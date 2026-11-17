//! 同步状态机 + Rust -> 前端事件发射。
//!
//! 事件：
//! - `sync://state`：状态变更，payload 为 `SyncStateDto`；
//! - `sync://progress`：阶段 / 百分比；`phase == "merge-required"` 时
//!   额外携带 `remote` 与 `base` 快照 JSON，交给前端 domain/merge.ts 合并。

use crate::error::AppError;
use serde::Serialize;
use serde_json::Value;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

pub const EVT_STATE: &str = "sync://state";
pub const EVT_PROGRESS: &str = "sync://progress";

#[derive(Debug, Clone, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum SyncKind {
    #[default]
    Off,
    Synced,
    Dirty,
    Syncing,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncErrorDto {
    /// 错误码字符串（如 E_WEBDAV_AUTH），不含密码。
    pub code: String,
    /// 安全描述，不含密码 / 令牌。
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStateDto {
    pub kind: SyncKind,
    pub last_sync_at: Option<i64>,
    pub revision: i64,
    pub error: Option<SyncErrorDto>,
    pub job_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub job_id: String,
    pub phase: String,
    pub percent: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base: Option<Value>,
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub struct SyncState {
    dto: Mutex<SyncStateDto>,
    /// 正在运行的任务（同时兼作并发锁与 jobId 记录）。
    current_job: Mutex<Option<String>>,
    /// 合并握手：sync_now 等待前端 save_snapshot(merged) 唤醒。
    pending_merge: Mutex<Option<oneshot::Sender<()>>>,
}

impl SyncState {
    pub fn new() -> Self {
        Self {
            dto: Mutex::new(SyncStateDto {
                kind: SyncKind::Off,
                last_sync_at: None,
                revision: 0,
                error: None,
                job_id: None,
            }),
            current_job: Mutex::new(None),
            pending_merge: Mutex::new(None),
        }
    }

    pub fn dto(&self) -> SyncStateDto {
        self.dto.lock().unwrap().clone()
    }

    /// 尝试占用任务槽；若已有任务则返回其 jobId（sync_now 据此幂等返回）。
    pub fn try_begin(&self, job_id: &str) -> Option<String> {
        let mut guard = self.current_job.lock().unwrap();
        if let Some(existing) = guard.as_ref() {
            return Some(existing.clone());
        }
        *guard = Some(job_id.to_string());
        None
    }

    pub fn finish(&self) {
        *self.current_job.lock().unwrap() = None;
    }

    fn emit_state(&self, app: &AppHandle, dto: SyncStateDto) {
        let _ = app.emit(EVT_STATE, dto);
    }

    fn update<F>(&self, app: &AppHandle, f: F)
    where
        F: FnOnce(&mut SyncStateDto),
    {
        let mut guard = self.dto.lock().unwrap();
        f(&mut guard);
        let snapshot = guard.clone();
        drop(guard);
        self.emit_state(app, snapshot);
    }

    pub fn set_syncing(&self, app: &AppHandle, job_id: &str) {
        self.update(app, |d| {
            d.kind = SyncKind::Syncing;
            d.error = None;
            d.job_id = Some(job_id.to_string());
        });
    }

    pub fn set_off(&self, app: &AppHandle) {
        self.update(app, |d| {
            d.kind = SyncKind::Off;
            d.error = None;
            d.job_id = None;
        });
    }

    pub fn set_synced(&self, app: &AppHandle, revision: i64) {
        self.update(app, |d| {
            d.kind = SyncKind::Synced;
            d.last_sync_at = Some(now_millis());
            d.revision = revision;
            d.error = None;
            d.job_id = None;
        });
    }

    pub fn set_error(&self, app: &AppHandle, err: &AppError, job_id: &str) {
        self.update(app, |d| {
            d.kind = SyncKind::Error;
            d.error = Some(SyncErrorDto {
                code: err.code().to_string(),
                message: err.message().to_string(),
            });
            d.job_id = Some(job_id.to_string());
        });
    }

    pub fn emit_progress(
        &self,
        app: &AppHandle,
        job_id: &str,
        phase: &str,
        percent: u8,
        remote: Option<Value>,
        base: Option<Value>,
    ) {
        let event = ProgressEvent {
            job_id: job_id.to_string(),
            phase: phase.to_string(),
            percent,
            remote,
            base,
        };
        let _ = app.emit(EVT_PROGRESS, event);
    }

    /// 注册合并握手，返回等待前端保存的 receiver。
    pub fn begin_merge(&self) -> oneshot::Receiver<()> {
        let (tx, rx) = oneshot::channel();
        *self.pending_merge.lock().unwrap() = Some(tx);
        rx
    }

    /// 由 `save_snapshot` 调用：前端已保存合并结果，唤醒同步任务进入 PUT 阶段。
    pub fn notify_saved(&self) {
        if let Some(tx) = self.pending_merge.lock().unwrap().take() {
            let _ = tx.send(());
        }
    }

    /// 取消未完成的握手（任务结束 / 超时）。
    pub fn cancel_merge(&self) {
        self.pending_merge.lock().unwrap().take();
    }
}

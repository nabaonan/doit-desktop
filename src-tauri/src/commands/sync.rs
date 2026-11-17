use crate::error::{AppError, CmdResult};
use crate::AppState;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State};

fn now_nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

/// 读取当前同步状态（Value 形式）。
#[tauri::command]
pub fn get_sync_state(state: State<'_, AppState>) -> CmdResult<Value> {
    serde_json::to_value(state.sync.dto()).map_err(|e| AppError::Io(e.to_string()).to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncNowResult {
    pub job_id: String,
}

/// 发起一次同步：立即返回 jobId，网络流程在后台任务中执行并发事件。
/// 已有任务在跑时幂等返回其 jobId，不重复启动。
///
/// 刻意声明为同步命令：它只负责 spawn，自身无需 async，
/// 从而避免 `async fn` 命令与 `State<'_, _>` 借用的生命周期约束。
#[tauri::command]
pub fn sync_now(app: AppHandle, state: State<'_, AppState>) -> CmdResult<SyncNowResult> {
    // 先完成可能失败的读取，再占用任务槽，避免失败时槽位泄漏。
    let config = crate::storage::config::load_webdav_config(&app).map_err(|e| e.to_string())?;

    let job_id = format!("sync-{}", now_nanos());
    let sync = state.sync.clone();
    if let Some(existing) = sync.try_begin(&job_id) {
        return Ok(SyncNowResult { job_id: existing });
    }

    let app_handle = app.clone();
    let job = job_id.clone();
    tauri::async_runtime::spawn(async move {
        crate::sync::run_job(app_handle, sync, job, config, None).await;
    });

    Ok(SyncNowResult { job_id })
}

/// 目录探测 + 鉴权探测。`password` 为可选内存凭据（未保存也能测）；
/// 不落盘任何内容。失败走 Err（统一错误码），成功返回 `{ ok, rootPath, latencyMs }`。
#[tauri::command]
pub async fn test_webdav(
    config: Value,
    password: Option<String>,
) -> CmdResult<crate::sync::webdav::TestResult> {
    crate::sync::webdav::test(&config, password)
        .await
        .map_err(|e| e.to_string())
}

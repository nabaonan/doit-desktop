//! 同步编排（只做网络 / 文件 / 事件，不含合并业务规则）。
//!
//! 时序（与设计稿第 6 节一致，Rust 不碰 merge3）：
//! 1. PROPFIND 探测目录；
//! 2. GET 远端 `doit-backup.json`；
//! 3. 通过 `sync://progress`（phase = `merge-required`）把 remote + base 交给前端；
//! 4. 前端 `domain/merge.ts` 合并后调用 `save_snapshot(merged)`；
//!    `save_snapshot` 唤醒本任务的握手 receiver；
//! 5. Rust 读回刚保存的本地快照 PUT 到 WebDAV，写入 `sync-base.json`；
//! 6. emit `sync://state = synced`。
//!
//! 若远端无文件（404），跳过合并握手，直接上传当前本地快照。

pub mod state;
pub mod webdav;

use crate::error::AppError;
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;

const MERGE_WAIT_TIMEOUT: Duration = Duration::from_secs(30);

enum Outcome {
    Synced(i64),
    Off,
}

/// 后台同步任务入口。成功 / 失败都收敛为状态事件，并释放任务槽与握手。
pub async fn run_job(
    app: AppHandle,
    sync: Arc<state::SyncState>,
    job_id: String,
    config: Value,
    password_override: Option<String>,
) {
    let result = do_sync(&app, &sync, &job_id, &config, password_override).await;
    match result {
        Ok(Outcome::Synced(revision)) => {
            sync.set_synced(&app, revision);
            sync.emit_progress(&app, &job_id, "done", 100, None, None);
        }
        Ok(Outcome::Off) => {
            // do_sync 内已 emit off，不再覆盖状态。
        }
        Err(err) => {
            sync.set_error(&app, &err, &job_id);
            sync.emit_progress(&app, &job_id, "error", 0, None, None);
        }
    }
    sync.cancel_merge();
    sync.finish();
}

async fn do_sync(
    app: &AppHandle,
    sync: &Arc<state::SyncState>,
    job_id: &str,
    config: &Value,
    password_override: Option<String>,
) -> Result<Outcome, AppError> {
    let enabled = config
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if !enabled {
        sync.set_off(app);
        return Ok(Outcome::Off);
    }

    sync.set_syncing(app, job_id);
    sync.emit_progress(app, job_id, "probing", 10, None, None);

    let password = webdav::resolve_password(config, password_override)?;
    let username = webdav::username_of(config);
    let client = webdav::build_client(config)?;
    let base = webdav::normalize_base(config)?;

    webdav::probe_root(&client, base.as_str(), username, &password).await?;
    sync.emit_progress(app, job_id, "fetching", 30, None, None);

    let remote = webdav::get(&client, base.as_str(), username, &password).await?;
    let base_snapshot = crate::storage::snapshot::read_base(app);

    let local = if let Some(remote_value) = remote {
        // 把原始 remote + base 交给前端合并；Rust 不解析、不改写快照内容。
        sync.emit_progress(
            app,
            job_id,
            "merge-required",
            50,
            Some(remote_value),
            Some(base_snapshot),
        );
        let rx = sync.begin_merge();
        match tokio::time::timeout(MERGE_WAIT_TIMEOUT, rx).await {
            Ok(Ok(())) => {}
            _ => {
                sync.cancel_merge();
                return Err(AppError::ConflictMerge(
                    "等待前端合并结果超时或未收到 save_snapshot".into(),
                ));
            }
        }
        // 前端已把 merged 保存到本地主文件。
        crate::storage::snapshot::read_current_snapshot(app)?
    } else {
        // 首次同步：服务器尚无文件，直接上传当前本地快照。
        crate::storage::snapshot::read_current_snapshot(app)?
    };

    sync.emit_progress(app, job_id, "uploading", 80, None, None);
    webdav::put(&client, base.as_str(), username, &password, &local).await?;

    // 基线只记录上次成功同步的快照，不进入业务读取路径。
    if let Err(e) = crate::storage::snapshot::write_base(app, &local) {
        tracing::warn!("写入 sync-base.json 失败: {}", e);
    }

    let revision = local.get("revision").and_then(|v| v.as_i64()).unwrap_or(0);
    Ok(Outcome::Synced(revision))
}

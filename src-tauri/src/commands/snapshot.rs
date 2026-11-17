use crate::error::CmdResult;
use crate::AppState;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State};

/// 启动读取本地快照；文件不存在返回空快照 v2。
#[tauri::command]
pub fn load_snapshot(app: AppHandle) -> CmdResult<Value> {
    crate::storage::snapshot::read_snapshot(&app).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub revision: i64,
}

/// 原子写快照（含备份轮转），返回 revision。
/// 同时唤醒可能正在等待合并结果的同步任务（见 sync::run_job）。
#[tauri::command]
pub fn save_snapshot(
    app: AppHandle,
    state: State<'_, AppState>,
    snapshot: Value,
) -> CmdResult<SaveResult> {
    let revision =
        crate::storage::snapshot::write_snapshot(&app, &snapshot).map_err(|e| e.to_string())?;
    state.sync.notify_saved();
    Ok(SaveResult { revision })
}

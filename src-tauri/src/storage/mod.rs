//! 本地持久化：快照原子写 / 备份轮转 / 设置与基线。
//! 所有路径基于 `app.path().app_data_dir()`。

pub mod config;
pub mod snapshot;

use crate::error::AppError;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// 应用数据目录，并保证其存在。
pub fn data_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Io(e.to_string()))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

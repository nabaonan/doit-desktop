//! 快照文件读写。
//!
//! - 主文件 `doit-backup.json`，与手机端 WebDAV 同步的同名快照 v2；
//! - 原子写：`*.tmp` -> `fsync(file)` -> `rename` -> `fsync(dir)`；
//! - 写前轮转最近 3 份备份（`doit-backup.json.bak.1..3`）；
//! - `sync-base.json` 只存上次成功同步的快照，不进入业务读取路径。
//!
//! Rust 侧只把内容当 `serde_json::Value` 收发，不解析任务树、不做合并。

use crate::error::AppError;
use serde_json::Value;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

pub const SNAPSHOT_FILE: &str = "doit-backup.json";
pub const BASE_FILE: &str = "sync-base.json";
pub const BACKUP_COUNT: usize = 3;

fn snapshot_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(super::data_dir(app)?.join(SNAPSHOT_FILE))
}

fn base_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(super::data_dir(app)?.join(BASE_FILE))
}

fn backup_path(path: &Path, index: usize) -> PathBuf {
    let mut os = path.as_os_str().to_os_string();
    os.push(format!(".bak.{index}"));
    PathBuf::from(os)
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 空快照 v2：主文件不存在时返回。仅构造占位 JSON，不含任何业务规则。
pub fn empty_snapshot() -> Value {
    let now = now_millis();
    serde_json::json!({
        "version": 2,
        "revision": 0,
        "exportedAt": now,
        "deviceId": format!("desktop-{now}"),
        "lastSyncAt": null,
        "categories": [],
        "tasks": []
    })
}

fn read_value(path: &Path) -> Result<Value, AppError> {
    let mut bytes = Vec::new();
    File::open(path)?.read_to_end(&mut bytes)?;
    serde_json::from_slice::<Value>(&bytes).map_err(|e| AppError::SnapshotInvalid(e.to_string()))
}

/// 启动读取：文件不存在返回空快照 v2；主文件损坏时依次回退最近备份；
/// 全部损坏才返回 E_SNAPSHOT_INVALID（由前端提示并保留上一份备份）。
pub fn read_snapshot(app: &AppHandle) -> Result<Value, AppError> {
    let path = snapshot_path(app)?;
    if !path.exists() {
        return Ok(empty_snapshot());
    }
    if let Ok(v) = read_value(&path) {
        return Ok(v);
    }
    for i in 1..=BACKUP_COUNT {
        let bak = backup_path(&path, i);
        if bak.exists() {
            if let Ok(v) = read_value(&bak) {
                return Ok(v);
            }
        }
    }
    Err(AppError::SnapshotInvalid("快照文件损坏且无可用备份".into()))
}

/// 读取当前主文件（不回退备份），供同步 PUT 使用；文件不存在返回空快照。
pub fn read_current_snapshot(app: &AppHandle) -> Result<Value, AppError> {
    let path = snapshot_path(app)?;
    if !path.exists() {
        return Ok(empty_snapshot());
    }
    read_value(&path)
}

/// 保存快照，返回其中的 revision（缺失则 0）。
pub fn write_snapshot(app: &AppHandle, snapshot: &Value) -> Result<i64, AppError> {
    let path = snapshot_path(app)?;
    let bytes =
        serde_json::to_vec(snapshot).map_err(|e| AppError::SnapshotInvalid(e.to_string()))?;
    // 备份是辅助能力，轮转失败不应阻断主写入。
    if let Err(e) = rotate_backup(&path) {
        tracing::warn!("备份轮转失败（不影响主写入）: {}", e);
    }
    atomic_write(&path, &bytes)?;
    Ok(snapshot
        .get("revision")
        .and_then(|v| v.as_i64())
        .unwrap_or(0))
}

/// tmp 文件 + fsync + rename 的原子写。tmp 名带 pid + 纳秒时间戳，避免并发写入互相踩踏。
pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), AppError> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::Io("目标文件无父目录".into()))?;
    fs::create_dir_all(parent)?;

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let file_name = path
        .file_name()
        .map(|s| s.to_string_lossy())
        .unwrap_or_default();
    let tmp = parent.join(format!(
        "{}.{}.{}.tmp",
        file_name,
        std::process::id(),
        stamp
    ));

    {
        let mut file = File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?; // fsync 文件内容
    }

    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        AppError::from(e)
    })?;

    // fsync 目录，确保 rename 本身落盘（Unix）。
    #[cfg(unix)]
    {
        if let Ok(dir) = File::open(parent) {
            let _ = dir.sync_all();
        }
    }
    Ok(())
}

/// 保留最近 3 份备份：.bak.3 删除，.bak.2->.bak.3，.bak.1->.bak.2，当前->.bak.1。
fn rotate_backup(path: &Path) -> Result<(), AppError> {
    if !path.exists() {
        return Ok(());
    }
    let oldest = backup_path(path, BACKUP_COUNT);
    if oldest.exists() {
        fs::remove_file(&oldest)?;
    }
    // 从高到低位移，避免覆盖尚未搬走的文件。
    for i in (1..BACKUP_COUNT).rev() {
        let src = backup_path(path, i);
        if src.exists() {
            fs::rename(&src, backup_path(path, i + 1))?;
        }
    }
    // 用 copy 保留原文件，直到新内容原子覆盖完成。
    fs::copy(path, backup_path(path, 1))?;
    Ok(())
}

/// 读取同步基线；缺失或损坏一律视为 null（base 只是辅助数据）。
pub fn read_base(app: &AppHandle) -> Value {
    let Ok(path) = base_path(app) else {
        return Value::Null;
    };
    if !path.exists() {
        return Value::Null;
    }
    read_value(&path).unwrap_or(Value::Null)
}

/// 写入同步基线（上次成功同步的快照）。
pub fn write_base(app: &AppHandle, snapshot: &Value) -> Result<(), AppError> {
    let path = base_path(app)?;
    let bytes =
        serde_json::to_vec(snapshot).map_err(|e| AppError::SnapshotInvalid(e.to_string()))?;
    atomic_write(&path, &bytes)
}

//! 系统钥匙串封装（macOS Keychain / Windows Credential Manager / Linux Secret Service）。
//!
//! 安全约定：
//! - 真实密码只通过 IPC 以 `Option<String>` 传入内存，立刻写入钥匙串；
//! - 读写回的密码只在内存局部变量中使用，绝不写入任何配置文件 / 日志 / 错误信息；
//! - 配置文件只保存 `passwordRef`（凭据引用标识，如 `doit-webdav:<username>`）；
//! - 底层 keyring 错误一律不向外透传（其文案可能含 service / user）。
//!
//! keyring 4.2.0 `v1` API（已查 crate 源码确认）：
//! `Entry::new(service, user) -> Result<Entry>`、`set_password`、
//! `get_password`、`delete_credential`。

use crate::error::AppError;
use keyring::Entry;
use serde_json::Value;

/// 钥匙串 service 名（固定）。
pub const KEYRING_SERVICE: &str = "com.doit.desktop";
/// passwordRef 的默认前缀。
pub const PASSWORD_REF_PREFIX: &str = "doit-webdav:";

/// 由配置推导凭据引用标识：优先用自带的 `passwordRef`，否则按 username 生成。
pub fn password_ref(config: &Value) -> String {
    let existing = config
        .get("passwordRef")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if !existing.is_empty() {
        return existing.to_string();
    }
    let username = config
        .get("username")
        .and_then(|v| v.as_str())
        .unwrap_or("default")
        .trim();
    if username.is_empty() {
        return String::new();
    }
    format!("{PASSWORD_REF_PREFIX}{username}")
}

fn entry_for(password_ref: &str) -> Result<Entry, AppError> {
    if password_ref.is_empty() {
        return Err(AppError::Keyring("凭据引用标识为空".into()));
    }
    Entry::new(KEYRING_SERVICE, password_ref)
        .map_err(|_| AppError::Keyring("系统钥匙串不可用".into()))
}

/// 把真实密码写入系统钥匙串。`password` 只在此函数内被使用，不做任何格式化 / 日志。
pub fn set_secret(password_ref: &str, password: &str) -> Result<(), AppError> {
    let entry = entry_for(password_ref)?;
    entry
        .set_password(password)
        .map_err(|_| AppError::Keyring("写入凭据失败".into()))
}

/// 从钥匙串读回密码。返回值仅在调用方内存中使用。
pub fn get_secret(password_ref: &str) -> Result<String, AppError> {
    let entry = entry_for(password_ref)?;
    entry
        .get_password()
        .map_err(|_| AppError::Keyring("读取凭据失败或凭据不存在".into()))
}

/// 删除凭据。删除失败按幂等成功处理（凭据本就不存在是常见情况），
/// 这样 `clear_webdav_secret` 的语义恒为「确保该引用下没有凭据」。
pub fn delete_secret(password_ref: &str) -> Result<(), AppError> {
    let entry = entry_for(password_ref)?;
    let _ = entry.delete_credential();
    Ok(())
}

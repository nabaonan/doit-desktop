use crate::error::CmdResult;
use serde_json::Value;
use tauri::AppHandle;

/// 读取设置（读回时也会净化 webdav 子对象，绝不含明文密码）。
#[tauri::command]
pub fn load_settings(app: AppHandle) -> CmdResult<Value> {
    crate::storage::config::load_settings(&app).map_err(|e| e.to_string())
}

/// 保存设置（落盘前剥离 webdav 下所有明文字段）。
#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Value) -> CmdResult<()> {
    crate::storage::config::save_settings(&app, &settings).map_err(|e| e.to_string())
}

/// 读取 WebDAV 配置，**不含密码**（只含 passwordRef）。
#[tauri::command]
pub fn get_webdav_config(app: AppHandle) -> CmdResult<Value> {
    crate::storage::config::load_webdav_config(&app).map_err(|e| e.to_string())
}

/// 写入 WebDAV 配置。
/// `password`（若有）只写系统钥匙串，绝不进入任何配置文件 / 日志 / 错误信息；
/// config 里即便夹带明文字段也会在落盘前被剥离。
#[tauri::command]
pub fn set_webdav_config(app: AppHandle, config: Value, password: Option<String>) -> CmdResult<()> {
    let pref = crate::security::keyring::password_ref(&config);

    if let Some(secret) = password.as_deref() {
        if !secret.is_empty() {
            crate::security::keyring::set_secret(&pref, secret).map_err(|e| e.to_string())?;
        }
    }

    // 构造「干净」配置：强制 passwordRef，移除任何明文凭据字段。
    let mut safe = config.clone();
    if let Some(obj) = safe.as_object_mut() {
        obj.insert("passwordRef".into(), Value::String(pref));
        for key in [
            "password",
            "passwordPlain",
            "token",
            "accessToken",
            "secret",
            "credential",
            "credentials",
        ] {
            obj.remove(key);
        }
    }

    crate::storage::config::save_webdav_config(&app, &safe).map_err(|e| e.to_string())
}

/// 删除系统钥匙串中的凭据（按当前 settings 的 passwordRef）。
#[tauri::command]
pub fn clear_webdav_secret(app: AppHandle) -> CmdResult<()> {
    let config = crate::storage::config::load_webdav_config(&app).map_err(|e| e.to_string())?;
    let pref = crate::security::keyring::password_ref(&config);
    if pref.is_empty() {
        return Ok(());
    }
    crate::security::keyring::delete_secret(&pref).map_err(|e| e.to_string())
}

//! 设置持久化（`settings.json`）。
//!
//! 安全核心：落盘前对 WebDAV 配置做**白名单净化**——只保留
//! `enabled / url / username / passwordRef / rootPath` 五个键，
//! 任何明文字段（password / token / secret / ...）都会被剥离。
//! 读回时也净化一次，防御历史脏数据。真实密码只进系统钥匙串。

use crate::error::AppError;
use serde_json::{json, Value};
use std::fs::File;
use std::io::Read;
use std::path::PathBuf;
use tauri::AppHandle;

const SETTINGS_FILE: &str = "settings.json";

/// WebDAV 配置允许落盘的白名单字段。
const WEBDAV_KEYS: &[&str] = &["enabled", "url", "username", "passwordRef", "rootPath"];

/// 任何层级都不允许落盘的明文字段名。
const FORBIDDEN_KEYS: &[&str] = &[
    "password",
    "passwordPlain",
    "token",
    "accessToken",
    "secret",
    "credential",
    "credentials",
];

fn settings_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    Ok(super::data_dir(app)?.join(SETTINGS_FILE))
}

/// 从任意输入构造「可落盘」的 WebDAV 配置：仅保留白名单键。
pub fn sanitize_webdav_config(input: &Value) -> Value {
    let mut out = serde_json::Map::new();
    for key in WEBDAV_KEYS {
        if let Some(v) = input.get(*key) {
            out.insert((*key).to_string(), v.clone());
        }
    }
    Value::Object(out)
}

/// 净化整份 settings：剥离顶层明文字段，并强制 webdav 子对象走白名单。
pub fn sanitize_settings(input: &Value) -> Value {
    let mut out = match input {
        Value::Object(m) => m.clone(),
        _ => return default_settings(),
    };
    for key in FORBIDDEN_KEYS {
        out.remove(*key);
    }
    let webdav = out.get("webdav").cloned().unwrap_or_else(|| json!({}));
    out.insert("webdav".into(), sanitize_webdav_config(&webdav));
    Value::Object(out)
}

pub fn default_settings() -> Value {
    json!({
        "theme": "light",
        "skin": "mint",
        "progressColor": "#3FBB9C",
        "webdav": {
            "enabled": false,
            "url": "",
            "username": "",
            "passwordRef": "",
            "rootPath": null
        }
    })
}

pub fn load_settings(app: &AppHandle) -> Result<Value, AppError> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(default_settings());
    }
    let mut text = String::new();
    File::open(&path)?.read_to_string(&mut text)?;
    let value: Value = serde_json::from_str(&text).map_err(|e| AppError::Io(e.to_string()))?;
    Ok(sanitize_settings(&value))
}

pub fn save_settings(app: &AppHandle, settings: &Value) -> Result<(), AppError> {
    let clean = sanitize_settings(settings);
    let bytes = serde_json::to_vec_pretty(&clean).map_err(|e| AppError::Io(e.to_string()))?;
    super::snapshot::atomic_write(&settings_path(app)?, &bytes)
}

/// 返回不含密码的 WebDAV 配置（直接从净化后的 settings 中取 webdav 子对象）。
pub fn load_webdav_config(app: &AppHandle) -> Result<Value, AppError> {
    let settings = load_settings(app)?;
    let webdav = settings.get("webdav").cloned().unwrap_or_else(|| json!({}));
    Ok(sanitize_webdav_config(&webdav))
}

/// 合并式写入 WebDAV 配置：保留未提供的既有字段，再整体净化后落盘。
pub fn save_webdav_config(app: &AppHandle, config: &Value) -> Result<(), AppError> {
    let mut settings = load_settings(app)?;
    let existing = settings.get("webdav").cloned().unwrap_or_else(|| json!({}));
    let mut merged = sanitize_webdav_config(&existing);

    if let (Some(dst), Some(src)) = (merged.as_object_mut(), config.as_object()) {
        for (key, value) in src {
            if WEBDAV_KEYS.contains(&key.as_str()) {
                dst.insert(key.clone(), value.clone());
            }
        }
    }

    let clean = sanitize_webdav_config(&merged);
    if let Some(obj) = settings.as_object_mut() {
        obj.insert("webdav".into(), clean);
    }
    save_settings(app, &settings)
}

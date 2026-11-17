use crate::error::{AppError, CmdResult};
use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

/// 允许通过系统浏览器打开的 https 域名白名单（含子域）。
/// 前端若需新增帮助 / 项目站点域名，在此扩展即可。
const ALLOWED_HOSTS: &[&str] = &["github.com", "docs.rs", "tauri.app", "doit.app"];

/// 打开外部链接：仅允许 https + 域名白名单 + 拒绝任何命令行元字符。
/// 用 `open` crate 调系统浏览器，内部不走 shell，避免命令注入。
#[tauri::command]
pub fn open_external(url: String) -> CmdResult<()> {
    let target = url.trim();
    if !target.starts_with("https://") {
        return Err(AppError::Permission("仅允许 https 链接".into()).to_string());
    }
    if target.chars().any(|c| {
        c.is_control()
            || c.is_whitespace()
            || matches!(
                c,
                '"' | '\'' | '`' | '&' | '|' | ';' | '$' | '<' | '>' | '\\'
            )
    }) {
        return Err(AppError::Permission("链接含非法字符".into()).to_string());
    }

    // 提取 host：去掉 scheme、userinfo、端口，只保留主机名做精确 / 子域匹配。
    let rest = &target["https://".len()..];
    let authority = rest
        .split(|c| c == '/' || c == '?' || c == '#')
        .next()
        .unwrap_or("");
    let host = authority
        .rsplit('@')
        .next()
        .unwrap_or(authority)
        .split(':')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();

    let allowed = ALLOWED_HOSTS
        .iter()
        .any(|h| host == *h || host.ends_with(&format!(".{h}")));
    if !allowed {
        return Err(AppError::Permission("域名不在白名单内".into()).to_string());
    }

    open::that(target).map_err(|e| AppError::Io(format!("无法打开外部链接: {}", e)).to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppMetadata {
    pub version: String,
    pub platform: String,
    pub webview: String,
}

fn platform_name() -> String {
    if cfg!(target_os = "macos") {
        "macos".to_string()
    } else if cfg!(target_os = "windows") {
        "windows".to_string()
    } else if cfg!(target_os = "linux") {
        "linux".to_string()
    } else {
        "unknown".to_string()
    }
}

fn webview_name() -> String {
    if cfg!(target_os = "macos") {
        "WKWebView".to_string()
    } else if cfg!(target_os = "windows") {
        "WebView2".to_string()
    } else if cfg!(target_os = "linux") {
        "WebKitGTK".to_string()
    } else {
        "unknown".to_string()
    }
}

/// 关于页 / 兼容性日志所需的元信息。
#[tauri::command]
pub fn app_metadata() -> CmdResult<AppMetadata> {
    Ok(AppMetadata {
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: platform_name(),
        webview: webview_name(),
    })
}

/// 开机自启状态查询（经 tauri-plugin-autostart，不自行写注册表 / plist）。
#[tauri::command]
pub fn get_autostart(app: AppHandle) -> CmdResult<bool> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

/// 开关开机自启。禁用时插件已把 Windows「未找到注册表项」视作成功。
#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> CmdResult<()> {
    let manager = app.autolaunch();
    let result = if enabled { manager.enable() } else { manager.disable() };
    result.map_err(|e| e.to_string())
}

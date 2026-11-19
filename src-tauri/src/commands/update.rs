//! 检查更新 + 下载安装包：
//! - `check_update`：调 GitHub Releases API 查最新版本（仓库公开后匿名即可访问）。
//! - `download_update`：reqwest 流式下载最新版安装包到应用缓存目录，边下边 emit `update://progress`。
//!
//! 安全约定（同 error.rs）：错误只回 `"CODE: safe message"`，绝不含 token / 完整 URL / 无权限信息外的细节。

use std::fs::{self, File};
use std::io::Write;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use crate::error::AppError;

/// GitHub Releases API（语义上的“最新发布”）。
const RELEASE_API: &str = "https://api.github.com/repos/nabaonan/doit-desktop/releases/latest";
/// 仓库元信息 API：用于在 404 时区分「token 无效」vs「仓库确实没有已发布 Release」。
const REPO_INFO_API: &str = "https://api.github.com/repos/nabaonan/doit-desktop";
/// 仓库发布页（前端“去 Releases 查看/下载”入口）。
const RELEASE_PAGE: &str = "https://github.com/nabaonan/doit-desktop/releases";
/// GitHub 下载域名前缀（download 白名单，杜绝任意 URL 下载落地）。
const DOWNLOAD_PREFIX: &str = "https://github.com/nabaonan/doit-desktop/releases/download/";
/// 下载进度事件名（与前端 update service 一致）。
const EVT_PROGRESS: &str = "update://progress";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAsset {
    pub name: String,
    pub url: String,
    pub size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckUpdateResult {
    pub latest_tag: String,
    pub published_at: String,
    pub html_url: String,
    /// 匹配当前平台安装包（macOS .dmg / Windows .exe / Linux .deb）
    pub asset: Option<UpdateAsset>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    phase: String, // downloading | done | error
    received: u64,
    total: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<String>,
}

#[derive(Deserialize)]
struct GhRelease {
    tag_name: Option<String>,
    published_at: Option<String>,
    html_url: Option<String>,
    assets: Option<Vec<GhAsset>>,
}

#[derive(Deserialize)]
struct GhAsset {
    name: Option<String>,
    browser_download_url: Option<String>,
    size: Option<u64>,
}

/// 构建带默认头（User-Agent 必填；若仍有调用方传入 token 则注入 Bearer，token 只用在本函数内）。
fn build_client(token: &Option<String>) -> Result<reqwest::Client, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    let ua: reqwest::header::HeaderValue = "doit-desktop-update-checker/1.0"
        .parse()
        .map_err(|_| AppError::Network("请求头构造失败".into()).to_string())?;
    headers.insert(reqwest::header::USER_AGENT, ua);
    if let Some(t) = token {
        if !t.trim().is_empty() {
            let mut value = String::from("Bearer ");
            value.push_str(t.trim());
            let hv: reqwest::header::HeaderValue = value
                .parse()
                .map_err(|_| AppError::Permission("Token 含非法字符".into()).to_string())?;
            headers.insert(reqwest::header::AUTHORIZATION, hv);
        }
    }
    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|_| AppError::Network("无法创建 HTTP 客户端".into()).to_string())
}

/// 当前平台应下载的安装包后缀。
/// 注意：tauri 2 默认产物名为 `{product}_v{version}_{arch}.dmg`（含 aarch64/x64 但不含 “macos”），
/// 所以 macOS 只按 `.dmg` 后缀判定即可（release 只出 dmg，无其他 dmg 类混淆）。
fn platform_match(name: &str) -> bool {
    let n = name.to_lowercase();
    #[cfg(target_os = "macos")]
    let ok = n.ends_with(".dmg");
    #[cfg(target_os = "windows")]
    let ok = n.ends_with(".exe");
    #[cfg(target_os = "linux")]
    let ok = n.ends_with(".deb") || n.ends_with(".appimage");
    ok
}

/// 检查更新：返回最新版本 tag 与当前平台的安装包信息。
#[tauri::command]
pub async fn check_update(token: Option<String>) -> crate::error::CmdResult<CheckUpdateResult> {
    let client = build_client(&token)?;
    let resp = client
        .get(RELEASE_API)
        .send()
        .await
        .map_err(|_| AppError::Network("无法连接 GitHub".into()).to_string())?;

    let status = resp.status();
    let has_token = token.as_ref().is_some_and(|t| !t.trim().is_empty());
    let is_auth_fail = status == reqwest::StatusCode::UNAUTHORIZED
        || status == reqwest::StatusCode::FORBIDDEN;
    let is_404 = status == reqwest::StatusCode::NOT_FOUND;
    if is_auth_fail || is_404 {
        // 开源后匿名即可查询；这些异常一般意味着「仓库暂无可读 Release」或网络/访问受限。
        // 若未来以私有仓库 + token 方式部署，仍按场景区分提示。
        let msg = if !has_token {
            "无法获取 GitHub 最新版本：仓库暂无已发布的 Release，或网络/访问受限，请稍后重试"
        } else if is_auth_fail {
            "GitHub Token 无效或权限不足：需已授权本仓库，具备 contents:read 的只读 Token"
        } else {
            match client.get(REPO_INFO_API).send().await {
                Ok(rep) if rep.status().is_success() => {
                    "GitHub 返回 404：仓库还没有已发布的 Release（只有 tag 不算），请先在 Actions 确认 release.yml 发布成功，或到 Releases 页查看"
                }
                _ => "GitHub 返回 404：Token 无效或无权访问该仓库（需已授权 + contents:read）",
            }
        };
        return Err(AppError::Permission(msg.into()).to_string());
    }
    if !status.is_success() {
        return Err(AppError::Network(format!("GitHub 返回 HTTP {status}")).to_string());
    }

    let raw = resp
        .bytes()
        .await
        .map_err(|_| AppError::Network("读取 GitHub 响应失败".into()).to_string())?;
    let rel: GhRelease = serde_json::from_slice(&raw)
        .map_err(|_| AppError::Network("解析 GitHub 响应失败".into()).to_string())?;

    let tag = rel.tag_name.unwrap_or_default();
    let html = rel
        .html_url
        .unwrap_or_else(|| RELEASE_PAGE.to_string());
    let published = rel.published_at.unwrap_or_default();

    let asset = rel
        .assets
        .unwrap_or_default()
        .into_iter()
        .filter_map(|a| {
            let name = a.name.unwrap_or_default();
            if platform_match(&name) {
                a.browser_download_url.map(|url| UpdateAsset {
                    name,
                    url,
                    size: a.size.unwrap_or(0),
                })
            } else {
                None
            }
        })
        .next();

    Ok(CheckUpdateResult {
        latest_tag: tag,
        published_at: published,
        html_url: html,
        asset,
    })
}

/// 清洗下载文件名：只保留字母数字 . _ -，并剥掉前导点（防 `..` 残留成 `....x`），防止路径穿越 / 参数注入。
fn sanitize_name(name: &str) -> String {
    let base = name.split(['?', '#']).next().unwrap_or("doit-update");
    let cleaned: String = base
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        .collect();
    let trimmed = cleaned.trim_start_matches('.').to_string();
    if trimmed.is_empty() {
        "doit-update.bin".to_string()
    } else {
        trimmed
    }
}

/// 下载安装包（仅允许 GitHub 本仓库 Releases 的下载地址），进度经 `update://progress` 事件回报。
#[tauri::command]
pub async fn download_update(
    app: AppHandle,
    url: String,
    token: Option<String>,
) -> crate::error::CmdResult<String> {
    if !url.starts_with(DOWNLOAD_PREFIX) {
        return Err(
            AppError::Permission("仅允许下载本仓库 GitHub Release 的安装包".into()).to_string(),
        );
    }
    let raw_name = url.rsplit('/').next().unwrap_or("doit-update.bin");
    let file_name = sanitize_name(raw_name);

    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|_| AppError::Io("无法定位应用缓存目录".into()).to_string())?
        .join("update");
    fs::create_dir_all(&dir)
        .map_err(|e| AppError::Io(format!("创建下载目录失败: {e}")).to_string())?;
    let dest = dir.join(&file_name);

    let client = build_client(&token)?;
    let mut resp = client
        .get(&url)
        .send()
        .await
        .map_err(|_| AppError::Network("下载请求失败".into()).to_string())?;
    let status = resp.status();
    let has_token = token.as_ref().is_some_and(|t| !t.trim().is_empty());
    if status == reqwest::StatusCode::UNAUTHORIZED
        || status == reqwest::StatusCode::FORBIDDEN
        || status == reqwest::StatusCode::NOT_FOUND
    {
        let msg = if has_token {
            "下载被拒绝（HTTP 401/403/404）：Token 无效或该版本没有当前平台的安装包，请到 Releases 页核对资产名"
        } else {
            "无法下载安装包（可能是文件不存在或网络受限），请到 Releases 页手动下载"
        };
        return Err(AppError::Permission(msg.into()).to_string());
    }
    if !status.is_success() {
        return Err(AppError::Network(format!("下载返回 HTTP {status}")).to_string());
    }

    let total = resp.content_length().unwrap_or(0);
    let mut file = File::create(&dest)
        .map_err(|e| AppError::Io(format!("创建文件失败: {e}")).to_string())?;
    let mut received: u64 = 0;
    let mut last_emit: u64 = 0;

    loop {
        match resp.chunk().await {
            Ok(Some(bytes)) => {
                let len = bytes.len() as u64;
                received += len;
                file.write_all(&bytes)
                    .map_err(|e| AppError::Io(format!("写入文件失败: {e}")).to_string())?;
                // 节流：约每 256KB 报一次进度，避免高频事件压垮前端
                if received.saturating_sub(last_emit) >= 262_144 {
                    last_emit = received;
                    let _ = app.emit(
                        EVT_PROGRESS,
                        DownloadProgress {
                            phase: "downloading".into(),
                            received,
                            total,
                            path: None,
                        },
                    );
                }
            }
            Ok(None) => break,
            Err(_) => {
                let _ = fs::remove_file(&dest);
                return Err(AppError::Network("下载中断".into()).to_string());
            }
        }
    }

    file.sync_all()
        .map_err(|e| AppError::Io(format!("落盘失败: {e}")).to_string())?;
    // 兜底：补发一次 100% 事件（若此前因节流未到 100%）
    let _ = app.emit(
        EVT_PROGRESS,
        DownloadProgress {
            phase: "done".into(),
            received,
            total,
            path: Some(dest.to_string_lossy().into_owned()),
        },
    );
    Ok(dest.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::{platform_match, sanitize_name};

    #[test]
    fn platform_match_picks_installer_by_suffix() {
        // 当前平台应命中对应安装包后缀
        #[cfg(target_os = "macos")]
        {
            assert!(platform_match("doit-desktop-v0.1.2-macos-arm64.dmg"));
            assert!(platform_match("doit-desktop-v0.1.2-macos-x64.dmg"));
            assert!(!platform_match("doit-desktop-v0.1.2-linux-x64.deb"));
            assert!(!platform_match("doit-desktop-v0.1.2-windows-x64.exe"));
        }
        #[cfg(target_os = "windows")]
        {
            assert!(platform_match("doit-desktop-v0.1.2-windows-x64.exe"));
            assert!(!platform_match("doit-desktop-v0.1.2-linux-x64.deb"));
        }
        #[cfg(target_os = "linux")]
        {
            assert!(platform_match("doit-desktop-v0.1.2-linux-x64.deb"));
            assert!(!platform_match("doit-desktop-v0.1.2-macos-arm64.dmg"));
        }
        assert!(!platform_match("readme.md"));
    }

    #[test]
    fn sanitize_name_strips_query_and_path() {
        assert_eq!(sanitize_name("ok-v1.2.3.dmg"), "ok-v1.2.3.dmg");
        assert_eq!(sanitize_name("doit-v0.1.2.dmg?download=1"), "doit-v0.1.2.dmg");
        assert_eq!(sanitize_name("../../evil.dmg"), "evil.dmg");
        assert_eq!(sanitize_name(""), "doit-update.bin");
    }
}

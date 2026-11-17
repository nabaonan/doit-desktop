//! WebDAV 网络层：PROPFIND 目录探测 / GET 远端快照 / PUT 本地快照。
//!
//! 只做系统网络能力，收发 `serde_json::Value` 形式的快照 JSON，
//! 不实现任务树、完成判定或三方合并。
//!
//! 安全：
//! - Basic Auth 凭据来自系统钥匙串（或仅存在于内存中的 IPC 入参），绝不落盘；
//! - 底层 `reqwest::Error` 的 Display 一律不外传（可能含请求 URL / userinfo），
//!   只按 `is_timeout` / `is_connect` 分类成安全文案；
//! - 日志与错误信息不打印 URL、请求头、响应体。

use crate::error::AppError;
use crate::security::keyring;
use reqwest::{Client, Method, StatusCode};
use serde::Serialize;
use serde_json::Value;
use std::time::{Duration, Instant};

const BACKUP_NAME: &str = "doit-backup.json";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(8);

const PROPFIND_BODY: &str = r#"<?xml version="1.0" encoding="utf-8" ?><D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/></D:prop></D:propfind>"#;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestResult {
    pub ok: bool,
    pub root_path: String,
    pub latency_ms: u64,
}

/// 是否放行自签证书：默认 false（安全优先），仅当配置显式声明时开启。
fn allow_insecure(config: &Value) -> bool {
    config
        .get("allowInvalidCerts")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// 归一化 WebDAV 基地址：url 去尾斜杠 + rootPath 子路径，并保证以 '/' 结尾。
pub fn normalize_base(config: &Value) -> Result<String, AppError> {
    let url = config
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if url.is_empty() {
        return Err(AppError::WebdavNotFound("未配置 WebDAV 地址".into()));
    }
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(AppError::WebdavNotFound(
            "WebDAV 地址必须以 http(s):// 开头".into(),
        ));
    }

    let mut base = url.trim_end_matches('/').to_string();
    let root = config
        .get("rootPath")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .trim_matches('/');
    if !root.is_empty() {
        base.push('/');
        base.push_str(root);
    }
    base.push('/');
    Ok(base)
}

/// 供 test_webdav 回传的 rootPath（探测确认可用的相对目录，空则用 "/"）。
pub fn resolved_root_path(config: &Value) -> String {
    let root = config
        .get("rootPath")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    if root.is_empty() {
        "/".to_string()
    } else {
        root.to_string()
    }
}

pub fn username_of(config: &Value) -> &str {
    config
        .get("username")
        .and_then(|v| v.as_str())
        .unwrap_or("")
}

/// 解析本次请求使用的密码：优先用 IPC 传入的内存密码；否则按 passwordRef 从钥匙串读回。
/// 返回值仅在调用方内存中使用。
pub fn resolve_password(config: &Value, password: Option<String>) -> Result<String, AppError> {
    if let Some(p) = password {
        if !p.is_empty() {
            return Ok(p);
        }
    }
    let pref = keyring::password_ref(config);
    keyring::get_secret(&pref)
}

pub fn build_client(config: &Value) -> Result<Client, AppError> {
    Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .connect_timeout(CONNECT_TIMEOUT)
        .danger_accept_invalid_certs(allow_insecure(config))
        .build()
        .map_err(|_| AppError::Network("无法初始化网络客户端".into()))
}

/// 把底层网络错误分类成安全错误（绝不调用 e.to_string()）。
fn classify(e: reqwest::Error) -> AppError {
    if e.is_timeout() {
        AppError::WebdavTimeout("WebDAV 请求超时".into())
    } else if e.is_connect() {
        AppError::Network("无法连接 WebDAV 服务器".into())
    } else {
        AppError::Network("WebDAV 网络请求失败".into())
    }
}

fn auth_error(status: StatusCode) -> AppError {
    AppError::WebdavAuth(format!("鉴权失败 (HTTP {})", status.as_u16()))
}

/// PROPFIND 目录探测 + 鉴权探测。
pub async fn probe_root(
    client: &Client,
    base: &str,
    username: &str,
    password: &str,
) -> Result<(), AppError> {
    let method = Method::from_bytes(b"PROPFIND").expect("PROPFIND 是合法 HTTP 方法");
    let resp = client
        .request(method, base)
        .basic_auth(username, Some(password))
        .header("Depth", "0")
        .header("Content-Type", "application/xml; charset=utf-8")
        .body(PROPFIND_BODY)
        .send()
        .await
        .map_err(classify)?;

    let status = resp.status();
    // 用 guard 比较而非常量模式，避免依赖 StatusCode 的结构化匹配能力。
    match status {
        s if s == StatusCode::UNAUTHORIZED || s == StatusCode::FORBIDDEN => Err(auth_error(s)),
        s if s == StatusCode::NOT_FOUND => Err(AppError::WebdavNotFound(format!(
            "目录不存在 (HTTP {})",
            s.as_u16()
        ))),
        s if s.is_success() => Ok(()), // 含 207 Multi-Status
        s => Err(AppError::Network(format!(
            "目录探测失败 (HTTP {})",
            s.as_u16()
        ))),
    }
}

/// GET 远端快照；404 表示服务器尚无文件（返回 None）。
pub async fn get(
    client: &Client,
    base: &str,
    username: &str,
    password: &str,
) -> Result<Option<Value>, AppError> {
    let url = format!("{base}{BACKUP_NAME}");
    let resp = client
        .get(url.as_str())
        .basic_auth(username, Some(password))
        .send()
        .await
        .map_err(classify)?;

    let status = resp.status();
    match status {
        s if s == StatusCode::NOT_FOUND => Ok(None),
        s if s == StatusCode::UNAUTHORIZED || s == StatusCode::FORBIDDEN => Err(auth_error(s)),
        s if s.is_success() => {
            let bytes = resp.bytes().await.map_err(classify)?;
            let value: Value = serde_json::from_slice(&bytes)
                .map_err(|_| AppError::SnapshotInvalid("远端快照不是合法 JSON".into()))?;
            Ok(Some(value))
        }
        s => Err(AppError::Network(format!(
            "读取远端快照失败 (HTTP {})",
            s.as_u16()
        ))),
    }
}

/// PUT 快照到 WebDAV（幂等覆盖）。
pub async fn put(
    client: &Client,
    base: &str,
    username: &str,
    password: &str,
    snapshot: &Value,
) -> Result<(), AppError> {
    let url = format!("{base}{BACKUP_NAME}");
    let bytes =
        serde_json::to_vec(snapshot).map_err(|e| AppError::SnapshotInvalid(e.to_string()))?;
    let resp = client
        .put(url.as_str())
        .basic_auth(username, Some(password))
        .header("Content-Type", "application/json; charset=utf-8")
        .body(bytes)
        .send()
        .await
        .map_err(classify)?;

    let status = resp.status();
    match status {
        s if s == StatusCode::UNAUTHORIZED || s == StatusCode::FORBIDDEN => Err(auth_error(s)),
        s if s == StatusCode::NOT_FOUND => Err(AppError::WebdavNotFound(format!(
            "上传目标不存在 (HTTP {})",
            s.as_u16()
        ))),
        s if s.is_success() => Ok(()),
        s => Err(AppError::Network(format!(
            "上传快照失败 (HTTP {})",
            s.as_u16()
        ))),
    }
}

/// 目录探测 + 鉴权探测，返回 `{ ok, rootPath, latencyMs }`。
/// 失败一律走 Err（携带统一错误码），便于前端精确提示。
pub async fn test(config: &Value, password: Option<String>) -> Result<TestResult, AppError> {
    let client = build_client(config)?;
    let base = normalize_base(config)?;
    let username = username_of(config);
    let pw = resolve_password(config, password)?;

    let start = Instant::now();
    probe_root(&client, base.as_str(), username, &pw).await?;
    Ok(TestResult {
        ok: true,
        root_path: resolved_root_path(config),
        latency_ms: start.elapsed().as_millis() as u64,
    })
}

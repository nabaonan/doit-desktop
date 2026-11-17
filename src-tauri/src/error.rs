//! 统一错误码与错误类型。
//!
//! 约定：所有 IPC 命令返回 `Result<T, String>`。Err 字符串格式为
//! `"<CODE>: <safe message>"`，例如 `"E_WEBDAV_AUTH: 鉴权失败 (HTTP 401)"`。
//! 前端可用 `err.split(':')[0].trim()` 提取错误码（见 services/ipc.ts）。
//!
//! 安全底线：`safe message` 里绝不包含密码 / 令牌 / 带 userinfo 的 URL，
//! 也绝不透传底层网络库的错误 Display（可能含请求 URL）。

use thiserror::Error;

pub const E_IO: &str = "E_IO";
pub const E_SNAPSHOT_INVALID: &str = "E_SNAPSHOT_INVALID";
pub const E_WEBDAV_AUTH: &str = "E_WEBDAV_AUTH";
pub const E_WEBDAV_NOT_FOUND: &str = "E_WEBDAV_NOT_FOUND";
pub const E_WEBDAV_TIMEOUT: &str = "E_WEBDAV_TIMEOUT";
pub const E_NETWORK: &str = "E_NETWORK";
pub const E_STALE_REMOTE: &str = "E_STALE_REMOTE";
pub const E_CONFLICT_MERGE: &str = "E_CONFLICT_MERGE";
pub const E_PERMISSION: &str = "E_PERMISSION";
pub const E_KEYRING: &str = "E_KEYRING";

/// 命令返回类型别名：Err 一律为 `"CODE: message"` 形式的字符串。
pub type CmdResult<T> = Result<T, String>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("E_IO: {0}")]
    Io(String),
    #[error("E_SNAPSHOT_INVALID: {0}")]
    SnapshotInvalid(String),
    #[error("E_WEBDAV_AUTH: {0}")]
    WebdavAuth(String),
    #[error("E_WEBDAV_NOT_FOUND: {0}")]
    WebdavNotFound(String),
    #[error("E_WEBDAV_TIMEOUT: {0}")]
    WebdavTimeout(String),
    #[error("E_NETWORK: {0}")]
    Network(String),
    #[error("E_STALE_REMOTE: {0}")]
    StaleRemote(String),
    #[error("E_CONFLICT_MERGE: {0}")]
    ConflictMerge(String),
    #[error("E_PERMISSION: {0}")]
    Permission(String),
    #[error("E_KEYRING: {0}")]
    Keyring(String),
}

impl AppError {
    /// 错误码（不含描述），用于结构化事件 / 状态机。
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Io(_) => E_IO,
            AppError::SnapshotInvalid(_) => E_SNAPSHOT_INVALID,
            AppError::WebdavAuth(_) => E_WEBDAV_AUTH,
            AppError::WebdavNotFound(_) => E_WEBDAV_NOT_FOUND,
            AppError::WebdavTimeout(_) => E_WEBDAV_TIMEOUT,
            AppError::Network(_) => E_NETWORK,
            AppError::StaleRemote(_) => E_STALE_REMOTE,
            AppError::ConflictMerge(_) => E_CONFLICT_MERGE,
            AppError::Permission(_) => E_PERMISSION,
            AppError::Keyring(_) => E_KEYRING,
        }
    }

    /// 安全的用户可读描述（不含任何凭据）。
    pub fn message(&self) -> &str {
        match self {
            AppError::Io(s)
            | AppError::SnapshotInvalid(s)
            | AppError::WebdavAuth(s)
            | AppError::WebdavNotFound(s)
            | AppError::WebdavTimeout(s)
            | AppError::Network(s)
            | AppError::StaleRemote(s)
            | AppError::ConflictMerge(s)
            | AppError::Permission(s)
            | AppError::Keyring(s) => s.as_str(),
        }
    }
}

impl From<AppError> for String {
    fn from(e: AppError) -> String {
        e.to_string()
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

//! IPC 命令薄适配层：名称 / 入参与前端契约完全一致。
//! 所有命令返回 `Result<T, String>`，Err 为 `"CODE: message"` 且不含密码。

pub mod settings;
pub mod snapshot;
pub mod sync;
pub mod system;
pub mod update;

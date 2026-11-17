//! doit-desktop Tauri 2 原生侧入口。
//!
//! 边界：本 crate 只提供系统能力 / 网络 / 文件读写，收发 `serde_json::Value`
//! 形式的快照 JSON，**不实现任务树、完成判定或三方合并等业务规则**。

pub mod commands;
pub mod error;
pub mod storage;
pub mod sync;

// security 模块内联声明，复用 src/security/keyring.rs（不额外建 mod.rs）。
mod security {
    pub mod keyring;
}

use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

/// 通过 `manage()` 注入的全局共享状态。
/// 内部字段用 Arc 包一层，便于 `tauri::async_runtime::spawn` 时克隆进 'static 闭包。
pub struct AppState {
    pub sync: Arc<sync::state::SyncState>,
}

pub fn run() {
    tauri::Builder::default()
        // 单实例插件按官方建议最先注册，确保重复启动在其它插件初始化前就被拦截。
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // 第二个实例只把焦点交回主窗口，不做其它动作。
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        // 系统托盘：左键显示窗口，右键菜单「显示 / 退出」；关闭按钮隐藏到托盘，退出走菜单。
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出 doit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let icon = app
                .default_window_icon()
                .expect("托盘图标未配置，请检查 bundle.icon")
                .clone();

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("doit 待办")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            // 关闭按钮隐藏到托盘而非退出（窗口状态插件仍需保存几何，hide 不触发 exit）。
            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }
            Ok(())
        })
        .manage(AppState {
            sync: Arc::new(sync::state::SyncState::new()),
        })
        .invoke_handler(tauri::generate_handler![
            commands::snapshot::load_snapshot,
            commands::snapshot::save_snapshot,
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::settings::get_webdav_config,
            commands::settings::set_webdav_config,
            commands::settings::clear_webdav_secret,
            commands::sync::get_sync_state,
            commands::sync::sync_now,
            commands::sync::test_webdav,
            commands::system::open_external,
            commands::system::app_metadata,
            commands::system::get_autostart,
            commands::system::set_autostart,
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}

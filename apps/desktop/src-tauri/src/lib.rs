use std::path::PathBuf;

use stems_engine::device::{DeviceInfo, OpenedOutput, OutputConfig};
use stems_engine::host::EngineHost;
use stems_engine::{SongInfo, StateEvent, Transport};
use tauri::{Emitter, Manager, State};

/// Versions of the Rust crates, for the About panel and bug reports.
#[tauri::command]
fn engine_info() -> serde_json::Value {
    serde_json::json!({
        "engine": stems_engine::VERSION,
        "control": stems_control::VERSION,
        "library": stems_library::VERSION,
    })
}

#[tauri::command]
async fn engine_devices(host: State<'_, EngineHost>) -> Result<Vec<DeviceInfo>, String> {
    host.devices().map_err(|error| error.to_string())
}

#[tauri::command]
async fn engine_open(host: State<'_, EngineHost>, config: OutputConfig) -> Result<OpenedOutput, String> {
    host.open(config).map_err(|error| error.to_string())
}

#[tauri::command]
async fn engine_close(host: State<'_, EngineHost>) -> Result<(), String> {
    host.close().map_err(|error| error.to_string())
}

#[tauri::command]
async fn engine_load_song(host: State<'_, EngineHost>, paths: Vec<PathBuf>) -> Result<SongInfo, String> {
    host.load_song(paths).map_err(|error| error.to_string())
}

/// A transport command, now or at `at` (a frame of the engine clock).
#[tauri::command]
fn engine_command(host: State<'_, EngineHost>, command: Transport, at: Option<u64>) -> Result<(), String> {
    host.command(command, at).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        // The schema is created from the webview (`app/data/db.ts`) with idempotent statements on every open.
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            let handle = app.handle().clone();
            // The control thread publishes engine state at about 60 Hz.
            let host = EngineHost::spawn(move |state| {
                let _ = handle.emit("engine://state", StateEvent::from(state));
            })?;
            app.manage(host);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            engine_info,
            engine_devices,
            engine_open,
            engine_close,
            engine_load_song,
            engine_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running Stems");
}

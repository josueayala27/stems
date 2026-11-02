use tauri::Manager;

/// Versions of the Rust crates, for the About panel and bug reports.
#[tauri::command]
fn engine_info() -> serde_json::Value {
    serde_json::json!({
        "engine": stems_engine::VERSION,
        "control": stems_control::VERSION,
        "library": stems_library::VERSION,
    })
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
        .invoke_handler(tauri::generate_handler![engine_info])
        .run(tauri::generate_context!())
        .expect("error while running Stems");
}

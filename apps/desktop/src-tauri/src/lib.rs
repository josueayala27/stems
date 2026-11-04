use std::path::PathBuf;

use stems_engine::device::{DeviceInfo, OpenedOutput, OutputConfig};
use stems_engine::engine::{PerformOptions, SongDoc, TransitionDoc};
use stems_engine::host::EngineHost;
use stems_engine::{RoutingDoc, SongInfo, StateEvent, Transport};
use stems_library::import::{self, ImportMode, ImportedSong, Library, Rejected};
use stems_library::relink::{self, Found, Missing};
use tauri::ipc::Response;
use tauri::{Emitter, Manager, State};

/// Run blocking work (engine round trips, file I/O) off the main thread and the async runtime.
async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work).await.map_err(|error| error.to_string())?
}

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
    let host = host.inner().clone();
    blocking(move || host.devices().map_err(|error| error.to_string())).await
}

#[tauri::command]
async fn engine_open(host: State<'_, EngineHost>, config: OutputConfig) -> Result<OpenedOutput, String> {
    let host = host.inner().clone();
    blocking(move || host.open(config).map_err(|error| error.to_string())).await
}

#[tauri::command]
async fn engine_close(host: State<'_, EngineHost>) -> Result<(), String> {
    let host = host.inner().clone();
    blocking(move || host.close().map_err(|error| error.to_string())).await
}

/// Load a song document (the `@stems/schema` song) as the current song.
#[tauri::command]
async fn engine_load_song(host: State<'_, EngineHost>, song: SongDoc) -> Result<SongInfo, String> {
    let host = host.inner().clone();
    blocking(move || host.load_song(song).map_err(|error| error.to_string())).await
}

/// Preload the next setlist song and how to reach it.
#[tauri::command]
async fn engine_prepare_next(host: State<'_, EngineHost>, song: SongDoc, transition: TransitionDoc) -> Result<SongInfo, String> {
    let host = host.inner().clone();
    blocking(move || host.prepare_next(song, transition).map_err(|error| error.to_string())).await
}

#[tauri::command]
async fn engine_clear_next(host: State<'_, EngineHost>) -> Result<(), String> {
    let host = host.inner().clone();
    blocking(move || host.clear_next().map_err(|error| error.to_string())).await
}

/// Click and guide settings.
#[tauri::command]
async fn engine_set_options(host: State<'_, EngineHost>, options: PerformOptions) -> Result<(), String> {
    let host = host.inner().clone();
    blocking(move || host.set_options(options).map_err(|error| error.to_string())).await
}

/// Crossfade to a pad file, or fade the pad out with `null`.
#[tauri::command]
async fn engine_set_pad(host: State<'_, EngineHost>, file: Option<PathBuf>) -> Result<(), String> {
    let host = host.inner().clone();
    blocking(move || host.set_pad(file).map_err(|error| error.to_string())).await
}

/// The rig's buses (by index) and where each goes on the device.
#[tauri::command]
async fn engine_set_routing(host: State<'_, EngineHost>, routing: RoutingDoc) -> Result<(), String> {
    let host = host.inner().clone();
    blocking(move || host.set_routing(routing).map_err(|error| error.to_string())).await
}

/// A transport command, now or at `at` (a frame of the engine clock).
#[tauri::command]
async fn engine_command(host: State<'_, EngineHost>, command: Transport, at: Option<u64>) -> Result<(), String> {
    let host = host.inner().clone();
    blocking(move || host.command(command, at).map_err(|error| error.to_string())).await
}

/// Probe folders or files and report what would import (the import dialog preview).
#[tauri::command]
async fn library_plan_import(paths: Vec<PathBuf>) -> Result<import::ImportPlan, String> {
    blocking(move || Ok(import::plan(&paths))).await
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportResult {
    song: ImportedSong,
    rejected: Vec<Rejected>,
}

/// Import folders or files as one song: hash, copy or reference, peaks and tempo.
#[tauri::command]
async fn library_import(library: State<'_, Library>, paths: Vec<PathBuf>, mode: ImportMode) -> Result<ImportResult, String> {
    let library = library.inner().clone();
    blocking(move || {
        let plan = import::plan(&paths);
        let song = import::import(&plan, &library, mode).map_err(|error| error.to_string())?;
        Ok(ImportResult { song, rejected: plan.rejected })
    })
    .await
}

/// The peak file for a track hash, as raw bytes (`app/audio/peaks.ts` parses it).
#[tauri::command]
async fn library_peaks(library: State<'_, Library>, hash: String) -> Result<Response, String> {
    let path = library.peaks_path(&hash).ok_or("invalid hash")?;
    blocking(move || std::fs::read(path).map(Response::new).map_err(|error| error.to_string())).await
}

/// Which of these media files exist.
#[tauri::command]
async fn library_files_exist(files: Vec<PathBuf>) -> Result<Vec<bool>, String> {
    blocking(move || Ok(files.iter().map(|file| file.is_file()).collect())).await
}

/// Look for missing media by hash under `folder`.
#[tauri::command]
async fn library_relink(missing: Vec<Missing>, folder: PathBuf) -> Result<Vec<Found>, String> {
    blocking(move || Ok(relink::relink(&missing, &folder))).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
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
            // Copies and peak files live next to the database in the app data folder.
            app.manage(Library::new(app.path().app_data_dir()?.join("library")));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            engine_info,
            engine_devices,
            engine_open,
            engine_close,
            engine_load_song,
            engine_prepare_next,
            engine_clear_next,
            engine_set_options,
            engine_set_pad,
            engine_set_routing,
            engine_command,
            library_plan_import,
            library_import,
            library_peaks,
            library_files_exist,
            library_relink
        ])
        .run(tauri::generate_context!())
        .expect("error while running Stems");
}

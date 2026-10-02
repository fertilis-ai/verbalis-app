mod commands;

use commands::{fs, http, keychain, logs};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Info-level logging in debug builds, Warn in release so
            // production issues remain diagnosable.
            let log_level = if cfg!(debug_assertions) {
                log::LevelFilter::Info
            } else {
                log::LevelFilter::Warn
            };
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log_level)
                    .build(),
            )?;

            // Initialize the app data directory on startup
            if let Err(e) = fs::init_app_data_dir() {
                log::error!("Failed to initialize app data directory: {}", e);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            fs::get_home_dir,
            fs::get_app_data_dir,
            fs::init_app_data_dir,
            fs::read_directory,
            fs::read_file,
            fs::write_file,
            fs::write_file_base64,
            fs::read_file_base64,
            fs::copy_file,
            fs::reveal_in_folder,
            fs::delete_path,
            fs::create_directory,
            fs::path_exists,
            fs::list_files,
            fs::rename_path,
            http::http_request,
            // Debug logging
            logs::append_log,
            logs::clear_log,
            logs::read_log,
            logs::list_log_files,
            logs::read_log_file,
            logs::clear_log_file,
            logs::append_log_file,
            logs::write_log_file,
            // Keychain (secure API key storage)
            keychain::store_api_key,
            keychain::get_api_key,
            keychain::delete_api_key,
            keychain::get_all_api_keys,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

mod commands;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
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
            if let Err(e) = init_app_data_dir() {
                log::error!("Failed to initialize app data directory: {}", e);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_home_dir,
            get_app_data_dir,
            init_app_data_dir,
            read_directory,
            read_file,
            write_file,
            write_file_base64,
            read_file_base64,
            copy_file,
            reveal_in_folder,
            delete_path,
            create_directory,
            path_exists,
            list_files,
            read_config,
            save_config,
            rename_path,
            run_pi_sidecar,
            // New agentic commands
            execute_shell,
            read_clipboard,
            write_clipboard,
            send_notification,
            http_request,
            backup_file,
            restore_file,
            // Debug logging
            append_log,
            clear_log,
            read_log,
            list_log_files,
            read_log_file,
            clear_log_file,
            append_log_file,
            write_log_file,
            // Keychain (secure API key storage)
            store_api_key,
            get_api_key,
            delete_api_key,
            get_all_api_keys,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

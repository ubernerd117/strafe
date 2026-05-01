use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub shortcut: String,
    pub results_count: u8,
    pub brave_api_key: String,
    pub click_outside_dismisses: bool,
    pub scroll_speed: u8,
    pub theme: String,
    pub default_view: String,
    pub shortcuts: HashMap<String, String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        let mut shortcuts = HashMap::new();
        shortcuts.insert("sxm".to_string(), "https://www.siriusxm.com/".to_string());
        
        Self {
            shortcut: "Option+Space".to_string(),
            results_count: 4,
            brave_api_key: String::new(),
            click_outside_dismisses: true,
            scroll_speed: 3,
            theme: "auto".to_string(),
            default_view: "text".to_string(),
            shortcuts,
        }
    }
}

impl AppConfig {
    pub fn config_path(app_handle: &tauri::AppHandle) -> PathBuf {
        let config_dir = app_handle
            .path()
            .app_config_dir()
            .expect("failed to get app config dir");
        fs::create_dir_all(&config_dir).ok();
        config_dir.join("config.json")
    }

    pub fn load(app_handle: &tauri::AppHandle) -> Self {
        let path = Self::config_path(app_handle);
        match fs::read_to_string(&path) {
            Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
            Err(_) => {
                let config = Self::default();
                config.save(app_handle);
                config
            }
        }
    }

    pub fn save(&self, app_handle: &tauri::AppHandle) {
        let path = Self::config_path(app_handle);
        let json = serde_json::to_string_pretty(self).expect("failed to serialize config");
        fs::write(path, json).expect("failed to write config");
    }
}

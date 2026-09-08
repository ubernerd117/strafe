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
    #[serde(default)]
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

#[cfg(test)]
mod tests {
    use super::AppConfig;
    use std::collections::HashMap;

    #[test]
    fn previous_config_without_shortcuts_round_trips_saved_values() {
        let json = r#"{
            "shortcut": "Command+Shift+K",
            "results_count": 9,
            "brave_api_key": "saved-key",
            "click_outside_dismisses": false,
            "scroll_speed": 7,
            "theme": "light",
            "default_view": "raw"
        }"#;

        let migrated: AppConfig = serde_json::from_str(json).expect("previous config should load");
        let serialized =
            serde_json::to_string(&migrated).expect("migrated config should serialize");
        let config: AppConfig =
            serde_json::from_str(&serialized).expect("migrated config should load again");

        assert_eq!(config.shortcut, "Command+Shift+K");
        assert_eq!(config.results_count, 9);
        assert_eq!(config.brave_api_key, "saved-key");
        assert!(!config.click_outside_dismisses);
        assert_eq!(config.scroll_speed, 7);
        assert_eq!(config.theme, "light");
        assert_eq!(config.default_view, "raw");
        assert_eq!(config.shortcuts, HashMap::new());
    }

    #[test]
    fn config_preserves_custom_and_explicitly_empty_shortcuts() {
        let custom_json = r#"{
            "shortcut": "Option+Space",
            "results_count": 4,
            "brave_api_key": "",
            "click_outside_dismisses": true,
            "scroll_speed": 3,
            "theme": "auto",
            "default_view": "text",
            "shortcuts": {"docs": "https://docs.rs/"}
        }"#;
        let empty_json = r#"{
            "shortcut": "Option+Space",
            "results_count": 4,
            "brave_api_key": "",
            "click_outside_dismisses": true,
            "scroll_speed": 3,
            "theme": "auto",
            "default_view": "text",
            "shortcuts": {}
        }"#;

        let custom: AppConfig =
            serde_json::from_str(custom_json).expect("custom shortcuts should load");
        let empty: AppConfig =
            serde_json::from_str(empty_json).expect("empty shortcuts should load");

        assert_eq!(
            custom.shortcuts.get("docs").map(String::as_str),
            Some("https://docs.rs/")
        );
        assert!(empty.shortcuts.is_empty());
    }
}

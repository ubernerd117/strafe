use crate::config::AppConfig;
use crate::fetcher::{self, FetchedPage};
use crate::search::{self, SearchResult};

#[tauri::command]
pub async fn search_query(
    app: tauri::AppHandle,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    let config = AppConfig::load(&app);
    if config.brave_api_key.is_empty() {
        return Err("No API key configured".to_string());
    }
    search::search_brave(&config.brave_api_key, &query, config.results_count).await
}

#[tauri::command]
pub async fn fetch_single_page(url: String) -> Result<FetchedPage, String> {
    Ok(fetcher::fetch_single_page(url).await)
}

#[tauri::command]
pub fn get_config(app: tauri::AppHandle) -> AppConfig {
    AppConfig::load(&app)
}

#[tauri::command]
pub fn save_config(app: tauri::AppHandle, config: AppConfig) {
    config.save(&app);
}

use crate::config::AppConfig;
use crate::fetcher::{self, FetchedPage};
use crate::search::{self, SearchResult};

#[tauri::command]
pub async fn search_query(
    app: tauri::AppHandle,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    let config = AppConfig::load(&app);
    search_query_with_config(&config, &query, search::BRAVE_BASE_URL).await
}

async fn search_query_with_config(
    config: &AppConfig,
    query: &str,
    base_url: &str,
) -> Result<Vec<SearchResult>, String> {
    if config.brave_api_key.is_empty() {
        return Err("No API key configured".to_string());
    }
    search::search_brave(base_url, &config.brave_api_key, query, config.results_count).await
}

#[tauri::command]
pub async fn get_ai_summary(app: tauri::AppHandle, query: String) -> Result<String, String> {
    let config = AppConfig::load(&app);
    get_ai_summary_with_config(&config, &query, search::BRAVE_BASE_URL).await
}

async fn get_ai_summary_with_config(
    config: &AppConfig,
    query: &str,
    base_url: &str,
) -> Result<String, String> {
    search::fetch_brave_summary(base_url, &config.brave_answers_api_key, query).await
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    struct BraveServer {
        url: String,
        requests: Arc<Mutex<Vec<String>>>,
        task: tokio::task::JoinHandle<()>,
    }

    impl Drop for BraveServer {
        fn drop(&mut self) {
            self.task.abort();
        }
    }

    impl BraveServer {
        async fn start(status: u16, body: &str) -> Self {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let url = format!("http://{}/res/v1", listener.local_addr().unwrap());
            let requests = Arc::new(Mutex::new(Vec::new()));
            let recorded = requests.clone();
            let response = format!(
                "HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()
            );
            let task = tokio::spawn(async move {
                loop {
                    let (mut socket, _) = listener.accept().await.unwrap();
                    let mut request = Vec::new();
                    let mut buffer = [0; 4096];
                    loop {
                        let read = socket.read(&mut buffer).await.unwrap();
                        if read == 0 {
                            break;
                        }
                        request.extend_from_slice(&buffer[..read]);
                        if let Some(end) = request.windows(4).position(|bytes| bytes == b"\r\n\r\n")
                        {
                            let headers = String::from_utf8_lossy(&request[..end]).to_lowercase();
                            let length = headers
                                .lines()
                                .find_map(|line| line.strip_prefix("content-length: "))
                                .map(|value| value.parse::<usize>().unwrap())
                                .unwrap_or(0);
                            if request.len() >= end + 4 + length {
                                break;
                            }
                        }
                    }
                    recorded
                        .lock()
                        .unwrap()
                        .push(String::from_utf8(request).unwrap());
                    socket.write_all(response.as_bytes()).await.unwrap();
                }
            });
            Self {
                url,
                requests,
                task,
            }
        }
    }

    fn configured_keys() -> AppConfig {
        AppConfig {
            brave_api_key: "search-secret".into(),
            brave_answers_api_key: "answers-secret".into(),
            ..AppConfig::default()
        }
    }

    #[tokio::test]
    async fn search_sends_only_search_key_with_or_without_answers_subscription() {
        let server = BraveServer::start(
            200,
            r#"{"web":{"results":[{"title":"Article","url":"https://example.com"}]}}"#,
        )
        .await;
        for answers_key in ["answers-secret", ""] {
            let config = AppConfig {
                brave_answers_api_key: answers_key.into(),
                ..configured_keys()
            };
            let results = search_query_with_config(&config, "rust & tauri", &server.url)
                .await
                .unwrap();
            assert_eq!(results[0].title, "Article");
        }
        let requests = server.requests.lock().unwrap();
        assert_eq!(requests.len(), 2);
        for request in requests.iter() {
            assert!(request.starts_with("GET /res/v1/web/search?"), "{request}");
            assert!(request.contains("q=rust+%26+tauri&count=4"), "{request}");
            assert!(request.contains("x-subscription-token: search-secret\r\n"));
            assert!(!request.contains("answers-secret"));
        }
    }

    #[tokio::test]
    async fn overview_calls_answers_directly_using_only_answers_key() {
        let server = BraveServer::start(
            200,
            r#"{"choices":[{"message":{"content":"  Overview text  "}}]}"#,
        )
        .await;
        let result = get_ai_summary_with_config(&configured_keys(), "rust & tauri", &server.url)
            .await
            .unwrap();
        assert_eq!(result, "Overview text");
        let requests = server.requests.lock().unwrap();
        assert_eq!(
            requests.len(),
            1,
            "Overview must not use legacy Search/Summarizer routes"
        );
        let request = &requests[0];
        assert!(request.starts_with("POST /res/v1/chat/completions HTTP/1.1\r\n"));
        assert!(request.contains("x-subscription-token: answers-secret\r\n"));
        assert!(!request.contains("search-secret"));
        let body: serde_json::Value =
            serde_json::from_str(request.split_once("\r\n\r\n").unwrap().1).unwrap();
        assert_eq!(
            body,
            serde_json::json!({"model":"brave","stream":false,"messages":[{"role":"user","content":"rust & tauri"}]})
        );
    }

    #[tokio::test]
    async fn missing_answers_key_returns_setup_message_without_any_http_request() {
        let server = BraveServer::start(
            200,
            r#"{"choices":[{"message":{"content":"Should not be requested"}}]}"#,
        )
        .await;
        for answers_key in ["", " \t\n"] {
            let config = AppConfig {
                brave_answers_api_key: answers_key.into(),
                ..configured_keys()
            };
            let error = get_ai_summary_with_config(&config, "topic", &server.url)
                .await
                .unwrap_err();
            assert!(error.contains("Brave Answers API key"), "{error}");
            assert!(error.contains("Settings"), "{error}");
            assert!(error.contains("plan"), "{error}");
        }
        assert!(server.requests.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn answers_does_not_require_a_search_key() {
        let server =
            BraveServer::start(200, r#"{"choices":[{"message":{"content":"Overview"}}]}"#).await;
        let config = AppConfig {
            brave_api_key: String::new(),
            ..configured_keys()
        };
        assert_eq!(
            get_ai_summary_with_config(&config, "topic", &server.url)
                .await
                .unwrap(),
            "Overview"
        );
    }

    #[tokio::test]
    async fn answers_errors_distinguish_auth_plan_rate_limit_and_service_failures() {
        for (status, expected) in [
            (401, "authentication"),
            (402, "Answers plan"),
            (403, "Answers plan"),
            (429, "rate limit"),
            (500, "try again"),
        ] {
            let server = BraveServer::start(status, "vendor response must not be exposed").await;
            let error = get_ai_summary_with_config(&configured_keys(), "topic", &server.url)
                .await
                .unwrap_err();
            assert!(error.contains(expected), "{status}: {error}");
            assert!(error.contains(&status.to_string()), "{error}");
            assert!(!error.contains("vendor response"));
            assert!(!error.contains("search-secret"));
            assert!(!error.contains("answers-secret"));
        }
    }

    #[tokio::test]
    async fn answers_reports_documented_token_and_plan_errors_from_response_codes() {
        for (status, code, expected) in [
            (422, "SUBSCRIPTION_TOKEN_INVALID", "authentication"),
            (422, "SUBSCRIPTION_NOT_FOUND", "Answers plan"),
            (400, "RESOURCE_NOT_ALLOWED", "Answers plan"),
            (400, "OPTION_NOT_IN_PLAN", "Answers plan"),
            (402, "CREDIT_EXHAUSTED", "credits"),
            (429, "QUOTA_LIMITED", "quota"),
            (429, "USAGE_LIMIT_EXCEEDED", "quota"),
        ] {
            let body = serde_json::json!({"error": {
                "code": code, "status": status,
                "detail": "secret <script>vendor data</script>"
            }})
            .to_string();
            let server = BraveServer::start(status, &body).await;
            let error = get_ai_summary_with_config(&configured_keys(), "topic", &server.url)
                .await
                .unwrap_err();
            assert!(error.contains(expected), "{code}: {error}");
            assert!(error.contains(&status.to_string()), "{error}");
            assert!(!error.contains("secret"));
            assert!(!error.contains("<script>"));
        }
    }

    #[tokio::test]
    async fn answers_rejects_empty_or_malformed_responses() {
        for body in [
            r#"{"choices":[]}"#,
            r#"{"choices":[{"message":{"content":"  "}}]}"#,
            "invalid json",
        ] {
            let server = BraveServer::start(200, body).await;
            assert!(
                get_ai_summary_with_config(&configured_keys(), "topic", &server.url)
                    .await
                    .is_err()
            );
        }
    }
}

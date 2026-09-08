use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const SEARCH_TIMEOUT: Duration = Duration::from_secs(20);
const AI_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub description: String,
}

#[derive(Deserialize)]
struct BraveResponse {
    web: Option<BraveWeb>,
}

#[derive(Deserialize)]
struct BraveWeb {
    results: Vec<BraveResult>,
}

#[derive(Deserialize)]
struct BraveResult {
    title: String,
    url: String,
    description: Option<String>,
}

impl From<BraveResult> for SearchResult {
    fn from(result: BraveResult) -> Self {
        Self {
            title: result.title,
            url: result.url,
            description: result.description.unwrap_or_default(),
        }
    }
}

#[derive(Deserialize)]
struct BraveSummaryResponse {
    summarizer: Option<BraveSummarizer>,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct BraveSummarizer {
    pub key: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub title: Option<String>,
}

#[derive(Deserialize)]
struct BraveAnswersResponse {
    choices: Vec<BraveAnswerChoice>,
}

#[derive(Deserialize)]
struct BraveAnswerChoice {
    message: BraveAnswerMessage,
}

#[derive(Deserialize)]
struct BraveAnswerMessage {
    content: String,
}

async fn with_deadline<T>(
    operation: &str,
    deadline: Duration,
    future: impl std::future::Future<Output = Result<T, String>>,
) -> Result<T, String> {
    tokio::time::timeout(deadline, future)
        .await
        .map_err(|_| timeout_error(operation))?
}

fn timeout_error(operation: &str) -> String {
    format!("{operation} timed out. Please try again.")
}

fn request_error(operation: &str, context: &str, error: reqwest::Error) -> String {
    if error.is_timeout() {
        timeout_error(operation)
    } else {
        format!("{context}: {error}")
    }
}

fn brave_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|error| format!("Failed to initialize Brave client: {error}"))
}

fn build_unavailable_error() -> String {
    "AI Overview is unavailable for this Brave API key. Legacy Summarizer access requires the discontinued Pro AI plan, and the fallback Answers endpoint requires an Answers plan.".to_string()
}

fn collect_strings(value: &Value, out: &mut Vec<String>) {
    match value {
        Value::String(text) => {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                out.push(trimmed.to_string());
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_strings(item, out);
            }
        }
        Value::Object(map) => {
            for key in ["text", "answer", "raw_text", "content", "text_markdown"] {
                if let Some(value) = map.get(key) {
                    collect_strings(value, out);
                }
            }
        }
        _ => {}
    }
}

fn extract_summary_text(payload: &Value) -> Option<String> {
    let status = payload.get("status").and_then(Value::as_str);
    if matches!(status, Some("failed")) {
        return None;
    }

    let mut parts = Vec::new();

    if let Some(summary) = payload.get("summary") {
        collect_strings(summary, &mut parts);
    }

    if parts.is_empty() {
        if let Some(enrichments) = payload.get("enrichments") {
            collect_strings(enrichments, &mut parts);
        }
    }

    if parts.is_empty() {
        return None;
    }

    let mut deduped = Vec::new();
    for part in parts {
        if deduped.last() != Some(&part) {
            deduped.push(part);
        }
    }

    Some(deduped.join("\n\n"))
}

async fn fetch_brave_answer(api_key: &str, query: &str) -> Result<String, String> {
    let client = brave_client()?;
    let resp = client
        .post("https://api.search.brave.com/res/v1/chat/completions")
        .header("X-Subscription-Token", api_key)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .json(&serde_json::json!({
            "model": "brave",
            "stream": false,
            "messages": [
                {
                    "role": "user",
                    "content": query,
                }
            ]
        }))
        .send()
        .await
        .map_err(|e| request_error("AI overview", "Failed to fetch AI overview", e))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(build_unavailable_error());
    }

    let answers: BraveAnswersResponse = resp
        .json()
        .await
        .map_err(|e| request_error("AI overview", "Failed to parse AI overview response", e))?;

    let text = answers
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message.content.trim().to_string())
        .filter(|content| !content.is_empty())
        .ok_or_else(|| "The AI overview returned an empty response.".to_string())?;

    Ok(text)
}

pub async fn search_brave(
    api_key: &str,
    query: &str,
    results_count: u8,
) -> Result<Vec<SearchResult>, String> {
    with_deadline(
        "Search",
        SEARCH_TIMEOUT,
        search_brave_inner(api_key, query, results_count),
    )
    .await
}

async fn search_brave_inner(
    api_key: &str,
    query: &str,
    results_count: u8,
) -> Result<Vec<SearchResult>, String> {
    let client = brave_client()?;
    let resp = client
        .get("https://api.search.brave.com/res/v1/web/search")
        .header("X-Subscription-Token", api_key)
        .header("Accept", "application/json")
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .query(&[
            ("q", query),
            ("count", &results_count.to_string()),
        ])
        .send()
        .await
        .map_err(|e| request_error("Search", "Search request failed", e))?;

    let resp = resp
        .error_for_status()
        .map_err(|e| request_error("Search", "Search request failed", e))?;

    let brave_resp: BraveResponse = resp
        .json()
        .await
        .map_err(|e| request_error("Search", "Failed to parse search response", e))?;

    let results = brave_resp
        .web
        .map(|web| web.results.into_iter().map(SearchResult::from).collect())
        .unwrap_or_default();

    Ok(results)
}

pub async fn fetch_brave_summary(api_key: &str, query: &str) -> Result<String, String> {
    with_deadline(
        "AI overview",
        AI_TIMEOUT,
        fetch_brave_summary_inner(api_key, query),
    )
    .await
}

async fn fetch_brave_summary_inner(api_key: &str, query: &str) -> Result<String, String> {
    let client = brave_client()?;

    // 1. Initial search with summary=1 to get the summary key
    let resp = client
        .get("https://api.search.brave.com/res/v1/web/search")
        .header("X-Subscription-Token", api_key)
        .header("Accept", "application/json")
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .query(&[("q", query), ("summary", "1"), ("count", "5")])
        .send()
        .await
        .map_err(|e| request_error("AI overview", "Summary request failed", e))?;

    let resp = resp
        .error_for_status()
        .map_err(|e| request_error("AI overview", "Summary request failed", e))?;

    let brave_resp: BraveSummaryResponse = resp
        .json()
        .await
        .map_err(|e| request_error("AI overview", "Failed to parse summary response", e))?;

    let Some(summary_obj) = brave_resp.summarizer else {
        return fetch_brave_answer(api_key, query).await;
    };

    // 2. Fetch the actual summary text using the key
    // Note: Sometimes the summary is already in the first response, but for complex ones we need to poll/fetch
    let resp = client
        .get("https://api.search.brave.com/res/v1/summarizer/search")
        .header("X-Subscription-Token", api_key)
        .header("Accept", "application/json")
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .query(&[("key", &summary_obj.key)])
        .send()
        .await
        .map_err(|e| request_error("AI overview", "Failed to fetch summary", e))?;

    let resp = resp
        .error_for_status()
        .map_err(|e| request_error("AI overview", "Summary generation failed", e))?;

    let summary_detail: Value = resp
        .json()
        .await
        .map_err(|e| request_error("AI overview", "Failed to parse summary detail", e))?;

    let full_summary = extract_summary_text(&summary_detail)
        .or_else(|| summary_obj.title.clone())
        .ok_or_else(|| "The AI overview response did not contain summary text.".to_string())?;

    Ok(full_summary)
}

#[cfg(test)]
mod tests {
    use super::{BraveResult, SearchResult};

    #[tokio::test]
    async fn operation_deadline_returns_actionable_error() {
        for operation in ["Search", "AI overview"] {
            let result = tokio::time::timeout(
                std::time::Duration::from_secs(1),
                super::with_deadline(
                    operation,
                    std::time::Duration::from_millis(20),
                    std::future::pending::<Result<(), String>>(),
                ),
            )
            .await;
            let error = result.expect("operation deadline must fire").unwrap_err();
            assert_eq!(error, format!("{operation} timed out. Please try again."));
        }
    }

    #[tokio::test]
    async fn operation_deadline_preserves_success_and_failure() {
        let duration = std::time::Duration::from_secs(1);
        assert_eq!(
            super::with_deadline("Search", duration, async { Ok(42) }).await,
            Ok(42)
        );
        assert_eq!(
            super::with_deadline("Search", duration, async {
                Err::<(), _>("original error".to_string())
            })
            .await,
            Err("original error".to_string())
        );
    }

    async fn stalled_response_times_out(send_headers: bool) {
        use std::time::Duration;
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = [0; 1];
            socket.read_exact(&mut request).await.unwrap();
            if send_headers {
                socket
                    .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n{")
                    .await
                    .unwrap();
            }
            std::future::pending::<()>().await;
        });
        let result = tokio::time::timeout(Duration::from_secs(18), async {
            super::brave_client()
                .expect("client should build")
                .get(url)
                .send()
                .await?
                .text()
                .await
        })
        .await;
        server.abort();
        let error = result
            .expect("Brave request must terminate before the outer guard")
            .expect_err("stalled response must fail");
        assert!(error.is_timeout(), "expected timeout, got {error}");
        assert_eq!(
            super::request_error("Search", "request failed", error),
            "Search timed out. Please try again."
        );
    }

    #[tokio::test]
    async fn stalled_headers_hit_request_deadline() {
        stalled_response_times_out(false).await;
    }

    #[tokio::test]
    async fn stalled_body_hits_request_deadline() {
        stalled_response_times_out(true).await;
    }

    #[test]
    fn brave_result_without_description_converts_with_empty_description() {
        let brave_result: BraveResult =
            serde_json::from_str(r#"{"title":"Result","url":"https://example.com"}"#)
                .expect("result without description should deserialize");

        let result: SearchResult = brave_result.into();

        assert_eq!(result.description, "");
    }

    #[test]
    fn brave_result_with_null_description_converts_with_empty_description() {
        let brave_result: BraveResult = serde_json::from_str(
            r#"{"title":"Result","url":"https://example.com","description":null}"#,
        )
        .expect("result with null description should deserialize");

        let result: SearchResult = brave_result.into();

        assert_eq!(result.description, "");
    }

    #[test]
    fn brave_result_with_description_preserves_snippet() {
        let brave_result: BraveResult = serde_json::from_str(
            r#"{"title":"Result","url":"https://example.com","description":"Useful snippet"}"#,
        )
        .expect("result with description should deserialize");

        let result: SearchResult = brave_result.into();

        assert_eq!(result.title, "Result");
        assert_eq!(result.url, "https://example.com");
        assert_eq!(result.description, "Useful snippet");
    }
}

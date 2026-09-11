use serde::{Deserialize, Serialize};
use std::time::Duration;

pub(crate) const BRAVE_BASE_URL: &str = "https://api.search.brave.com/res/v1";

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

#[derive(Deserialize)]
struct BraveErrorResponse {
    error: BraveError,
}

#[derive(Deserialize)]
struct BraveError {
    code: String,
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

fn answers_status_error(status: reqwest::StatusCode, error_code: Option<&str>) -> String {
    let code = status.as_u16();
    // Brave can report token and subscription errors with HTTP 422 or 400.
    // Map documented codes to our own copy; vendor details may contain secrets.
    match error_code {
        Some("SUBSCRIPTION_TOKEN_INVALID") => format!("Brave Answers authentication failed (HTTP {code}). Check the Brave Answers API key in Settings."),
        Some("SUBSCRIPTION_NOT_FOUND" | "RESOURCE_NOT_ALLOWED" | "OPTION_NOT_IN_PLAN") => format!("Brave Answers access denied (HTTP {code}). Check that your Answers key has an active Answers plan."),
        Some("CREDIT_EXHAUSTED") => format!("Brave Answers credits exhausted (HTTP {code}). Check your Answers plan and billing."),
        Some("QUOTA_LIMITED" | "USAGE_LIMIT_EXCEEDED") => format!("Brave Answers quota exceeded (HTTP {code}). Check your Answers plan usage limits."),
        Some("RATE_LIMITED") => format!("Brave Answers rate limit reached (HTTP {code}). Please try again later."),
        _ => match code {
            401 => "Brave Answers authentication failed (HTTP 401). Check the Brave Answers API key in Settings.".to_string(),
            402 | 403 => format!("Brave Answers access denied (HTTP {code}). Check that your Answers key has an active Answers plan."),
            429 => "Brave Answers rate limit reached (HTTP 429). Please try again later.".to_string(),
            _ => format!("Brave Answers request failed (HTTP {code}). Please try again later."),
        },
    }
}

async fn fetch_brave_answer(base_url: &str, api_key: &str, query: &str) -> Result<String, String> {
    let client = brave_client()?;
    let resp = client
        .post(format!("{base_url}/chat/completions"))
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
        let error = resp.json::<BraveErrorResponse>().await.ok();
        return Err(answers_status_error(
            status,
            error.as_ref().map(|response| response.error.code.as_str()),
        ));
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
    base_url: &str,
    api_key: &str,
    query: &str,
    results_count: u8,
) -> Result<Vec<SearchResult>, String> {
    with_deadline(
        "Search",
        SEARCH_TIMEOUT,
        search_brave_inner(base_url, api_key, query, results_count),
    )
    .await
}

async fn search_brave_inner(
    base_url: &str,
    api_key: &str,
    query: &str,
    results_count: u8,
) -> Result<Vec<SearchResult>, String> {
    let client = brave_client()?;
    let resp = client
        .get(format!("{base_url}/web/search"))
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

pub async fn fetch_brave_summary(
    base_url: &str,
    answers_api_key: &str,
    query: &str,
) -> Result<String, String> {
    let answers_api_key = answers_api_key.trim();
    if answers_api_key.is_empty() {
        return Err("AI Overview requires a Brave Answers API key. Add it in Settings; Answers requires its own plan and key.".to_string());
    }
    with_deadline(
        "AI overview",
        AI_TIMEOUT,
        fetch_brave_answer(base_url, answers_api_key, query),
    )
    .await
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

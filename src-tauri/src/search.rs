use serde::{Deserialize, Serialize};
use serde_json::Value;

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
    description: String,
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

fn brave_client() -> reqwest::Client {
    reqwest::Client::new()
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
    let client = brave_client();
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
        .map_err(|e| format!("Failed to fetch AI overview: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        return Err(build_unavailable_error());
    }

    let answers: BraveAnswersResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse AI overview response: {}", e))?;

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
    let client = brave_client();
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
        .map_err(|e| format!("Search request failed: {}", e))?;

    let resp = resp
        .error_for_status()
        .map_err(|e| format!("Search request failed: {}", e))?;

    let brave_resp: BraveResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse search response: {}", e))?;

    let results = brave_resp
        .web
        .map(|web| {
            web.results
                .into_iter()
                .map(|result| SearchResult {
                    title: result.title,
                    url: result.url,
                    description: result.description,
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(results)
}

pub async fn fetch_brave_summary(
    api_key: &str,
    query: &str,
) -> Result<String, String> {
    let client = brave_client();
    
    // 1. Initial search with summary=1 to get the summary key
    let resp = client
        .get("https://api.search.brave.com/res/v1/web/search")
        .header("X-Subscription-Token", api_key)
        .header("Accept", "application/json")
        .header("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .query(&[("q", query), ("summary", "1"), ("count", "5")])
        .send()
        .await
        .map_err(|e| format!("Summary request failed: {}", e))?;

    let resp = resp
        .error_for_status()
        .map_err(|e| format!("Summary request failed: {}", e))?;

    let brave_resp: BraveSummaryResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse summary response: {}", e))?;

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
        .map_err(|e| format!("Failed to fetch summary: {}", e))?;

    let resp = resp
        .error_for_status()
        .map_err(|e| format!("Summary generation failed: {}", e))?;

    let summary_detail: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse summary detail: {}", e))?;

    let full_summary = extract_summary_text(&summary_detail)
        .or_else(|| summary_obj.title.clone())
        .ok_or_else(|| "The AI overview response did not contain summary text.".to_string())?;

    Ok(full_summary)
}

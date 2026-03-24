use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct FetchedPage {
    pub url: String,
    pub html: Option<String>,
    pub error: Option<String>,
}

pub async fn fetch_single_page(url: String) -> FetchedPage {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("Strafe/0.1 (desktop search reader; +https://github.com/ubernerd117/strafe)")
        .build()
        .unwrap_or_default();

    match client.get(&url).send().await {
        Ok(resp) => match resp.text().await {
            Ok(html) => FetchedPage {
                url,
                html: Some(html),
                error: None,
            },
            Err(e) => FetchedPage {
                url,
                html: None,
                error: Some(format!("Failed to read body: {}", e)),
            },
        },
        Err(e) => FetchedPage {
            url,
            html: None,
            error: Some(format!("Failed to fetch: {}", e)),
        },
    }
}

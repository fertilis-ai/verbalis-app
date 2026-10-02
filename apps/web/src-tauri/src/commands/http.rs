//! Outgoing HTTP requests for the web tools (`lib/tools/web-tools.ts`).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub duration_ms: u64,
}

/// Make an HTTP request
#[tauri::command]
pub async fn http_request(
    url: String,
    method: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<HttpResponse, String> {
    let start = std::time::Instant::now();
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(30000)); // Default 30s

    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let method = method.to_uppercase();
    let mut request = match method.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "PATCH" => client.patch(&url),
        "HEAD" => client.head(&url),
        _ => return Err(format!("Unsupported HTTP method: {}", method)),
    };

    // Add headers
    if let Some(hdrs) = headers {
        for (key, value) in hdrs {
            request = request.header(&key, &value);
        }
    }

    // Add body
    if let Some(b) = body {
        request = request.body(b);
    }

    let response = request.send().await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let status = response.status().as_u16();
    let headers: HashMap<String, String> = response.headers()
        .iter()
        .map(|(k, v)| {
            let value = v.to_str().unwrap_or_else(|_| {
                log::warn!("Dropping non-UTF8 value for response header {}", k);
                ""
            });
            (k.to_string(), value.to_string())
        })
        .collect();

    let body = response.text().await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    let duration_ms = start.elapsed().as_millis() as u64;

    Ok(HttpResponse {
        status,
        headers,
        body,
        duration_ms,
    })
}

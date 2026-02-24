/**
 * Robust JSON fetch helper to prevent "SyntaxError: Unexpected EOF"
 * and handle network/server errors gracefully.
 */
async function safeFetchJson(url, options = {}, defaultResponse = null) {
    try {
        const response = await fetch(url, options);

        // Handle non-2xx responses
        if (!response.ok) {
            console.warn(`Fetch failed: ${url} (HTTP ${response.status})`);

            // Try to extract error message if available
            try {
                const errorData = await response.json();
                return {
                    error: errorData.error || response.statusText,
                    status: response.status,
                    _isError: true
                };
            } catch (e) {
                return {
                    error: response.statusText || `HTTP ${response.status}`,
                    status: response.status,
                    _isError: true
                };
            }
        }

        // Check for empty body before parsing JSON
        const text = await response.text();
        if (!text || text.trim() === '') {
            console.warn(`Empty response body from: ${url}`);
            return defaultResponse || { success: true, empty: true };
        }

        try {
            return JSON.parse(text);
        } catch (e) {
            console.error(`JSON Parse Error for ${url}:`, e, "Body:", text.substring(0, 100));
            return {
                error: "Malformed JSON response",
                _parseError: true,
                _isError: true
            };
        }
    } catch (error) {
        console.error(`Network Error for ${url}:`, error);
        return {
            error: "Network or Server error",
            message: error.message,
            _isError: true
        };
    }
}

// Expose globally
window.safeFetchJson = safeFetchJson;

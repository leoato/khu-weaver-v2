const MAX_BODY_BYTES = 22 * 1024 * 1024;

exports.handler = async function handler(event) {
    if (event.httpMethod === "OPTIONS") {
        return response(event, 204, "");
    }

    if (event.httpMethod !== "POST") {
        return response(event, 405, { error: "Method not allowed" });
    }

    if (!isAllowedOrigin(event)) {
        return response(event, 403, { error: "Origin is not allowed." });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        return response(event, 500, { error: "GEMINI_API_KEY is not configured on the server." });
    }

    const rawBody = event.body || "";
    const estimatedBytes = Buffer.byteLength(rawBody, event.isBase64Encoded ? "base64" : "utf8");
    if (estimatedBytes > MAX_BODY_BYTES) {
        return response(event, 413, { error: "Uploaded images are too large. Please use fewer or smaller screenshots." });
    }

    let payload;
    try {
        payload = JSON.parse(event.isBase64Encoded ? Buffer.from(rawBody, "base64").toString("utf8") : rawBody);
    } catch (err) {
        return response(event, 400, { error: "Invalid JSON body." });
    }

    const model = sanitizeModel(payload.model || process.env.GEMINI_MODEL || "gemini-2.5-flash");
    const geminiBody = {
        contents: payload.contents,
        generationConfig: payload.generationConfig || { responseMimeType: "application/json" }
    };

    if (!Array.isArray(geminiBody.contents)) {
        return response(event, 400, { error: "Missing Gemini contents." });
    }

    const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key);

    try {
        const gemini = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(geminiBody)
        });
        const text = await gemini.text();

        return {
            statusCode: gemini.status,
            headers: {
                "Access-Control-Allow-Origin": allowedOrigin(event),
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Content-Type": gemini.headers.get("content-type") || "application/json"
            },
            body: text
        };
    } catch (err) {
        return response(event, 502, { error: "Gemini request failed." });
    }
};

function sanitizeModel(model) {
    const value = String(model || "").trim();
    return /^[A-Za-z0-9_.-]+$/.test(value) ? value : "gemini-2.5-flash";
}

function header(event, name) {
    const headers = event.headers || {};
    return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || "";
}

function allowedOrigin(event) {
    const origin = header(event, "origin");
    if (origin) return origin;
    const host = header(event, "host");
    return host ? "https://" + host : "*";
}

function isAllowedOrigin(event) {
    const origin = header(event, "origin");
    if (!origin) return true;

    let originUrl;
    try {
        originUrl = new URL(origin);
    } catch (err) {
        return false;
    }

    const host = header(event, "host");
    if (host && originUrl.host === host) return true;

    return originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1";
}

function response(event, statusCode, body) {
    return {
        statusCode,
        headers: {
            "Access-Control-Allow-Origin": allowedOrigin(event),
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Content-Type": "application/json"
        },
        body: body === "" ? "" : JSON.stringify(body)
    };
}

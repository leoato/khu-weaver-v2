const MAX_BODY_BYTES = 22 * 1024 * 1024;
const MAX_INLINE_IMAGES = 8;
const DEFAULT_MODEL = "gemini-2.5-flash";
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

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

    const primaryModel = sanitizeModel(payload.model || process.env.GEMINI_MODEL || DEFAULT_MODEL) || DEFAULT_MODEL;
    const models = buildModelFallbacks(primaryModel, process.env.GEMINI_FALLBACK_MODELS);
    const geminiBody = {
        contents: payload.contents,
        generationConfig: payload.generationConfig || ocrGenerationConfig()
    };

    const validationError = validateOcrPayload(geminiBody);
    if (validationError) {
        return response(event, 400, { error: validationError });
    }

    const attempts = [];
    for (let i = 0; i < models.length; i++) {
        const model = models[i];
        const result = await callGeminiModel(model, key, geminiBody);
        attempts.push({ model, statusCode: result.statusCode, reason: result.reason });

        if (!result.shouldRetry) {
            return geminiResponse(event, result, model, i > 0);
        }
    }

    const allRateLimited = attempts.length > 0 && attempts.every((a) => a.statusCode === 429);
    return response(event, allRateLimited ? 429 : 502, {
        error: allRateLimited
            ? "OCR usage limit was reached. Please wait a moment and try again."
            : "Gemini OCR fallback attempts failed.",
        attempts
    });
};

function sanitizeModel(model) {
    const value = String(model || "").trim();
    return /^[A-Za-z0-9_.-]+$/.test(value) ? value : "";
}

function buildModelFallbacks(primaryModel, fallbackEnv) {
    const seen = new Set();
    const models = [];
    [primaryModel].concat(String(fallbackEnv || "").split(",")).forEach((model) => {
        const clean = sanitizeModel(model);
        if (clean && !seen.has(clean)) {
            seen.add(clean);
            models.push(clean);
        }
    });
    return models.slice(0, 2);
}

function ocrGenerationConfig() {
    return {
        responseMimeType: "application/json",
        responseSchema: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    name: { type: "STRING" },
                    code: { type: "STRING" },
                    credits: { type: "NUMBER" },
                    grade: { type: "STRING" },
                    semester: { type: "STRING" }
                },
                required: ["name"]
            }
        }
    };
}

async function callGeminiModel(model, key, geminiBody) {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key);

    try {
        const gemini = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(geminiBody)
        });
        const text = await gemini.text();
        const result = {
            statusCode: gemini.status,
            contentType: gemini.headers.get("content-type") || "application/json",
            body: text,
            shouldRetry: false,
            reason: ""
        };

        if (gemini.status === 404 || gemini.status === 429 || gemini.status >= 500) {
            result.shouldRetry = true;
            result.reason = gemini.status === 404 ? "model-unavailable" : (gemini.status === 429 ? "rate-limited" : "server-error");
            return result;
        }

        if (gemini.ok) {
            const contentError = validateGeminiJsonText(text);
            if (contentError) {
                result.statusCode = 502;
                result.shouldRetry = true;
                result.reason = contentError;
            }
        }

        return result;
    } catch (err) {
        return {
            statusCode: 502,
            contentType: "application/json",
            body: JSON.stringify({ error: "Gemini request failed." }),
            shouldRetry: true,
            reason: "network-error"
        };
    }
}

function validateGeminiJsonText(bodyText) {
    let body;
    try {
        body = JSON.parse(bodyText);
    } catch (err) {
        return "invalid-response-json";
    }

    const parts = body && body.candidates && body.candidates[0] &&
        body.candidates[0].content && body.candidates[0].content.parts;
    const text = Array.isArray(parts) ? parts.map((part) => part && part.text || "").join("").trim() : "";
    if (!text) return "empty-ocr-result";

    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed.length ? "" : "empty-ocr-result";
        if (parsed && Array.isArray(parsed.courses)) return parsed.courses.length ? "" : "empty-ocr-result";
    } catch (err) {
        return "invalid-ocr-json";
    }

    return "invalid-ocr-shape";
}

function validateOcrPayload(body) {
    if (!Array.isArray(body.contents) || body.contents.length !== 1) {
        return "Missing OCR contents.";
    }

    const parts = body.contents[0] && body.contents[0].parts;
    if (!Array.isArray(parts) || parts.length < 2) {
        return "OCR request must include a prompt and at least one image.";
    }

    const hasPrompt = parts.some((part) => typeof part.text === "string" && part.text.trim().length > 0);
    if (!hasPrompt) {
        return "OCR request must include a text prompt.";
    }

    const images = parts.filter((part) => part && part.inline_data);
    if (images.length < 1 || images.length > MAX_INLINE_IMAGES) {
        return "OCR request must include 1 to 8 images.";
    }

    for (const part of images) {
        const data = part.inline_data;
        if (!ALLOWED_IMAGE_MIME_TYPES.has(data.mime_type)) {
            return "Only JPG and PNG screenshots are supported.";
        }
        if (typeof data.data !== "string" || data.data.length === 0) {
            return "Image data is missing.";
        }
    }

    return "";
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
    const host = header(event, "host");
    if (!origin) return isLocalHost(host);

    let originUrl;
    try {
        originUrl = new URL(origin);
    } catch (err) {
        return false;
    }

    if (host && originUrl.host === host) return true;

    return isLocalHost(originUrl.hostname);
}

function isLocalHost(host) {
    const value = String(host || "").split(":")[0];
    return value === "localhost" || value === "127.0.0.1" || value === "::1";
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

function geminiResponse(event, result, model, usedFallback) {
    return {
        statusCode: result.statusCode,
        headers: {
            "Access-Control-Allow-Origin": allowedOrigin(event),
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Content-Type": result.contentType || "application/json",
            "X-KW-OCR-Model": model,
            "X-KW-OCR-Fallback": usedFallback ? "1" : "0"
        },
        body: result.body
    };
}

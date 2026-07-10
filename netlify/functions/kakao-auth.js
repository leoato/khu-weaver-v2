const crypto = require("crypto");

const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
const KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const KAKAO_USER_URL = "https://kapi.kakao.com/v2/user/me";
const SESSION_COOKIE = "kw_session";
const OAUTH_COOKIE = "kw_kakao_oauth";
const OAUTH_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

exports.handler = async function handler(event) {
    const action = getAction(event);

    try {
        if (action === "start") return startLogin(event);
        if (action === "callback") return finishLogin(event);
        if (action === "session") return getSession(event);
        if (action === "logout") return logout(event);
        return json(404, { error: "Not found." });
    } catch (error) {
        console.error("Kakao auth failed:", sanitizeError(error));
        if (action === "callback") return redirectWithError(event, "server_error", true);
        return json(500, { error: "로그인 처리 중 문제가 발생했습니다." });
    }
};

function startLogin(event) {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." });

    const configError = validateConfig();
    if (configError) return json(503, { error: configError });

    const now = Math.floor(Date.now() / 1000);
    const state = randomBase64Url(32);
    const verifier = randomBase64Url(48);
    const next = safeLocalPath(event.queryStringParameters && event.queryStringParameters.next);
    const transient = signToken({ state, verifier, next, exp: now + OAUTH_TTL_SECONDS });
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    const params = new URLSearchParams({
        client_id: process.env.KAKAO_REST_API_KEY,
        redirect_uri: process.env.KAKAO_REDIRECT_URI,
        response_type: "code",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256"
    });

    return {
        statusCode: 302,
        headers: {
            Location: `${KAKAO_AUTHORIZE_URL}?${params.toString()}`,
            "Cache-Control": "no-store",
            "Set-Cookie": serializeCookie(OAUTH_COOKIE, transient, OAUTH_TTL_SECONDS, event)
        },
        body: ""
    };
}

async function finishLogin(event) {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." });

    const query = event.queryStringParameters || {};
    if (query.error) return redirectWithError(event, "cancelled", true);
    if (!query.code || !query.state) return redirectWithError(event, "missing_code", true);

    const cookies = parseCookies(event.headers && (event.headers.cookie || event.headers.Cookie));
    const oauth = verifyToken(cookies[OAUTH_COOKIE]);
    if (!oauth || oauth.exp < Math.floor(Date.now() / 1000) || !timingSafeEqual(oauth.state, query.state)) {
        return redirectWithError(event, "invalid_state", true);
    }

    const tokenParams = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.KAKAO_REST_API_KEY,
        redirect_uri: process.env.KAKAO_REDIRECT_URI,
        code: query.code,
        code_verifier: oauth.verifier
    });
    if (process.env.KAKAO_CLIENT_SECRET) tokenParams.set("client_secret", process.env.KAKAO_CLIENT_SECRET);

    const tokenResponse = await fetch(KAKAO_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
        body: tokenParams.toString()
    });
    if (!tokenResponse.ok) throw new Error(`token_exchange_${tokenResponse.status}`);
    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) throw new Error("token_missing");

    const userResponse = await fetch(KAKAO_USER_URL, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    if (!userResponse.ok) throw new Error(`user_info_${userResponse.status}`);
    const kakaoUser = await userResponse.json();
    if (kakaoUser.id === undefined || kakaoUser.id === null) throw new Error("user_id_missing");

    const identity = normalizeIdentity(kakaoUser);
    const now = Math.floor(Date.now() / 1000);
    const session = signToken({
        sub: `kakao:${identity.providerUserId}`,
        provider: identity.provider,
        nickname: identity.nickname,
        avatarUrl: identity.avatarUrl,
        iat: now,
        exp: now + SESSION_TTL_SECONDS
    });
    const destination = appendQuery(oauth.next, "auth", "kakao");

    return {
        statusCode: 302,
        multiValueHeaders: {
            "Set-Cookie": [
                serializeCookie(SESSION_COOKIE, session, SESSION_TTL_SECONDS, event),
                clearCookie(OAUTH_COOKIE, event)
            ]
        },
        headers: { Location: destination, "Cache-Control": "no-store" },
        body: ""
    };
}

function getSession(event) {
    if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." });
    const cookies = parseCookies(event.headers && (event.headers.cookie || event.headers.Cookie));
    const session = verifyToken(cookies[SESSION_COOKIE]);
    if (!session || session.exp < Math.floor(Date.now() / 1000) || session.provider !== "kakao") {
        return json(401, { authenticated: false }, { "Set-Cookie": clearCookie(SESSION_COOKIE, event) });
    }

    return json(200, {
        authenticated: true,
        user: {
            provider: "kakao",
            providerUserId: String(session.sub || "").replace(/^kakao:/, ""),
            nickname: session.nickname || null,
            avatarUrl: session.avatarUrl || null
        }
    });
}

function logout(event) {
    if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
    if (!isSameOrigin(event)) return json(403, { error: "Origin is not allowed." });
    return json(200, { authenticated: false }, { "Set-Cookie": clearCookie(SESSION_COOKIE, event) });
}

function normalizeIdentity(user) {
    const account = user.kakao_account || {};
    const profile = account.profile || user.properties || {};
    return {
        provider: "kakao",
        providerUserId: String(user.id),
        email: account.email || null,
        emailVerified: typeof account.is_email_verified === "boolean" ? account.is_email_verified : null,
        nickname: profile.nickname || null,
        avatarUrl: profile.profile_image_url || profile.thumbnail_image_url || null
    };
}

function getAction(event) {
    const queryAction = event.queryStringParameters && event.queryStringParameters.action;
    if (queryAction) return queryAction;
    const match = String(event.path || "").match(/\/(start|callback|session|logout)\/?$/);
    return match ? match[1] : "";
}

function validateConfig() {
    if (!process.env.KAKAO_REST_API_KEY) return "KAKAO_REST_API_KEY가 설정되지 않았습니다.";
    if (!process.env.KAKAO_REDIRECT_URI) return "KAKAO_REDIRECT_URI가 설정되지 않았습니다.";
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
        return "SESSION_SECRET은 32자 이상으로 설정해야 합니다.";
    }
    return "";
}

function signToken(payload) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
}

function verifyToken(token) {
    if (!token || !process.env.SESSION_SECRET) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const expected = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(parts[0]).digest("base64url");
    if (!timingSafeEqual(parts[1], expected)) return null;
    try {
        return JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    } catch (error) {
        return null;
    }
}

function timingSafeEqual(left, right) {
    const a = Buffer.from(String(left || ""));
    const b = Buffer.from(String(right || ""));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function randomBase64Url(bytes) {
    return crypto.randomBytes(bytes).toString("base64url");
}

function parseCookies(header) {
    return String(header || "").split(";").reduce((cookies, pair) => {
        const index = pair.indexOf("=");
        if (index > 0) cookies[pair.slice(0, index).trim()] = decodeURIComponent(pair.slice(index + 1).trim());
        return cookies;
    }, {});
}

function serializeCookie(name, value, maxAge, event) {
    const secure = isSecureRequest(event) ? "; Secure" : "";
    return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function clearCookie(name, event) {
    const secure = isSecureRequest(event) ? "; Secure" : "";
    return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function isSecureRequest(event) {
    const proto = event.headers && (event.headers["x-forwarded-proto"] || event.headers["X-Forwarded-Proto"]);
    return proto === "https" || process.env.CONTEXT === "production" || process.env.CONTEXT === "deploy-preview";
}

function isSameOrigin(event) {
    const headers = event.headers || {};
    const origin = headers.origin || headers.Origin;
    if (!origin) return true;
    const proto = headers["x-forwarded-proto"] || "https";
    const host = headers["x-forwarded-host"] || headers.host || headers.Host;
    return Boolean(host) && origin === `${proto}://${host}`;
}

function safeLocalPath(value) {
    const path = String(value || "/");
    return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : "/";
}

function appendQuery(path, key, value) {
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function redirectWithError(event, code, clearOauth) {
    const cookies = parseCookies(event.headers && (event.headers.cookie || event.headers.Cookie));
    const oauth = verifyToken(cookies[OAUTH_COOKIE]);
    const next = oauth && oauth.next ? oauth.next : "/";
    const response = {
        statusCode: 302,
        headers: { Location: appendQuery(next, "auth_error", code), "Cache-Control": "no-store" },
        body: ""
    };
    if (clearOauth) response.headers["Set-Cookie"] = clearCookie(OAUTH_COOKIE, event);
    return response;
}

function json(statusCode, body, extraHeaders) {
    return {
        statusCode,
        headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, extraHeaders || {}),
        body: JSON.stringify(body)
    };
}

function sanitizeError(error) {
    const message = error && error.message ? error.message : "unknown_error";
    return message.replace(/[\r\n]/g, " ").slice(0, 120);
}

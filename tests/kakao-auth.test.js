const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/kakao-auth");

const originalFetch = global.fetch;
const originalEnv = {
    KAKAO_REST_API_KEY: process.env.KAKAO_REST_API_KEY,
    KAKAO_CLIENT_SECRET: process.env.KAKAO_CLIENT_SECRET,
    KAKAO_REDIRECT_URI: process.env.KAKAO_REDIRECT_URI,
    SESSION_SECRET: process.env.SESSION_SECRET,
    CONTEXT: process.env.CONTEXT
};

process.env.KAKAO_REST_API_KEY = "test-rest-key";
process.env.KAKAO_CLIENT_SECRET = "test-client-secret";
process.env.KAKAO_REDIRECT_URI = "https://v3.example.com/api/auth/kakao/callback";
process.env.SESSION_SECRET = "test-session-secret-that-is-longer-than-32-characters";
process.env.CONTEXT = "production";

test.after(() => {
    global.fetch = originalFetch;
    Object.keys(originalEnv).forEach((key) => {
        if (originalEnv[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[key];
    });
});

function event(action, overrides) {
    return Object.assign({
        httpMethod: "GET",
        path: `/api/auth/kakao/${action}`,
        queryStringParameters: { action },
        headers: {
            host: "v3.example.com",
            origin: "https://v3.example.com",
            "x-forwarded-host": "v3.example.com",
            "x-forwarded-proto": "https"
        }
    }, overrides || {});
}

function cookiePair(setCookie) {
    return setCookie.split(";")[0];
}

async function beginLogin(next) {
    const response = await handler(event("start", {
        queryStringParameters: { action: "start", next: next || "/" }
    }));
    assert.equal(response.statusCode, 302);
    const authorizeUrl = new URL(response.headers.Location);
    return {
        response,
        state: authorizeUrl.searchParams.get("state"),
        cookie: cookiePair(response.headers["Set-Cookie"])
    };
}

test("login start creates a PKCE Kakao authorization request", async () => {
    const login = await beginLogin("/roadmap?tab=analysis");
    const url = new URL(login.response.headers.Location);

    assert.equal(url.origin, "https://kauth.kakao.com");
    assert.equal(url.searchParams.get("client_id"), "test-rest-key");
    assert.equal(url.searchParams.get("redirect_uri"), process.env.KAKAO_REDIRECT_URI);
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.ok(url.searchParams.get("code_challenge"));
    assert.match(login.response.headers["Set-Cookie"], /HttpOnly/);
    assert.match(login.response.headers["Set-Cookie"], /SameSite=Lax/);
    assert.match(login.response.headers["Set-Cookie"], /Secure/);
});

test("callback rejects a state mismatch before token exchange", async () => {
    const login = await beginLogin("/");
    let fetchCalled = false;
    global.fetch = async () => {
        fetchCalled = true;
        throw new Error("should not be called");
    };

    const response = await handler(event("callback", {
        queryStringParameters: { action: "callback", code: "code", state: "wrong-state" },
        headers: Object.assign({}, event("callback").headers, { cookie: login.cookie })
    }));

    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.Location, "/?auth_error=invalid_state");
    assert.equal(fetchCalled, false);
});

test("callback supports a Kakao account without email and creates a session", async () => {
    const login = await beginLogin("/?tab=analysis");
    const requests = [];
    global.fetch = async (url, options) => {
        requests.push({ url, options });
        if (url.includes("/oauth/token")) {
            return { ok: true, json: async () => ({ access_token: "provider-access-token" }) };
        }
        return {
            ok: true,
            json: async () => ({
                id: 123456,
                kakao_account: {
                    profile: { nickname: "위버", profile_image_url: "https://example.com/avatar.png" }
                }
            })
        };
    };

    const callback = await handler(event("callback", {
        queryStringParameters: { action: "callback", code: "valid-code", state: login.state },
        headers: Object.assign({}, event("callback").headers, { cookie: login.cookie })
    }));

    assert.equal(callback.statusCode, 302);
    assert.equal(callback.headers.Location, "/?tab=analysis&auth=kakao");
    assert.equal(requests.length, 2);
    assert.doesNotMatch(requests[0].options.body, /provider-access-token/);

    const sessionCookie = callback.multiValueHeaders["Set-Cookie"].find((value) => value.startsWith("kw_session="));
    assert.ok(sessionCookie);
    assert.doesNotMatch(sessionCookie, /provider-access-token/);

    const session = await handler(event("session", {
        headers: Object.assign({}, event("session").headers, { cookie: cookiePair(sessionCookie) })
    }));
    const body = JSON.parse(session.body);
    assert.equal(session.statusCode, 200);
    assert.equal(body.authenticated, true);
    assert.deepEqual(body.user, {
        provider: "kakao",
        providerUserId: "123456",
        nickname: "위버",
        avatarUrl: "https://example.com/avatar.png"
    });
});

test("service logout clears only the local session cookie", async () => {
    const response = await handler(event("logout", { httpMethod: "POST" }));
    assert.equal(response.statusCode, 200);
    assert.match(response.headers["Set-Cookie"], /^kw_session=;/);
    assert.match(response.headers["Set-Cookie"], /Max-Age=0/);
});

test("logout rejects a cross-origin request", async () => {
    const response = await handler(event("logout", {
        httpMethod: "POST",
        headers: Object.assign({}, event("logout").headers, { origin: "https://evil.example" })
    }));
    assert.equal(response.statusCode, 403);
});

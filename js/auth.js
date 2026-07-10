(function () {
    "use strict";

    var loginButton = document.getElementById("kakao-login-btn");
    var userBox = document.getElementById("auth-user");
    var userName = document.getElementById("auth-user-name");
    var userAvatar = document.getElementById("auth-user-avatar");
    var userFallback = document.getElementById("auth-user-fallback");
    var logoutButton = document.getElementById("auth-logout-btn");
    var status = document.getElementById("auth-status");

    if (!loginButton || !userBox || !logoutButton) return;

    function setBusy(busy) {
        loginButton.disabled = busy;
        logoutButton.disabled = busy;
        loginButton.classList.toggle("is-loading", busy);
    }

    function showLoggedOut() {
        loginButton.hidden = false;
        userBox.hidden = true;
        window.KHU_AUTH_USER = null;
    }

    function showUser(user) {
        var nickname = user && user.nickname ? user.nickname : "카카오 사용자";
        userName.textContent = nickname;
        userAvatar.hidden = true;
        userAvatar.removeAttribute("src");
        userFallback.hidden = false;

        if (user && /^https:\/\//i.test(user.avatarUrl || "")) {
            userAvatar.src = user.avatarUrl;
            userAvatar.hidden = false;
            userFallback.hidden = true;
        }

        loginButton.hidden = true;
        userBox.hidden = false;
        window.KHU_AUTH_USER = user;
        window.dispatchEvent(new CustomEvent("khu-auth-change", { detail: { user: user } }));
    }

    function showMessage(message, isError) {
        status.textContent = message || "";
        status.classList.toggle("is-error", Boolean(isError));
        if (message) {
            window.setTimeout(function () {
                if (status.textContent === message) status.textContent = "";
            }, 5000);
        }
    }

    function cleanAuthQuery() {
        var url = new URL(window.location.href);
        var changed = url.searchParams.has("auth") || url.searchParams.has("auth_error");
        url.searchParams.delete("auth");
        url.searchParams.delete("auth_error");
        if (changed) window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }

    function explainCallbackResult() {
        var params = new URLSearchParams(window.location.search);
        var error = params.get("auth_error");
        if (params.get("auth") === "kakao") showMessage("카카오 로그인이 완료되었습니다.", false);
        if (error) {
            var messages = {
                cancelled: "카카오 로그인이 취소되었습니다.",
                missing_code: "로그인 응답을 확인할 수 없습니다. 다시 시도해주세요.",
                invalid_state: "로그인 요청이 만료되었습니다. 다시 시도해주세요.",
                server_error: "로그인 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요."
            };
            showMessage(messages[error] || messages.server_error, true);
        }
        cleanAuthQuery();
    }

    async function loadSession() {
        setBusy(true);
        try {
            var response = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
            if (response.status === 401) {
                showLoggedOut();
                return;
            }
            if (!response.ok) throw new Error("session_request_failed");
            var data = await response.json();
            if (data.authenticated && data.user) showUser(data.user);
            else showLoggedOut();
        } catch (error) {
            showLoggedOut();
            showMessage("로그인 상태를 확인하지 못했습니다.", true);
        } finally {
            setBusy(false);
        }
    }

    loginButton.addEventListener("click", function () {
        if (loginButton.disabled) return;
        setBusy(true);
        var next = window.location.pathname + window.location.search + window.location.hash;
        window.location.assign("/api/auth/kakao/start?next=" + encodeURIComponent(next));
    });

    logoutButton.addEventListener("click", async function () {
        if (logoutButton.disabled) return;
        setBusy(true);
        try {
            var response = await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: "{}"
            });
            if (!response.ok) throw new Error("logout_failed");
            showLoggedOut();
            showMessage("서비스에서 로그아웃했습니다.", false);
            window.dispatchEvent(new CustomEvent("khu-auth-change", { detail: { user: null } }));
        } catch (error) {
            showMessage("로그아웃하지 못했습니다. 다시 시도해주세요.", true);
        } finally {
            setBusy(false);
        }
    });

    userAvatar.addEventListener("error", function () {
        userAvatar.hidden = true;
        userFallback.hidden = false;
    });

    explainCallbackResult();
    loadSession();
}());

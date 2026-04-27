/**
 * JobFlow Auto-Fill — Background Service Worker
 * Handles all API communication with the JobFlow backend.
 */

const API_BASE_DEFAULT = "http://localhost:8001/api/v1";

async function getApiBase() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["api_base"], (s) => {
      const v = s.api_base && String(s.api_base).trim();
      resolve(v || API_BASE_DEFAULT);
    });
  });
}

// ─── Token helpers ────────────────────────────────────────────────────────────

async function getStoredTokens() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["access_token", "refresh_token", "user_email"], resolve);
  });
}

async function setStoredTokens(access, refresh, email) {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      { access_token: access, refresh_token: refresh, user_email: email },
      resolve
    );
  });
}

async function clearTokens() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(["access_token", "refresh_token", "user_email"], resolve);
  });
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}, retry = true) {
  const base = await getApiBase();
  const { access_token, refresh_token } = await getStoredTokens();

  const headers = {
    "Content-Type": "application/json",
    ...(access_token ? { Authorization: `Bearer ${access_token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${base}${path}`, { ...options, headers });

  if (res.status === 401 && retry && refresh_token) {
    // Try refreshing
    const refreshed = await tryRefresh(refresh_token);
    if (refreshed) {
      return apiFetch(path, options, false);
    }
    await clearTokens();
    throw new Error("SESSION_EXPIRED");
  }

  return res;
}

async function tryRefresh(refreshToken) {
  try {
    const base = await getApiBase();
    const res = await fetch(`${base}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const { access_token, refresh_token } = await getStoredTokens();
    await setStoredTokens(
      data.access_token || access_token,
      data.refresh_token || refreshToken,
      (await getStoredTokens()).user_email
    );
    return true;
  } catch {
    return false;
  }
}

// ─── Message handlers ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg)
    .then(sendResponse)
    .catch((err) =>
      sendResponse({ success: false, error: err.message || String(err) })
    );
  return true; // keep channel open for async response
});

async function handleMessage(msg) {
  switch (msg.type) {
    case "LOGIN": {
      const base = await getApiBase();
      const res = await fetch(`${base}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: msg.email, password: msg.password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Login failed");
      }
      const data = await res.json();
      await setStoredTokens(data.access_token, data.refresh_token, msg.email);
      return { success: true };
    }

    case "LOGOUT": {
      await clearTokens();
      return { success: true };
    }

    case "GET_AUTH_STATE": {
      const { access_token, user_email } = await getStoredTokens();
      return { loggedIn: !!access_token, email: user_email };
    }

    case "MATCH_URL": {
      const res = await apiFetch(
        `/extension/match?url=${encodeURIComponent(msg.url)}`
      );
      if (!res.ok) throw new Error(`Match failed: ${res.status}`);
      return await res.json();
    }

    case "GET_RESUME_PDF": {
      const { access_token } = await getStoredTokens();
      const res = await apiFetch("/extension/resume-pdf", {
        method: "POST",
        body: JSON.stringify({
          job_id: msg.jobId,
          resume_template_slug: msg.templateSlug || "classic",
        }),
      });
      if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
      const buf = await res.arrayBuffer();
      // Return as base64 so it survives the message boundary
      const bytes = new Uint8Array(buf);
      let binary = "";
      bytes.forEach((b) => (binary += String.fromCharCode(b)));
      return { success: true, base64: btoa(binary) };
    }

    case "GET_SETTINGS": {
      return new Promise((resolve) => {
        chrome.storage.local.get(["api_base", "auto_submit", "highlight_fields"], (s) => {
          resolve({
            apiBase: s.api_base || API_BASE_DEFAULT,
            autoSubmit: !!s.auto_submit,
            highlightFields: s.highlight_fields !== false,
          });
        });
      });
    }

    case "SAVE_SETTINGS": {
      return new Promise((resolve) => {
        chrome.storage.local.set(
          {
            api_base: msg.apiBase,
            auto_submit: msg.autoSubmit,
            highlight_fields: msg.highlightFields,
          },
          () => resolve({ success: true })
        );
      });
    }

    default:
      throw new Error(`Unknown message type: ${msg.type}`);
  }
}

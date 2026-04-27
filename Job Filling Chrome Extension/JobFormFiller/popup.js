/**
 * JobFlow Auto-Fill — Popup Controller
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function bg(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (res?.error) reject(new Error(res.error));
      else resolve(res);
    });
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToContent(tabId, msg) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, msg, (res) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(res);
    });
  });
}

function formatRelativeTime(isoString) {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Match backend-style URL compare: https, no www, path without trailing slash (no query). */
function normalizeUrlForCompare(raw) {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/$/, "") || "/";
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return `https://${host}${path}`;
  } catch {
    return (raw || "").trim().toLowerCase();
  }
}

/** Same as backend: /jobs/view/123 and search URLs with ?currentJobId=123 */
function linkedinJobPostingId(raw) {
  try {
    const u = new URL(raw);
    if (!u.hostname.toLowerCase().includes("linkedin.com")) return null;
    const m = u.pathname.match(/\/jobs\/view\/(\d+)/i);
    if (m) return m[1];
    const p =
      u.searchParams.get("currentJobId") ||
      u.searchParams.get("jobId") ||
      u.searchParams.get("postId");
    if (p && /^\d+$/.test(p.trim())) return p.trim();
  } catch {}
  return null;
}

function isTailorApplySamePage(tabUrl, recommendedUrl) {
  if (!tabUrl || !recommendedUrl) return false;
  if (normalizeUrlForCompare(tabUrl) === normalizeUrlForCompare(recommendedUrl)) return true;
  const a = linkedinJobPostingId(tabUrl);
  const b = linkedinJobPostingId(recommendedUrl);
  return !!(a && b && a === b);
}

/**
 * Show whether to open LinkedIn (Easy Apply) or an external company/ATS URL.
 */
function configureApplyDestination(match, tabUrl) {
  const wrap = $("applyDestination");
  const hint = $("applyDestinationHint");
  const btn = $("openApplyDestinationBtn");
  const rec = (match.recommended_apply_url || match.job_url || "").trim();
  const mode = match.apply_mode || "other";
  const easy = match.linkedin_easy_apply === true;

  if (!wrap || !hint || !btn) return;

  if (!rec) {
    wrap.classList.add("hidden");
    return;
  }

  const onCorrectTab = isTailorApplySamePage(tabUrl, rec);
  wrap.classList.remove("hidden");
  delete wrap.dataset.applyUrl;

  if (onCorrectTab) {
    if (mode === "linkedin_easy" || easy) {
      hint.textContent =
        "Tailored resume matched. This job uses LinkedIn Easy Apply — run Auto-Fill on the Easy Apply form.";
    } else if (mode === "external") {
      hint.textContent =
        "Tailored resume matched. Apply on this page, then run Auto-Fill.";
    } else {
      hint.textContent = "Tailored resume matched for this page.";
    }
    btn.classList.add("hidden");
    return;
  }

  btn.classList.remove("hidden");
  wrap.dataset.applyUrl = rec;

  if (mode === "linkedin_easy" || easy) {
    hint.textContent =
      "This tailored resume is for LinkedIn Easy Apply. Open the LinkedIn job page, then run Auto-Fill.";
    btn.textContent = "Open LinkedIn job page";
  } else if (mode === "external") {
    hint.textContent =
      "This job applies on the company website (not LinkedIn Easy Apply). Open the apply page to use Auto-Fill there.";
    btn.textContent = "Open company apply page";
  } else {
    hint.textContent = "Open the recommended page to use Auto-Fill.";
    btn.textContent = "Open apply page";
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

let currentMatch = null;
let isPaused = false;
let settings = { autoSubmit: false, highlightFields: true };
let previousView = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  showView("viewLoading");

  // Load settings
  try {
    settings = await bg({ type: "GET_SETTINGS" });
  } catch {}

  // Check auth
  let authState;
  try {
    authState = await bg({ type: "GET_AUTH_STATE" });
  } catch {
    showView("viewLogin");
    return;
  }

  if (!authState.loggedIn) {
    showView("viewLogin");
    return;
  }

  // Match current tab URL
  const tab = await getActiveTab();
  if (!tab?.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
    showView("viewNoMatch");
    return;
  }

  try {
    const match = await bg({ type: "MATCH_URL", url: tab.url });
    if (match.matched) {
      currentMatch = match;
      $("matchTitle").textContent = match.job_title || "Job Application";
      $("matchCompany").textContent = match.company || "";
      $("matchTime").textContent = match.updated_at
        ? `Tailored ${formatRelativeTime(match.updated_at)}`
        : "";
      configureApplyDestination(match, tab.url);
      showView("viewMatch");
    } else {
      showView("viewNoMatch");
    }
  } catch (e) {
    if (e.message === "SESSION_EXPIRED") {
      showView("viewLogin");
    } else {
      showView("viewNoMatch");
    }
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  const errEl = $("loginError");
  const btn = $("loginBtn");

  errEl.classList.add("hidden");
  btn.disabled = true;
  btn.textContent = "Signing in…";

  try {
    await bg({ type: "LOGIN", email, password });
    init();
  } catch (err) {
    errEl.textContent = err.message || "Login failed";
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign In";
  }
});

// ─── Fill ─────────────────────────────────────────────────────────────────────

$("fillBtn").addEventListener("click", async () => {
  if (!currentMatch) return;

  const tab = await getActiveTab();
  const includeCL = $("includeCoverLetter").checked;
  const autoNav = $("autoNavigate").checked;

  // Fetch PDF for file upload
  let pdfBase64 = null;
  try {
    const pdfResult = await bg({ type: "GET_RESUME_PDF", jobId: currentMatch.job_id });
    pdfBase64 = pdfResult.base64;
  } catch (e) {
    console.warn("[JobFlow popup] PDF fetch failed:", e.message);
  }

  // Switch to progress view
  showView("viewFilling");
  $("progressLabel").textContent = "Filling form…";
  $("stepInfo").textContent = "Step 1";
  $("fieldCount").textContent = "";
  $("progressBar").style.width = "15%";
  $("progressBar").classList.remove("done");
  $("submitSection").classList.add("hidden");

  // Send fill command to content script
  try {
    await sendToContent(tab.id, {
      type: "START_FILL",
      resume: currentMatch.tailored_resume,
      coverLetter: includeCL ? currentMatch.cover_letter : "",
      pdfBase64,
      jobId: currentMatch.job_id,
      autoNavigate: autoNav,
    });
  } catch {
    // Content script might not be injected — inject it and retry
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      await new Promise((r) => setTimeout(r, 300));
      await sendToContent(tab.id, {
        type: "START_FILL",
        resume: currentMatch.tailored_resume,
        coverLetter: includeCL ? currentMatch.cover_letter : "",
        pdfBase64,
        jobId: currentMatch.job_id,
        autoNavigate: autoNav,
      });
    } catch (err) {
      $("progressLabel").textContent = "Error: " + err.message;
    }
  }
});

// ─── Pause / Resume ───────────────────────────────────────────────────────────

$("pauseBtn").addEventListener("click", async () => {
  const tab = await getActiveTab();
  isPaused = !isPaused;
  $("pauseBtn").textContent = isPaused ? "Resume" : "Pause";
  const msgType = isPaused ? "PAUSE_FILL" : "RESUME_FILL";
  try {
    await sendToContent(tab.id, { type: msgType });
  } catch {}
});

// ─── Submit ───────────────────────────────────────────────────────────────────

$("submitBtn").addEventListener("click", async () => {
  const tab = await getActiveTab();
  try {
    const res = await sendToContent(tab.id, { type: "SUBMIT_FORM" });
    if (res?.ok) {
      $("doneJobTitle").textContent =
        `${currentMatch?.job_title || "Job"} at ${currentMatch?.company || ""}`;
      showView("viewDone");
    } else {
      alert("Submit button not found — please click Submit manually.");
    }
  } catch {}
});

$("reviewBtn").addEventListener("click", () => {
  window.close();
});

$("doneCloseBtn").addEventListener("click", () => window.close());

// ─── Progress messages from content script ───────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "FILL_PROGRESS") return;

  const { status, step, filled, message } = msg;

  if (message) $("progressLabel").textContent = message;
  if (step) $("stepInfo").textContent = `Step ${step}`;
  if (filled !== undefined) $("fieldCount").textContent = `${filled} field(s) filled`;

  if (status === "filling") {
    $("progressBar").style.width = `${Math.min(20 + step * 25, 80)}%`;
  } else if (status === "navigating") {
    $("progressBar").style.width = `${Math.min(30 + step * 25, 85)}%`;
  } else if (status === "awaiting_submit") {
    $("progressBar").style.width = "95%";
    $("progressBar").classList.add("done");
    $("submitSection").classList.remove("hidden");
    if (settings.autoSubmit) {
      $("submitBtn").click();
    }
  } else if (status === "done") {
    $("progressBar").style.width = "100%";
    $("progressBar").classList.add("done");
    $("progressLabel").textContent = "Fill complete";
    // Show submit section so user can manually submit if needed
    $("submitSection").classList.remove("hidden");
  }
});

// ─── No match: open JobFlow ───────────────────────────────────────────────────

$("openJobFlowBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: "http://localhost:5173" });
  window.close();
});

$("openApplyDestinationBtn").addEventListener("click", () => {
  const url = $("applyDestination")?.dataset?.applyUrl;
  if (url) chrome.tabs.create({ url });
});

// ─── Settings panel ───────────────────────────────────────────────────────────

$("settingsBtn").addEventListener("click", async () => {
  previousView = document.querySelector(".view:not(.hidden)")?.id;
  const s = await bg({ type: "GET_SETTINGS" });
  $("settingsApiBase").value = s.apiBase || "http://localhost:8001/api/v1";
  $("settingsHighlight").checked = s.highlightFields !== false;
  $("settingsAutoSubmit").checked = !!s.autoSubmit;
  showView("viewSettings");
});

$("saveSettingsBtn").addEventListener("click", async () => {
  await bg({
    type: "SAVE_SETTINGS",
    apiBase: $("settingsApiBase").value.trim() || "http://localhost:8001/api/v1",
    highlightFields: $("settingsHighlight").checked,
    autoSubmit: $("settingsAutoSubmit").checked,
  });
  showView(previousView || "viewLoading");
  init();
});

$("cancelSettingsBtn").addEventListener("click", () => {
  showView(previousView || "viewLoading");
});

$("logoutBtn").addEventListener("click", async () => {
  await bg({ type: "LOGOUT" });
  showView("viewLogin");
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

init();

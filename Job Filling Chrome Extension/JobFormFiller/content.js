/**
 * JobFlow Auto-Fill — Content Script
 * Injected into all pages. Passive until activated by the popup.
 */

(function () {
  if (window.__jobflowInjected) return;
  window.__jobflowInjected = true;

  // ─── State ──────────────────────────────────────────────────────────────────
  let fillState = {
    active: false,
    paused: false,
    resume: null,
    coverLetter: "",
    jobId: null,
    pdfBase64: null,
    stepCount: 0,
  };

  // ─── Field-type detection heuristics ────────────────────────────────────────

  const FIELD_PATTERNS = {
    first_name: [
      /\bfirst[\s_-]?name\b/i,
      /\bgiven[\s_-]?name\b/i,
      /\bforename\b/i,
    ],
    last_name: [
      /\blast[\s_-]?name\b/i,
      /\bfamily[\s_-]?name\b/i,
      /\bsurname\b/i,
    ],
    full_name: [
      /\bfull[\s_-]?name\b/i,
      /\byour[\s_-]?name\b/i,
      /\bname\b/i,
      /\bapplicant[\s_-]?name\b/i,
    ],
    email: [/\bemail\b/i, /\be[\s_-]?mail[\s_-]?address\b/i],
    phone: [
      /\bphone\b/i,
      /\bmobile\b/i,
      /\btelephone\b/i,
      /\bcell\b/i,
      /\bcontact[\s_-]?number\b/i,
    ],
    address: [/\baddress\b/i, /\bstreet\b/i, /\bline[\s_-]?1\b/i],
    city: [/\bcity\b/i, /\btown\b/i],
    state: [/\bstate\b/i, /\bprovince\b/i, /\bregion\b/i],
    zip: [/\bzip\b/i, /\bpostal[\s_-]?code\b/i],
    country: [/\bcountry\b/i, /\bnation\b/i],
    location: [/\blocation\b/i],
    linkedin: [/\blinkedin\b/i],
    github: [/\bgithub\b/i, /\bgit[\s_-]?hub\b/i],
    portfolio: [
      /\bportfolio\b/i,
      /\bwebsite\b/i,
      /\bpersonal[\s_-]?site\b/i,
      /\bhomepage\b/i,
    ],
    summary: [
      /\bsummary\b/i,
      /\babout[\s_-]?(you|yourself|me)?\b/i,
      /\bprofile\b/i,
      /\bintroduction\b/i,
      /\bprofessional[\s_-]?summary\b/i,
    ],
    cover_letter: [
      /\bcover[\s_-]?letter\b/i,
      /\bmessage[\s_-]?to[\s_-]?hiring\b/i,
      /\bwhy[\s_-]?(do you|are you)\b/i,
      /\bmotivation\b/i,
    ],
    skills: [/\bskills\b/i, /\btechnical[\s_-]?skills\b/i, /\bcompetencies\b/i],
    resume_upload: [
      /\bresume\b/i,
      /\bcv\b/i,
      /\bcurriculum[\s_-]?vitae\b/i,
      /\bupload[\s_-]?resume\b/i,
      /\battach[\s_-]?resume\b/i,
    ],
    cover_letter_upload: [
      /\bcover[\s_-]?letter\b/i,
      /\bupload[\s_-]?cover\b/i,
    ],
  };

  const AUTOCOMPLETE_MAP = {
    name: "full_name",
    "given-name": "first_name",
    "additional-name": "middle_name",
    "family-name": "last_name",
    email: "email",
    tel: "phone",
    "street-address": "address",
    "address-line1": "address",
    "address-level2": "city",
    "address-level1": "state",
    "postal-code": "zip",
    country: "country",
    "country-name": "country",
    url: "portfolio",
    organization: null, // skip
  };

  function getElementHint(el) {
    const parts = [
      el.getAttribute("name") || "",
      el.getAttribute("id") || "",
      el.getAttribute("placeholder") || "",
      el.getAttribute("aria-label") || "",
      el.getAttribute("data-field") || "",
      el.getAttribute("data-qa") || "",
      el.getAttribute("data-testid") || "",
      el.getAttribute("autocomplete") || "",
    ];
    // Also grab associated label text
    let labelText = "";
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) labelText = lbl.innerText || lbl.textContent || "";
    }
    // Walk up to find fieldset/legend or wrapping label
    let parent = el.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      if (parent.tagName === "LABEL") {
        labelText += " " + (parent.innerText || "");
        break;
      }
      const legend = parent.querySelector("legend");
      if (legend) labelText += " " + (legend.innerText || "");
      parent = parent.parentElement;
    }
    parts.push(labelText);
    return parts.join(" ").toLowerCase();
  }

  function detectFieldType(el) {
    // Check autocomplete attribute first (most reliable)
    const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
    if (ac && ac !== "off" && ac !== "on" && AUTOCOMPLETE_MAP[ac] !== undefined) {
      return AUTOCOMPLETE_MAP[ac];
    }

    // File inputs: check label/name hint
    if (el.type === "file") {
      const hint = getElementHint(el);
      for (const [type, patterns] of Object.entries(FIELD_PATTERNS)) {
        if (type.endsWith("_upload") && patterns.some((p) => p.test(hint))) {
          return type;
        }
      }
      return "resume_upload"; // assume resume upload by default
    }

    const hint = getElementHint(el);

    // Check specific patterns
    for (const [type, patterns] of Object.entries(FIELD_PATTERNS)) {
      if (type.endsWith("_upload")) continue; // file-only types handled above
      if (patterns.some((p) => p.test(hint))) {
        return type;
      }
    }
    return null;
  }

  // ─── Resolve value from resume data ─────────────────────────────────────────

  function resolveValue(fieldType, resume, coverLetter) {
    if (!resume) return null;
    switch (fieldType) {
      case "full_name":
        return resume.full_name || "";
      case "first_name": {
        const parts = (resume.full_name || "").trim().split(/\s+/);
        return parts[0] || "";
      }
      case "last_name": {
        const parts = (resume.full_name || "").trim().split(/\s+/);
        return parts.length > 1 ? parts.slice(1).join(" ") : "";
      }
      case "email":
        return resume.email || "";
      case "phone":
        return resume.phone || "";
      case "address":
        return resume.location || "";
      case "location":
        return resume.location || "";
      case "city": {
        const loc = resume.location || "";
        return loc.split(",")[0]?.trim() || loc;
      }
      case "state": {
        const loc = resume.location || "";
        const parts = loc.split(",");
        return parts[1]?.trim() || "";
      }
      case "zip":
      case "country":
        return "";
      case "linkedin":
        return resume.linkedin_url || "";
      case "github":
        return resume.github_url || "";
      case "portfolio":
        return resume.portfolio_url || resume.github_url || "";
      case "summary":
        return resume.summary || "";
      case "cover_letter":
        return coverLetter || "";
      case "skills": {
        if (Array.isArray(resume.skills)) return resume.skills.join(", ");
        return "";
      }
      default:
        return null;
    }
  }

  // ─── Fill a single input/textarea ───────────────────────────────────────────

  function nativeInputValueSetter(el, value) {
    // Works for React-controlled inputs
    const nativeInputValueSetter =
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set ||
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  async function fillFileInput(el, pdfBase64, filename) {
    try {
      const binary = atob(pdfBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], filename || "resume.pdf", { type: "application/pdf" });
      const dt = new DataTransfer();
      dt.items.add(file);
      el.files = dt.files;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    } catch (e) {
      console.warn("[JobFlow] File upload failed:", e);
      return false;
    }
  }

  // ─── Highlight helpers ───────────────────────────────────────────────────────

  function highlightField(el, color = "#4ade80") {
    el.style.outline = `2px solid ${color}`;
    el.style.boxShadow = `0 0 0 3px ${color}33`;
    setTimeout(() => {
      el.style.outline = "";
      el.style.boxShadow = "";
    }, 2500);
  }

  // ─── Scan and fill all fields on the current page ───────────────────────────

  async function fillPage(resume, coverLetter, pdfBase64, jobId) {
    const filled = [];
    const skipped = [];

    const inputs = document.querySelectorAll(
      "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]), textarea, select"
    );

    for (const el of inputs) {
      if (!isVisible(el)) continue;

      const type = el.type?.toLowerCase();

      if (type === "file") {
        const fieldType = detectFieldType(el);
        if (fieldType === "resume_upload" && pdfBase64) {
          const fname = `${(resume?.full_name || "resume").replace(/\s+/g, "_")}_resume.pdf`;
          const ok = await fillFileInput(el, pdfBase64, fname);
          if (ok) {
            highlightField(el, "#4ade80");
            filled.push({ field: "resume_upload", el: el.id || el.name });
          }
        }
        continue;
      }

      if (el.tagName === "SELECT") {
        // Skip selects for now (ATS-specific dropdowns need special handling)
        continue;
      }

      const fieldType = detectFieldType(el);
      if (!fieldType) {
        skipped.push(el.id || el.name || "(unnamed)");
        continue;
      }

      const value = resolveValue(fieldType, resume, coverLetter);
      if (!value) {
        skipped.push(`${fieldType}=empty`);
        continue;
      }

      // Skip if already filled with the same value
      if (el.value && el.value === value) continue;

      nativeInputValueSetter(el, value);
      highlightField(el, "#4ade80");
      filled.push({ field: fieldType, el: el.id || el.name });

      // Small delay between fields to avoid triggering bot detection
      await sleep(80);
    }

    return { filled, skipped };
  }

  function isVisible(el) {
    if (!el.offsetParent && el.tagName !== "BODY") return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ─── Next-button detection ───────────────────────────────────────────────────

  const NEXT_PATTERNS = [
    /\bnext\b/i,
    /\bcontinue\b/i,
    /\bproceed\b/i,
    /\bsave\s*&?\s*(proceed|next|continue)\b/i,
    /\bforward\b/i,
  ];

  const SUBMIT_PATTERNS = [
    /\bsubmit\b/i,
    /\bapply\b/i,
    /\bsend\s*(application|my\s*application)?\b/i,
    /\bfinish\b/i,
    /\bcomplete\b/i,
  ];

  function findNextButton() {
    const candidates = document.querySelectorAll(
      'button, input[type="button"], input[type="submit"], a[role="button"], [role="button"]'
    );
    for (const el of candidates) {
      if (!isVisible(el)) continue;
      const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim();
      if (NEXT_PATTERNS.some((p) => p.test(text))) return el;
    }
    return null;
  }

  function findSubmitButton() {
    const candidates = document.querySelectorAll(
      'button, input[type="button"], input[type="submit"], a[role="button"], [role="button"]'
    );
    for (const el of candidates) {
      if (!isVisible(el)) continue;
      const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim();
      if (SUBMIT_PATTERNS.some((p) => p.test(text))) return el;
    }
    return null;
  }

  // ─── Multi-step navigation observer ──────────────────────────────────────────

  let mutationObserver = null;

  function watchForNextPage(resume, coverLetter, pdfBase64, jobId) {
    if (mutationObserver) mutationObserver.disconnect();

    mutationObserver = new MutationObserver(async () => {
      if (fillState.paused || !fillState.active) return;
      // Detect if new form fields appeared (new page loaded in SPA)
      await sleep(600);
      const result = await fillPage(resume, coverLetter, pdfBase64, jobId);
      sendProgress({ step: ++fillState.stepCount, filled: result.filled.length });
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ─── Main auto-fill flow ─────────────────────────────────────────────────────

  async function startAutoFill(data) {
    const { resume, coverLetter, pdfBase64, jobId, autoNavigate } = data;
    fillState = { active: true, paused: false, resume, coverLetter, jobId, pdfBase64, stepCount: 1 };

    sendProgress({ status: "filling", step: 1, message: "Scanning form fields…" });

    await sleep(300);
    const result = await fillPage(resume, coverLetter, pdfBase64, jobId);
    sendProgress({ status: "filling", step: 1, filled: result.filled.length, message: `Filled ${result.filled.length} field(s)` });

    if (autoNavigate) {
      await sleep(800);
      const nextBtn = findNextButton();
      const submitBtn = findSubmitButton();

      if (submitBtn && !nextBtn) {
        // On final step
        sendProgress({ status: "awaiting_submit", step: fillState.stepCount, message: "Ready to submit — review and confirm" });
        return;
      }

      if (nextBtn) {
        sendProgress({ status: "navigating", step: fillState.stepCount, message: "Clicking Next…" });
        await sleep(400);
        nextBtn.click();
        watchForNextPage(resume, coverLetter, pdfBase64, jobId);
      } else {
        sendProgress({ status: "done", step: fillState.stepCount, message: "Fill complete" });
      }
    } else {
      sendProgress({ status: "done", step: fillState.stepCount, message: "Fill complete" });
    }
  }

  function sendProgress(data) {
    chrome.runtime.sendMessage({ type: "FILL_PROGRESS", ...data });
  }

  // ─── Message listener ─────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "START_FILL") {
      startAutoFill(msg).then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg.type === "PAUSE_FILL") {
      fillState.paused = true;
      sendResponse({ ok: true });
    }
    if (msg.type === "RESUME_FILL") {
      fillState.paused = false;
      sendResponse({ ok: true });
    }
    if (msg.type === "STOP_FILL") {
      fillState.active = false;
      if (mutationObserver) mutationObserver.disconnect();
      sendResponse({ ok: true });
    }
    if (msg.type === "SUBMIT_FORM") {
      const btn = findSubmitButton();
      if (btn) {
        btn.click();
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "No submit button found" });
      }
    }
    if (msg.type === "PING") {
      sendResponse({ ok: true });
    }
  });
})();

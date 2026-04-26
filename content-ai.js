/**
 * DevReflect — Content Script: AI Tools (content-ai.js)
 *
 * Injected into: ChatGPT, Claude, Gemini, Copilot
 *
 * Detects:
 * - Prompt submissions (AI query count)
 * - Copy events (code copy-paste tracking)
 * - Page activity (keep lastActiveTime fresh)
 *
 * Uses MutationObserver for SPA compatibility (no page reload on submit).
 */

(function () {
  "use strict";

  let isInitialized = false;

  function init() {
    if (isInitialized) return;
    isInitialized = true;

    setupCopyDetection();
    setupSubmitDetection();
    setupActivityPing();

    console.debug("[DevReflect] AI content script initialized on", location.hostname);
  }

  /**
   * Detect copy events on the page.
   * We only report if the user is copying text (likely code).
   */
  function setupCopyDetection() {
    document.addEventListener("copy", (e) => {
      const selection = window.getSelection()?.toString() || "";
      if (selection.length < 20) return; // Ignore trivial copies

      chrome.runtime.sendMessage({
        type: "COPY_PASTE_DETECTED",
        payload: {
          charCount: selection.length,
          site: location.hostname,
          // Heuristic: contains code-like characters
          looksLikeCode: /[{}();\[\]=>]/.test(selection),
        },
      }).catch(() => {}); // Extension may be reloading
    });
  }

  /**
   * Detect prompt submissions.
   *
   * Strategy: Watch for "send" button clicks OR Enter key in the prompt textarea.
   * Uses MutationObserver to handle dynamic DOM (SPAs re-render the input area).
   */
  function setupSubmitDetection() {
    let lastSubmitTime = 0;
    const DEBOUNCE_MS = 2000;

    function onSubmitDetected() {
      const now = Date.now();
      if (now - lastSubmitTime < DEBOUNCE_MS) return; // Debounce
      lastSubmitTime = now;

      chrome.runtime.sendMessage({
        type: "AI_QUERY_DETECTED",
        payload: { site: location.hostname, time: now },
      }).catch(() => {});
    }

    // Watch for keyboard: Enter in textarea (most AI tools use this pattern)
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      const target = e.target;
      if (
        target.tagName === "TEXTAREA" ||
        target.getAttribute("role") === "textbox" ||
        target.getAttribute("contenteditable") === "true"
      ) {
        onSubmitDetected();
      }
    });

    // Also watch for button clicks with submit-like aria labels
    const observer = new MutationObserver(() => {
      const sendButtons = document.querySelectorAll(
        'button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="submit"]'
      );
      sendButtons.forEach((btn) => {
        if (btn._devreflect_bound) return;
        btn._devreflect_bound = true;
        btn.addEventListener("click", onSubmitDetected);
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Ping background every 30 seconds to keep lastActiveTime fresh
   * while user is actively on an AI site (reading responses, etc.)
   */
  function setupActivityPing() {
    setInterval(() => {
      if (document.visibilityState === "visible") {
        chrome.runtime.sendMessage({ type: "PING" }).catch(() => {});
      }
    }, 30_000);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        // Tab hidden — stop ping implicitly
      }
    });
  }

  // Run init
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

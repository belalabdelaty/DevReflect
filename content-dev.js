/**
 * DevReflect — Content Script: Dev Resources (content-dev.js)
 *
 * Injected into: Stack Overflow, GitHub
 *
 * Detects:
 * - Copy events (copying code from answers)
 * - Search queries (gauging research effort)
 * - Page scroll depth (engagement signal)
 */

(function () {
  "use strict";

  function init() {
    setupCopyDetection();
    setupScrollDepthTracking();

    console.debug("[DevReflect] Dev content script initialized on", location.hostname);
  }

  /**
   * Track when user copies from Stack Overflow / GitHub answers.
   * This is a positive signal — they're doing research!
   */
  function setupCopyDetection() {
    document.addEventListener("copy", (e) => {
      const selection = window.getSelection()?.toString() || "";
      if (selection.length < 10) return;

      chrome.runtime.sendMessage({
        type: "COPY_PASTE_DETECTED",
        payload: {
          charCount: selection.length,
          site: location.hostname,
          looksLikeCode: /[{}();\[\]=>]/.test(selection),
        },
      }).catch(() => {});
    });
  }

  /**
   * Track scroll depth as an engagement signal.
   * If a user scrolls past 60% of an SO page, they're actually reading.
   * This data stays local — no external reporting.
   */
  function setupScrollDepthTracking() {
    let maxScrollDepth = 0;
    let reported60 = false;

    const onScroll = () => {
      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight;
      const depth = Math.round((scrolled / total) * 100);

      if (depth > maxScrollDepth) {
        maxScrollDepth = depth;
      }

      // Report 60% threshold once (signals actual reading)
      if (!reported60 && maxScrollDepth >= 60) {
        reported60 = true;
        chrome.runtime.sendMessage({
          type: "DEEP_READ_DETECTED",
          payload: { site: location.hostname },
        }).catch(() => {});
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

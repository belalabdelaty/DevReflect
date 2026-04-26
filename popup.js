/**
 * DevReflect — Popup Controller (popup.js)
 *
 * Manages the dashboard UI:
 * - Loads stats from background via message passing
 * - Renders score ring, time bar, site list, heatmap
 * - Handles settings panel interactions
 * - Listens for live feedback events from background
 *
 * Runs as an ES module inside popup.html.
 */

import { formatDuration, scoreToLabel } from "../src/analytics.js";
import { ALL_TRACKED_DOMAINS, TRACKED_SITES } from "../src/constants.js";

// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  await loadAndRender();
  bindEventListeners();
  listenForLiveFeedback();
});

// ─── Data Loading ─────────────────────────────────────────────────────────────

/**
 * Request stats from background service worker and render the UI.
 */
async function loadAndRender() {
  try {
    const { stats, session, settings } = await sendMessage({ type: "GET_STATS" });
    renderDashboard(stats, session, settings);
  } catch (err) {
    console.error("[DevReflect] Failed to load stats:", err);
    showError("Could not load data. Try reopening the extension.");
  }
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderDashboard(stats, session, settings) {
  renderScoreCard(stats);
  renderTimeBar(stats);
  renderSiteList(stats);
  renderHeatmap(stats.hourlyActivity);
  renderSessionStatus(session, settings);
  applySettingsToUI(settings);
}

/**
 * Score ring + metadata.
 */
function renderScoreCard(stats) {
  const score = stats.independenceScore ?? 100;
  const { label, level } = scoreToLabel(score);

  // Animate the ring
  const CIRCUMFERENCE = 314; // 2π × 50
  const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;

  const ring = document.getElementById("score-ring-fill");
  ring.style.strokeDashoffset = offset;
  ring.setAttribute("data-level", level);

  document.getElementById("score-value").textContent = score;
  document.getElementById("score-label").textContent = label;

  // Metadata
  document.getElementById("meta-queries").textContent = stats.aiQueries ?? 0;
  document.getElementById("meta-copypaste").textContent = stats.copyPasteFromAI ?? 0;
  document.getElementById("meta-ai-time").textContent = formatDuration(stats.aiTime ?? 0);
}

/**
 * Research vs AI time bar.
 */
function renderTimeBar(stats) {
  const aiTime = stats.aiTime ?? 0;
  const researchTime = stats.researchTime ?? 0;
  const total = aiTime + researchTime;

  const aiPct = total > 0 ? (aiTime / total) * 100 : 0;
  const resPct = total > 0 ? (researchTime / total) * 100 : 0;

  document.getElementById("bar-research").style.width = `${resPct}%`;
  document.getElementById("bar-ai").style.width = `${aiPct}%`;

  document.getElementById("legend-research-time").textContent = formatDuration(researchTime);
  document.getElementById("legend-ai-time").textContent = formatDuration(aiTime);

  document.getElementById("time-total").textContent =
    total > 0 ? formatDuration(total) + " total" : "Today";
}

/**
 * Per-site time breakdown list.
 */
function renderSiteList(stats) {
  const container = document.getElementById("site-list");
  const breakdown = stats.siteBreakdown ?? {};

  const entries = Object.entries(breakdown)
    .filter(([, ms]) => ms > 0)
    .sort(([, a], [, b]) => b - a);

  if (entries.length === 0) {
    container.innerHTML = '<div class="empty-state">No activity yet today.</div>';
    return;
  }

  const maxTime = Math.max(...entries.map(([, ms]) => ms));

  container.innerHTML = entries
    .map(([domain, ms]) => {
      const info = ALL_TRACKED_DOMAINS[domain] || { label: domain, color: "#4a5170", category: "other" };
      const pct = Math.round((ms / maxTime) * 100);
      return `
        <div class="site-item">
          <div class="site-item__dot" style="background:${info.color}"></div>
          <div class="site-item__name">${info.label}</div>
          <div class="site-item__bar">
            <div class="site-item__bar-fill" style="width:${pct}%;background:${info.color}"></div>
          </div>
          <div class="site-item__time">${formatDuration(ms)}</div>
        </div>
      `;
    })
    .join("");
}

/**
 * 24-hour activity heatmap.
 */
function renderHeatmap(hourlyActivity) {
  const container = document.getElementById("heatmap");
  if (!hourlyActivity || hourlyActivity.length === 0) {
    container.innerHTML = "";
    return;
  }

  const maxActivity = Math.max(...hourlyActivity, 1);
  const currentHour = new Date().getHours();

  container.innerHTML = hourlyActivity
    .map((ms, hour) => {
      const intensity = ms / maxActivity;
      let level = "0";

      if (intensity > 0) {
        if (intensity < 0.25) level = "1";
        else if (intensity < 0.5) level = "2";
        else if (intensity < 0.75) level = "3";
        else level = "4";
      }

      const isNow = hour === currentHour ? 'style="outline:1px solid #4f8ef7;outline-offset:1px"' : "";
      const title = `${hour}:00 — ${formatDuration(ms)}`;

      return `<div class="heatmap__cell" data-level="${level}" title="${title}" ${isNow}></div>`;
    })
    .join("");
}

/**
 * Footer session status indicator.
 */
function renderSessionStatus(session, settings) {
  const statusEl = document.getElementById("session-status");
  const dot = statusEl.querySelector(".status-dot");

  if (!settings.trackingEnabled) {
    statusEl.innerHTML = '<span class="status-dot status-dot--inactive"></span> Tracking paused';
    return;
  }

  if (session.isTracking) {
    const siteName = session.currentSite
      ? (ALL_TRACKED_DOMAINS[session.currentSite]?.label ?? session.currentSite)
      : "browsing";
    statusEl.innerHTML = `<span class="status-dot status-dot--active"></span> Tracking — ${siteName}`;
  } else {
    statusEl.innerHTML = '<span class="status-dot status-dot--inactive"></span> Waiting for activity';
  }
}

/**
 * Apply settings to the UI controls.
 */
function applySettingsToUI(settings) {
  document.getElementById("toggle-tracking").checked = settings.trackingEnabled;
  document.getElementById("toggle-notifications").checked = settings.showNotifications;

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("mode-btn--active", btn.dataset.mode === settings.feedbackMode);
  });
}

// ─── Event Bindings ───────────────────────────────────────────────────────────

function bindEventListeners() {
  // Settings panel open/close
  document.getElementById("btn-settings").addEventListener("click", () => {
    document.getElementById("settings-overlay").style.display = "flex";
  });

  document.getElementById("btn-settings-close").addEventListener("click", () => {
    document.getElementById("settings-overlay").style.display = "none";
  });

  document.getElementById("settings-overlay").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) {
      e.currentTarget.style.display = "none";
    }
  });

  // Tracking toggle
  document.getElementById("toggle-tracking").addEventListener("change", async (e) => {
    await updateSetting("trackingEnabled", e.target.checked);
    await loadAndRender();
  });

  // Notifications toggle
  document.getElementById("toggle-notifications").addEventListener("change", async (e) => {
    await updateSetting("showNotifications", e.target.checked);
  });

  // Feedback mode buttons
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("mode-btn--active"));
      btn.classList.add("mode-btn--active");
      await updateSetting("feedbackMode", btn.dataset.mode);
    });
  });

  // Reset data
  document.getElementById("btn-reset").addEventListener("click", async () => {
    if (confirm("Reset all DevReflect data? This cannot be undone.")) {
      await sendMessage({ type: "RESET_DATA" });
      document.getElementById("settings-overlay").style.display = "none";
      await loadAndRender();
    }
  });
}

/**
 * Listen for live feedback events pushed from background.
 */
function listenForLiveFeedback() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "FEEDBACK_EVENT") {
      showFeedbackBanner(message.payload.message);
    }
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function updateSetting(key, value) {
  const response = await sendMessage({
    type: "GET_STATS",
  });
  const updatedSettings = { ...response.settings, [key]: value };
  await sendMessage({ type: "UPDATE_SETTINGS", payload: updatedSettings });
}

function showFeedbackBanner(message) {
  const banner = document.getElementById("feedback-banner");
  const text = document.getElementById("feedback-text");
  text.textContent = message;
  banner.style.display = "flex";

  // Auto-hide after 8 seconds
  setTimeout(() => {
    banner.style.display = "none";
  }, 8000);
}

function showError(msg) {
  const main = document.querySelector(".main");
  main.innerHTML = `<div class="empty-state" style="padding:40px 0">${msg}</div>`;
}

/**
 * Send a message to the background service worker.
 * Returns a promise resolving to the response.
 */
function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * DevReflect — Background Service Worker (background.js)
 *
 * This is the extension's persistent brain. It:
 * - Listens to tab activation/update events
 * - Tracks time spent on each tracked domain
 * - Manages session state (when does a "problem session" begin/end?)
 * - Coordinates with content scripts via message passing
 * - Triggers feedback at the right moments
 * - Runs periodic analytics saves via chrome.alarms
 *
 * MV3 service workers are ephemeral — they can be killed and restarted.
 * All state is persisted to chrome.storage immediately, never held only in memory.
 */

import { ALL_TRACKED_DOMAINS, TRACKED_SITES, HEURISTICS } from "./constants.js";
import {
  getTodayStats,
  saveTodayStats,
  getSession,
  saveSession,
  getSettings,
} from "./storage.js";
import {
  calculateIndependenceScore,
  classifyBehavior,
  buildSessionSummary,
} from "./analytics.js";
import { showFeedback } from "./feedback.js";

// ─── Initialization ───────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[DevReflect] Extension installed/updated.");
  await initSession();
  setupAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("[DevReflect] Browser started.");
  await initSession();
  setupAlarms();
});

/**
 * Set up periodic alarms for stats flushing.
 * chrome.alarms survives service worker suspension.
 */
function setupAlarms() {
  // Save stats every 60 seconds
  chrome.alarms.create("stats-flush", { periodInMinutes: 1 });
  // Check idle state every 2 minutes
  chrome.alarms.create("idle-check", { periodInMinutes: 2 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "stats-flush") {
    await flushCurrentSiteTime();
    await recalculateScore();
  }
  if (alarm.name === "idle-check") {
    await checkIdleState();
  }
});

// ─── Tab Event Listeners ──────────────────────────────────────────────────────

/**
 * User switched to a different tab.
 */
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return;
  await handleTabChange(tab.url);
});

/**
 * Tab URL changed (navigation within a tab).
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  // Only handle if this is the active tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab?.id === tabId) {
    await handleTabChange(tab.url);
  }
});

/**
 * Window lost focus (user switched apps).
 */
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await pauseTracking("window_blur");
  } else {
    // Refocus — resume tracking current tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.url) {
      await handleTabChange(activeTab.url);
    }
  }
});

// ─── Core Tracking Logic ──────────────────────────────────────────────────────

/**
 * Main handler for tab changes and focus events.
 * Determines if the new URL is tracked, and starts/stops timers accordingly.
 */
async function handleTabChange(url) {
  const settings = await getSettings();
  if (!settings.trackingEnabled) return;

  const domain = extractDomain(url);
  const siteInfo = domain ? ALL_TRACKED_DOMAINS[domain] : null;

  // Flush time spent on the PREVIOUS site
  await flushCurrentSiteTime();

  const session = await getSession();
  const now = Date.now();

  if (!siteInfo) {
    // Navigated away from all tracked sites
    await saveSession({
      ...session,
      currentSite: null,
      currentSiteStart: null,
      activeSiteCategory: null,
      lastActiveTime: now,
    });
    return;
  }

  // Starting to track a new site
  const isAI = siteInfo.category === "ai";

  // First time hitting AI in this session?
  if (isAI && !session.firstAITime && session.isTracking) {
    const updatedSession = {
      ...session,
      firstAITime: now,
      currentSite: domain,
      currentSiteStart: now,
      activeSiteCategory: siteInfo.category,
      lastActiveTime: now,
    };

    await saveSession(updatedSession);

    // Trigger feedback based on how long they waited
    const timeBeforeAI = now - session.startTime;
    await triggerBehaviorFeedback(timeBeforeAI, settings.feedbackMode);
  } else {
    // Start new session if this is first tracked site and no session active
    if (!session.isTracking) {
      await startNewSession(domain, siteInfo, now);
    } else {
      await saveSession({
        ...session,
        currentSite: domain,
        currentSiteStart: now,
        activeSiteCategory: siteInfo.category,
        lastActiveTime: now,
      });
    }
  }
}

/**
 * Flush elapsed time from the current site into today's stats.
 * Called before every site switch and on periodic alarm.
 */
async function flushCurrentSiteTime() {
  const session = await getSession();
  if (!session.currentSite || !session.currentSiteStart) return;

  const now = Date.now();
  const elapsed = now - session.currentSiteStart;

  // Sanity check: don't count > 30 min in one flush (catches suspension gaps)
  const cappedElapsed = Math.min(elapsed, 30 * 60 * 1000);
  if (cappedElapsed <= 0) return;

  const siteInfo = ALL_TRACKED_DOMAINS[session.currentSite];
  if (!siteInfo) return;

  const stats = await getTodayStats();

  // Accumulate into the right bucket
  if (siteInfo.category === "ai") {
    stats.aiTime += cappedElapsed;
  } else {
    stats.researchTime += cappedElapsed;
  }

  // Per-site breakdown
  if (!stats.siteBreakdown[session.currentSite]) {
    stats.siteBreakdown[session.currentSite] = 0;
  }
  stats.siteBreakdown[session.currentSite] += cappedElapsed;

  // Hourly activity heatmap
  const hour = new Date().getHours();
  stats.hourlyActivity[hour] += cappedElapsed;

  await saveTodayStats(stats);

  // Reset start time (don't lose the current site reference)
  await saveSession({ ...session, currentSiteStart: now });
}

/**
 * Start tracking a new problem-solving session.
 */
async function startNewSession(domain, siteInfo, now) {
  const sessionId = `session_${now}`;
  await saveSession({
    id: sessionId,
    startTime: now,
    firstAITime: siteInfo.category === "ai" ? now : null,
    currentSite: domain,
    currentSiteStart: now,
    activeSiteCategory: siteInfo.category,
    lastActiveTime: now,
    isTracking: true,
    timeBeforeAI: 0,
  });
}

/**
 * Pause time tracking (window blur, idle, etc.)
 */
async function pauseTracking(reason) {
  await flushCurrentSiteTime();
  const session = await getSession();
  await saveSession({
    ...session,
    currentSiteStart: null,
    lastActiveTime: Date.now(),
  });
}

/**
 * Initialize a clean session state.
 */
async function initSession() {
  const session = await getSession();
  // If session is stale (no activity for SESSION_RESET_AFTER_MS), end it
  const now = Date.now();
  if (
    session.isTracking &&
    session.lastActiveTime &&
    now - session.lastActiveTime > HEURISTICS.SESSION_RESET_AFTER_MS
  ) {
    await endCurrentSession();
  }
}

/**
 * End the current session and save its summary to today's stats.
 */
async function endCurrentSession() {
  const session = await getSession();
  if (!session.isTracking) return;

  await flushCurrentSiteTime();

  const summary = buildSessionSummary(session);
  const stats = await getTodayStats();
  stats.sessions.push(summary);
  stats.independenceScore = calculateIndependenceScore(stats, session);
  await saveTodayStats(stats);

  // Reset session
  await saveSession({
    id: "",
    startTime: 0,
    firstAITime: null,
    currentSite: null,
    currentSiteStart: null,
    lastActiveTime: 0,
    isTracking: false,
    activeSiteCategory: null,
  });
}

/**
 * Check if the user has been idle too long and pause accordingly.
 */
async function checkIdleState() {
  const session = await getSession();
  if (!session.isTracking || !session.lastActiveTime) return;

  const idleTime = Date.now() - session.lastActiveTime;
  if (idleTime > HEURISTICS.IDLE_TIMEOUT_MS) {
    await pauseTracking("idle");
  }
}

/**
 * Recalculate and save the independence score.
 */
async function recalculateScore() {
  const stats = await getTodayStats();
  const session = await getSession();
  stats.independenceScore = calculateIndependenceScore(stats, session);
  await saveTodayStats(stats);
}

// ─── Message Handler (from content scripts & popup) ───────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((err) => {
    console.error("[DevReflect] Message handler error:", err);
    sendResponse({ error: err.message });
  });
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
  const { type, payload } = message;

  switch (type) {
    case "AI_QUERY_DETECTED": {
      // Content script on ChatGPT detected a prompt submission
      const stats = await getTodayStats();
      stats.aiQueries += 1;
      await saveTodayStats(stats);
      return { ok: true };
    }

    case "COPY_PASTE_DETECTED": {
      const stats = await getTodayStats();
      const domain = extractDomain(sender.url || "");
      const siteInfo = ALL_TRACKED_DOMAINS[domain];

      if (siteInfo?.category === "ai") {
        stats.copyPasteFromAI += 1;
        const settings = await getSettings();
        if (stats.copyPasteFromAI % 3 === 0) {
          // Every 3rd copy from AI, give feedback
          await showFeedback("high_copy_paste", settings.feedbackMode, {
            title: "Code Paste Detected",
          });
        }
      } else if (siteInfo?.category === "research") {
        stats.copyPasteFromResearch += 1;
      }

      await saveTodayStats(stats);
      return { ok: true };
    }

    case "GET_STATS": {
      const [stats, session, settings] = await Promise.all([
        getTodayStats(),
        getSession(),
        getSettings(),
      ]);
      return { stats, session, settings };
    }

    case "UPDATE_SETTINGS": {
      const { saveSettings } = await import("./storage.js");
      await saveSettings(payload);
      return { ok: true };
    }

    case "RESET_DATA": {
      const { clearAllData } = await import("./storage.js");
      await clearAllData();
      return { ok: true };
    }

    case "PING": {
      return { pong: true };
    }

    default:
      return { error: `Unknown message type: ${type}` };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the registered domain from a URL.
 * Returns null for non-http URLs (chrome://, about:, etc.)
 */
function extractDomain(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return null;
    // Remove "www." prefix
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Trigger appropriate feedback based on how long user waited before AI.
 */
async function triggerBehaviorFeedback(timeBeforeAI, feedbackMode) {
  if (feedbackMode === "silent") return;

  let triggerType;
  if (timeBeforeAI < HEURISTICS.INSTANT_RELIANCE_THRESHOLD_MS) {
    triggerType = "instant_reliance";
  } else if (timeBeforeAI < HEURISTICS.GOOD_ATTEMPT_THRESHOLD_MS) {
    triggerType = "quick_attempt";
  } else if (timeBeforeAI < HEURISTICS.STRONG_ATTEMPT_THRESHOLD_MS) {
    triggerType = "good_attempt";
  } else {
    triggerType = "strong_attempt";
  }

  await showFeedback(triggerType, feedbackMode, {
    title: "DevReflect",
  });
}

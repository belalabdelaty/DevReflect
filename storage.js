/**
 * DevReflect — Storage Utility
 * Thin wrapper around chrome.storage.local with typed helpers.
 * All data access goes through here for consistency.
 */

import {
  STORAGE_KEYS,
  DEFAULT_TODAY_STATS,
  DEFAULT_SESSION,
  DEFAULT_SETTINGS,
} from "./constants.js";

/**
 * Get one or more keys from storage.
 * Returns null for missing keys (never throws).
 */
export async function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result);
    });
  });
}

/**
 * Set one or more keys in storage.
 */
export async function storageSet(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Atomically update a key by merging with existing value.
 */
export async function storageMerge(key, updates) {
  const result = await storageGet([key]);
  const existing = result[key] || {};
  await storageSet({ [key]: { ...existing, ...updates } });
}

/**
 * Returns today's stats, auto-creating fresh record if date has rolled over.
 */
export async function getTodayStats() {
  const today = getTodayKey();
  const result = await storageGet([STORAGE_KEYS.TODAY_STATS]);
  const stats = result[STORAGE_KEYS.TODAY_STATS];

  if (!stats || stats.date !== today) {
    // Roll over to a new day — archive yesterday if present
    if (stats && stats.date) {
      await archiveDay(stats);
    }
    const fresh = { ...DEFAULT_TODAY_STATS, date: today };
    await storageSet({ [STORAGE_KEYS.TODAY_STATS]: fresh });
    return fresh;
  }

  return stats;
}

/**
 * Write updated today stats back to storage.
 */
export async function saveTodayStats(stats) {
  await storageSet({ [STORAGE_KEYS.TODAY_STATS]: stats });
}

/**
 * Get current session state.
 */
export async function getSession() {
  const result = await storageGet([STORAGE_KEYS.SESSION]);
  return result[STORAGE_KEYS.SESSION] || { ...DEFAULT_SESSION };
}

/**
 * Write session state.
 */
export async function saveSession(session) {
  await storageSet({ [STORAGE_KEYS.SESSION]: session });
}

/**
 * Get user settings with defaults applied.
 */
export async function getSettings() {
  const result = await storageGet([STORAGE_KEYS.SETTINGS]);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
}

/**
 * Save user settings.
 */
export async function saveSettings(settings) {
  await storageSet({ [STORAGE_KEYS.SETTINGS]: settings });
}

/**
 * Get feedback state (cooldown tracking).
 */
export async function getFeedbackState() {
  const result = await storageGet([STORAGE_KEYS.FEEDBACK_STATE]);
  return result[STORAGE_KEYS.FEEDBACK_STATE] || { lastShownAt: 0, count: 0 };
}

/**
 * Update feedback state.
 */
export async function saveFeedbackState(state) {
  await storageSet({ [STORAGE_KEYS.FEEDBACK_STATE]: state });
}

/**
 * Archive a completed day into history (keep last 30 days).
 */
async function archiveDay(dayStats) {
  const result = await storageGet([STORAGE_KEYS.HISTORY]);
  const history = result[STORAGE_KEYS.HISTORY] || [];
  history.unshift(dayStats);
  if (history.length > 30) history.splice(30);
  await storageSet({ [STORAGE_KEYS.HISTORY]: history });
}

/**
 * Retrieve archived history (last N days).
 */
export async function getHistory(days = 7) {
  const result = await storageGet([STORAGE_KEYS.HISTORY]);
  const history = result[STORAGE_KEYS.HISTORY] || [];
  return history.slice(0, days);
}

/**
 * Returns "YYYY-MM-DD" for today in local time.
 */
export function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

/**
 * Clear all DevReflect data (for reset functionality).
 */
export async function clearAllData() {
  return new Promise((resolve) => {
    chrome.storage.local.clear(resolve);
  });
}

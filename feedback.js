/**
 * DevReflect — Feedback Engine
 * Generates context-aware messages with two modes:
 * - Sarcastic (light humor, self-aware developer culture)
 * - Motivational (encouraging, growth-focused)
 *
 * Respects cooldown to avoid notification fatigue.
 */

import { HEURISTICS } from "./constants.js";
import { getFeedbackState, saveFeedbackState } from "./storage.js";

// ─── Message Banks ────────────────────────────────────────────────────────────

const MESSAGES = {
  sarcastic: {
    instant_reliance: [
      "Wow, 30 seconds. That might be a record. Did you even read the error message?",
      "ChatGPT is basically your rubber duck at this point — but the duck thinks for you.",
      "Error occurs. Brain.exe not found. Opening ChatGPT...",
      "Quick question: is 'try stuff first' in your vocabulary?",
      "Your problem-solving pipeline: See error → Open ChatGPT → Pray. Classic.",
    ],
    quick_attempt: [
      "A whole few minutes before asking AI. Bold strategy.",
      "You tried! For like, a minute and a half. But still — you tried.",
      "Next time, try Googling it first. It's retro but effective.",
    ],
    good_attempt: [
      "3 minutes of actual thinking. Your future self is proud.",
      "Look at you — actually debugging before asking AI. Growth!",
      "You spent 3 real minutes on this. Stack Overflow misses you.",
    ],
    strong_attempt: [
      "10+ minutes before AI? Who are you and what have you done with the usual you?",
      "A genuine attempt. Your college professor would shed a tear.",
      "That's what we call 'doing the work'. Respect.",
    ],
    high_copy_paste: [
      "Ctrl+C, Ctrl+V, Ctrl+Cross-fingers. A bold architecture.",
      "Pasting AI code you don't understand is just importing bugs in bulk.",
      "That code won't debug itself when it breaks at 2am. Just saying.",
    ],
    high_score: [
      "Independence Score: High. You might actually be a developer.",
      "Almost no AI today. Either you're crushing it or the internet is down.",
    ],
    low_score: [
      "Independence Score: Critical. The AI is basically doing your job.",
      "At this rate, list 'ChatGPT' as a co-author on your PRs.",
    ],
  },

  motivational: {
    instant_reliance: [
      "Try spending 5 more minutes with the problem before opening AI. You'll often surprise yourself.",
      "The struggle IS the learning. Give yourself a chance to find the answer.",
      "Before AI: take a deep breath, re-read the error, and try ONE thing. That's it.",
    ],
    quick_attempt: [
      "Good start! Next time, try to hit 3 minutes of solo debugging before asking for help.",
      "You're building the habit. Keep pushing that solo-thinking window a little longer.",
      "Every problem you solve yourself makes the next one easier. Keep going!",
    ],
    good_attempt: [
      "Solid effort! You spent real time on this. That discipline builds expertise.",
      "3+ minutes of focused debugging — that's how great engineers are made.",
      "You're training your problem-solving muscle. This is the way.",
    ],
    strong_attempt: [
      "Exceptional! 10 minutes of deep focus before asking for help. You're building real skills.",
      "That persistence is what separates good developers from great ones.",
      "Your brain made new neural connections today. That's not nothing.",
    ],
    high_copy_paste: [
      "Try to understand each line before pasting. It takes 5 extra minutes but pays dividends.",
      "Reading AI-generated code critically makes you a better developer, not just a faster one.",
      "Ask yourself: can I explain every line of this code? If not, take a moment to learn.",
    ],
    high_score: [
      "Outstanding independence today! You're solving problems, not just asking about them.",
      "Your independence score is high — you're building real, lasting skills.",
    ],
    low_score: [
      "Tomorrow is a fresh start. Try: one problem, fully solo, before reaching for AI.",
      "Consider setting a 'no AI for the first 5 minutes' rule. Small habits, big results.",
    ],
  },
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Attempt to show feedback for a given trigger event.
 * Respects cooldown window to prevent notification fatigue.
 *
 * @param {string} triggerType - Key from MESSAGES[mode]
 * @param {string} mode - "sarcastic" | "motivational"
 * @param {object} context - Extra data for notification (title, etc.)
 */
export async function showFeedback(triggerType, mode, context = {}) {
  const feedbackState = await getFeedbackState();
  const now = Date.now();

  // Enforce cooldown
  if (now - feedbackState.lastShownAt < HEURISTICS.NOTIFICATION_COOLDOWN_MS) {
    return;
  }

  const message = pickMessage(triggerType, mode);
  if (!message) return;

  await saveFeedbackState({
    lastShownAt: now,
    count: (feedbackState.count || 0) + 1,
    lastType: triggerType,
  });

  // Send message to content script or show notification
  // We use chrome.notifications for non-intrusive toasts
  chrome.notifications.create({
    type: "basic",
    iconUrl: "../icons/icon48.png",
    title: context.title || "DevReflect",
    message,
    priority: 0,
    silent: true,
  });

  // Also broadcast to popup if open
  chrome.runtime.sendMessage({
    type: "FEEDBACK_EVENT",
    payload: { message, triggerType, mode },
  }).catch(() => {}); // Popup may not be open — ignore
}

/**
 * Pick a random message for a given trigger and mode.
 * Falls back to motivational if mode not found.
 */
export function pickMessage(triggerType, mode) {
  const bank = MESSAGES[mode] || MESSAGES.motivational;
  const pool = bank[triggerType];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Get all available trigger types for a given mode.
 */
export function getAvailableTriggers(mode) {
  return Object.keys(MESSAGES[mode] || MESSAGES.motivational);
}

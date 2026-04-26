/**
 * DevReflect — Shared Constants & Configuration
 * Central source of truth for all magic numbers and site definitions.
 */

export const TRACKED_SITES = {
  AI_TOOLS: {
    "chatgpt.com": { label: "ChatGPT", category: "ai", color: "#10a37f" },
    "chat.openai.com": { label: "ChatGPT", category: "ai", color: "#10a37f" },
    "claude.ai": { label: "Claude", category: "ai", color: "#d97706" },
    "gemini.google.com": { label: "Gemini", category: "ai", color: "#4285f4" },
    "copilot.microsoft.com": { label: "Copilot", category: "ai", color: "#0078d4" },
  },
  DEV_RESOURCES: {
    "stackoverflow.com": { label: "Stack Overflow", category: "research", color: "#f48024" },
    "github.com": { label: "GitHub", category: "research", color: "#6e40c9" },
  },
};

export const ALL_TRACKED_DOMAINS = {
  ...TRACKED_SITES.AI_TOOLS,
  ...TRACKED_SITES.DEV_RESOURCES,
};

export const HEURISTICS = {
  INSTANT_RELIANCE_THRESHOLD_MS: 30_000,   // < 30s = instant reliance
  GOOD_ATTEMPT_THRESHOLD_MS: 180_000,       // > 3 min = good attempt
  STRONG_ATTEMPT_THRESHOLD_MS: 600_000,     // > 10 min = strong attempt
  IDLE_TIMEOUT_MS: 120_000,                 // 2 min idle = pause tracking
  NOTIFICATION_COOLDOWN_MS: 300_000,        // 5 min between notifications
  SESSION_RESET_AFTER_MS: 3_600_000,        // 1 hour inactivity = new session
};

export const SCORE_THRESHOLDS = {
  CRITICAL: 20,
  LOW: 40,
  MEDIUM: 60,
  HIGH: 80,
};

export const STORAGE_KEYS = {
  TODAY_STATS: "devreflect_today_stats",
  SESSION: "devreflect_session",
  SETTINGS: "devreflect_settings",
  HISTORY: "devreflect_history",
  FEEDBACK_STATE: "devreflect_feedback_state",
};

export const DEFAULT_SETTINGS = {
  feedbackMode: "sarcastic", // "sarcastic" | "motivational" | "silent"
  trackingEnabled: true,
  showNotifications: true,
};

export const DEFAULT_TODAY_STATS = {
  date: "",
  aiTime: 0,
  researchTime: 0,
  aiQueries: 0,
  copyPasteFromAI: 0,
  copyPasteFromResearch: 0,
  independenceScore: 100,
  sessions: [],
  siteBreakdown: {},
  hourlyActivity: Array(24).fill(0),
};

export const DEFAULT_SESSION = {
  id: "",
  startTime: 0,
  firstAITime: null,
  timeBeforeAI: 0,
  currentSite: null,
  currentSiteStart: null,
  lastActiveTime: 0,
  isTracking: false,
  activeSiteCategory: null,
};

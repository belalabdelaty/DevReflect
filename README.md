# DevReflect — Chrome Extension

> *Track your AI dependency. Measure your independence. Become a better developer.*

##  Project Structure

```
devreflect/
├── manifest.json              # MV3 extension config
├── icons/                     # Extension icons (16, 48, 128px)
├── src/
│   ├── constants.js           # All magic numbers, site definitions, config
│   ├── storage.js             # chrome.storage.local abstraction layer
│   ├── analytics.js           # Score calculation, behavior classification
│   ├── feedback.js            # Message banks + notification engine
│   ├── background.js          # Service worker: tab tracking, timers, events
│   ├── content-ai.js          # Injected into ChatGPT/Claude/Gemini
│   └── content-dev.js         # Injected into StackOverflow/GitHub
└── popup/
    ├── popup.html             # Dashboard shell
    ├── popup.css              # Dark terminal aesthetic
    └── popup.js               # Dashboard controller
```

---

##  How to Load the Extension into Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer Mode** (toggle, top-right)
3. Click **"Load unpacked"**
4. Select the `devreflect/` folder
5. The extension icon appears in your toolbar — pin it!

---

##  Architecture Explained

### Data Flow
```
User navigates → Tab events fire → background.js
                                        ↓
                              chrome.storage.local
                                        ↓
            Content scripts ←→ Background messaging ←→ Popup
```

### background.js (Service Worker)
The orchestration layer. Handles:
- `chrome.tabs.onActivated` → detects site switches
- `chrome.tabs.onUpdated` → detects in-tab navigation
- `chrome.windows.onFocusChanged` → pauses when user alt-tabs
- `chrome.alarms` → periodic stats flush (MV3 service workers can sleep!)
- All message routing between popup ↔ content scripts

**Key insight:** MV3 service workers are ephemeral. They can be killed at any time.
This is why ALL state is immediately written to `chrome.storage` — never held only in memory.

### content-ai.js
Injected into AI sites. Detects:
- Prompt submissions via `keydown` (Enter) + MutationObserver for send buttons
- Copy events (large text copies = likely code copying)
- Sends messages to background via `chrome.runtime.sendMessage`

### content-dev.js
Injected into StackOverflow/GitHub. Detects:
- Copy events (positive signal: doing research)
- Scroll depth (60%+ = actually reading, not skimming)

### storage.js
Clean abstraction over `chrome.storage.local`. Key features:
- Auto date-rollover (creates fresh daily record each new day)
- Automatic history archival (keeps 30 days)
- Typed getters/setters for each data domain

### analytics.js
Pure functions only (no side effects). Includes:
- `calculateIndependenceScore()` — weighted formula
- `classifyBehavior()` — instant_reliance, quick_attempt, good_attempt, strong_attempt
- `formatDuration()` — ms → "4m 32s"
- `computeTrend()` — 7-day trend detection

### feedback.js
Message bank with 2 modes:
- **Sarcastic**: Developer culture humor, self-aware
- **Motivational**: Actionable, growth-focused

Respects a 5-minute cooldown to prevent notification spam.

---

##  Independence Score Formula

```
Base = (researchTime / totalTime) × 100

Penalties:
  - Instant reliance (<30s before AI): -8 per occurrence
  - High query volume (>10): -2 per query above 10, max -20
  - AI copy-paste: -5 per copy, max -25

Bonuses:
  - Good attempt (>3min): +5 per occurrence

Final = clamp(0, 100, Base + Bonuses - Penalties)
```

---

##  Session Lifecycle

```
[User opens tracked site]
        ↓
  startNewSession()
        ↓
  [Every 60s] flushCurrentSiteTime() → accumulate into stats
        ↓
  [User opens AI site for first time]
        ↓
  Record firstAITime → trigger behavior feedback
        ↓
  [1hr inactivity] endCurrentSession() → save summary
```

---

##  Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Tracking | ON | Enable/disable all tracking |
| Notifications | ON | Show Chrome notifications |
| Feedback Mode | Sarcastic | Sarcastic / Motivational / Silent |

---
##  Common Mistakes to Avoid

1. **Storing state only in service worker memory** — it WILL be killed. Always use `chrome.storage`.
2. **Forgetting MutationObserver cleanup** — always disconnect observers on page unload.
3. **Not handling `chrome.runtime.lastError`** — every message send needs error handling.
4. **Blocking the event loop in content scripts** — keep them lean and async.
5. **Not debouncing rapid events** — copy/paste and keydown fire many times; debounce them.
6. **Using `localStorage` in service workers** — not available in MV3 service workers; use `chrome.storage`.
7. **Overly broad `host_permissions`** — only request what you track; `<all_urls>` is a red flag in the store.

---

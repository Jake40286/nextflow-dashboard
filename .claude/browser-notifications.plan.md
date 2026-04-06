# Browser Notifications — Implementation Plan

**Goal:** Fire browser notifications for tasks with upcoming due dates, follow-up dates, or My Day dates. Works while the tab is open (foreground or background). Gated behind a feature flag. Permission requested lazily.

---

## Files to touch

| File | Change |
|------|--------|
| `app/web_ui/js/data.js` | Add `notifications` to `DEFAULT_FEATURE_FLAGS` |
| `app/web_ui/js/notifications.js` | **New file** — `NotificationScheduler` class |
| `app/web_ui/js/app.js` | Import and instantiate `NotificationScheduler` |
| `app/web_ui/js/ui.js` | Add `notifications` entry to `renderFeatureFlagSettings()` entries array |
| `app/web_ui/sw.js` | Add `notificationclick` event listener |

---

## Step 1 — `data.js`: add feature flag

In `DEFAULT_FEATURE_FLAGS` (line ~134), add:

```js
notifications: false,
```

`normalizeFeatureFlags()` handles it automatically — no other changes needed in `data.js`.

---

## Step 2 — `notifications.js`: new module

Create `app/web_ui/js/notifications.js`. Full spec:

```js
export class NotificationScheduler {
  // ...
}
```

### Constructor

```js
constructor(taskManager) {
  this._tm = taskManager;
  this._handles = new Map();        // taskId → timeoutId
  this._firedKey = "nextflow-notif-fired";  // localStorage key → Set<taskId:date>
  this._permissionState = null;     // cache, avoid repeat prompts
  this._bound = this._onStateChange.bind(this);
}
```

### `init()`

```js
init() {
  this._tm.addEventListener("statechange", this._bound);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") this._reschedule();
  });
  this._reschedule();
}
```

### Permission handling

```js
async _ensurePermission() {
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  // "default" — request it
  const result = await Notification.requestPermission();
  return result === "granted";
}
```

### `_onStateChange()`

```js
_onStateChange() {
  const flags = this._tm.getFeatureFlags();
  if (!flags.notifications) {
    this._cancelAll();
    return;
  }
  this._reschedule();
}
```

### `_reschedule()`

Clears all existing handles, then scans tasks. For each task:

1. Collect candidate dates:
   - `task.dueDate` → label `"Due"`
   - `task.followUpDate` → label `"Follow-up"`
   - `task.myDayDate` → label `"My Day"`
2. For each candidate date, parse as `YYYY-MM-DD`. Convert to a `Date` at midnight local time.
3. Compute `msUntil = date.getTime() - Date.now()`.
4. Only schedule if `msUntil > 0 && msUntil <= LOOKAHEAD_MS` (constant: `4 * 60 * 60 * 1000`, i.e. 4 hours).
5. Build a dedup key: `"${task.id}:${fieldName}:${dateStr}"`. Check `_getFiredSet()` — skip if already fired.
6. `setTimeout` → `_fire(task, label, dateStr, dedupKey)`.

```js
_reschedule() {
  this._cancelAll();
  const flags = this._tm.getFeatureFlags();
  if (!flags.notifications) return;
  if (!("Notification" in window)) return;

  const tasks = this._tm.getAllActiveTasks(); // returns all non-completed tasks
  const now = Date.now();
  const LOOKAHEAD_MS = 4 * 60 * 60 * 1000;

  for (const task of tasks) {
    const candidates = [
      { date: task.dueDate,       label: "Due",       field: "dueDate" },
      { date: task.followUpDate,  label: "Follow-up", field: "followUpDate" },
      { date: task.myDayDate,     label: "My Day",    field: "myDayDate" },
    ];
    for (const { date, label, field } of candidates) {
      if (!date) continue;
      const ts = new Date(date + "T00:00:00").getTime();
      const msUntil = ts - now;
      if (msUntil <= 0 || msUntil > LOOKAHEAD_MS) continue;
      const dedupKey = `${task.id}:${field}:${date}`;
      if (this._getFiredSet().has(dedupKey)) continue;
      const handle = setTimeout(() => this._fire(task, label, date, dedupKey), msUntil);
      this._handles.set(dedupKey, handle);
    }
  }
}
```

> **Note on `getAllActiveTasks()`**: This method may not exist by name. Use whatever `TaskManager` method returns all non-completed tasks — check `data.js` for the appropriate method. Likely candidates: `getTasks()`, `getActiveTasks()`, or iterate `this._tm.state.tasks`.

### `_fire(task, label, dateStr, dedupKey)`

```js
async _fire(task, label, dateStr, dedupKey) {
  this._handles.delete(dedupKey);
  const ok = await this._ensurePermission();
  if (!ok) return;

  // Mark fired before showing — prevents double-fire on rapid reschedule
  const fired = this._getFiredSet();
  fired.add(dedupKey);
  this._saveFiredSet(fired);

  const body = [task.areaOfFocus, task.contexts?.join(" ")].filter(Boolean).join(" · ") || "";
  const options = {
    body: body || undefined,
    icon: "/android-chrome-192x192.png",
    tag: dedupKey,       // browser deduplicates by tag
    data: { taskId: task.id },
  };

  const reg = await navigator.serviceWorker?.ready;
  if (reg) {
    reg.showNotification(`${label}: ${task.title}`, options);
  } else {
    new Notification(`${label}: ${task.title}`, options);
  }
}
```

### Fired-set helpers (localStorage)

```js
_getFiredSet() {
  try {
    const raw = localStorage.getItem(this._firedKey);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

_saveFiredSet(set) {
  // Prune entries older than 2 days to prevent unbounded growth.
  // dedupKey format: "taskId:field:YYYY-MM-DD"
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const pruned = [...set].filter(k => {
    const parts = k.split(":");
    const date = parts[parts.length - 1];
    return date >= cutoff;
  });
  localStorage.setItem(this._firedKey, JSON.stringify(pruned));
}
```

### `_cancelAll()`

```js
_cancelAll() {
  for (const handle of this._handles.values()) clearTimeout(handle);
  this._handles.clear();
}
```

---

## Step 3 — `app.js`: wire it up

Add import at top:

```js
import { NotificationScheduler } from "./notifications.js";
```

After `const review = new ReviewController(taskManager, ui);`, add:

```js
const notifications = new NotificationScheduler(taskManager);
```

Inside `DOMContentLoaded`, after `analytics.init();`, add:

```js
notifications.init();
```

---

## Step 4 — `ui.js`: Settings panel toggle

In `renderFeatureFlagSettings()` (line ~3700), the `entries` array is defined with objects for each flag. Add a new entry after the `googleCalendarEnabled` entry:

```js
{
  key: "notifications",
  label: "Browser Notifications",
  description: "Show a notification when a task's due date, follow-up date, or My Day date arrives. Permission is requested the first time a notification fires.",
},
```

No `renderConfig` needed — no sub-panel for this flag.

---

## Step 5 — `sw.js`: click handler

Append to the end of `sw.js` (after the `fetch` listener):

```js
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing tab if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab
      return clients.openWindow("/");
    })
  );
});
```

---

## Edge cases and constraints

- **`Notification` API unavailable** (insecure context, old browser): guard every access with `"Notification" in window`.
- **Service worker unavailable**: fall back to `new Notification(...)` directly (covered in `_fire()`).
- **Permission denied**: `_fire()` silently no-ops — no toast, no retry. The Settings toggle remains on; the user must re-enable in browser settings.
- **Tab reopened after a date passes**: tasks with dates already past the lookahead window won't schedule (msUntil <= 0). This is intentional — no spam for old items.
- **Feature flag toggled off**: `_onStateChange()` → `_cancelAll()` clears all pending timers immediately.
- **Multiple tabs open**: `tag: dedupKey` in notification options causes the browser to deduplicate — showing only one notification per key, replacing any prior one. The fired-set in localStorage also prevents double-fire across tabs.

---

## What this does NOT implement (out of scope)

- Push notifications when the browser is closed (requires Web Push API + VAPID keys + server endpoint — significant backend work, not worth it for a personal single-user tool)
- Configurable lookahead window (hardcoded 4 hours — can be added to Settings later if needed)
- Notification actions/buttons (e.g. "Mark Done") — would require SW to call back into the page; adds complexity

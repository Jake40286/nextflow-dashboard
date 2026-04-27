const STORAGE_KEY = "nextflow-state-v1";
const STORAGE_KEY_LEGACY = "gtd-dashboard-state-v1";
const STATE_ENDPOINT = "/state";

export const STATUS = Object.freeze({
  INBOX: "inbox",
  NEXT: "next",
  DOING: "doing",
  WAITING: "waiting",
  SOMEDAY: "someday",
});

export const PHYSICAL_CONTEXTS = ["@Phone", "@Office", "@Home", "@Errands", "@Lab", "@Work", "@Team", "@Desk"];
export const PEOPLE_TAG_PATTERN = /^\+[A-Za-z0-9][A-Za-z0-9_-]*$/;
export const EFFORT_LEVELS = ["low", "medium", "high"];
export const TIME_REQUIREMENTS = ["<5min", "<15min", "<30min", "30min+"];
export const PROJECT_AREAS = ["Work", "Personal", "Home", "Finance", "Health"];
export const PROJECT_THEMES = ["Networking", "DevOps", "Automations", "Family", "Admin", "Research"];
export const PROJECT_STATUSES = ["Active", "OnHold", "Completed"];
const SLUG_MIN_LENGTH = 5;
const DEVICE_INFO_KEY = "nextflow-device-info";
const DEVICE_INFO_KEY_LEGACY = "gtd-dashboard-device-info";
const OP_LOG_KEY = "nextflow-op-log";
const OP_LOG_MAX = 300;
const OP_LOG_SHARED_MAX = 100;
// Stores the last server-assigned _rev this client successfully wrote/read.
const REV_KEY = "nextflow-last-rev";
// Fields tracked in the op log and eligible for per-field-group merge
const OP_LOG_FIELDS = ["status", "myDayDate", "calendarDate", "calendarTime", "dueDate", "followUpDate"];
// Field groups for per-field-group merge logic in mergeTasks()
const MERGE_FIELD_GROUPS = {
  scheduling: ["myDayDate", "calendarDate", "calendarTime"],
  status: ["status"],
  dueDate: ["dueDate"],
  followUpDate: ["followUpDate"],
  prerequisites: ["prerequisiteTaskIds"],
};
// Field groups for per-field-group merge logic in mergeSettings().
// NOTE: theme/customTheme/customThemePalettes are intentionally excluded — they are
// device-local and never merged across devices (stripped from server payload too).
const SETTINGS_MERGE_GROUPS = {
  calendar: ["googleCalendarConfig"],
  flags: ["featureFlags", "staleTaskThresholds"],
  lists: ["contextOptions", "peopleOptions", "areaOptions", "deletedPeopleOptions"],
  review: ["review"],
};
export const RECURRENCE_TYPES = Object.freeze({
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  YEARLY: "yearly",
});
export const RECURRING_OPTIONS = ["daily", "weekly", "monthly", "yearly"];
export const THEME_OPTIONS = Object.freeze([
  Object.freeze({
    id: "light",
    label: "Sandstone",
    description: "Warm paper canvas with calm teal accents.",
    icon: "☀︎",
    swatches: Object.freeze(["#f5efe2", "#0f766e", "#b45309"]),
  }),
  Object.freeze({
    id: "dark",
    label: "Ember Night",
    description: "Deep contrast for late-night reviews.",
    icon: "☾",
    swatches: Object.freeze(["#1b1510", "#5eead4", "#fb923c"]),
  }),
  Object.freeze({
    id: "aurora",
    label: "Aurora",
    description: "Fresh mint gradients with energetic lime accents.",
    icon: "✦",
    swatches: Object.freeze(["#ecfff7", "#0f766e", "#65a30d"]),
  }),
  Object.freeze({
    id: "graphite",
    label: "Graphite",
    description: "Cool dark slate with bright cyan highlights.",
    icon: "◼",
    swatches: Object.freeze(["#141a22", "#38bdf8", "#f59e0b"]),
  }),
  Object.freeze({
    id: "skyline",
    label: "Skyline",
    description: "Light blue workspace tuned for daytime planning.",
    icon: "◧",
    swatches: Object.freeze(["#eef6ff", "#2563eb", "#0d9488"]),
  }),
  Object.freeze({
    id: "midnight",
    label: "Midnight",
    description: "Deep indigo for late-night focus sessions.",
    icon: "◉",
    swatches: Object.freeze(["#0e0d1f", "#a78bfa", "#fbbf24"]),
  }),
  Object.freeze({
    id: "custom",
    label: "Custom",
    description: "Choose your own canvas, accent, and highlight colors.",
    icon: "✎",
    swatches: Object.freeze(["#f5efe2", "#0f766e", "#b45309"]),
  }),
]);
const DEFAULT_THEME = "light";
const THEME_IDS = new Set(THEME_OPTIONS.map((theme) => theme.id));
const DEFAULT_CUSTOM_THEME = Object.freeze({
  canvas: "#f5efe2",
  accent: "#0f766e",
  signal: "#b45309",
});
const CUSTOM_THEME_PALETTE_DEFAULT_NAME = "Custom Palette";
const CUSTOM_THEME_PALETTE_NAME_MAX = 40;
const DEFAULT_FEATURE_FLAGS = Object.freeze({
  showFiltersCard: true,
  showDaysSinceTouched: false,
  highlightStaleTasks: false,
  googleCalendarEnabled: true,
});

const DEFAULT_STALE_TASK_THRESHOLDS = Object.freeze({
  warn: 7,
  stale: 14,
  old: 30,
  ancient: 90,
  futureDueDaysThreshold: 30,
});

const DEFAULT_GOOGLE_CALENDAR_CONFIG = Object.freeze({
  calendarId: "",
  timezone: "UTC",
  defaultDurationMinutes: 60,
});
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const STATUS_LABELS = {
  [STATUS.INBOX]: "Inbox",
  [STATUS.NEXT]: "Pending Tasks",
  [STATUS.DOING]: "Doing",
  [STATUS.WAITING]: "Delegated",
  [STATUS.SOMEDAY]: "Backburner",
};
const STATUS_ORDER = [STATUS.INBOX, STATUS.NEXT, STATUS.DOING, STATUS.WAITING, STATUS.SOMEDAY];
const SECTION_STATUS_MAP = new Map([
  ["inbox", STATUS.INBOX],
  ["capture", STATUS.INBOX],
  ["pending tasks", STATUS.NEXT],
  ["next actions", STATUS.NEXT],
  ["next-actions", STATUS.NEXT],
  ["next", STATUS.NEXT],
  ["doing", STATUS.DOING],
  ["in progress", STATUS.DOING],
  ["in-progress", STATUS.DOING],
  ["delegated", STATUS.WAITING],
  ["waiting for", STATUS.WAITING],
  ["waiting-for", STATUS.WAITING],
  ["waiting", STATUS.WAITING],
  ["backburner", STATUS.SOMEDAY],
  ["someday maybe", STATUS.SOMEDAY],
  ["someday / maybe", STATUS.SOMEDAY],
  ["someday-maybe", STATUS.SOMEDAY],
  ["someday", STATUS.SOMEDAY],
  ["maybe", STATUS.SOMEDAY],
]);

const EMPTY_STATE = {
  tasks: [],
  reference: [],
  completionLog: [],
  projects: [],
  completedProjects: [],
  templates: [],
};

const defaultSettings = (projects = [], completedProjects = []) => ({
  theme: DEFAULT_THEME,
  customTheme: { ...DEFAULT_CUSTOM_THEME },
  customThemePalettes: [],
  contextOptions: normalizeContextOptions(),
  peopleOptions: normalizePeopleOptions(),
  deletedPeopleOptions: [],
  areaOptions: normalizeAreaOptions(undefined, projects, completedProjects),
  featureFlags: { ...DEFAULT_FEATURE_FLAGS },
  staleTaskThresholds: { ...DEFAULT_STALE_TASK_THRESHOLDS },
  googleCalendarConfig: { ...DEFAULT_GOOGLE_CALENDAR_CONFIG },
  review: normalizeReviewSettings(),
});

const defaultState = () => ({
  tasks: [],
  reference: [],
  completionLog: [],
  projects: [],
  completedProjects: [],
  templates: [],
  checklist: [
    { id: "c-1", label: "Get inbox to zero", done: false },
    { id: "c-2", label: "Review pending tasks by context", done: false },
    { id: "c-3", label: "Update delegated list", done: false },
    { id: "c-4", label: "Review calendar notes and blockers", done: false },
    { id: "c-5", label: "Look at backburner to activate items", done: false },
  ],
  analytics: {
    history: [
      { week: "Week 08", complete: 12, remaining: 6 },
      { week: "Week 09", complete: 14, remaining: 5 },
      { week: "Week 10", complete: 18, remaining: 4 },
      { week: "Week 11", complete: 13, remaining: 7 },
      { week: "Week 12", complete: 16, remaining: 5 },
    ],
  },
  settings: defaultSettings(),
});

function hydrateState(raw = {}) {
  const nextState = {
    ...defaultState(),
    ...raw,
  };
  nextState.tasks = (nextState.tasks || []).map((task) => normalizeTask(task));
  nextState.reference = (nextState.reference || []).map((entry) => normalizeCompletionEntry(entry)).filter(Boolean);
  nextState.completionLog = (nextState.completionLog || [])
    .map((entry) => normalizeCompletionEntry(entry))
    .filter(Boolean);
  nextState.projects = (nextState.projects || []).map((project) => normalizeProjectTags(project));
  nextState.completedProjects = (nextState.completedProjects || [])
    .map((project) => normalizeCompletedProject(project))
    .filter(Boolean);
  nextState.templates = (nextState.templates || []).map(normalizeTemplate).filter(Boolean);
  nextState.settings = {
    theme: normalizeTheme(nextState.settings?.theme),
    customTheme: normalizeCustomTheme(nextState.settings?.customTheme),
    customThemePalettes: normalizeCustomThemePalettes(nextState.settings?.customThemePalettes),
    contextOptions: normalizeContextOptions(
      nextState.settings?.contextOptions,
      nextState.tasks,
      nextState.reference,
      nextState.completionLog
    ),
    peopleOptions: normalizePeopleOptions(
      nextState.settings?.peopleOptions,
      nextState.tasks,
      nextState.reference,
      nextState.completionLog
    ).filter((opt) => {
      // Exclude any tags the user has explicitly deleted, preventing text-mention
      // resurrection on page reload.
      const tag = typeof opt === "object" && opt !== null ? opt.name : opt;
      const deleted = nextState.settings?.deletedPeopleOptions || [];
      return !deleted.some((d) => typeof d === "string" && typeof tag === "string" && d.toLowerCase() === tag.toLowerCase());
    }),
    deletedPeopleOptions: normalizePeopleTagCollection(
      nextState.settings?.deletedPeopleOptions || []
    ),
    areaOptions: normalizeAreaOptions(
      nextState.settings?.areaOptions,
      nextState.projects,
      nextState.completedProjects
    ),
    featureFlags: normalizeFeatureFlags(nextState.settings?.featureFlags),
    staleTaskThresholds: normalizeStaleTaskThresholds(nextState.settings?.staleTaskThresholds),
    googleCalendarConfig: normalizeGoogleCalendarConfig(nextState.settings?.googleCalendarConfig),
    review: normalizeReviewSettings(nextState.settings?.review),
    _fieldTimestamps: nextState.settings?._fieldTimestamps || {},
  };
  return nextState;
}

async function readServerState() {
  if (typeof fetch === "undefined") {
    throw new Error("Fetch API is unavailable");
  }
  const response = await fetch(STATE_ENDPOINT, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}`);
  }
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("Invalid server state payload", error);
    return {};
  }
}

async function readCompletedState() {
  if (typeof fetch === "undefined") {
    throw new Error("Fetch API is unavailable");
  }
  const response = await fetch("/completed", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}`);
  }
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("Invalid /completed payload", error);
    return {};
  }
}

// Writes state to the server using optimistic locking.
// ifMatch: the client's last known server _rev (sent as If-Match header).
// Returns the new _rev on success.
// Throws an error with .isConflict=true and .serverState set on 409.
async function writeServerState(state, { ifMatch } = {}) {
  if (typeof fetch === "undefined") {
    throw new Error("Fetch API is unavailable");
  }
  // Completion fields are included when the caller opts in (completionsDirty flag).
  // The server merges them into completed.json rather than replacing it.
  const slim = { ...state };
  // Strip device-local theme fields so they are never overwritten on another device.
  if (slim.settings) {
    const { theme: _t, customTheme: _ct, customThemePalettes: _ctp, ...settingsSlim } = slim.settings;
    if (settingsSlim._fieldTimestamps) {
      const { appearance: _a, ...tsRest } = settingsSlim._fieldTimestamps;
      settingsSlim._fieldTimestamps = Object.keys(tsRest).length ? tsRest : undefined;
    }
    slim.settings = settingsSlim;
  }
  const headers = { "Content-Type": "application/json" };
  if (ifMatch !== undefined && ifMatch !== null) {
    headers["If-Match"] = String(ifMatch);
  }
  const response = await fetch(STATE_ENDPOINT, {
    method: "PUT",
    headers,
    body: JSON.stringify(slim),
  });
  if (response.status === 409) {
    const text = await response.text().catch(() => "{}");
    let serverState = {};
    try { serverState = JSON.parse(text); } catch { /* ignore */ }
    const err = new Error("Conflict");
    err.isConflict = true;
    err.serverState = serverState;
    throw err;
  }
  if (!response.ok) {
    throw new Error(`Failed with status ${response.status}`);
  }
  const body = await response.json().catch(() => ({}));
  return body._rev ?? null;
}

function safeLocalStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch (error) {
    console.error("LocalStorage unavailable", error);
  }
  return null;
}

function generateId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

function _sessionSecs(start, end) {
  return Math.max(0, Math.floor((new Date(end) - new Date(start)) / 1000));
}

function _logDoingSessionStart(task, startIso) {
  task.doingSessions = task.doingSessions || [];
  task.doingSessions.push({ id: generateId("sess"), start: startIso, end: null });
  task.doingStartedAt = startIso;
}

function _closeDoingSession(task, endIso) {
  const sessions = task.doingSessions || [];
  const openIdx = sessions.findIndex((s) => s.start && !s.end);
  // Prefer the open session's start; fall back to the legacy doingStartedAt field.
  const startIso = openIdx >= 0 ? sessions[openIdx].start : task.doingStartedAt;
  if (startIso) {
    task.totalDoingSeconds = (task.totalDoingSeconds || 0) + _sessionSecs(startIso, endIso);
    if (openIdx >= 0) {
      sessions[openIdx] = { ...sessions[openIdx], end: endIso };
    } else {
      // Backward-compat: had doingStartedAt but no session entry yet.
      task.doingSessions = [...sessions, { id: generateId("sess"), start: startIso, end: endIso }];
    }
  }
  task.doingStartedAt = null;
}

function nowIso() {
  return new Date().toISOString();
}

function createSlug(seed = "") {
  const input = seed || `${Math.random()}-${Date.now()}`;
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  const slug = Math.abs(hash).toString(36).toUpperCase();
  if (slug.length >= SLUG_MIN_LENGTH) {
    return slug.slice(0, 8);
  }
  return slug.padStart(SLUG_MIN_LENGTH, "0");
}

function normalizeSlug(value, seed) {
  if (typeof value === "string" && value.trim()) {
    return value.trim().toUpperCase();
  }
  return createSlug(seed);
}

function readOpLogEntries(storage, limit = OP_LOG_MAX) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(OP_LOG_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    return Array.isArray(entries) ? entries.slice(0, limit) : [];
  } catch {
    return [];
  }
}

function appendOpLogEntries(storage, newEntries) {
  if (!storage || !newEntries?.length) return;
  try {
    const existing = readOpLogEntries(storage, OP_LOG_MAX);
    const merged = mergeOpLogs(existing, newEntries);
    storage.setItem(OP_LOG_KEY, JSON.stringify(merged));
  } catch {
    // localStorage full or unavailable — op log is best-effort
  }
}

function mergeOpLogs(localEntries = [], remoteEntries = []) {
  const map = new Map();
  [...localEntries, ...remoteEntries].forEach((entry) => {
    if (entry?.id) map.set(entry.id, entry);
  });
  return Array.from(map.values())
    .sort((a, b) => (b.ts > a.ts ? 1 : b.ts < a.ts ? -1 : 0))
    .slice(0, OP_LOG_MAX);
}

function getDeviceIdentity(storage) {
  const fallback = { id: "device-unknown", label: "Unknown device" };
  if (!storage) {
    return fallback;
  }
  try {
    const cached = storage.getItem(DEVICE_INFO_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.id && parsed?.label) {
        return parsed;
      }
    }
  } catch (error) {
    console.error("Failed to read device identity", error);
  }
  const id = generateId("device");
  let platformLabel = "This device";
  try {
    if (typeof navigator !== "undefined") {
      platformLabel =
        navigator.userAgentData?.platform ||
        navigator.platform ||
        navigator.userAgent ||
        platformLabel;
    }
  } catch (error) {
    platformLabel = "This device";
  }
  const label = `${platformLabel} (${id.slice(-4)})`;
  const info = { id, label };
  try {
    storage.setItem(DEVICE_INFO_KEY, JSON.stringify(info));
  } catch (error) {
    console.error("Failed to persist device identity", error);
  }
  return info;
}

function migrateStorageKeys(storage) {
  if (!storage) return;
  const pairs = [
    [STORAGE_KEY_LEGACY, STORAGE_KEY],
    [DEVICE_INFO_KEY_LEGACY, DEVICE_INFO_KEY],
  ];
  for (const [oldKey, newKey] of pairs) {
    try {
      const val = storage.getItem(oldKey);
      if (val !== null && storage.getItem(newKey) === null) {
        storage.setItem(newKey, val);
      }
      if (val !== null) storage.removeItem(oldKey);
    } catch (error) {
      console.warn("Storage migration failed for", oldKey, error);
    }
  }
}

export class TaskManager extends EventTarget {
  constructor(storageKey = STORAGE_KEY) {
    super();
    this.storageKey = storageKey;
    this.storage = safeLocalStorage();
    this.state = hydrateState(EMPTY_STATE);
    this.deviceInfo = getDeviceIdentity(this.storage);
    this.remoteSyncEnabled = typeof fetch !== "undefined";
    this.lastKnownRev = this._loadLastKnownRev();
    this.remoteRetryTimer = null;
    this.lastSyncInfo = null;
    this.connectionStatus = "unknown";
    this.serverVersion = null;
    this._initialLoadComplete = false;
    this._localPersistTimer = null;
    this._completedDataLoaded = false;
    this._completionsDirty = false;
    this._flushInProgress = false;
    this._flushPending = false;
    migrateStorageKeys(this.storage);
    this.loadFromLocal();
    if (typeof window !== "undefined") {
      const flush = () => this._persistLocallyNow();
      window.addEventListener("beforeunload", flush);
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flush();
      });
    }
    if (this.remoteSyncEnabled) {
      this.loadRemoteState();
    }
  }

  async loadRemoteState(options = {}) {
    try {
      // Fetch slim /state and completion history in parallel.
      const [remoteState, completedData] = await Promise.all([
        readServerState(),
        readCompletedState().catch(() => ({})),
      ]);
      this._checkServerVersion(remoteState);
      this._initialLoadComplete = true;
      // Reconstitute a full remote state for merging so that tombstones
      // (tasks completed on another device) are preserved correctly.
      const remoteStateFull = { ...remoteState, ...completedData };
      const nextState = options.replaceLocal
        ? hydrateState(remoteStateFull)
        : hydrateState(mergeStates(remoteStateFull, this.state || {}));
      this.state = nextState;
      // Merge the remote device's op log entries into our local log.
      if (Array.isArray(remoteState.deviceLog) && remoteState.deviceLog.length) {
        const merged = mergeOpLogs(readOpLogEntries(this.storage, OP_LOG_MAX), remoteState.deviceLog);
        try { this.storage?.setItem(OP_LOG_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
      }
      // Track the server's revision so flushRemoteQueue can use optimistic locking.
      if (remoteState._rev != null) {
        this.lastKnownRev = remoteState._rev;
        this._saveLastKnownRev(remoteState._rev);
      }
      this._completedDataLoaded = true;
      this.setConnectionStatus("online");
      this.emitChange({ persist: false });
      // Write-back: if the merge produced more data than the server reported,
      // local had offline-created content the server doesn't know about. Upload now.
      // Skipped when the caller is manualSync() and when replaceLocal is set.
      if (!options.replaceLocal && !options.skipWriteBack) {
        const remoteActiveTasks = (remoteStateFull.tasks || []).filter((t) => t && !t._deleted).length;
        const mergedActiveTasks = (nextState.tasks || []).filter((t) => t && !t._deleted).length;
        const remoteCompletions = (remoteStateFull.completionLog || []).length +
          (remoteStateFull.reference || []).length +
          (remoteStateFull.completedProjects || []).length;
        const mergedCompletions = (nextState.completionLog || []).length +
          (nextState.reference || []).length +
          (nextState.completedProjects || []).length;
        if (mergedActiveTasks > remoteActiveTasks || mergedCompletions > remoteCompletions) {
          this._completionsDirty = mergedCompletions > remoteCompletions;
          this.persistRemotely();
        }
      }
    } catch (error) {
      console.error("Failed to load remote state", error);
      this.setConnectionStatus("offline");
      this.notify("warn", "Server storage unavailable. Showing local data until it returns.");
      if (options?.rethrow) {
        throw error;
      }
    }
  }

  _loadLastKnownRev() {
    try {
      const v = this.storage?.getItem(REV_KEY);
      if (v !== null && v !== undefined) {
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : 0;
      }
    } catch { /* ignore */ }
    return 0;
  }

  _saveLastKnownRev(rev) {
    try {
      this.storage?.setItem(REV_KEY, String(rev));
    } catch { /* ignore */ }
  }

  loadFromLocal() {
    if (!this.storage) {
      return;
    }
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (raw) {
        this.state = hydrateState(JSON.parse(raw));
      }
    } catch (error) {
      console.error("Failed to load state", error);
      this.notify("error", "Could not load saved data. Starting from an empty dashboard.");
      this.state = hydrateState(EMPTY_STATE);
    }
  }

  _persistLocallyNow() {
    if (!this.storage) return;
    if (this._localPersistTimer) {
      clearTimeout(this._localPersistTimer);
      this._localPersistTimer = null;
    }
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (error) {
      console.error("Failed to cache state locally", error);
    }
  }

  persistLocally() {
    if (!this.storage) return;
    if (this._localPersistTimer) clearTimeout(this._localPersistTimer);
    this._localPersistTimer = setTimeout(() => {
      this._localPersistTimer = null;
      this._persistLocallyNow();
    }, 500);
  }

  async ensureCompletedLoaded() {
    if (this._completedDataLoaded || !this.remoteSyncEnabled) return;
    try {
      const completed = await readCompletedState();
      // Merge server data with local state rather than replacing — local entries
      // (not yet synced to the server) must survive this load.
      const mergeById = (localArr, remoteArr) => {
        const map = new Map((remoteArr || []).filter((e) => e?.id).map((e) => [e.id, e]));
        (localArr || []).forEach((e) => { if (e?.id) map.set(e.id, e); });
        return Array.from(map.values());
      };
      this.state = {
        ...this.state,
        completionLog: mergeById(this.state.completionLog, completed.completionLog),
        reference: mergeById(this.state.reference, completed.reference),
        completedProjects: mergeById(this.state.completedProjects, completed.completedProjects),
      };
      this._completedDataLoaded = true;
    } catch (error) {
      console.error("Failed to load completed state", error);
      // Leave _completedDataLoaded false so the panel can retry on next visit
    }
  }

  persistRemotely() {
    if (!this.remoteSyncEnabled) return;
    this.flushRemoteQueue();
  }

  async flushRemoteQueue(options = {}) {
    // Concurrency guard: if a flush is already in-flight, record that another
    // is needed and return. The in-flight flush will re-invoke on completion.
    if (this._flushInProgress) {
      this._flushPending = true;
      return;
    }
    this._flushInProgress = true;
    try {
      // Stamp device identity and op log into the payload.
      const syncMeta = {
        deviceId: this.deviceInfo.id,
        deviceLabel: this.deviceInfo.label,
        syncedAt: nowIso(),
      };
      let sendPayload = {
        ...hydrateState(this.state),
        syncMeta,
        deviceLog: readOpLogEntries(this.storage, OP_LOG_SHARED_MAX),
      };
      // Strip completion collections from the PUT payload when unchanged — they can be
      // large and only need to reach the server when they've been modified locally.
      if (!this._completionsDirty) {
        delete sendPayload.completionLog;
        delete sendPayload.reference;
        delete sendPayload.completedProjects;
      }
      let rev = this.lastKnownRev;
      const MAX_RETRIES = 3;
      let succeeded = false;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const newRev = await writeServerState(sendPayload, { ifMatch: rev });
          if (newRev !== null) {
            this.lastKnownRev = newRev;
            this._saveLastKnownRev(newRev);
          }
          this.lastSyncInfo = syncMeta;
          this._completionsDirty = false;
          this.setConnectionStatus("online");
          if (this.remoteRetryTimer) {
            clearTimeout(this.remoteRetryTimer);
            this.remoteRetryTimer = null;
          }
          succeeded = true;
          break;
        } catch (error) {
          if (error.isConflict && attempt < MAX_RETRIES - 1) {
            // 409: server has a newer revision. Merge server state into local and retry.
            const serverState = error.serverState;
            this._checkServerVersion(serverState);
            const completedData = await readCompletedState().catch(() => ({}));
            const serverStateFull = { ...serverState, ...completedData };
            // Compute delta summary before merging, while pre-merge local is still available.
            const remoteDevice = serverState?.syncMeta?.deviceLabel || "another device";
            const summary = _buildConflictSummary(sendPayload, serverStateFull);
            const merged = mergeStates(serverStateFull, this.state);
            this.state = hydrateState(merged);
            rev = serverState._rev ?? rev;
            this.lastKnownRev = rev;
            this._saveLastKnownRev(rev);
            sendPayload = { ...hydrateState(this.state), syncMeta, deviceLog: sendPayload.deviceLog };
            this.emitChange({ persist: false });
            this.dispatchEvent(new CustomEvent("syncconflict", { detail: { remoteDevice, summary } }));
            continue;
          }
          throw error;
        }
      }
      if (!succeeded) {
        throw new Error("Max retries exceeded during conflict resolution");
      }
    } catch (error) {
      console.error("Failed to sync remote state", error);
      this.setConnectionStatus("offline");
      if (!this.remoteRetryTimer) {
        this.remoteRetryTimer = setTimeout(() => {
          this.remoteRetryTimer = null;
          this.flushRemoteQueue();
        }, 60000);
      }
      if (options?.rethrow) {
        throw error;
      }
    } finally {
      this._flushInProgress = false;
      // If another flush was requested while this one was in-flight, run it now.
      if (this._flushPending) {
        this._flushPending = false;
        this.flushRemoteQueue();
      }
    }
  }

  _checkServerVersion(remoteState) {
    const v = remoteState?._serverVersion;
    if (!v) return;
    const STORAGE_KEY = "nextflow-server-version";
    const lastKnown = this.storage?.getItem(STORAGE_KEY) ?? null;
    if (lastKnown === null) {
      // First ever launch — record the version without showing the banner.
      this.storage?.setItem(STORAGE_KEY, v);
    } else if (v !== lastKnown) {
      // Server was redeployed since last session (or mid-session). Show banner.
      this.storage?.setItem(STORAGE_KEY, v);
      if (this._initialLoadComplete) {
        this.dispatchEvent(new CustomEvent("versionchange"));
      }
    }
    this.serverVersion = v;
  }

  async checkConnectivity() {
    if (!this.remoteSyncEnabled) {
      this.setConnectionStatus("offline");
      return false;
    }
    try {
      const state = await readServerState();
      this._checkServerVersion(state);
      this.setConnectionStatus("online");
      return true;
    } catch (error) {
      this.setConnectionStatus("offline");
      return false;
    }
  }

  setConnectionStatus(status) {
    if (this.connectionStatus === status) return;
    this.connectionStatus = status;
    this.dispatchEvent(new CustomEvent("connection", { detail: { status } }));
  }

  async manualSync() {
    if (!this.remoteSyncEnabled) {
      throw new Error("Remote sync unavailable.");
    }
    this._persistLocallyNow();
    // Load (and merge) the latest server state into local first, so that
    // flushRemoteQueue writes the fully-merged result rather than overwriting
    // remote changes that arrived since the last auto-save.
    await this.loadRemoteState({ rethrow: true, skipWriteBack: true });
    await this.flushRemoteQueue({ rethrow: true });
    this._persistLocallyNow();
  }

  save() {
    this.persistLocally();
    this.persistRemotely();
  }

  notify(level, message, { action } = {}) {
    this.dispatchEvent(new CustomEvent("toast", { detail: { level, message, action } }));
  }

  emitChange(options = {}) {
    const { persist = true } = options;
    this.dispatchEvent(new CustomEvent("statechange", { detail: this.state }));
    if (persist) {
      this.save();
    }
  }

  // Returns the effective area for a task: explicit task area, then inherited from
  // its project, then null (universal — visible in all area lenses).
  _effectiveTaskArea(task) {
    if (task.areaOfFocus) return task.areaOfFocus;
    if (task.projectId) {
      const project = this.state.projects.find((p) => p.id === task.projectId);
      if (project?.areaOfFocus) return project.areaOfFocus;
    }
    return null;
  }

  getTasks({
    status,
    context,
    contexts,
    projectId,
    projectIds,
    searchTerm,
    person,
    people,
    waitingFor,
    waitingFors,
    effort,
    efforts,
    time,
    times,
    myDayDate,
    myDayDates,
    areaLens = null,
    includeCompleted = false,
    includeFutureScheduled = true,
  } = {}) {
    const filterRules = {
      context: contexts ?? context,
      projectId: projectIds ?? projectId,
      person: people ?? person,
      waitingFor: waitingFors ?? waitingFor,
      effort: efforts ?? effort,
      time: times ?? time,
      myDayDate: myDayDates ?? myDayDate,
      searchTerm,
    };
    return this.state.tasks.filter((task) => {
      if (!includeCompleted && task.completedAt) return false;
      if (status && task.status !== status) return false;
      if (!matchesTaskFilters(task, filterRules)) return false;
      if (areaLens) {
        const area = this._effectiveTaskArea(task);
        if (area !== null && area !== areaLens) return false;
      }
      if (!includeFutureScheduled) {
        const isRecurring = Boolean(task.recurrenceRule?.type);
        const today = new Date();
        const y = today.getUTCFullYear();
        const m = today.getUTCMonth();
        const d = today.getUTCDate();
        const todayCutoff = new Date(Date.UTC(y, m, d));
        if (task.calendarDate && isRecurring) {
          const when = new Date(task.calendarDate);
          if (!Number.isNaN(when.getTime()) && when > todayCutoff) {
            return false;
          }
        }
        if (task.dueDate) {
          const threshold = this.getStaleTaskThresholds().futureDueDaysThreshold;
          if (threshold > 0) {
            const dueCutoff = new Date(Date.UTC(y, m, d + threshold));
            const when = new Date(task.dueDate);
            if (!Number.isNaN(when.getTime()) && when > dueCutoff) {
              return false;
            }
          }
        }
      }
      return true;
    });
  }

  getTaskById(id) {
    return this.state.tasks.find((task) => task.id === id);
  }

  getCompletedTaskById(id, { includeDeleted = false } = {}) {
    const resolved = this.resolveCompletedTaskEntry(id);
    if (!resolved) return null;
    const entry = normalizeCompletionEntry(resolved.list[resolved.index]);
    if (!entry) return null;
    if (!includeDeleted && entry.archiveType === "deleted") return null;
    return entry;
  }

  parseTaskReferences(waitingFor) {
    if (!waitingFor || typeof waitingFor !== "string") return { text: waitingFor, referencedTaskIds: [] };
    const text = waitingFor.trim();
    const referencedTaskIds = [];
    // Match "task:<id-or-slug>" prefix or a bare ID/slug (case-insensitive, hyphens allowed for UUIDs)
    const patterns = [
      /^task:([a-z0-9_-]+)/i,
      /^([a-z0-9_-]+)(?:\s|$)/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const ref = match[1];
        const task = this.getTaskById(ref)
          || this.state.tasks.find((t) => t.slug && t.slug.toUpperCase() === ref.toUpperCase());
        if (task) {
          referencedTaskIds.push(task.id);
          break;
        }
      }
    }
    return { text, referencedTaskIds };
  }

  getReferencedTask(waitingFor) {
    const { referencedTaskIds } = this.parseTaskReferences(waitingFor);
    if (referencedTaskIds.length === 0) return null;
    return this.getTaskById(referencedTaskIds[0]);
  }

  searchTasksForReference(searchTerm = "", { excludeTaskId = null } = {}) {
    if (!searchTerm || typeof searchTerm !== "string") return [];
    const term = searchTerm.trim().toLowerCase();
    if (term.length < 2) return [];
    return this.state.tasks
      .filter((task) => {
        if (excludeTaskId && task.id === excludeTaskId) return false;
        const matchesId = task.id.toLowerCase().includes(term) || (task.slug && task.slug.toLowerCase().includes(term));
        const matchesTitle = task.title.toLowerCase().includes(term);
        return matchesId || matchesTitle;
      })
      .slice(0, 10);
  }

  isBlocked(taskId) {
    const task = this.getTaskById(taskId);
    if (!task?.prerequisiteTaskIds?.length) return false;
    return task.prerequisiteTaskIds.some((prereqId) => {
      const prereq = this.getTaskById(prereqId);
      return prereq != null; // prereq exists in active tasks = not yet completed
    });
  }

  getBlockers(taskId) {
    const task = this.getTaskById(taskId);
    if (!task?.prerequisiteTaskIds?.length) return [];
    return task.prerequisiteTaskIds
      .map((id) => this.getTaskById(id))
      .filter(Boolean);
  }

  getUnlockedByCompletion(completedTaskId) {
    return this.state.tasks.filter((task) => {
      if (!task.prerequisiteTaskIds?.includes(completedTaskId)) return false;
      // All remaining prereqs (excluding the just-completed one) must also be done
      return task.prerequisiteTaskIds.every((prereqId) => {
        if (prereqId === completedTaskId) return true; // being completed now
        return !this.getTaskById(prereqId); // not in active tasks = completed
      });
    });
  }

  _wouldCreateCycle(taskId, prereqTaskId) {
    // Check if prereqTaskId already (transitively) requires taskId — adding
    // the reverse edge would form a cycle.
    const visited = new Set();
    const stack = [prereqTaskId];
    while (stack.length) {
      const current = stack.pop();
      if (current === taskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      const t = this.getTaskById(current);
      if (t?.prerequisiteTaskIds) {
        for (const id of t.prerequisiteTaskIds) stack.push(id);
      }
    }
    return false;
  }

  addPrerequisite(taskId, prereqTaskId) {
    if (taskId === prereqTaskId) {
      this.notify("warn", "A task cannot be its own prerequisite.");
      return false;
    }
    const task = this.getTaskById(taskId);
    if (!task) { this.notify("error", "Task not found."); return false; }
    const prereq = this.getTaskById(prereqTaskId);
    if (!prereq) { this.notify("error", "Prerequisite task not found."); return false; }
    const existing = task.prerequisiteTaskIds || [];
    if (existing.includes(prereqTaskId)) return true; // already linked
    if (this._wouldCreateCycle(taskId, prereqTaskId)) {
      this.notify("warn", "Cannot add — this would create a circular dependency.");
      return false;
    }
    this.updateTask(taskId, { prerequisiteTaskIds: [...existing, prereqTaskId] });
    return true;
  }

  removePrerequisite(taskId, prereqTaskId) {
    const task = this.getTaskById(taskId);
    if (!task) return;
    const existing = task.prerequisiteTaskIds || [];
    this.updateTask(taskId, { prerequisiteTaskIds: existing.filter((id) => id !== prereqTaskId) });
  }

  addTask(payload) {
    const id = generateId("task");
    const createdAt = new Date().toISOString();
    const linkedSchedule = normalizeLinkedSchedule({
      calendarDate: payload.calendarDate,
      myDayDate: payload.myDayDate,
      calendarTime: payload.calendarTime,
    });
    const task = {
      id,
      title: payload.title.trim(),
      description: payload.description?.trim() || "",
      status: payload.status || STATUS.INBOX,
      contexts: normalizeContextsField(payload.contexts ?? payload.context),
      dueDate: payload.dueDate || null,
      followUpDate: payload.followUpDate || null,
      myDayDate: linkedSchedule.myDayDate,
      areaOfFocus:
        typeof payload.areaOfFocus === "string" && payload.areaOfFocus.trim()
          ? payload.areaOfFocus.trim()
          : null,
      projectId: payload.projectId || null,
      createdAt,
      waitingFor: payload.waitingFor || null,
      calendarDate: linkedSchedule.calendarDate,
      calendarTime: linkedSchedule.calendarTime,
      completedAt: payload.completedAt || null,
      closureNotes: payload.closureNotes?.trim() || null,
      notes: normalizeTaskNotes(payload.notes, { fallbackCreatedAt: createdAt }),
      listItems: normalizeListItems(payload.listItems),
      updatedAt: nowIso(),
      recurrenceRule: normalizeRecurrenceRule(payload.recurrenceRule),
      slug: normalizeSlug(payload.slug, id),
      originDevice: this.deviceInfo?.label || "Unknown device",
      originDeviceId: this.deviceInfo?.id || null,
      prerequisiteTaskIds: Array.isArray(payload.prerequisiteTaskIds) ? [...payload.prerequisiteTaskIds] : [],
      _fieldTimestamps: { scheduling: nowIso(), status: nowIso(), dueDate: nowIso(), followUpDate: nowIso(), prerequisites: nowIso() },
    };
    const enforceContext = task.status !== STATUS.INBOX;
    normalizeTaskTags(task, { enforceContext });
    const tagError = validateTaskTags(task, { requireContext: enforceContext });
    if (tagError) {
      this.notify("error", tagError);
      return null;
    }

    if (!task.title) {
      this.notify("warn", "Task needs a title before it can be saved.");
      return null;
    }

    this.state.tasks.unshift(task);
    if (task.projectId) {
      const project = this.state.projects.find((p) => p.id === task.projectId);
      if (project) {
        project.tasks = project.tasks || [];
        if (!project.tasks.includes(task.id)) {
          project.tasks.unshift(task.id);
        }
      }
    }
    this.emitChange();
    const destLabel = {
      [STATUS.INBOX]: "Inbox",
      [STATUS.NEXT]: "Pending Tasks",
      [STATUS.DOING]: "Doing",
      [STATUS.WAITING]: "Delegated",
      [STATUS.SOMEDAY]: "Backburner",
    }[task.status] ?? "Inbox";
    this.notify("info", `Added "${task.title}" to ${destLabel}.`);
    return task;
  }

  updateTask(id, updates) {
    const task = this.getTaskById(id);
    if (!task) {
      this.notify("error", "Task not found.");
      return null;
    }
    const nextUpdates = { ...(updates || {}) };
    const hasCalendarDateUpdate = Object.prototype.hasOwnProperty.call(nextUpdates, "calendarDate");
    const hasMyDayDateUpdate = Object.prototype.hasOwnProperty.call(nextUpdates, "myDayDate");
    if (hasCalendarDateUpdate && !hasMyDayDateUpdate) {
      nextUpdates.myDayDate = nextUpdates.calendarDate || null;
    }
    if (hasMyDayDateUpdate && !hasCalendarDateUpdate) {
      nextUpdates.calendarDate = nextUpdates.myDayDate || null;
    }
    if ((hasCalendarDateUpdate || hasMyDayDateUpdate) && !nextUpdates.calendarDate) {
      nextUpdates.calendarTime = null;
    }
    const draft = normalizeTask({ ...task, ...nextUpdates });
    normalizeTaskTags(draft);
    const tagError = validateTaskTags(draft);
    if (tagError) {
      this.notify("error", tagError);
      return null;
    }
    const originalFields = {};
    OP_LOG_FIELDS.forEach((f) => { originalFields[f] = task[f]; });
    Object.assign(task, draft);
    const now = nowIso();
    task.updatedAt = now;
    // Stamp per-field-group timestamps and emit diagnostic op log entries
    const ft = { ...(task._fieldTimestamps || {}) };
    const ops = [];
    const hasSchedulingUpdate = hasCalendarDateUpdate || hasMyDayDateUpdate;
    if (hasSchedulingUpdate) ft.scheduling = now;
    if ("status" in nextUpdates) {
      ft.status = now;
      const wasAlreadyDoing = originalFields.status === STATUS.DOING;
      if (nextUpdates.status === STATUS.DOING && !wasAlreadyDoing) {
        _logDoingSessionStart(task, now);
      } else if (nextUpdates.status !== STATUS.DOING && wasAlreadyDoing) {
        _closeDoingSession(task, now);
      }
    }
    if ("dueDate" in nextUpdates) ft.dueDate = now;
    if ("followUpDate" in nextUpdates) ft.followUpDate = now;
    if ("prerequisiteTaskIds" in nextUpdates) ft.prerequisites = now;
    task._fieldTimestamps = ft;
    OP_LOG_FIELDS.forEach((f) => {
      const prev = String(originalFields[f] ?? "");
      const next = String(task[f] ?? "");
      if (prev !== next) {
        ops.push({
          id: generateId("op"),
          taskId: task.id,
          taskTitle: task.title,
          field: f,
          prev,
          next,
          ts: now,
          deviceId: this.deviceInfo?.id || "unknown",
          deviceLabel: this.deviceInfo?.label || "Unknown device",
        });
      }
    });
    if (ops.length) appendOpLogEntries(this.storage, ops);
    this.emitChange();
    return task;
  }

  updateCompletedTask(id, updates = {}) {
    const resolved = this.resolveCompletedTaskEntry(id);
    if (!resolved) {
      this.notify("error", "Completed task not found.");
      return null;
    }
    const current = normalizeCompletionEntry(resolved.list[resolved.index]);
    if (!current) {
      this.notify("error", "Completed task could not be loaded.");
      return null;
    }

    const nextUpdates = { ...(updates || {}) };
    const hasCalendarDateUpdate = Object.prototype.hasOwnProperty.call(nextUpdates, "calendarDate");
    const hasMyDayDateUpdate = Object.prototype.hasOwnProperty.call(nextUpdates, "myDayDate");
    if (hasCalendarDateUpdate && !hasMyDayDateUpdate) {
      nextUpdates.myDayDate = nextUpdates.calendarDate || null;
    }
    if (hasMyDayDateUpdate && !hasCalendarDateUpdate) {
      nextUpdates.calendarDate = nextUpdates.myDayDate || null;
    }
    if ((hasCalendarDateUpdate || hasMyDayDateUpdate) && !nextUpdates.calendarDate) {
      nextUpdates.calendarTime = null;
    }

    const draft = normalizeCompletionEntry({
      ...current,
      ...nextUpdates,
      updatedAt: nowIso(),
    });
    if (!draft?.title || !draft.title.trim()) {
      this.notify("warn", "Task title cannot be empty.");
      return null;
    }
    normalizeTaskTags(draft, { enforceContext: false });
    resolved.list[resolved.index] = draft;
    this.emitChange();
    return draft;
  }

  addTaskNote(id, text, { createdAt } = {}) {
    const task = this.getTaskById(id);
    if (!task) {
      this.notify("error", "Task not found.");
      return null;
    }
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) {
      this.notify("warn", "Note cannot be empty.");
      return null;
    }
    const noteTimestamp = sanitizeIsoTimestamp(createdAt) || nowIso();
    const note = {
      id: generateId("note"),
      text: trimmed,
      createdAt: noteTimestamp,
    };
    task.notes = normalizeTaskNotes([...(task.notes || []), note], { fallbackCreatedAt: noteTimestamp });
    task.updatedAt = nowIso();
    this.emitChange();
    return task.notes.find((n) => n.id === note.id) || note;
  }

  updateTaskNote(id, noteId, text) {
    const task = this.getTaskById(id);
    if (!task) {
      this.notify("error", "Task not found.");
      return null;
    }
    const targetNoteId = typeof noteId === "string" ? noteId.trim() : "";
    if (!targetNoteId) {
      this.notify("warn", "Note not found.");
      return null;
    }
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) {
      this.notify("warn", "Note cannot be empty.");
      return null;
    }
    const notes = Array.isArray(task.notes) ? [...task.notes] : [];
    const noteIndex = notes.findIndex((note) => note?.id === targetNoteId);
    if (noteIndex === -1) {
      this.notify("warn", "Note not found.");
      return null;
    }
    const updatedNote = {
      ...notes[noteIndex],
      text: trimmed,
      updatedAt: nowIso(),
    };
    notes[noteIndex] = updatedNote;
    task.notes = normalizeTaskNotes(notes, { fallbackCreatedAt: updatedNote.createdAt || nowIso() });
    task.updatedAt = nowIso();
    this.emitChange();
    return task.notes.find((note) => note.id === targetNoteId) || null;
  }

  deleteTaskNote(id, noteId) {
    const task = this.getTaskById(id);
    if (!task) {
      this.notify("error", "Task not found.");
      return false;
    }
    const targetNoteId = typeof noteId === "string" ? noteId.trim() : "";
    if (!targetNoteId) {
      this.notify("warn", "Note not found.");
      return false;
    }
    const notes = Array.isArray(task.notes) ? [...task.notes] : [];
    const noteIndex = notes.findIndex((note) => note?.id === targetNoteId);
    if (noteIndex === -1) {
      this.notify("warn", "Note not found.");
      return false;
    }
    notes.splice(noteIndex, 1);
    task.notes = normalizeTaskNotes(notes, { fallbackCreatedAt: nowIso() });
    task.updatedAt = nowIso();
    this.emitChange();
    return true;
  }

  addTaskListItems(id, texts) {
    const task = this.getTaskById(id);
    if (!task) {
      this.notify("error", "Task not found.");
      return null;
    }
    const lines = (Array.isArray(texts) ? texts : [texts])
      .map((t) => (typeof t === "string" ? t.trim() : ""))
      .filter(Boolean);
    if (!lines.length) {
      this.notify("warn", "List item cannot be empty.");
      return null;
    }
    const timestamp = nowIso();
    const newItems = lines.map((text) => ({ id: generateId("li"), text, done: false, updatedAt: timestamp }));
    task.listItems = normalizeListItems([...(task.listItems || []), ...newItems]);
    task.updatedAt = nowIso();
    this.emitChange();
    return newItems;
  }

  toggleTaskListItem(id, itemId) {
    const task = this.getTaskById(id);
    if (!task) return false;
    const items = Array.isArray(task.listItems) ? task.listItems : [];
    const item = items.find((i) => i?.id === itemId);
    if (!item) return false;
    item.done = !item.done;
    item.updatedAt = nowIso();
    task.updatedAt = nowIso();
    this.emitChange();
    return true;
  }

  updateTaskListItem(id, itemId, text) {
    const task = this.getTaskById(id);
    if (!task) {
      this.notify("error", "Task not found.");
      return null;
    }
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) {
      this.notify("warn", "List item cannot be empty.");
      return null;
    }
    const items = Array.isArray(task.listItems) ? task.listItems : [];
    const index = items.findIndex((i) => i?.id === itemId);
    if (index === -1) {
      this.notify("warn", "List item not found.");
      return null;
    }
    items[index] = { ...items[index], text: trimmed, updatedAt: nowIso() };
    task.listItems = normalizeListItems(items);
    task.updatedAt = nowIso();
    this.emitChange();
    return items[index];
  }

  deleteTaskListItem(id, itemId) {
    const task = this.getTaskById(id);
    if (!task) {
      this.notify("error", "Task not found.");
      return false;
    }
    const items = Array.isArray(task.listItems) ? task.listItems : [];
    const index = items.findIndex((i) => i?.id === itemId);
    if (index === -1) {
      this.notify("warn", "List item not found.");
      return false;
    }
    items.splice(index, 1);
    task.listItems = normalizeListItems(items);
    task.updatedAt = nowIso();
    this.emitChange();
    return true;
  }

  addCompletedTaskNote(id, text, { createdAt } = {}) {
    const resolved = this.resolveCompletedTaskEntry(id);
    if (!resolved) {
      this.notify("error", "Completed task not found.");
      return null;
    }
    const entry = normalizeCompletionEntry(resolved.list[resolved.index]);
    if (!entry) {
      this.notify("error", "Completed task could not be loaded.");
      return null;
    }
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) {
      this.notify("warn", "Note cannot be empty.");
      return null;
    }
    const noteTimestamp = sanitizeIsoTimestamp(createdAt) || nowIso();
    const note = {
      id: generateId("note"),
      text: trimmed,
      createdAt: noteTimestamp,
    };
    entry.notes = normalizeTaskNotes([...(entry.notes || []), note], { fallbackCreatedAt: noteTimestamp });
    entry.updatedAt = nowIso();
    resolved.list[resolved.index] = entry;
    this.emitChange();
    return note;
  }

  updateCompletedTaskNote(id, noteId, text) {
    const resolved = this.resolveCompletedTaskEntry(id);
    if (!resolved) {
      this.notify("error", "Completed task not found.");
      return null;
    }
    const entry = normalizeCompletionEntry(resolved.list[resolved.index]);
    if (!entry) {
      this.notify("error", "Completed task could not be loaded.");
      return null;
    }
    const targetNoteId = typeof noteId === "string" ? noteId.trim() : "";
    if (!targetNoteId) {
      this.notify("warn", "Note not found.");
      return null;
    }
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) {
      this.notify("warn", "Note cannot be empty.");
      return null;
    }
    const notes = Array.isArray(entry.notes) ? [...entry.notes] : [];
    const noteIndex = notes.findIndex((note) => note?.id === targetNoteId);
    if (noteIndex === -1) {
      this.notify("warn", "Note not found.");
      return null;
    }
    const updatedNote = {
      ...notes[noteIndex],
      text: trimmed,
      updatedAt: nowIso(),
    };
    notes[noteIndex] = updatedNote;
    entry.notes = normalizeTaskNotes(notes, { fallbackCreatedAt: updatedNote.createdAt || nowIso() });
    entry.updatedAt = nowIso();
    resolved.list[resolved.index] = entry;
    this.emitChange();
    return entry.notes.find((note) => note.id === targetNoteId) || null;
  }

  deleteCompletedTaskNote(id, noteId) {
    const resolved = this.resolveCompletedTaskEntry(id);
    if (!resolved) {
      this.notify("error", "Completed task not found.");
      return false;
    }
    const entry = normalizeCompletionEntry(resolved.list[resolved.index]);
    if (!entry) {
      this.notify("error", "Completed task could not be loaded.");
      return false;
    }
    const targetNoteId = typeof noteId === "string" ? noteId.trim() : "";
    if (!targetNoteId) {
      this.notify("warn", "Note not found.");
      return false;
    }
    const notes = Array.isArray(entry.notes) ? [...entry.notes] : [];
    const noteIndex = notes.findIndex((note) => note?.id === targetNoteId);
    if (noteIndex === -1) {
      this.notify("warn", "Note not found.");
      return false;
    }
    notes.splice(noteIndex, 1);
    entry.notes = normalizeTaskNotes(notes, { fallbackCreatedAt: nowIso() });
    entry.updatedAt = nowIso();
    resolved.list[resolved.index] = entry;
    this.emitChange();
    return true;
  }

  resolveCompletedTaskEntry(id) {
    if (!id) return null;
    const match = (entry) => entry?.id === id || entry?.sourceId === id;
    const reference = Array.isArray(this.state.reference) ? this.state.reference : [];
    const referenceIndex = reference.findIndex(match);
    if (referenceIndex !== -1) {
      return { list: reference, index: referenceIndex, archiveType: "reference" };
    }
    const log = Array.isArray(this.state.completionLog) ? this.state.completionLog : [];
    const logIndex = log.findIndex(match);
    if (logIndex !== -1) {
      return { list: log, index: logIndex, archiveType: "deleted" };
    }
    return null;
  }

  moveTask(id, nextStatus) {
    const task = this.getTaskById(id);
    if (!task) {
      this.notify("error", "Cannot move missing task.");
      return;
    }

    if (nextStatus === STATUS.DOING && this.isBlocked(id)) {
      const blockers = this.getBlockers(id);
      const names = blockers.slice(0, 2).map((t) => `"${t.title}"`).join(", ");
      const suffix = blockers.length > 2 ? ` and ${blockers.length - 2} more` : "";
      this.notify("warn", `Complete prerequisites first: ${names}${suffix}`);
      return;
    }

    const wasAlreadyDoing = task.status === STATUS.DOING;
    task.status = nextStatus;
    task.completedAt = null;
    if (nextStatus === STATUS.DOING && !wasAlreadyDoing) {
      _logDoingSessionStart(task, nowIso());
    } else if (nextStatus !== STATUS.DOING && wasAlreadyDoing) {
      _closeDoingSession(task, nowIso());
    }
    if (nextStatus === STATUS.WAITING && !task.waitingFor) {
      task.waitingFor = "Pending response";
    }
    if (nextStatus !== STATUS.WAITING) {
      task.waitingFor = task.waitingFor && task.waitingFor.startsWith("Pending") ? null : task.waitingFor;
    }
    task.updatedAt = nowIso();
    this.emitChange();
  }

  addDoingSession(taskId, { start, end }) {
    const task = this.getTaskById(taskId);
    if (!task || !start || !end) return;
    task.doingSessions = task.doingSessions || [];
    task.doingSessions.push({ id: generateId("sess"), start, end });
    task.totalDoingSeconds = (task.totalDoingSeconds || 0) + _sessionSecs(start, end);
    task.updatedAt = nowIso();
    this.emitChange();
  }

  updateDoingSession(taskId, sessionId, { start, end }) {
    const task = this.getTaskById(taskId);
    if (!task) return;
    const sessions = task.doingSessions || [];
    const idx = sessions.findIndex((s) => s.id === sessionId);
    if (idx < 0) return;
    const old = sessions[idx];
    if (old.start && old.end) {
      task.totalDoingSeconds = Math.max(0, (task.totalDoingSeconds || 0) - _sessionSecs(old.start, old.end));
    }
    const newStart = start ?? old.start;
    const newEnd = end ?? old.end;
    if (newStart && newEnd) {
      task.totalDoingSeconds = (task.totalDoingSeconds || 0) + _sessionSecs(newStart, newEnd);
    }
    sessions[idx] = { ...old, start: newStart, end: newEnd };
    task.doingSessions = sessions;
    task.updatedAt = nowIso();
    this.emitChange();
  }

  deleteDoingSession(taskId, sessionId) {
    const task = this.getTaskById(taskId);
    if (!task) return;
    const sessions = task.doingSessions || [];
    const idx = sessions.findIndex((s) => s.id === sessionId);
    if (idx < 0) return;
    const old = sessions[idx];
    if (old.start && old.end) {
      task.totalDoingSeconds = Math.max(0, (task.totalDoingSeconds || 0) - _sessionSecs(old.start, old.end));
    }
    task.doingSessions = sessions.filter((_, i) => i !== idx);
    task.updatedAt = nowIso();
    this.emitChange();
  }

  reorderProjectNextTask(sourceId, targetId, { before = true } = {}) {
    if (!sourceId || !targetId || sourceId === targetId) {
      return false;
    }
    const sourceIndex = this.state.tasks.findIndex((task) => task.id === sourceId);
    const targetIndex = this.state.tasks.findIndex((task) => task.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) {
      return false;
    }
    const sourceTask = this.state.tasks[sourceIndex];
    const targetTask = this.state.tasks[targetIndex];
    if (
      !sourceTask ||
      !targetTask ||
      sourceTask.status !== STATUS.NEXT ||
      targetTask.status !== STATUS.NEXT ||
      !sourceTask.projectId ||
      sourceTask.projectId !== targetTask.projectId
    ) {
      return false;
    }

    const [moved] = this.state.tasks.splice(sourceIndex, 1);
    let adjustedTargetIndex = this.state.tasks.findIndex((task) => task.id === targetId);
    if (adjustedTargetIndex === -1) {
      this.state.tasks.splice(sourceIndex, 0, moved);
      return false;
    }
    const placeBefore = before !== false;
    if (!placeBefore) {
      adjustedTargetIndex += 1;
    }
    this.state.tasks.splice(adjustedTargetIndex, 0, moved);
    this.emitChange();
    return true;
  }

  completeTask(id, { archive = "reference", closureNotes } = {}) {
    const taskIndex = this.state.tasks.findIndex((task) => task.id === id);
    if (taskIndex === -1) {
      this.notify("error", "Cannot complete missing task.");
      return null;
    }
    const completedAt = new Date().toISOString();
    const archiveType = archive === "reference" ? "reference" : "deleted";
    const [task] = this.state.tasks.splice(taskIndex, 1);
    // Record a tombstone so other devices don't resurrect this task during merge.
    this.state._tombstones = this.state._tombstones || {};
    this.state._tombstones[task.id] = completedAt;
    // Flush any in-progress doing session into the total before snapshotting.
    if (task.doingStartedAt) {
      _closeDoingSession(task, completedAt);
    }
    normalizeTaskTags(task);
    if (typeof closureNotes === "string") {
      const trimmed = closureNotes.trim();
      if (trimmed) {
        task.closureNotes = trimmed;
      }
    }
    const snapshot = createCompletionSnapshot(task, completedAt, archiveType);
    if (archive === "reference") {
      this.state.reference.unshift(snapshot);
    } else {
      this.state.completionLog.unshift(snapshot);
    }
    this._completionsDirty = true;
    this.state.projects.forEach((project) => {
      project.tasks = project.tasks.filter((taskId) => taskId !== id);
    });
    // Check before scheduling (which may mutate tasks) which tasks become unblocked
    const nowUnblocked = this.getUnlockedByCompletion(id);
    const scheduled = this.scheduleRecurringTask(task, completedAt);
    this.emitChange();
    for (const t of nowUnblocked) {
      this.notify("info", `"${t.title}" is now unblocked.`);
    }
    const completionMessage =
      archive === "reference" ? `Moved "${task.title}" to Reference.` : `Completed and removed "${task.title}".`;
    const suffix = scheduled ? " Next occurrence scheduled." : "";
    this.notify("info", `${completionMessage}${suffix}`, {
      action: { label: "Undo", onClick: () => this.restoreCompletedTask(task.id) },
    });
    return snapshot;
  }

  scheduleRecurringTask(template, completedAt) {
    const rule = normalizeRecurrenceRule(template?.recurrenceRule);
    if (!rule) return null;
    const now = nowIso();
    const clone = {
      ...template,
      id: generateId("task"),
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      archiveType: null,
      closureNotes: null,
      waitingFor: null,
      myDayDate: null,
      notes: [],
      slug: null,
      status: STATUS.NEXT,
    };
    clone.calendarTime = sanitizeTime(template.calendarTime) || null;
    const { nextDue, nextCalendar, fallbackNext } = computeNextRecurrenceDates(clone, rule, completedAt ? new Date(completedAt) : new Date());
    clone.dueDate = nextDue ? formatIsoDate(nextDue) : null;
    clone.calendarDate = nextCalendar ? formatIsoDate(nextCalendar) : fallbackNext ? formatIsoDate(fallbackNext) : null;
    clone.recurrenceRule = rule;
    const nextTask = normalizeTask(clone);
    this.state.tasks.unshift(nextTask);
    if (nextTask.projectId) {
      const project = this.state.projects.find((p) => p.id === nextTask.projectId);
      if (project) {
        project.tasks = project.tasks || [];
        if (!project.tasks.includes(nextTask.id)) {
          project.tasks.unshift(nextTask.id);
        }
      }
    }
    return nextTask;
  }

  skipRecurringTaskInstance(id) {
    const task = this.getTaskById(id);
    if (!task) {
      this.notify("error", "Cannot skip missing task.");
      return null;
    }
    const rule = normalizeRecurrenceRule(task.recurrenceRule);
    if (!rule) {
      this.notify("warn", "Task has no recurrence rule to skip.");
      return null;
    }
    const { nextDue, nextCalendar, fallbackNext } = computeNextRecurrenceDates(task, rule, new Date());
    const updates = { myDayDate: null };
    if (nextDue) updates.dueDate = formatIsoDate(nextDue);
    if (nextCalendar) updates.calendarDate = formatIsoDate(nextCalendar);
    else if (fallbackNext && !nextDue) updates.calendarDate = formatIsoDate(fallbackNext);
    const updated = this.updateTask(id, updates);
    const next = nextDue || nextCalendar || fallbackNext;
    this.notify("info", `Skipped — next occurrence: ${next ? formatIsoDate(next) : "unknown"}.`);
    return updated;
  }

  restoreCompletedTask(id) {
    const sourceIndex = this.state.reference.findIndex((entry) => entry.id === id || entry.sourceId === id);
    const logIndex = this.state.completionLog.findIndex((entry) => entry.id === id || entry.sourceId === id);
    let entry = null;
    let archiveType = "reference";
    if (sourceIndex !== -1) {
      [entry] = this.state.reference.splice(sourceIndex, 1);
      archiveType = "reference";
    } else if (logIndex !== -1) {
      [entry] = this.state.completionLog.splice(logIndex, 1);
      archiveType = "deleted";
    }
    if (entry) this._completionsDirty = true;
    if (!entry) {
      this.notify("error", "Completed task not found.");
      return null;
    }
    const restored = {
      id: entry.sourceId || entry.id || generateId("task"),
      title: entry.title,
      description: entry.description || "",
      status: entry.status || STATUS.NEXT,
      contexts: normalizeContextsField(entry.contexts ?? entry.context),
      peopleTag: entry.peopleTag || null,
      effortLevel: entry.effortLevel || entry.energyLevel || null,
      timeRequired: entry.timeRequired || null,
      areaOfFocus:
        typeof entry.areaOfFocus === "string" && entry.areaOfFocus.trim()
          ? entry.areaOfFocus.trim()
          : null,
      projectId: entry.projectId || null,
      waitingFor: entry.waitingFor || null,
      dueDate: entry.dueDate || null,
      myDayDate: sanitizeIsoDate(entry.myDayDate) || null,
      calendarDate: entry.calendarDate || null,
      calendarTime: sanitizeTime(entry.calendarTime) || null,
      createdAt: entry.createdAt || new Date().toISOString(),
      completedAt: null,
      closureNotes: entry.closureNotes || null,
      notes: normalizeTaskNotes(entry.notes, { fallbackCreatedAt: entry.createdAt || nowIso() }),
      updatedAt: nowIso(),
      archiveType: archiveType,
      recurrenceRule: normalizeRecurrenceRule(entry.recurrenceRule),
      slug: normalizeSlug(entry.slug, entry.id || entry.sourceId),
      originDevice: entry.originDevice || null,
      originDeviceId: entry.originDeviceId || null,
    };
    normalizeTaskTags(restored, { enforceContext: restored.status !== STATUS.INBOX });
    // Clear any tombstone so the merge algorithm doesn't suppress this restored task.
    if (this.state._tombstones) {
      delete this.state._tombstones[restored.id];
    }
    this.state.tasks.unshift(restored);
    if (restored.projectId) {
      const project = this.state.projects.find((p) => p.id === restored.projectId);
      if (project && !project.tasks.includes(restored.id)) {
        project.tasks.push(restored.id);
      }
    }
    this.emitChange();
    this.notify("info", `Restored "${restored.title}" to Pending Tasks.`);
    return restored;
  }

  refreshFromStorage() {
    const previousTheme = this.getTheme();
    const previousCustomTheme = this.getCustomTheme();
    const previousCustomThemePalettes = this.getCustomThemePalettes();
    const previousFeatureFlags = this.getFeatureFlags();
    const previousContextOptions = this.getContexts();
    const previousPeopleOptions = this.getPeopleTags();
    this.loadFromLocal();
    if (!this.state.settings) {
      this.state.settings = {
        theme: previousTheme,
        customTheme: { ...previousCustomTheme },
        customThemePalettes: [...previousCustomThemePalettes],
        contextOptions: normalizeContextOptions(
          previousContextOptions,
          this.state.tasks,
          this.state.reference,
          this.state.completionLog
        ),
        peopleOptions: normalizePeopleOptions(
          previousPeopleOptions,
          this.state.tasks,
          this.state.reference,
          this.state.completionLog
        ),
        areaOptions: normalizeAreaOptions(undefined, this.state.projects, this.state.completedProjects),
        featureFlags: normalizeFeatureFlags(undefined, previousFeatureFlags),
      };
    } else {
      this.state.settings.theme = normalizeTheme(this.state.settings.theme || previousTheme);
      this.state.settings.customTheme = normalizeCustomTheme(
        this.state.settings.customTheme,
        previousCustomTheme
      );
      this.state.settings.customThemePalettes = normalizeCustomThemePalettes(
        this.state.settings.customThemePalettes,
        previousCustomThemePalettes
      );
      this.state.settings.contextOptions = normalizeContextOptions(
        this.state.settings.contextOptions || previousContextOptions,
        this.state.tasks,
        this.state.reference,
        this.state.completionLog
      );
      this.state.settings.peopleOptions = normalizePeopleOptions(
        this.state.settings.peopleOptions || previousPeopleOptions,
        this.state.tasks,
        this.state.reference,
        this.state.completionLog
      );
      this.state.settings.areaOptions = normalizeAreaOptions(
        this.state.settings.areaOptions,
        this.state.projects,
        this.state.completedProjects
      );
      this.state.settings.featureFlags = normalizeFeatureFlags(
        this.state.settings.featureFlags,
        previousFeatureFlags
      );
    }
    this.emitChange();
    this.notify("info", "Reloaded saved dashboard data.");
  }

  resetToDefaults() {
    const theme = this.getTheme();
    const customTheme = this.getCustomTheme();
    const customThemePalettes = this.getCustomThemePalettes();
    const featureFlags = this.getFeatureFlags();
    this.state = defaultState();
    this.state.settings.theme = theme;
    this.state.settings.customTheme = { ...customTheme };
    this.state.settings.customThemePalettes = [...customThemePalettes];
    this.state.settings.featureFlags = { ...featureFlags };
    this.state.tasks = this.state.tasks.map((task) => normalizeTask(task));
    this.state.projects = this.state.projects.map((project) => normalizeProjectTags(project));
    this.state.reference = [];
    this.state.completionLog = [];
    this.state.completedProjects = [];
    this._completionsDirty = true;
    this.emitChange();
    this.notify("info", "Restored starter sample data.");
  }

  deleteTask(id) {
    const taskIndex = this.state.tasks.findIndex((task) => task.id === id);
    if (taskIndex === -1) {
      this.notify("error", "Task not found.");
      return;
    }
    const [task] = this.state.tasks.splice(taskIndex, 1);
    const deletedAt = nowIso();
    // Record a tombstone so other devices don't resurrect this task during merge.
    this.state._tombstones = this.state._tombstones || {};
    this.state._tombstones[id] = deletedAt;
    this.state.projects.forEach((project) => {
      project.tasks = project.tasks.filter((taskId) => taskId !== id);
    });
    const snapshot = createCompletionSnapshot(task, deletedAt, "deleted");
    this.state.completionLog = this.state.completionLog || [];
    this.state.completionLog.unshift(snapshot);
    this._completionsDirty = true;
    this.emitChange();
    this.notify("info", `"${task.title}" deleted.`);
  }

  getProjects({ includeSomeday = true } = {}) {
    const completedIds = new Set((this.state.completedProjects || []).map((entry) => entry?.id).filter(Boolean));
    return this.state.projects
      .filter((project) => !completedIds.has(project.id))
      .filter((project) => !isCompletedProject(project))
      .filter((project) => includeSomeday || !project.someday);
  }

  toggleProjectExpansion(projectId, force) {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return;
    project.isExpanded = typeof force === "boolean" ? force : !project.isExpanded;
    this.emitChange();
  }

  activateProject(projectId) {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) {
      this.notify("error", "Project not found.");
      return;
    }
    project.someday = false;
    project.status = "active";
    this.emitChange();
    this.notify("info", `Activated project "${project.name}".`);
  }

  moveProjectToSomeday(projectId) {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) {
      this.notify("error", "Project not found.");
      return;
    }
    project.someday = true;
    project.updatedAt = nowIso();
    this.emitChange();
    this.notify("info", `Moved project "${project.name}" to Backburner.`);
  }

  addProject(name, vision = "", metadata = {}) {
    const trimmed = name.trim();
    if (!trimmed) {
      this.notify("warn", "Project name cannot be empty.");
      return null;
    }
    const project = {
      id: generateId("project"),
      name: trimmed,
      vision: vision ? vision.trim() : "",
      status: "active",
      owner: "",
      tags: [],
      tasks: [],
      isExpanded: true,
      someday: false,
      areaOfFocus: metadata.areaOfFocus || PROJECT_AREAS[0],
      themeTag: metadata.themeTag || null,
      statusTag: metadata.statusTag || PROJECT_STATUSES[0],
      deadline: metadata.deadline || null,
    };
    normalizeProjectTags(project);
    const projectError = validateProjectTags(project);
    if (projectError) {
      this.notify("error", projectError);
      return null;
    }
    project.updatedAt = nowIso();
    this.state.projects.push(project);
    this.emitChange();
    this.notify("info", `Created project "${project.name}".`);
    return project;
  }

  updateProject(projectId, updates) {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) {
      this.notify("error", "Project not found.");
      return null;
    }
    if (updates.name !== undefined) {
      const trimmed = updates.name.trim();
      if (!trimmed) {
        this.notify("warn", "Project name cannot be empty.");
        return null;
      }
      project.name = trimmed;
    }
    if (updates.vision !== undefined) {
      project.vision = updates.vision.trim();
    }
    const { name, vision, ...rest } = updates;
    const draft = normalizeProjectTags({ ...project, ...rest });
    const projectError = validateProjectTags(draft);
    if (projectError) {
      this.notify("error", projectError);
      return null;
    }
    Object.assign(project, draft);
    project.updatedAt = nowIso();
    this.emitChange();
    return project;
  }

  deleteProject(projectId) {
    const projectIndex = this.state.projects.findIndex((p) => p.id === projectId);
    if (projectIndex === -1) {
      this.notify("error", "Project not found.");
      return;
    }

    const [project] = this.state.projects.splice(projectIndex, 1);
    this.state.tasks.forEach((task) => {
      if (task.projectId === projectId) {
        task.projectId = null;
      }
    });

    this.emitChange();
    this.notify("info", `Deleted project "${project.name}". Tasks remain available in their current lists.`);
  }

  mergeProjects(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) {
      this.notify("error", "Invalid merge: source and target must be different projects.");
      return 0;
    }
    const source = this.state.projects.find((p) => p.id === sourceId);
    const target = this.state.projects.find((p) => p.id === targetId);
    if (!source || !target) {
      this.notify("error", "Merge failed: project not found.");
      return 0;
    }
    const now = nowIso();
    let moved = 0;
    this.state.tasks.forEach((task) => {
      if (task.projectId === sourceId) {
        task.projectId = targetId;
        task.updatedAt = now;
        moved += 1;
      }
    });
    const sourceIndex = this.state.projects.findIndex((p) => p.id === sourceId);
    this.state.projects.splice(sourceIndex, 1);
    this.emitChange();
    return moved;
  }

  completeProject(projectId, closureNotes = {}) {
    const projectIndex = this.state.projects.findIndex((p) => p.id === projectId);
    if (projectIndex === -1) {
      this.notify("error", "Project not found.");
      return null;
    }
    const [project] = this.state.projects.splice(projectIndex, 1);
    this.state.tasks.forEach((task) => {
      if (task.projectId === projectId) {
        task.projectId = null;
      }
    });
    const entry = normalizeCompletedProject({
      id: project.id,
      name: project.name,
      completedAt: new Date().toISOString(),
      snapshot: project,
      closureNotes,
      updatedAt: nowIso(),
    });
    this.state.completedProjects = this.state.completedProjects || [];
    this.state.completedProjects.unshift(entry);
    this._completionsDirty = true;
    this.emitChange();
    this.notify("info", `Marked project "${project.name}" as complete.`);
    return entry;
  }

  updateCompletedProject(projectId, updates = {}) {
    const entry = (this.state.completedProjects || []).find((project) => project.id === projectId);
    if (!entry) {
      this.notify("error", "Completed project not found.");
      return null;
    }
    if (updates.closureNotes) {
      entry.closureNotes = normalizeClosureNotes(updates.closureNotes, entry.closureNotes || {});
    }
    entry.updatedAt = nowIso();
    this.emitChange();
    this.notify("info", `Updated closure notes for "${entry.name}".`);
    return entry;
  }

  getCompletedProjects() {
    return (this.state.completedProjects || []).slice().sort((a, b) => {
      const left = a.completedAt || "";
      const right = b.completedAt || "";
      return right.localeCompare(left);
    });
  }

  removeCompletedProject(projectId) {
    if (!this.state.completedProjects || !this.state.completedProjects.length) {
      this.notify("error", "No completed projects to remove.");
      return false;
    }
    const before = this.state.completedProjects.length;
    this.state.completedProjects = this.state.completedProjects.filter((project) => project.id !== projectId);
    if (this.state.completedProjects.length === before) {
      this.notify("error", "Completed project not found.");
      return false;
    }
    this._completionsDirty = true;
    this.emitChange();
    this.notify("info", "Removed project from Completed Projects.");
    return true;
  }

  getTemplates() {
    return (this.state.templates || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  // Returns a template-shaped object derived from a project's active tasks.
  // Does NOT save anything — pass the result to the template editor for review before saving.
  buildTemplateFromProject(projectId) {
    const project = this.state.projects.find((p) => p.id === projectId);
    if (!project) return null;
    const taskOrder = project.tasks || [];
    const taskMap = new Map(this.state.tasks.map((t) => [t.id, t]));
    const tasks = taskOrder
      .map((id) => taskMap.get(id))
      .filter(Boolean)
      .map((t) => ({
        title: t.title,
        // "doing" is instance-specific — treat as "next" in a template
        status: t.status === STATUS.DOING ? STATUS.NEXT : t.status,
        contexts: t.contexts || [],
        effortLevel: t.effortLevel || null,
        timeRequired: t.timeRequired || null,
        description: t.description || null,
      }));
    return {
      // No id — openTemplateEditor treats id-less objects as "new template"
      name: project.name,
      areaOfFocus: project.areaOfFocus || null,
      themeTag: project.themeTag || null,
      statusTag: project.statusTag || PROJECT_STATUSES[0],
      tasks,
    };
  }

  addTemplate(name, { areaOfFocus = null, themeTag = null, statusTag = null, tasks = [] } = {}) {
    const trimmed = (name || "").trim();
    if (!trimmed) {
      this.notify("warn", "Template name cannot be empty.");
      return null;
    }
    const now = nowIso();
    const template = normalizeTemplate({
      id: generateId("tmpl"),
      name: trimmed,
      areaOfFocus: areaOfFocus || null,
      themeTag: themeTag || null,
      statusTag: statusTag || PROJECT_STATUSES[0],
      tasks,
      updatedAt: now,
      createdAt: now,
    });
    this.state.templates.push(template);
    this.emitChange();
    this.notify("info", `Created template "${template.name}".`);
    return template;
  }

  updateTemplate(templateId, updates = {}) {
    const template = this.state.templates.find((t) => t.id === templateId);
    if (!template) {
      this.notify("error", "Template not found.");
      return null;
    }
    if (updates.name !== undefined) {
      const trimmed = (updates.name || "").trim();
      if (!trimmed) {
        this.notify("warn", "Template name cannot be empty.");
        return null;
      }
      template.name = trimmed;
    }
    if (updates.areaOfFocus !== undefined) template.areaOfFocus = updates.areaOfFocus || null;
    if (updates.themeTag !== undefined) template.themeTag = updates.themeTag || null;
    if (updates.statusTag !== undefined) template.statusTag = updates.statusTag || PROJECT_STATUSES[0];
    if (updates.tasks !== undefined) {
      template.tasks = (updates.tasks || []).map(normalizeTemplateTask).filter(Boolean);
    }
    template.updatedAt = nowIso();
    this.emitChange();
    this.notify("info", `Updated template "${template.name}".`);
    return template;
  }

  deleteTemplate(templateId) {
    const idx = this.state.templates.findIndex((t) => t.id === templateId);
    if (idx === -1) {
      this.notify("error", "Template not found.");
      return;
    }
    const [tmpl] = this.state.templates.splice(idx, 1);
    this.emitChange();
    this.notify("info", `Deleted template "${tmpl.name}".`);
  }

  createProjectFromTemplate(templateId, projectName) {
    const template = this.state.templates.find((t) => t.id === templateId);
    if (!template) {
      this.notify("error", "Template not found.");
      return null;
    }
    const trimmedName = ((projectName || "").trim() || template.name).trim();
    if (!trimmedName) {
      this.notify("warn", "Project name cannot be empty.");
      return null;
    }
    const now = nowIso();
    const project = {
      id: generateId("project"),
      name: trimmedName,
      vision: "",
      status: "active",
      owner: "",
      tags: [],
      tasks: [],
      isExpanded: true,
      someday: false,
      areaOfFocus: template.areaOfFocus || PROJECT_AREAS[0],
      themeTag: template.themeTag || null,
      statusTag: template.statusTag || PROJECT_STATUSES[0],
      deadline: null,
      updatedAt: now,
    };
    normalizeProjectTags(project);
    this.state.projects.push(project);
    // Create tasks directly without emitting per-task notifications
    const createdAt = new Date().toISOString();
    (template.tasks || []).forEach((tmplTask) => {
      const taskId = generateId("task");
      const task = {
        id: taskId,
        title: tmplTask.title.trim(),
        description: (tmplTask.description || "").trim(),
        status: tmplTask.status || STATUS.INBOX,
        contexts: normalizeContextsField(tmplTask.contexts || []),
        dueDate: null,
        followUpDate: null,
        myDayDate: null,
        areaOfFocus: template.areaOfFocus || null,
        projectId: project.id,
        createdAt,
        waitingFor: tmplTask.waitingFor || null,
        calendarDate: null,
        calendarTime: null,
        completedAt: null,
        closureNotes: null,
        notes: [],
        listItems: [],
        updatedAt: now,
        recurrenceRule: null,
        slug: normalizeSlug(undefined, taskId),
        originDevice: this.deviceInfo?.label || "Unknown device",
        originDeviceId: this.deviceInfo?.id || null,
        effortLevel: EFFORT_LEVELS.includes(tmplTask.effortLevel) ? tmplTask.effortLevel : null,
        timeRequired: TIME_REQUIREMENTS.includes(tmplTask.timeRequired) ? tmplTask.timeRequired : null,
        _fieldTimestamps: { scheduling: now, status: now, dueDate: now, followUpDate: now },
      };
      this.state.tasks.unshift(task);
      project.tasks.unshift(taskId);
    });
    this.emitChange();
    const taskCount = (template.tasks || []).length;
    this.notify("info", `Created project "${project.name}" with ${taskCount} task${taskCount !== 1 ? "s" : ""} from template.`);
    return project;
  }

  getContexts({ areaLens = null } = {}) {
    const contexts = new Set();
    const addContext = (value) => {
      const raw = typeof value === "object" && value !== null ? value.name : value;
      if (typeof raw !== "string") return;
      const normalized = sanitizePhysicalContext(raw, { allowEmpty: false });
      if (normalized) contexts.add(normalized);
    };
    (this.state.settings?.contextOptions || []).forEach((value) => addContext(value));
    this.state.tasks.forEach((task) => (task.contexts || []).forEach((c) => addContext(c)));
    (this.state.reference || []).forEach((entry) => (entry.contexts || []).forEach((c) => addContext(c)));
    // Intentionally not scanning completionLog for contexts — deleted contexts would
    // otherwise resurface from historical completed tasks.
    if (!contexts.size) {
      PHYSICAL_CONTEXTS.forEach((context) => contexts.add(context));
    }
    const all = Array.from(contexts).sort((a, b) => a.localeCompare(b));
    if (!areaLens) return all;
    // Filter to contexts visible in the active area: universal (areas=[]) + matching area
    const options = this.state.settings?.contextOptions || [];
    const areaMap = new Map(options.map((opt) => {
      const name = typeof opt === "object" && opt !== null ? opt.name : opt;
      const areas = typeof opt === "object" && opt !== null && Array.isArray(opt.areas) ? opt.areas : [];
      return [typeof name === "string" ? name.toLowerCase() : "", areas];
    }));
    return all.filter((name) => {
      const areas = areaMap.get(name.toLowerCase()) ?? [];
      return areas.length === 0 || areas.includes(areaLens);
    });
  }

  getPeopleTagOptions() {
    // Returns only the explicitly managed list — no text scanning.
    // Used by the Settings panel so deleted tags don't resurface via text mentions.
    const raw = this.state.settings?.peopleOptions || [];
    return raw
      .map((v) => sanitizePeopleTag(typeof v === "object" && v !== null ? v.name : v))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

  // Returns [{name, areas}] for each explicitly managed context option.
  // Used by the Settings panel to render area assignment chips.
  getContextOptionsWithAreas() {
    const raw = this.state.settings?.contextOptions || [];
    return raw
      .map((v) => {
        const name = sanitizePhysicalContext(
          typeof v === "object" && v !== null ? v.name : v,
          { allowEmpty: false }
        );
        const areas = typeof v === "object" && v !== null && Array.isArray(v.areas) ? [...v.areas] : [];
        return name ? { name, areas } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Returns [{name, areas}] for each explicitly managed people tag option.
  // Used by the Settings panel to render area assignment chips.
  getPeopleTagOptionsWithAreas() {
    const raw = this.state.settings?.peopleOptions || [];
    return raw
      .map((v) => {
        const name = sanitizePeopleTag(typeof v === "object" && v !== null ? v.name : v);
        const areas = typeof v === "object" && v !== null && Array.isArray(v.areas) ? [...v.areas] : [];
        return name ? { name, areas } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getKnownDelegateNames() {
    const names = new Set();
    for (const entry of (this.state.settings?.peopleOptions || [])) {
      const tag = typeof entry === "object" && entry !== null ? entry.name : entry;
      const name = typeof tag === "string" && tag.startsWith("+") ? tag.slice(1) : tag;
      if (name) names.add(name);
    }
    for (const task of this.state.tasks) {
      const wf = task.waitingFor;
      if (!wf || wf.startsWith("@") || /^task:/i.test(wf) || wf.startsWith("Pending")) continue;
      const name = wf.startsWith("+") ? wf.slice(1) : wf;
      if (name) names.add(name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }

  getPeopleTags({ includeNoteMentions = true, areaLens = null } = {}) {
    const tags = new Set();
    const addTag = (value) => {
      if (typeof value !== "string") return;
      const normalized = sanitizePeopleTag(value);
      if (normalized) tags.add(normalized);
    };
    const addEntryTags = (entry) => {
      collectEntryPeopleTags(entry, { includeNoteMentions }).forEach((tag) => addTag(tag));
    };
    (this.state.settings?.peopleOptions || []).forEach((value) =>
      addTag(typeof value === "object" && value !== null ? value.name : value)
    );
    this.state.tasks.forEach((task) => addEntryTags(task));
    (this.state.reference || []).forEach((entry) => addEntryTags(entry));
    (this.state.completionLog || []).forEach((entry) => addEntryTags(entry));
    const deleted = new Set(
      (this.state.settings?.deletedPeopleOptions || []).map((t) => t.toLowerCase())
    );
    const all = Array.from(tags)
      .filter((t) => !deleted.has(t.toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
    if (!areaLens) return all;
    // Filter to people visible in the active area: universal (areas=[]) + matching area
    const options = this.state.settings?.peopleOptions || [];
    const areaMap = new Map(options.map((opt) => {
      const name = typeof opt === "object" && opt !== null ? opt.name : opt;
      const areas = typeof opt === "object" && opt !== null && Array.isArray(opt.areas) ? opt.areas : [];
      return [typeof name === "string" ? name.toLowerCase() : "", areas];
    }));
    return all.filter((name) => {
      const areas = areaMap.get(name.toLowerCase()) ?? [];
      return areas.length === 0 || areas.includes(areaLens);
    });
  }

  addContextOption(value, { notify = true } = {}) {
    const normalized = sanitizePhysicalContext(value, { allowEmpty: false });
    if (!normalized) {
      if (notify) {
        this.notify("warn", "Context must start with @ and contain text.");
      }
      return null;
    }
    const existing = this.getContexts();
    if (existing.some((context) => context.toLowerCase() === normalized.toLowerCase())) {
      return normalized;
    }
    if (!this.state.settings) {
      this.state.settings = defaultSettings(this.state.projects, this.state.completedProjects);
    }
    const currentOptions = Array.isArray(this.state.settings?.contextOptions)
      ? this.state.settings.contextOptions
      : [];
    this.state.settings.contextOptions = normalizeContextOptions(
      [...currentOptions, { name: normalized, areas: [] }],
      this.state.tasks,
      this.state.reference,
      this.state.completionLog
    );
    stampSettingsTimestamp(this.state.settings, "lists");
    this.emitChange();
    if (notify) {
      this.notify("info", `Added context "${normalized}".`);
    }
    return normalized;
  }

  addPeopleTagOption(value, { notify = true } = {}) {
    const normalized = sanitizePeopleTag(value);
    if (!normalized) {
      if (notify) {
        this.notify("warn", "People tag must start with + and contain text.");
      }
      return null;
    }
    const existing = this.getPeopleTags({ includeNoteMentions: false });
    if (existing.some((tag) => tag.toLowerCase() === normalized.toLowerCase())) {
      return normalized;
    }
    if (!this.state.settings) {
      this.state.settings = defaultSettings(this.state.projects, this.state.completedProjects);
    }
    const currentOptions = Array.isArray(this.state.settings?.peopleOptions)
      ? this.state.settings.peopleOptions
      : [];
    this.state.settings.peopleOptions = normalizePeopleOptions(
      [...currentOptions, { name: normalized, areas: [] }],
      this.state.tasks,
      this.state.reference,
      this.state.completionLog
    );
    // Remove from deletion exclusion list so the tag survives future hydration.
    if (Array.isArray(this.state.settings?.deletedPeopleOptions)) {
      this.state.settings.deletedPeopleOptions = this.state.settings.deletedPeopleOptions
        .filter((d) => d.toLowerCase() !== normalized.toLowerCase());
    }
    stampSettingsTimestamp(this.state.settings, "lists");
    this.emitChange();
    if (notify) {
      this.notify("info", `Added people tag "${normalized}".`);
    }
    return normalized;
  }

  setContextAreas(contextName, areas) {
    const name = sanitizePhysicalContext(contextName, { allowEmpty: false });
    if (!name) return false;
    const validAreas = Array.isArray(areas)
      ? areas.filter((a) => typeof a === "string" && a.trim())
      : [];
    const currentOptions = Array.isArray(this.state.settings?.contextOptions)
      ? this.state.settings.contextOptions
      : [];
    const existsInOptions = currentOptions.some((opt) => {
      const n = typeof opt === "object" && opt !== null ? opt.name : opt;
      return typeof n === "string" && n.toLowerCase() === name.toLowerCase();
    });
    // Upsert: if the context was added via a task (not Settings UI) it may be
    // absent from contextOptions even though it appears in getContexts(). Add it
    // now so area assignments can be persisted.
    const baseOptions = existsInOptions ? currentOptions : [...currentOptions, { name, areas: [] }];
    this.state.settings.contextOptions = baseOptions.map((opt) => {
      const n = typeof opt === "object" && opt !== null ? opt.name : opt;
      if (typeof n === "string" && n.toLowerCase() === name.toLowerCase()) {
        return { name: n, areas: validAreas };
      }
      return opt;
    });
    stampSettingsTimestamp(this.state.settings, "lists");
    this.emitChange();
    return true;
  }

  setPeopleTagAreas(tagName, areas) {
    const name = sanitizePeopleTag(tagName);
    if (!name) return false;
    const validAreas = Array.isArray(areas)
      ? areas.filter((a) => typeof a === "string" && a.trim())
      : [];
    const currentOptions = Array.isArray(this.state.settings?.peopleOptions)
      ? this.state.settings.peopleOptions
      : [];
    const existsInOptions = currentOptions.some((opt) => {
      const n = typeof opt === "object" && opt !== null ? opt.name : opt;
      return typeof n === "string" && n.toLowerCase() === name.toLowerCase();
    });
    const baseOptions = existsInOptions ? currentOptions : [...currentOptions, { name, areas: [] }];
    this.state.settings.peopleOptions = baseOptions.map((opt) => {
      const n = typeof opt === "object" && opt !== null ? opt.name : opt;
      if (typeof n === "string" && n.toLowerCase() === name.toLowerCase()) {
        return { name: n, areas: validAreas };
      }
      return opt;
    });
    stampSettingsTimestamp(this.state.settings, "lists");
    this.emitChange();
    return true;
  }

  getAreasOfFocus() {
    const areas = new Set(this.state.settings?.areaOptions || []);
    (this.state.projects || []).forEach((project) => {
      if (project?.areaOfFocus) areas.add(project.areaOfFocus);
    });
    (this.state.completedProjects || []).forEach((entry) => {
      if (entry?.snapshot?.areaOfFocus) areas.add(entry.snapshot.areaOfFocus);
    });
    return Array.from(areas).sort((a, b) => a.localeCompare(b));
  }

  addAreaOption(value, { notify = true } = {}) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!trimmed) {
      if (notify) this.notify("warn", "Area of focus cannot be empty.");
      return null;
    }
    const existing = this.getAreasOfFocus();
    if (existing.some((area) => area.toLowerCase() === trimmed.toLowerCase())) {
      return trimmed;
    }
    if (!this.state.settings) {
      this.state.settings = defaultSettings(this.state.projects, this.state.completedProjects);
    }
    const currentOptions = Array.isArray(this.state.settings?.areaOptions)
      ? this.state.settings.areaOptions
      : [];
    this.state.settings.areaOptions = normalizeAreaOptions(
      [...currentOptions, trimmed],
      this.state.projects,
      this.state.completedProjects
    );
    stampSettingsTimestamp(this.state.settings, "lists");
    this.emitChange();
    if (notify) this.notify("info", `Added area "${trimmed}".`);
    return trimmed;
  }

  renameContext(fromValue, toValue) {
    const from = sanitizePhysicalContext(fromValue, { allowEmpty: false }) || "";
    const to = sanitizePhysicalContext(toValue, { allowEmpty: false }) || "";
    if (!from || !to) {
      this.notify("warn", "Context rename requires both current and new values.");
      return false;
    }
    if (from === to) return false;
    this.state.tasks.forEach((task) => {
      if (!Array.isArray(task.contexts) || !task.contexts.includes(from)) return;
      task.contexts = task.contexts.map((c) => (c === from ? to : c));
      task.updatedAt = nowIso();
    });
    (this.state.reference || []).forEach((entry) => {
      if (!Array.isArray(entry.contexts) || !entry.contexts.includes(from)) return;
      entry.contexts = entry.contexts.map((c) => (c === from ? to : c));
      entry.updatedAt = nowIso();
    });
    (this.state.completionLog || []).forEach((entry) => {
      if (!Array.isArray(entry.contexts) || !entry.contexts.includes(from)) return;
      entry.contexts = entry.contexts.map((c) => (c === from ? to : c));
      entry.updatedAt = nowIso();
    });
    // Carry area configuration forward: rename the matching entry, keep all others as-is
    const currentContextOptions = Array.isArray(this.state.settings?.contextOptions)
      ? this.state.settings.contextOptions
      : [];
    const renamedContextOptions = currentContextOptions.map((opt) => {
      const name = typeof opt === "object" && opt !== null ? opt.name : opt;
      if (typeof name === "string" && name.toLowerCase() === from.toLowerCase()) {
        return { name: to, areas: Array.isArray(opt.areas) ? opt.areas : [] };
      }
      return opt;
    });
    this.state.settings.contextOptions = normalizeContextOptions(
      renamedContextOptions,
      this.state.tasks,
      this.state.reference,
      this.state.completionLog
    );
    stampSettingsTimestamp(this.state.settings, "lists");
    this.emitChange();
    this.notify("info", `Renamed context "${from}" to "${to}".`);
    return true;
  }

  deleteContext(value) {
    const target = sanitizePhysicalContext(value, { allowEmpty: false }) || "";
    if (!target) return false;
    const fallback =
      this.getContexts().find((context) => context !== target) || PHYSICAL_CONTEXTS[0];
    let changed = false;
    this.state.tasks.forEach((task) => {
      if (!Array.isArray(task.contexts) || !task.contexts.includes(target)) return;
      task.contexts = task.contexts.filter((c) => c !== target);
      task.updatedAt = nowIso();
      changed = true;
    });
    (this.state.reference || []).forEach((entry) => {
      if (!Array.isArray(entry.contexts) || !entry.contexts.includes(target)) return;
      entry.contexts = entry.contexts.filter((c) => c !== target);
      entry.updatedAt = nowIso();
      changed = true;
    });
    (this.state.completionLog || []).forEach((entry) => {
      if (!Array.isArray(entry.contexts) || !entry.contexts.includes(target)) return;
      entry.contexts = entry.contexts.filter((c) => c !== target);
      entry.updatedAt = nowIso();
      changed = true;
    });
    const contextOptions = Array.isArray(this.state.settings?.contextOptions)
      ? this.state.settings.contextOptions
      : [];
    const normalizedOptions = normalizeContextOptions(
      contextOptions.filter((opt) => {
        const name = typeof opt === "object" && opt !== null ? opt.name : opt;
        return typeof name !== "string" || name.toLowerCase() !== target.toLowerCase();
      }),
      this.state.tasks,
      this.state.reference,
      this.state.completionLog
    );
    if (normalizedOptions.length !== contextOptions.length) {
      this.state.settings.contextOptions = normalizedOptions;
      changed = true;
    }
    if (!changed) return false;
    stampSettingsTimestamp(this.state.settings, "lists");
    this.emitChange();
    this.notify("info", `Deleted context "${target}".`);
    return true;
  }

  renamePeopleTag(fromValue, toValue) {
    const from = sanitizePeopleTag(fromValue);
    const to = sanitizePeopleTag(toValue);
    if (!from || !to) {
      this.notify("warn", "People tag rename requires valid +tag values.");
      return false;
    }
    if (from === to) return false;
    // Escape special regex chars in `from` (the + prefix needs escaping).
    const escapedFrom = from.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&");
    const tagPattern = new RegExp(`${escapedFrom}(?=[^A-Za-z0-9_-]|$)`, "g");
    const replaceInText = (text) =>
      typeof text === "string" ? text.replace(tagPattern, to) : text;

    const renameEntry = (entry) => {
      let touched = false;
      if (entry.peopleTag === from) { entry.peopleTag = to; touched = true; }
      const nextTitle = replaceInText(entry.title);
      if (nextTitle !== entry.title) { entry.title = nextTitle; touched = true; }
      const nextDesc = replaceInText(entry.description);
      if (nextDesc !== entry.description) { entry.description = nextDesc; touched = true; }
      if (Array.isArray(entry.notes)) {
        entry.notes.forEach((note) => {
          if (typeof note?.text === "string") {
            const nextText = replaceInText(note.text);
            if (nextText !== note.text) { note.text = nextText; touched = true; }
          }
        });
      }
      if (touched) entry.updatedAt = nowIso();
    };

    this.state.tasks.forEach(renameEntry);
    (this.state.reference || []).forEach(renameEntry);
    (this.state.completionLog || []).forEach(renameEntry);
    // Carry area configuration forward: rename the matching entry, keep all others as-is
    const currentPeopleOptions = Array.isArray(this.state.settings?.peopleOptions)
      ? this.state.settings.peopleOptions
      : [];
    const renamedPeopleOptions = currentPeopleOptions.map((opt) => {
      const name = typeof opt === "object" && opt !== null ? opt.name : opt;
      if (typeof name === "string" && name.toLowerCase() === from.toLowerCase()) {
        return { name: to, areas: Array.isArray(opt.areas) ? opt.areas : [] };
      }
      return opt;
    });
    this.state.settings.peopleOptions = normalizePeopleOptions(
      renamedPeopleOptions,
      this.state.tasks,
      this.state.reference,
      this.state.completionLog
    );
    stampSettingsTimestamp(this.state.settings, "lists");
    this.emitChange();
    this.notify("info", `Renamed people tag "${from}" to "${to}".`);
    return true;
  }

  deletePeopleTag(value) {
    const target = sanitizePeopleTag(value);
    if (!target) return false;
    this.state.tasks.forEach((task) => {
      if (task.peopleTag === target) {
        task.peopleTag = null;
        task.updatedAt = nowIso();
      }
    });
    (this.state.reference || []).forEach((entry) => {
      if (entry.peopleTag === target) {
        entry.peopleTag = null;
        entry.updatedAt = nowIso();
      }
    });
    (this.state.completionLog || []).forEach((entry) => {
      if (entry.peopleTag === target) {
        entry.peopleTag = null;
        entry.updatedAt = nowIso();
      }
    });
    const peopleOptions = Array.isArray(this.state.settings?.peopleOptions)
      ? this.state.settings.peopleOptions
      : [];
    // Always write the filtered list. normalizePeopleOptions re-scans text mentions
    // and would re-add the tag if we relied on a length guard, preventing deletion.
    const optName = (opt) => (typeof opt === "object" && opt !== null ? opt.name : opt);
    this.state.settings.peopleOptions = normalizePeopleOptions(
      peopleOptions.filter((opt) => {
        const name = optName(opt);
        return typeof name !== "string" || name.toLowerCase() !== target.toLowerCase();
      }),
      this.state.tasks,
      this.state.reference,
      this.state.completionLog
    ).filter((opt) => {
      const name = optName(opt);
      return typeof name !== "string" || name.toLowerCase() !== target.toLowerCase();
    });
    // Record explicit deletion so hydrateState's text-mention rescan can't resurrect the tag.
    const deletedOptions = Array.isArray(this.state.settings?.deletedPeopleOptions)
      ? this.state.settings.deletedPeopleOptions
      : [];
    if (!deletedOptions.some((d) => d.toLowerCase() === target.toLowerCase())) {
      this.state.settings.deletedPeopleOptions = normalizePeopleTagCollection([...deletedOptions, target]);
    }
    stampSettingsTimestamp(this.state.settings, "lists");
    this.emitChange();
    this.notify("info", `Deleted people tag "${target}".`);
    return true;
  }

  renameAreaOfFocus(fromValue, toValue) {
    const from = typeof fromValue === "string" ? fromValue.trim() : "";
    const to = typeof toValue === "string" ? toValue.trim() : "";
    if (!from || !to) {
      this.notify("warn", "Area rename requires both current and new values.");
      return false;
    }
    if (from === to) return false;
    let changed = false;
    const areaOptions = Array.isArray(this.state.settings?.areaOptions)
      ? this.state.settings.areaOptions
      : [];
    const optionIndex = areaOptions.findIndex((area) => area === from);
    if (optionIndex !== -1) {
      areaOptions[optionIndex] = to;
    } else {
      areaOptions.push(to);
    }
    this.state.settings.areaOptions = Array.from(new Set(areaOptions.filter((a) => a !== from)));
    changed = true;
    this.state.tasks.forEach((task) => {
      if (task.areaOfFocus === from) {
        task.areaOfFocus = to;
        task.updatedAt = nowIso();
        changed = true;
      }
    });
    (this.state.reference || []).forEach((entry) => {
      if (entry.areaOfFocus === from) {
        entry.areaOfFocus = to;
        entry.updatedAt = nowIso();
        changed = true;
      }
    });
    (this.state.completionLog || []).forEach((entry) => {
      if (entry.areaOfFocus === from) {
        entry.areaOfFocus = to;
        entry.updatedAt = nowIso();
        changed = true;
      }
    });
    this.state.projects.forEach((project) => {
      if (project.areaOfFocus === from) {
        project.areaOfFocus = to;
        normalizeProjectTags(project);
        project.updatedAt = nowIso();
        changed = true;
      }
    });
    (this.state.completedProjects || []).forEach((entry) => {
      if (entry?.snapshot?.areaOfFocus === from) {
        entry.snapshot.areaOfFocus = to;
        normalizeProjectTags(entry.snapshot);
        entry.updatedAt = nowIso();
        changed = true;
      }
    });
    if (!changed) return false;
    stampSettingsTimestamp(this.state.settings, "lists");
    this.emitChange();
    this.notify("info", `Renamed area "${from}" to "${to}".`);
    return true;
  }

  deleteAreaOfFocus(value) {
    return this.migrateAreaReferences(value, null);
  }

  // Deletes fromArea and reassigns all references to toArea (or clears them if toArea is null).
  // Covers: tasks, reference, completionLog, projects, completedProjects,
  //         contextOptions.areas[], peopleOptions.areas[], and areaOptions.
  migrateAreaReferences(fromArea, toArea) {
    const from = typeof fromArea === "string" ? fromArea.trim() : "";
    if (!from) return false;
    const to = typeof toArea === "string" && toArea.trim() ? toArea.trim() : null;
    let changed = false;

    this.state.tasks.forEach((task) => {
      if (task.areaOfFocus === from) {
        task.areaOfFocus = to;
        task.updatedAt = nowIso();
        changed = true;
      }
    });
    (this.state.reference || []).forEach((entry) => {
      if (entry.areaOfFocus === from) {
        entry.areaOfFocus = to;
        entry.updatedAt = nowIso();
        changed = true;
      }
    });
    (this.state.completionLog || []).forEach((entry) => {
      if (entry.areaOfFocus === from) {
        entry.areaOfFocus = to;
        entry.updatedAt = nowIso();
        changed = true;
      }
    });
    this.state.projects.forEach((project) => {
      if (project.areaOfFocus === from) {
        project.areaOfFocus = to;
        normalizeProjectTags(project);
        project.updatedAt = nowIso();
        changed = true;
      }
    });
    (this.state.completedProjects || []).forEach((entry) => {
      if (entry?.snapshot?.areaOfFocus === from) {
        entry.snapshot.areaOfFocus = to;
        normalizeProjectTags(entry.snapshot);
        entry.updatedAt = nowIso();
        changed = true;
      }
    });

    if (!this.state.settings) {
      this.state.settings = defaultSettings(this.state.projects, this.state.completedProjects);
    }
    // Remove fromArea from contextOptions.areas[]
    const ctxOptions = Array.isArray(this.state.settings?.contextOptions)
      ? this.state.settings.contextOptions
      : [];
    this.state.settings.contextOptions = ctxOptions.map((opt) => {
      if (typeof opt === "object" && opt !== null && Array.isArray(opt.areas) && opt.areas.includes(from)) {
        changed = true;
        return { ...opt, areas: opt.areas.filter((a) => a !== from) };
      }
      return opt;
    });
    // Remove fromArea from peopleOptions.areas[]
    const pplOptions = Array.isArray(this.state.settings?.peopleOptions)
      ? this.state.settings.peopleOptions
      : [];
    this.state.settings.peopleOptions = pplOptions.map((opt) => {
      if (typeof opt === "object" && opt !== null && Array.isArray(opt.areas) && opt.areas.includes(from)) {
        changed = true;
        return { ...opt, areas: opt.areas.filter((a) => a !== from) };
      }
      return opt;
    });
    // Remove fromArea from areaOptions
    const areaOptions = Array.isArray(this.state.settings?.areaOptions)
      ? this.state.settings.areaOptions
      : [];
    const filteredAreaOptions = areaOptions.filter((a) => a !== from);
    if (filteredAreaOptions.length !== areaOptions.length) {
      this.state.settings.areaOptions = filteredAreaOptions;
      changed = true;
    }

    if (!changed) return false;
    stampSettingsTimestamp(this.state.settings, "lists");
    this.emitChange();
    const actionDesc = to ? `Reassigned to "${to}".` : "References cleared.";
    this.notify("info", `Deleted area "${from}". ${actionDesc}`);
    return true;
  }

  getInboxQueue() {
    return this.state.tasks
      .filter((task) => !task.completedAt && task.status === STATUS.INBOX)
      .slice()
      .sort((a, b) => {
        const aTs = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTs = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return aTs - bTs;
      })
      .map((task) => task.id);
  }

  getSummary() {
    const todayIso = new Date().toISOString().slice(0, 10);
    const summary = {
      inbox: 0,
      next: 0,
      doing: 0,
      waiting: 0,
      someday: 0,
      projects: this.getProjects({ includeSomeday: true }).length,
      overdue: 0,
      dueToday: 0,
    };

    this.state.tasks.forEach((task) => {
      if (task.completedAt) return;
      if (task.status === STATUS.INBOX) summary.inbox += 1;
      if (task.status === STATUS.NEXT) summary.next += 1;
      if (task.status === STATUS.DOING) summary.doing += 1;
      if (task.status === STATUS.WAITING) summary.waiting += 1;
      if (task.status === STATUS.SOMEDAY) summary.someday += 1;
      if (!task.dueDate) return;

      if (task.dueDate < todayIso) summary.overdue += 1;
      if (task.dueDate === todayIso) summary.dueToday += 1;
    });

    return summary;
  }

  getCalendarEntries({ exactDate, filters, includeCompleted = false } = {}) {
    const areaLens = filters?.areaLens ?? null;
    const activeTasks = this.state.tasks.filter((task) => {
      if (task.completedAt) return false;
      if (!matchesTaskFilters(task, filters)) return false;
      if (areaLens) {
        const area = this._effectiveTaskArea(task);
        if (area !== null && area !== areaLens) return false;
      }
      return true;
    });
    const entries = [];

    // Scheduled (calendarDate) and due (dueDate) entries
    activeTasks
      .filter((task) => Boolean(task.calendarDate || task.dueDate))
      .forEach((task) => {
        const hasCalendarTime = Boolean(task.calendarDate && task.calendarTime);
        const date = hasCalendarTime ? `${task.calendarDate}T${task.calendarTime}` : task.calendarDate || task.dueDate;
        entries.push({
          date,
          title: task.title,
          contexts: task.contexts ?? [],
          status: task.status,
          projectId: task.projectId,
          taskId: task.id,
          calendarDate: task.calendarDate || null,
          calendarTime: task.calendarTime || null,
          isScheduled: Boolean(task.calendarDate),
          isDue: Boolean(task.dueDate && !task.calendarDate),
          isFollowUp: false,
          isCompleted: false,
          raw: task,
        });
      });

    // Follow-up entries — appear on their own day, visually distinct from scheduled/due
    activeTasks
      .filter((task) => Boolean(task.followUpDate))
      .forEach((task) => {
        entries.push({
          date: task.followUpDate,
          title: task.title,
          contexts: task.contexts ?? [],
          status: task.status,
          projectId: task.projectId,
          taskId: task.id,
          calendarDate: null,
          calendarTime: null,
          isScheduled: false,
          isDue: false,
          isFollowUp: true,
          isCompleted: false,
          raw: task,
        });
      });

    if (includeCompleted) {
      const completions = this.getCompletionEntries().filter(
        (entry) => entry.completedAt && entry.archiveType !== "deleted" && matchesTaskFilters(entry, filters)
      );
      completions.forEach((entry) => {
        entries.push({
          date: entry.completedAt,
          title: entry.title || "Completed task",
          contexts: entry.contexts ?? [],
          status: entry.status || "completed",
          projectId: entry.projectId || null,
          taskId: entry.sourceId || entry.id,
          calendarDate: null,
          calendarTime: null,
          isDue: false,
          isCompleted: true,
          raw: entry,
        });
      });
    }

    entries.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    if (exactDate) {
      return entries.filter((entry) => entry.date === exactDate);
    }
    return entries;
  }

  getCompletionEntries() {
    const reference = Array.isArray(this.state.reference) ? this.state.reference : [];
    const logged = Array.isArray(this.state.completionLog) ? this.state.completionLog : [];
    return [...reference, ...logged]
      .map((entry) => normalizeCompletionEntry(entry))
      .filter((entry) => entry && entry.archiveType !== "deleted");
  }

  getCompletedTasks({ year, context, contexts, projectId, projectIds, areas } = {}) {
    const entries = this.getCompletionEntries();
    return entries.filter((entry) => {
      if (!entry.completedAt) return false;
      if (Number.isFinite(year)) {
        const completedYear = new Date(entry.completedAt).getFullYear();
        if (completedYear !== year) return false;
      }
      if (!matchesContextsFilter(entry.contexts, contexts ?? context)) return false;
      if (!matchesFilterValue(entry.projectId, projectIds ?? projectId)) return false;
      if (!matchesFilterValue(entry.areaOfFocus, areas)) return false;
      return true;
    });
  }

  getCompletionSummary({ grouping = "week", year, context, contexts, projectId, projectIds, areas } = {}) {
    const formatter = getCompletionFormatter(grouping);
    if (!formatter) return [];
    const tasks = this.getCompletedTasks({
      context,
      contexts,
      projectId,
      projectIds,
      areas,
      year: grouping === "year" ? undefined : year,
    });
    if (!tasks.length) return [];
    const buckets = new Map();
    tasks.forEach((task) => {
      const date = new Date(task.completedAt);
      if (!Number.isFinite(date.getTime())) return;
      const key = formatter.key(date);
      const bucket =
        buckets.get(key) ||
        {
          key,
          label: formatter.label(date),
          range: formatter.range ? formatter.range(date) : null,
          count: 0,
          sortValue: formatter.sortValue(date),
          tasks: [],
        };
      bucket.count += 1;
      bucket.tasks.push(task);
      buckets.set(key, bucket);
    });
    return Array.from(buckets.values()).sort((a, b) => a.sortValue - b.sortValue);
  }

  getChecklist() {
    return this.state.checklist;
  }

  toggleChecklistItem(id) {
    const item = this.state.checklist.find((entry) => entry.id === id);
    if (!item) return;
    item.done = !item.done;
    this.emitChange();
  }

  resetChecklist() {
    this.state.checklist.forEach((item) => {
      item.done = false;
    });
    this.emitChange();
  }

  exportToMarkdown() {
    const headerLines = [
      "# NextFlow Tasks",
      "",
      `> Exported ${new Date().toISOString()}`,
      "",
    ];

    const projectsById = new Map(this.state.projects.map((project) => [project.id, project]));
    const sections = STATUS_ORDER.map((status) => {
      const label = STATUS_LABELS[status] || status;
      const tasks = this.getTasks({ status });
      if (!tasks.length) {
        return `## ${label}\n\n_No tasks_\n`;
      }
      const lines = [`## ${label}`, ""];
      tasks.forEach((task) => {
        const parts = [`- [ ] ${task.title}`];

        if (task.dueDate) parts.push(`📅 ${task.dueDate}`);
        if (task.calendarDate) parts.push(`📆 ${task.calendarDate}`);

        if (task.contexts?.length) task.contexts.forEach((ctx) => parts.push(formatContextToken(ctx)));

        if (task.projectId) {
          const project = projectsById.get(task.projectId);
          if (project) {
            parts.push(`#${slugify(project.name)}`);
          }
        }

        if (task.waitingFor) parts.push(`waiting::${quoteIfNeeded(task.waitingFor)}`);

        const metadata = [];
        if (task.description) {
          metadata.push(`  > ${task.description.replace(/\r?\n/g, "\n  > ")}`);
        }

        lines.push(parts.join(" "));
        if (metadata.length) {
          lines.push(...metadata);
        }
        lines.push("");
      });
      return lines.join("\n");
    });

    return [...headerLines, ...sections].join("\n").trimEnd() + "\n";
  }

  importFromMarkdown(markdown) {
    try {
      const parsed = parseMarkdownDocument(markdown, this.state.projects);
      if (!parsed.tasks.length) {
        this.notify("warn", "No tasks found in the Markdown file.");
        return false;
      }

      this.state.tasks = parsed.tasks.map((task) => normalizeTask(task));
      this.state.projects = parsed.projects;
      this.state.reference = [];
      this.state.completionLog = [];
      this.state.completedProjects = [];
      this._completionsDirty = true;

      this.emitChange();
      this.notify("info", `Imported ${parsed.tasks.length} tasks from Markdown.`);
      return true;
    } catch (error) {
      console.error("Failed to import Markdown", error);
      this.notify("error", "Unable to import Markdown. Please check the file format.");
      return false;
    }
  }

  importFromJSON(json) {
    try {
      const parsed = typeof json === "string" ? JSON.parse(json) : json;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        this.notify("warn", "Invalid export file — expected a JSON object.");
        return false;
      }
      const merged = mergeStates(parsed, this.state);
      this.state = hydrateState(merged);
      this.emitChange();
      const count = this.state.tasks.length;
      this.notify("info", `Import complete. ${count} active task${count !== 1 ? "s" : ""}.`);
      return true;
    } catch (error) {
      console.error("Failed to import JSON", error);
      this.notify("error", "Unable to import file. Please check it is a valid NextFlow export.");
      return false;
    }
  }

  getAnalyticsHistory() {
    return this.state.analytics.history;
  }

  updateTheme(theme) {
    if (!this.state.settings) {
      this.state.settings = defaultSettings(this.state.projects, this.state.completedProjects);
    }
    const normalized = normalizeTheme(theme);
    if (this.state.settings.theme === normalized) {
      return;
    }
    this.state.settings.theme = normalized;
    stampSettingsTimestamp(this.state.settings, "appearance");
    this.emitChange();
  }

  updateCustomTheme(nextCustomTheme = {}) {
    if (!this.state.settings) {
      this.state.settings = defaultSettings(this.state.projects, this.state.completedProjects);
    }
    const current = normalizeCustomTheme(this.state.settings.customTheme);
    const next = normalizeCustomTheme(
      {
        ...current,
        ...(nextCustomTheme || {}),
      },
      current
    );
    const unchanged =
      current.canvas === next.canvas &&
      current.accent === next.accent &&
      current.signal === next.signal;
    if (unchanged) {
      return current;
    }
    this.state.settings.customTheme = next;
    stampSettingsTimestamp(this.state.settings, "appearance");
    this.emitChange();
    return next;
  }

  saveCustomThemePalette(name, paletteTheme) {
    if (!this.state.settings) {
      this.state.settings = defaultSettings(this.state.projects, this.state.completedProjects);
    }
    const currentTheme = normalizeCustomTheme(this.state.settings.customTheme);
    const nextTheme = normalizeCustomTheme(paletteTheme, currentTheme);
    const currentPalettes = normalizeCustomThemePalettes(this.state.settings.customThemePalettes);
    const requestedName = normalizeCustomThemePaletteName(name);
    const resolvedName = requestedName || nextCustomThemePaletteName(currentPalettes);
    const existingIndex = currentPalettes.findIndex(
      (entry) => entry.name.toLowerCase() === resolvedName.toLowerCase()
    );
    const timestamp = nowIso();
    if (existingIndex !== -1) {
      const existing = currentPalettes[existingIndex];
      const unchanged =
        existing.customTheme.canvas === nextTheme.canvas &&
        existing.customTheme.accent === nextTheme.accent &&
        existing.customTheme.signal === nextTheme.signal;
      if (unchanged) {
        return existing;
      }
      currentPalettes[existingIndex] = {
        ...existing,
        name: resolvedName,
        customTheme: { ...nextTheme },
        updatedAt: timestamp,
      };
      this.state.settings.customThemePalettes = currentPalettes;
      stampSettingsTimestamp(this.state.settings, "appearance");
      this.emitChange();
      this.notify("info", `Updated palette "${resolvedName}".`);
      return currentPalettes[existingIndex];
    }
    const palette = {
      id: generateId("palette"),
      name: resolvedName,
      customTheme: { ...nextTheme },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.state.settings.customThemePalettes = [palette, ...currentPalettes];
    stampSettingsTimestamp(this.state.settings, "appearance");
    this.emitChange();
    this.notify("info", `Saved palette "${resolvedName}".`);
    return palette;
  }

  applyCustomThemePalette(id) {
    const paletteId = typeof id === "string" ? id.trim() : "";
    if (!paletteId) return null;
    if (!this.state.settings) {
      this.state.settings = defaultSettings(this.state.projects, this.state.completedProjects);
    }
    const currentPalettes = normalizeCustomThemePalettes(this.state.settings.customThemePalettes);
    const palette = currentPalettes.find((entry) => entry.id === paletteId);
    if (!palette) {
      this.notify("error", "Palette not found.");
      return null;
    }
    const currentTheme = normalizeCustomTheme(this.state.settings.customTheme);
    const nextTheme = normalizeCustomTheme(palette.customTheme, currentTheme);
    const colorsChanged =
      currentTheme.canvas !== nextTheme.canvas ||
      currentTheme.accent !== nextTheme.accent ||
      currentTheme.signal !== nextTheme.signal;
    const themeChanged = normalizeTheme(this.state.settings.theme) !== "custom";
    if (!colorsChanged && !themeChanged) {
      return palette;
    }
    this.state.settings.customTheme = nextTheme;
    this.state.settings.theme = "custom";
    stampSettingsTimestamp(this.state.settings, "appearance");
    this.emitChange();
    this.notify("info", `Applied palette "${palette.name}".`);
    return palette;
  }

  deleteCustomThemePalette(id) {
    const paletteId = typeof id === "string" ? id.trim() : "";
    if (!paletteId) return false;
    if (!this.state.settings) {
      this.state.settings = defaultSettings(this.state.projects, this.state.completedProjects);
    }
    const currentPalettes = normalizeCustomThemePalettes(this.state.settings.customThemePalettes);
    const index = currentPalettes.findIndex((entry) => entry.id === paletteId);
    if (index === -1) {
      return false;
    }
    const [removed] = currentPalettes.splice(index, 1);
    this.state.settings.customThemePalettes = currentPalettes;
    stampSettingsTimestamp(this.state.settings, "appearance");
    this.emitChange();
    this.notify("info", `Deleted palette "${removed.name}".`);
    return true;
  }

  updateFeatureFlag(flag, enabled) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_FEATURE_FLAGS, flag)) {
      this.notify("error", `Unknown feature flag: ${flag}`);
      return false;
    }
    if (!this.state.settings) {
      this.state.settings = defaultSettings(this.state.projects, this.state.completedProjects);
    }
    const current = normalizeFeatureFlags(this.state.settings.featureFlags);
    const nextValue = Boolean(enabled);
    if (current[flag] === nextValue) {
      return false;
    }
    this.state.settings.featureFlags = {
      ...current,
      [flag]: nextValue,
    };
    stampSettingsTimestamp(this.state.settings, "flags");
    this.emitChange();
    return true;
  }

  getTheme() {
    return normalizeTheme(this.state.settings?.theme);
  }

  getCustomTheme() {
    return normalizeCustomTheme(this.state.settings?.customTheme);
  }

  getCustomThemePalettes() {
    return normalizeCustomThemePalettes(this.state.settings?.customThemePalettes);
  }

  getFeatureFlags() {
    return normalizeFeatureFlags(this.state.settings?.featureFlags);
  }

  getReviewData() {
    return normalizeReviewSettings(this.state.settings?.review);
  }

  updateReviewData(data) {
    if (!this.state.settings) {
      this.state.settings = defaultSettings(this.state.projects, this.state.completedProjects);
    }
    if (!this.state.settings.review) {
      this.state.settings.review = normalizeReviewSettings();
    }
    Object.assign(this.state.settings.review, data);
    stampSettingsTimestamp(this.state.settings, "review");
    this.emitChange();
  }

  getFeatureFlag(flag) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_FEATURE_FLAGS, flag)) {
      return false;
    }
    return Boolean(this.getFeatureFlags()[flag]);
  }

  getStaleTaskThresholds() {
    return normalizeStaleTaskThresholds(this.state.settings?.staleTaskThresholds);
  }

  updateStaleTaskThresholds(nextThresholds = {}) {
    const normalized = normalizeStaleTaskThresholds({ ...this.getStaleTaskThresholds(), ...nextThresholds });
    if (
      normalized.warn >= normalized.stale ||
      normalized.stale >= normalized.old ||
      normalized.old >= normalized.ancient
    ) {
      this.notify("error", "Stale task thresholds must be increasing: warn < stale < old < ancient.");
      return false;
    }
    if (!this.state.settings) {
      this.state.settings = defaultSettings(this.state.projects, this.state.completedProjects);
    }
    this.state.settings.staleTaskThresholds = normalized;
    stampSettingsTimestamp(this.state.settings, "flags");
    this.emitChange();
    return true;
  }

  getGoogleCalendarConfig() {
    return normalizeGoogleCalendarConfig(this.state.settings?.googleCalendarConfig);
  }

  updateGoogleCalendarConfig(config) {
    if (!this.state.settings) {
      this.state.settings = defaultSettings(this.state.projects, this.state.completedProjects);
    }
    this.state.settings.googleCalendarConfig = normalizeGoogleCalendarConfig({
      ...this.state.settings.googleCalendarConfig,
      ...config,
    });
    stampSettingsTimestamp(this.state.settings, "calendar");
    this.emitChange();
  }
}

function normalizeTheme(theme) {
  if (typeof theme === "string" && THEME_IDS.has(theme)) {
    return theme;
  }
  return DEFAULT_THEME;
}

function normalizeThemeColor(value, fallback) {
  const resolvedFallback = typeof fallback === "string" && HEX_COLOR_PATTERN.test(fallback)
    ? fallback.toLowerCase()
    : "#000000";
  if (typeof value !== "string") return resolvedFallback;
  const normalized = value.trim().toLowerCase();
  if (!HEX_COLOR_PATTERN.test(normalized)) return resolvedFallback;
  return normalized;
}

function normalizeCustomTheme(customTheme, fallbackTheme = DEFAULT_CUSTOM_THEME) {
  const fallback = {
    canvas: normalizeThemeColor(fallbackTheme?.canvas, DEFAULT_CUSTOM_THEME.canvas),
    accent: normalizeThemeColor(fallbackTheme?.accent, DEFAULT_CUSTOM_THEME.accent),
    signal: normalizeThemeColor(fallbackTheme?.signal, DEFAULT_CUSTOM_THEME.signal),
  };
  return {
    canvas: normalizeThemeColor(customTheme?.canvas, fallback.canvas),
    accent: normalizeThemeColor(customTheme?.accent, fallback.accent),
    signal: normalizeThemeColor(customTheme?.signal, fallback.signal),
  };
}

function normalizeCustomThemePaletteName(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  return normalized.slice(0, CUSTOM_THEME_PALETTE_NAME_MAX);
}

function nextCustomThemePaletteName(existingPalettes = []) {
  const existing = new Set(
    (Array.isArray(existingPalettes) ? existingPalettes : [])
      .map((entry) => (typeof entry?.name === "string" ? entry.name.trim().toLowerCase() : ""))
      .filter(Boolean)
  );
  let index = existing.size + 1;
  let candidate = `${CUSTOM_THEME_PALETTE_DEFAULT_NAME} ${index}`;
  while (existing.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${CUSTOM_THEME_PALETTE_DEFAULT_NAME} ${index}`;
  }
  return candidate;
}

function normalizeCustomThemePalette(palette) {
  if (!palette || typeof palette !== "object") return null;
  const name = normalizeCustomThemePaletteName(palette.name);
  if (!name) return null;
  const id = typeof palette.id === "string" ? palette.id.trim() : "";
  const customTheme = normalizeCustomTheme(palette.customTheme || palette.colors);
  const createdAt = sanitizeIsoTimestamp(palette.createdAt) || nowIso();
  const updatedAt = sanitizeIsoTimestamp(palette.updatedAt) || createdAt;
  return {
    id,
    name,
    customTheme,
    createdAt,
    updatedAt,
  };
}

function normalizeCustomThemePalettes(palettes, fallbackPalettes = []) {
  const source = Array.isArray(palettes) ? palettes : fallbackPalettes;
  const normalized = [];
  const seenIds = new Set();
  (Array.isArray(source) ? source : []).forEach((palette, index) => {
    const next = normalizeCustomThemePalette(palette);
    if (!next) return;
    if (!next.id) {
      next.id = `palette-${normalizeSlug(null, `${next.name}-${index + 1}`)}`;
    }
    if (seenIds.has(next.id)) {
      next.id = `palette-${normalizeSlug(
        null,
        `${next.name}-${index + 1}-${next.updatedAt || next.createdAt || nowIso()}`
      )}`;
    }
    if (seenIds.has(next.id)) {
      next.id = generateId("palette");
    }
    seenIds.add(next.id);
    normalized.push(next);
  });
  return normalized;
}

function normalizeFeatureFlags(featureFlags, fallbackFlags = DEFAULT_FEATURE_FLAGS) {
  const normalized = {};
  Object.keys(DEFAULT_FEATURE_FLAGS).forEach((flag) => {
    const fallbackValue =
      typeof fallbackFlags?.[flag] === "boolean" ? fallbackFlags[flag] : DEFAULT_FEATURE_FLAGS[flag];
    normalized[flag] =
      typeof featureFlags?.[flag] === "boolean" ? featureFlags[flag] : Boolean(fallbackValue);
  });
  return normalized;
}

function normalizeStaleTaskThresholds(thresholds, fallback = DEFAULT_STALE_TASK_THRESHOLDS) {
  const normalized = {
    warn: fallback.warn,
    stale: fallback.stale,
    old: fallback.old,
    ancient: fallback.ancient,
    futureDueDaysThreshold: fallback.futureDueDaysThreshold,
  };

  if (typeof thresholds?.warn === "number" && thresholds.warn > 0) {
    normalized.warn = Math.max(1, Math.floor(thresholds.warn));
  }
  if (typeof thresholds?.stale === "number" && thresholds.stale > 0) {
    normalized.stale = Math.max(1, Math.floor(thresholds.stale));
  }
  if (typeof thresholds?.old === "number" && thresholds.old > 0) {
    normalized.old = Math.max(1, Math.floor(thresholds.old));
  }
  if (typeof thresholds?.ancient === "number" && thresholds.ancient > 0) {
    normalized.ancient = Math.max(1, Math.floor(thresholds.ancient));
  }
  // 0 means disabled; positive values cap at 365
  if (typeof thresholds?.futureDueDaysThreshold === "number" && thresholds.futureDueDaysThreshold >= 0) {
    normalized.futureDueDaysThreshold = Math.min(365, Math.floor(thresholds.futureDueDaysThreshold));
  }

  return normalized;
}

function normalizeListItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item && typeof item === "object" && typeof item.text === "string" && item.text.trim())
    .map((item) => ({
      id: typeof item.id === "string" && item.id ? item.id : generateId("li"),
      text: item.text.trim(),
      done: Boolean(item.done),
      updatedAt: sanitizeIsoTimestamp(item.updatedAt) || null,
    }));
}

function normalizeGoogleCalendarConfig(config) {
  const duration = parseInt(config?.defaultDurationMinutes ?? DEFAULT_GOOGLE_CALENDAR_CONFIG.defaultDurationMinutes, 10);
  return {
    calendarId: typeof config?.calendarId === "string" ? config.calendarId : DEFAULT_GOOGLE_CALENDAR_CONFIG.calendarId,
    timezone: typeof config?.timezone === "string" && config.timezone ? config.timezone : DEFAULT_GOOGLE_CALENDAR_CONFIG.timezone,
    defaultDurationMinutes: Number.isFinite(duration) && duration >= 5 ? duration : DEFAULT_GOOGLE_CALENDAR_CONFIG.defaultDurationMinutes,
  };
}

function normalizeReviewSettings(raw = {}) {
  return {
    lastReviewDate: typeof raw?.lastReviewDate === "string" ? raw.lastReviewDate : null,
    currentStreak: Number.isFinite(raw?.currentStreak) && raw.currentStreak >= 0 ? Math.floor(raw.currentStreak) : 0,
    longestStreak: Number.isFinite(raw?.longestStreak) && raw.longestStreak >= 0 ? Math.floor(raw.longestStreak) : 0,
    lastStreakWeek: typeof raw?.lastStreakWeek === "string" ? raw.lastStreakWeek : null,
  };
}

function createCompletionSnapshot(task, completedAt, archiveType = "reference") {
  const noteFallback = completedAt || task.updatedAt || task.createdAt || nowIso();
  return {
    id: task.id,
    sourceId: task.id,
    title: task.title,
    description: task.description,
    contexts: task.contexts ?? [],
    peopleTag: task.peopleTag,
    effortLevel: task.effortLevel,
    timeRequired: task.timeRequired,
    areaOfFocus: task.areaOfFocus || null,
    projectId: task.projectId,
    waitingFor: task.waitingFor,
    dueDate: task.dueDate,
    myDayDate: task.myDayDate || null,
    calendarDate: task.calendarDate,
    calendarTime: task.calendarTime,
    createdAt: task.createdAt,
    completedAt,
    archivedAt: new Date().toISOString(),
    archiveType,
    closureNotes: task.closureNotes || null,
    notes: normalizeTaskNotes(task.notes, { fallbackCreatedAt: noteFallback }),
    updatedAt: completedAt || nowIso(),
    recurrenceRule: normalizeRecurrenceRule(task.recurrenceRule),
    slug: task.slug || normalizeSlug(null, task.id),
    originDevice: task.originDevice || null,
    originDeviceId: task.originDeviceId || null,
    totalDoingSeconds: task.totalDoingSeconds || null,
    doingSessions: task.doingSessions?.length ? task.doingSessions : null,
  };
}

function normalizeTask(task) {
  const linkedSchedule = normalizeLinkedSchedule({
    calendarDate: task.calendarDate,
    myDayDate: task.myDayDate,
    calendarTime: task.calendarTime,
  });
  const noteFallback = task.updatedAt || task.createdAt || nowIso();
  const normalized = {
    ...task,
    completedAt: task.completedAt || null,
    archiveType: task.archiveType || null,
    recurrenceRule: normalizeRecurrenceRule(task.recurrenceRule),
    slug: normalizeSlug(task.slug, task.id || task.sourceId || task.title || nowIso()),
    originDevice: task.originDevice || null,
    originDeviceId: task.originDeviceId || null,
    _fieldTimestamps: task._fieldTimestamps || null,
    calendarDate: linkedSchedule.calendarDate,
    calendarTime: linkedSchedule.calendarTime,
    contexts: normalizeContextsField(task.contexts ?? task.context ?? task.physicalContext),
    peopleTag: task.peopleTag ?? task.peopleContext ?? null,
    effortLevel: task.effortLevel ?? task.energyLevel ?? null,
    timeRequired: task.timeRequired ?? null,
    myDayDate: linkedSchedule.myDayDate,
    followUpDate: task.followUpDate || null,
    areaOfFocus:
      typeof task.areaOfFocus === "string" && task.areaOfFocus.trim()
        ? task.areaOfFocus.trim()
        : null,
    closureNotes: task.closureNotes ?? null,
    notes: normalizeTaskNotes(task.notes, { fallbackCreatedAt: noteFallback }),
    listItems: normalizeListItems(task.listItems),
    prerequisiteTaskIds: Array.isArray(task.prerequisiteTaskIds) ? [...task.prerequisiteTaskIds] : [],
    updatedAt: task.updatedAt || task.createdAt || nowIso(),
  };
  return normalizeTaskTags(normalized);
}

function normalizeCompletionEntry(entry) {
  if (!entry) return null;
  const noteFallback = entry.completedAt || entry.archivedAt || entry.updatedAt || entry.createdAt || nowIso();
  return {
    id: entry.id || entry.sourceId || generateId("completed"),
    title: entry.title || "Completed task",
    description: entry.description || "",
    contexts: normalizeContextsField(entry.contexts ?? entry.context),
    peopleTag: entry.peopleTag || null,
    effortLevel: entry.effortLevel || entry.energyLevel || null,
    timeRequired: entry.timeRequired || null,
    areaOfFocus:
      typeof entry.areaOfFocus === "string" && entry.areaOfFocus.trim()
        ? entry.areaOfFocus.trim()
        : null,
    projectId: entry.projectId || null,
    waitingFor: entry.waitingFor || null,
    dueDate: entry.dueDate || null,
    myDayDate: sanitizeIsoDate(entry.myDayDate) || null,
    calendarDate: entry.calendarDate || null,
    calendarTime: sanitizeTime(entry.calendarTime) || null,
    createdAt: entry.createdAt || null,
    completedAt: entry.completedAt || entry.archivedAt || null,
    archivedAt: entry.archivedAt || entry.completedAt || null,
    archiveType: entry.archiveType || "reference",
    closureNotes: entry.closureNotes || null,
    notes: normalizeTaskNotes(entry.notes, { fallbackCreatedAt: noteFallback }),
    recurrenceRule: normalizeRecurrenceRule(entry.recurrenceRule),
    slug: normalizeSlug(entry.slug, entry.id || entry.sourceId),
    originDevice: entry.originDevice || null,
    originDeviceId: entry.originDeviceId || null,
  };
}

function normalizeClosureNotes(notes = {}, previous = {}) {
  const pick = (key) => {
    const fallback = typeof previous[key] === "string" ? previous[key] : "";
    if (notes[key] === undefined || notes[key] === null) {
      return fallback;
    }
    const value = String(notes[key]).trim();
    return value;
  };
  return {
    achieved: pick("achieved"),
    lessons: pick("lessons"),
    followUp: pick("followUp"),
  };
}

function normalizeCompletedProject(entry) {
  if (!entry) return null;
  const snapshot = entry.snapshot ? normalizeProjectTags({ ...entry.snapshot }) : null;
  return {
    id: entry.id || entry.projectId || generateId("completed-project"),
    name: entry.name || snapshot?.name || "Completed project",
    completedAt: entry.completedAt || new Date().toISOString(),
    snapshot,
    closureNotes: normalizeClosureNotes(entry.closureNotes || {}),
    updatedAt: entry.updatedAt || entry.completedAt || nowIso(),
  };
}

function normalizeTaskTags(task) {
  const explicit = normalizeContextsField(task.contexts ?? task.context);
  const fromText = [
    ...extractContextTagsFromText(task.title),
    ...extractContextTagsFromText(task.description),
    ...(Array.isArray(task.listItems) ? task.listItems.flatMap((item) => extractContextTagsFromText(item?.text)) : []),
  ];
  const merged = [...explicit];
  fromText.forEach((ctx) => { if (!merged.includes(ctx)) merged.push(ctx); });
  task.contexts = merged;
  task.peopleTag = sanitizePeopleTag(task.peopleTag);
  task.effortLevel = sanitizeChoice(task.effortLevel, EFFORT_LEVELS, { allowCustom: false });
  task.timeRequired = sanitizeChoice(task.timeRequired, TIME_REQUIREMENTS, { allowCustom: false });
  return task;
}

function validateTaskTags(task) {
  if (task.peopleTag && !PEOPLE_TAG_PATTERN.test(task.peopleTag)) {
    return "People tag must start with + and contain only letters, numbers, underscores, or dashes.";
  }
  return null;
}

function normalizeProjectTags(project) {
  project.areaOfFocus = sanitizeChoice(project.areaOfFocus, PROJECT_AREAS, { allowCustom: true, allowEmpty: false }) || PROJECT_AREAS[0];
  project.themeTag = sanitizeChoice(project.themeTag, PROJECT_THEMES, { allowCustom: true }) || null;
  project.statusTag = sanitizeChoice(project.statusTag, PROJECT_STATUSES, { allowCustom: true, allowEmpty: false }) || PROJECT_STATUSES[0];
  project.deadline = sanitizeIsoDate(project.deadline);
  project.tags = buildProjectTagList(project);
  project.updatedAt = project.updatedAt || nowIso();
  return project;
}

function validateProjectTags(project) {
  if (!project.areaOfFocus) {
    return "Project needs an Area of Focus classification.";
  }
  if (!project.statusTag) {
    return "Project needs a Status classification.";
  }
  return null;
}

function isCompletedProject(project) {
  if (!project) return false;
  const status = typeof project.status === "string" ? project.status.trim().toLowerCase() : "";
  const statusTag = typeof project.statusTag === "string" ? project.statusTag.trim().toLowerCase() : "";
  return status === "completed" || statusTag === "completed";
}

function buildProjectTagList(project) {
  return [project.areaOfFocus, project.themeTag, project.statusTag].filter(Boolean);
}

function sanitizeChoice(value, allowed, { allowCustom = false, allowEmpty = true } = {}) {
  if (value === null || value === undefined) {
    return allowEmpty ? null : allowed?.[0] ?? null;
  }
  const normalized = String(value).trim();
  if (!normalized) {
    return allowEmpty ? null : allowed?.[0] ?? null;
  }
  const match = allowed?.find((item) => item.toLowerCase() === normalized.toLowerCase());
  if (match) return match;
  if (allowCustom) return normalized;
  return allowEmpty ? null : allowed?.[0] ?? null;
}

function sanitizePhysicalContext(value, { allowEmpty = false } = {}) {
  return sanitizeChoice(value, PHYSICAL_CONTEXTS, { allowCustom: true, allowEmpty });
}

function normalizeContextsField(value) {
  const items = Array.isArray(value) ? value : (typeof value === "string" && value.trim() ? [value] : []);
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const normalized = sanitizePhysicalContext(item, { allowEmpty: false });
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function normalizeTemplateTask(t) {
  if (!t || typeof t !== "object") return null;
  const title = (t.title || "").trim();
  if (!title) return null;
  return {
    id: t.id || generateId("tmpl-task"),
    title,
    status: Object.values(STATUS).includes(t.status) ? t.status : STATUS.INBOX,
    contexts: normalizeContextsField(t.contexts),
    effortLevel: EFFORT_LEVELS.includes(t.effortLevel) ? t.effortLevel : null,
    timeRequired: TIME_REQUIREMENTS.includes(t.timeRequired) ? t.timeRequired : null,
    waitingFor: (t.waitingFor && typeof t.waitingFor === "string") ? t.waitingFor.trim() || null : null,
    description: (t.description && typeof t.description === "string") ? t.description.trim() || null : null,
  };
}

function normalizeTemplate(tmpl) {
  if (!tmpl || typeof tmpl !== "object") return null;
  return {
    id: tmpl.id || generateId("tmpl"),
    name: (tmpl.name || "").trim() || "Untitled Template",
    areaOfFocus: tmpl.areaOfFocus || null,
    themeTag: tmpl.themeTag || null,
    statusTag: PROJECT_STATUSES.includes(tmpl.statusTag) ? tmpl.statusTag : PROJECT_STATUSES[0],
    tasks: (tmpl.tasks || []).map(normalizeTemplateTask).filter(Boolean),
    updatedAt: tmpl.updatedAt || nowIso(),
    createdAt: tmpl.createdAt || nowIso(),
  };
}

function sanitizePeopleTag(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.startsWith("@") ? `+${trimmed.slice(1)}` : trimmed;
  if (!PEOPLE_TAG_PATTERN.test(normalized)) return null;
  if (PHYSICAL_CONTEXTS.some((context) => context.toLowerCase() === normalized.toLowerCase())) {
    return null;
  }
  return normalized;
}

function sanitizeIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function sanitizeIsoTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeTaskNotes(notes, { fallbackCreatedAt } = {}) {
  if (!Array.isArray(notes)) return [];
  const fallbackTimestamp = sanitizeIsoTimestamp(fallbackCreatedAt) || nowIso();
  return notes
    .map((entry) => {
      if (typeof entry === "string") {
        const text = entry.trim();
        if (!text) return null;
        return {
          id: generateId("note"),
          text,
          createdAt: fallbackTimestamp,
        };
      }
      if (!entry || typeof entry !== "object") return null;
      const text = typeof entry.text === "string" ? entry.text.trim() : "";
      if (!text) return null;
      const id =
        typeof entry.id === "string" && entry.id.trim()
          ? entry.id.trim()
          : generateId("note");
      const createdAt = sanitizeIsoTimestamp(entry.createdAt) || fallbackTimestamp;
      return {
        id,
        text,
        createdAt,
        updatedAt: sanitizeIsoTimestamp(entry.updatedAt) || createdAt,
      };
    })
    .filter(Boolean);
}

function extractTimeFromDateValue(value) {
  if (typeof value !== "string" || !value.includes("T")) return null;
  const [, rawTime = ""] = value.split("T");
  const match = /^([01]?\d|2[0-3]):([0-5]\d)/.exec(rawTime.trim());
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function sanitizeTime(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(normalized);
  if (!match) return null;
  const hours = match[1].padStart(2, "0");
  const minutes = match[2];
  return `${hours}:${minutes}`;
}

function normalizeLinkedSchedule({ calendarDate, myDayDate, calendarTime } = {}) {
  const normalizedCalendarDate = sanitizeIsoDate(calendarDate) || null;
  const normalizedMyDayDate = sanitizeIsoDate(myDayDate) || null;
  const linkedDate = normalizedCalendarDate || normalizedMyDayDate || null;
  const derivedTime = sanitizeTime(calendarTime) || sanitizeTime(extractTimeFromDateValue(calendarDate));
  return {
    calendarDate: linkedDate,
    myDayDate: linkedDate,
    calendarTime: linkedDate ? derivedTime : null,
  };
}

function normalizeContextOptions(options, tasks = [], reference = [], completionLog = []) {
  // Each entry is { name: string, areas: string[] }. Accepts legacy string entries
  // (treated as universal, areas=[]) for backward-compatible migration on first load.
  const map = new Map(); // normalized name -> areas[]

  // Process explicit options first — objects carry area configuration, strings are universal.
  (Array.isArray(options) ? options : []).forEach((value) => {
    let name, areas;
    if (typeof value === "object" && value !== null && typeof value.name === "string") {
      name = sanitizePhysicalContext(value.name, { allowEmpty: false });
      areas = Array.isArray(value.areas) ? [...value.areas] : [];
    } else if (typeof value === "string") {
      name = sanitizePhysicalContext(value, { allowEmpty: false });
      areas = [];
    } else {
      return;
    }
    if (name && !map.has(name)) map.set(name, areas);
  });

  // Add contexts found in task usage — universal (areas=[]), don't override explicit config.
  const addFromUsage = (value) => {
    const name = sanitizePhysicalContext(value, { allowEmpty: false });
    if (name && !map.has(name)) map.set(name, []);
  };
  (Array.isArray(tasks) ? tasks : []).forEach((entry) => (entry?.contexts || []).forEach(addFromUsage));
  (Array.isArray(reference) ? reference : []).forEach((entry) => (entry?.contexts || []).forEach(addFromUsage));
  (Array.isArray(completionLog) ? completionLog : []).forEach((entry) => (entry?.contexts || []).forEach(addFromUsage));

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, areas]) => ({ name, areas }));
}

function normalizePeopleOptions(options, tasks = [], reference = [], completionLog = []) {
  // Each entry is { name: string, areas: string[] }. Accepts legacy string entries
  // (treated as universal, areas=[]) for backward-compatible migration on first load.
  const map = new Map(); // normalized tag -> areas[]

  (Array.isArray(options) ? options : []).forEach((value) => {
    let name, areas;
    if (typeof value === "object" && value !== null && typeof value.name === "string") {
      name = sanitizePeopleTag(value.name);
      areas = Array.isArray(value.areas) ? [...value.areas] : [];
    } else if (typeof value === "string") {
      name = sanitizePeopleTag(value);
      areas = [];
    } else {
      return;
    }
    if (name && !map.has(name)) map.set(name, areas);
  });

  // Add tags found in task usage — universal (areas=[]), don't override explicit config.
  const addFromUsage = (value) => {
    const name = sanitizePeopleTag(value);
    if (name && !map.has(name)) map.set(name, []);
  };
  const addEntryTags = (entry) => {
    collectEntryPeopleTags(entry).forEach(addFromUsage);
  };
  (Array.isArray(tasks) ? tasks : []).forEach((entry) => addEntryTags(entry));
  (Array.isArray(reference) ? reference : []).forEach((entry) => addEntryTags(entry));
  (Array.isArray(completionLog) ? completionLog : []).forEach((entry) => addEntryTags(entry));

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, areas]) => ({ name, areas }));
}

function normalizePeopleTagCollection(values = []) {
  const result = [];
  const seen = new Set();
  (Array.isArray(values) ? values : []).forEach((value) => {
    const normalized = sanitizePeopleTag(value);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result;
}

function extractContextTagsFromText(rawText) {
  if (typeof rawText !== "string" || !rawText) return [];
  const results = [];
  const tokenRegex = /(?:^|[\s([{,;])(@[A-Za-z][A-Za-z0-9_-]*)/g;
  let match = tokenRegex.exec(rawText);
  while (match) {
    const normalized = sanitizePhysicalContext(match[1], { allowEmpty: false });
    if (normalized && !results.includes(normalized)) results.push(normalized);
    match = tokenRegex.exec(rawText);
  }
  return results;
}

function extractPeopleMentionTagsFromText(rawText) {
  if (typeof rawText !== "string" || !rawText) return [];
  const matches = [];
  const tokenRegex = /(?:^|[\s([{,;])(\+[A-Za-z0-9][A-Za-z0-9_-]*)/g;
  let match = tokenRegex.exec(rawText);
  while (match) {
    matches.push(match[1]);
    match = tokenRegex.exec(rawText);
  }
  return normalizePeopleTagCollection(matches);
}

function extractPeopleMentionTagsFromNotes(notes) {
  if (!Array.isArray(notes)) return [];
  const mentions = [];
  notes.forEach((note) => {
    if (typeof note?.text !== "string" || !note.text) return;
    mentions.push(...extractPeopleMentionTagsFromText(note.text));
  });
  return normalizePeopleTagCollection(mentions);
}

function collectEntryPeopleTags(entry, { includeNoteMentions = true } = {}) {
  if (!entry || typeof entry !== "object") return [];
  const values = [entry.peopleTag];
  values.push(...extractPeopleMentionTagsFromText(entry.title));
  values.push(...extractPeopleMentionTagsFromText(entry.description));
  if (Array.isArray(entry.listItems)) {
    entry.listItems.forEach((item) => values.push(...extractPeopleMentionTagsFromText(item?.text)));
  }
  if (includeNoteMentions) {
    values.push(...extractPeopleMentionTagsFromNotes(entry.notes));
  }
  return normalizePeopleTagCollection(values);
}

function normalizeAreaOptions(options, projects = [], completedProjects = []) {
  const values = new Set(
    (Array.isArray(options) ? options : [])
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean)
  );
  if (!values.size) {
    PROJECT_AREAS.forEach((area) => values.add(area));
  }
  (projects || []).forEach((project) => {
    if (project?.areaOfFocus) values.add(project.areaOfFocus);
  });
  (completedProjects || []).forEach((entry) => {
    if (entry?.snapshot?.areaOfFocus) values.add(entry.snapshot.areaOfFocus);
  });
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function normalizeRecurrenceRule(rule) {
  if (!rule) return null;
  const base = typeof rule === "string" ? { type: rule } : rule;
  if (!base || typeof base !== "object") return null;
  const type = typeof base.type === "string" ? base.type.toLowerCase() : "";
  if (!RECURRING_OPTIONS.includes(type)) {
    return null;
  }
  let interval = parseInt(base.interval, 10);
  if (!Number.isFinite(interval) || interval < 1) {
    interval = 1;
  }
  return {
    type,
    interval,
  };
}

// Builds a human-readable summary of what the remote state changed relative to
// local state. Called before mergeStates() so pre-merge local is still available.
function _buildConflictSummary(localState = {}, remoteState = {}) {
  const localTasks  = Array.isArray(localState.tasks)  ? localState.tasks  : [];
  const remoteTasks = Array.isArray(remoteState.tasks) ? remoteState.tasks : [];
  const localTaskMap = new Map(localTasks.map((t) => [t.id, t]));
  const changedTasks = [];
  const addedTasks   = [];
  const removedTasks = [];
  for (const remoteTask of remoteTasks) {
    if (!remoteTask?.id) continue;
    const localTask = localTaskMap.get(remoteTask.id);
    if (!localTask) {
      if (!remoteTask._deleted) addedTasks.push({ id: remoteTask.id, title: remoteTask.title || remoteTask.id });
    } else if (toTimestamp(remoteTask.updatedAt) > toTimestamp(localTask.updatedAt)) {
      changedTasks.push({ id: remoteTask.id, title: remoteTask.title || remoteTask.id });
    }
  }
  const remoteTaskIds = new Set(remoteTasks.map((t) => t?.id).filter(Boolean));
  for (const localTask of localTasks) {
    if (!localTask?.id || localTask._deleted) continue;
    if (!remoteTaskIds.has(localTask.id)) {
      removedTasks.push({ id: localTask.id, title: localTask.title || localTask.id });
    }
  }
  const localTs  = localState.settings?._fieldTimestamps  || {};
  const remoteTs = remoteState.settings?._fieldTimestamps || {};
  const changedSettingsGroups = Object.keys(SETTINGS_MERGE_GROUPS).filter(
    (g) => toTimestamp(remoteTs[g]) > toTimestamp(localTs[g])
  );
  return { changedTasks, addedTasks, removedTasks, changedSettingsGroups };
}

function mergeStates(remoteState = {}, localState = {}) {
  const merged = {
    ...remoteState,
    ...localState,
  };
  const mergeCollections = (localArr = [], remoteArr = []) => {
    const map = new Map();
    [...remoteArr, ...localArr].forEach((item) => {
      if (!item?.id) return;
      const existing = map.get(item.id);
      if (!existing) {
        map.set(item.id, item);
        return;
      }
      const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      const nextTime = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
      if (nextTime >= existingTime) {
        map.set(item.id, item);
      }
    });
    return Array.from(map.values());
  };
  merged.tasks = mergeTasks(
    localState.tasks,
    remoteState.tasks,
    localState._tombstones || {},
    remoteState._tombstones || {}
  );
  // Merge tombstone maps: union with max timestamp per id, then prune suppressed tasks.
  merged._tombstones = {};
  for (const [id, ts] of [
    ...Object.entries(localState._tombstones || {}),
    ...Object.entries(remoteState._tombstones || {}),
  ]) {
    if (!merged._tombstones[id] || ts > merged._tombstones[id]) merged._tombstones[id] = ts;
  }
  merged.projects = mergeCollections(localState.projects, remoteState.projects);
  merged.reference = mergeCollections(localState.reference, remoteState.reference);
  merged.completionLog = mergeCollections(localState.completionLog, remoteState.completionLog);
  merged.completedProjects = mergeCollections(localState.completedProjects, remoteState.completedProjects);
  merged.templates = mergeCollections(localState.templates, remoteState.templates);
  merged.analytics = mergeAnalytics(localState.analytics || {}, remoteState.analytics || {});
  merged.settings = mergeSettings(localState.settings || {}, remoteState.settings || {});
  return merged;
}

// Merges two analytics objects by unioning their history arrays keyed on the week label.
// For weeks present on both sides: max(complete) is more accurate, min(remaining) is more current.
// Ordering follows the first-seen chronological order from the union of both sides.
function mergeAnalytics(localAnalytics = {}, remoteAnalytics = {}) {
  const localHistory  = Array.isArray(localAnalytics.history)  ? localAnalytics.history  : [];
  const remoteHistory = Array.isArray(remoteAnalytics.history) ? remoteAnalytics.history : [];
  if (!localHistory.length && !remoteHistory.length) {
    return { ...(localAnalytics || remoteAnalytics || {}) };
  }
  const map = new Map();
  [...remoteHistory, ...localHistory].forEach((entry) => {
    const key = entry?.week;
    if (!key) return;
    const existing = map.get(key);
    if (!existing) { map.set(key, entry); return; }
    map.set(key, {
      ...existing,
      complete:  Math.max(existing.complete  || 0, entry.complete  || 0),
      remaining: Math.min(existing.remaining || 0, entry.remaining || 0),
    });
  });
  // Preserve chronological week order using first-seen order from the union of both sides.
  const seen = new Set();
  const ordered = [...remoteHistory, ...localHistory]
    .map((e) => e?.week)
    .filter((w) => w && !seen.has(w) && seen.add(w));
  return {
    ...localAnalytics,
    history: ordered.map((w) => map.get(w)).filter(Boolean),
  };
}

// Stamps a per-group timestamp on a settings object so mergeSettings() can use LWW per group.
function stampSettingsTimestamp(settings, group) {
  if (!settings._fieldTimestamps || typeof settings._fieldTimestamps !== "object") {
    settings._fieldTimestamps = {};
  }
  settings._fieldTimestamps[group] = nowIso();
}

// Merges two settings objects using per-field-group last-write-wins via _fieldTimestamps.
// Falls back to local-wins for any group that lacks timestamps on both sides (legacy state).
function mergeSettings(localSettings = {}, remoteSettings = {}) {
  // Start with local-wins as the base (preserves current behaviour for un-stamped settings).
  const merged = { ...remoteSettings, ...localSettings };
  const localTs = localSettings._fieldTimestamps || {};
  const remoteTs = remoteSettings._fieldTimestamps || {};
  // Seed merged timestamps with local; remote overrides below where remote wins.
  const mergedTs = { ...localTs };
  for (const [group, fields] of Object.entries(SETTINGS_MERGE_GROUPS)) {
    const localTime = toTimestamp(localTs[group]);
    const remoteTime = toTimestamp(remoteTs[group]);
    if (remoteTime > localTime) {
      // Remote has a newer explicit timestamp for this group — override the local-wins base.
      // Skip undefined values: a field absent in an older remote state should not wipe
      // a locally-defined value introduced after that state was last written.
      for (const f of fields) {
        if (remoteSettings[f] !== undefined) merged[f] = remoteSettings[f];
      }
      mergedTs[group] = remoteTs[group];
    }
    // If local wins (localTime >= remoteTime), the base spread is already correct.
  }
  // Only carry _fieldTimestamps forward if at least one side already had them; avoids
  // persisting an empty object into legacy state that has never had a timestamp.
  if (Object.keys(localTs).length || Object.keys(remoteTs).length) {
    merged._fieldTimestamps = mergedTs;
  } else {
    delete merged._fieldTimestamps;
  }
  return merged;
}

function toTimestamp(value) {
  if (!value) return 0;
  const date = new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

// Merges two sub-arrays of id'd items (notes, listItems) from a single task using id-based LWW.
// Unlike whole-task LWW, this always unions both sides so items added on either device
// survive a concurrent edit on the other. Output is sorted chronologically so that
// items added on either device appear in the right position.
function mergeSubcollection(localArr, remoteArr) {
  const local = Array.isArray(localArr) ? localArr : [];
  const remote = Array.isArray(remoteArr) ? remoteArr : [];
  if (!local.length && !remote.length) return [];
  const map = new Map();
  // Remote seeds the map; local overrides where the same id exists and is newer.
  [...remote, ...local].forEach((item) => {
    if (!item?.id) return;
    const existing = map.get(item.id);
    if (!existing) { map.set(item.id, item); return; }
    const existingTs = toTimestamp(existing.updatedAt || existing.createdAt);
    const nextTs = toTimestamp(item.updatedAt || item.createdAt);
    if (nextTs >= existingTs) map.set(item.id, item);
  });
  // Sort chronologically so items added on either device land in the right place.
  return Array.from(map.values()).sort((a, b) =>
    toTimestamp(a.createdAt || a.updatedAt) - toTimestamp(b.createdAt || b.updatedAt)
  );
}

function mergeTasks(localTasks = [], remoteTasks = [], localTombstones = {}, remoteTombstones = {}) {
  // Merge tombstone maps: union with max (latest) timestamp per task id.
  const tombstones = { ...localTombstones };
  for (const [id, ts] of Object.entries(remoteTombstones || {})) {
    if (!tombstones[id] || ts > tombstones[id]) tombstones[id] = ts;
  }

  const localList  = Array.isArray(localTasks)  ? localTasks.filter(Boolean)  : [];
  const remoteList = Array.isArray(remoteTasks) ? remoteTasks.filter(Boolean) : [];
  const localMap  = new Map(localList.filter((t)  => t?.id).map((t) => [t.id, t]));
  const remoteMap = new Map(remoteList.filter((t) => t?.id).map((t) => [t.id, t]));
  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);
  const result = new Map();

  for (const id of allIds) {
    const local  = localMap.get(id);
    const remote = remoteMap.get(id);

    // Tombstone check: if the task was explicitly deleted and neither side
    // has restored it more recently, suppress it entirely.
    const tombstoneTs = toTimestamp(tombstones[id]);
    if (tombstoneTs > 0) {
      const localTime  = local  ? toTimestamp(local.updatedAt  || local.createdAt)  : 0;
      const remoteTime = remote ? toTimestamp(remote.updatedAt || remote.createdAt) : 0;
      if (localTime <= tombstoneTs && remoteTime <= tombstoneTs) {
        continue; // deletion wins — suppress the task
      }
      // One side has a newer edit — the task was restored after deletion, keep it.
    }

    if (!local)  { result.set(id, remote); continue; }
    if (!remote) { result.set(id, local);  continue; }

    // Standard whole-task LWW base, then per-field-group override.
    const localUpdatedAt  = toTimestamp(local.updatedAt  || local.createdAt);
    const remoteUpdatedAt = toTimestamp(remote.updatedAt || remote.createdAt);
    const base = remoteUpdatedAt > localUpdatedAt ? remote : local;
    const merged = { ...base };

    // Per-field-group override: for each tracked group, pick the source
    // whose _fieldTimestamps entry is newer. Falls back to updatedAt for
    // legacy tasks that predate _fieldTimestamps.
    const mergedFt = { ...(merged._fieldTimestamps || {}) };
    for (const [group, fields] of Object.entries(MERGE_FIELD_GROUPS)) {
      const localTs  = toTimestamp(local._fieldTimestamps?.[group]  || local.updatedAt  || local.createdAt);
      const remoteTs = toTimestamp(remote._fieldTimestamps?.[group] || remote.updatedAt || remote.createdAt);
      const src = remoteTs >= localTs ? remote : local;
      for (const f of fields) merged[f] = src[f];
      mergedFt[group] = remoteTs >= localTs
        ? (remote._fieldTimestamps?.[group] || remote.updatedAt)
        : (local._fieldTimestamps?.[group]  || local.updatedAt);
    }
    merged._fieldTimestamps = mergedFt;
    // Merge notes and listItems as sub-collections so items added on either device
    // survive concurrent whole-task or field-group LWW on the other device.
    merged.notes = mergeSubcollection(local.notes, remote.notes);
    merged.listItems = mergeSubcollection(local.listItems, remote.listItems);
    result.set(id, merged);
  }

  return Array.from(result.values());
}

function advanceRecurrence(date, rule) {
  if (!date || !rule) return null;
  const next = new Date(date);
  if (Number.isNaN(next.getTime())) return null;
  const interval = Math.max(1, rule.interval || 1);
  switch (rule.type) {
    case RECURRENCE_TYPES.DAILY:
      next.setDate(next.getDate() + interval);
      break;
    case RECURRENCE_TYPES.WEEKLY:
      next.setDate(next.getDate() + interval * 7);
      break;
    case RECURRENCE_TYPES.MONTHLY:
      next.setMonth(next.getMonth() + interval);
      break;
    case RECURRENCE_TYPES.YEARLY:
      next.setFullYear(next.getFullYear() + interval);
      break;
    default:
      return null;
  }
  return next;
}

function computeNextRecurrenceDates(task, rule, fallbackDate = null) {
  const dueDateBase = task.dueDate ? new Date(task.dueDate) : null;
  const calendarBase = task.calendarDate ? new Date(task.calendarDate) : null;
  const nextDue = dueDateBase ? advanceRecurrence(dueDateBase, rule) : null;
  const nextCalendar = calendarBase ? advanceRecurrence(calendarBase, rule) : null;
  const fallbackNext = !nextDue && !nextCalendar && fallbackDate ? advanceRecurrence(fallbackDate, rule) : null;
  return { nextDue, nextCalendar, fallbackNext };
}

function formatIsoDate(date) {
  if (!date) return null;
  const clone = new Date(date);
  if (Number.isNaN(clone.getTime())) return null;
  return clone.toISOString().slice(0, 10);
}

export const __testing = {
  mergeStates,
  mergeAnalytics,
  mergeSettings,
  mergeSubcollection,
  mergeTasks,
  _buildConflictSummary,
  toTimestamp,
  advanceRecurrence,
  normalizeRecurrenceRule,
  mergeOpLogs,
  appendOpLogEntries,
  readOpLogEntries,
  MERGE_FIELD_GROUPS,
  SETTINGS_MERGE_GROUPS,
  normalizeTask,
  // Tombstone helpers exposed for testing
  _mergeTombstones: (a = {}, b = {}) => {
    const result = { ...a };
    for (const [id, ts] of Object.entries(b)) {
      if (!result[id] || ts > result[id]) result[id] = ts;
    }
    return result;
  },
};

function getCompletionFormatter(grouping) {
  if (grouping === "week") {
    return {
      key: (date) => `${date.getFullYear()}-W${String(getIsoWeek(date)).padStart(2, "0")}`,
      label: (date) => `Week ${getIsoWeek(date)}, ${date.getFullYear()}`,
      sortValue: (date) => date.getFullYear() * 100 + getIsoWeek(date),
      range: (date) => getWeekRange(date),
    };
  }
  if (grouping === "month") {
    return {
      key: (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: (date) =>
        `${date.toLocaleString(undefined, { month: "short" })} ${date.getFullYear()}`,
      sortValue: (date) => date.getFullYear() * 100 + date.getMonth(),
    };
  }
  if (grouping === "year") {
    return {
      key: (date) => `${date.getFullYear()}`,
      label: (date) => `${date.getFullYear()}`,
      sortValue: (date) => date.getFullYear(),
    };
  }
  return null;
}

function getIsoWeek(date) {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
}

function getWeekRange(date) {
  const d = new Date(date);
  const day = d.getDay();
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (dt) =>
    dt.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

function matchesSearch(task, rawTerm) {
  const term = rawTerm.trim().toLowerCase();
  if (!term) return true;
  const noteFields = Array.isArray(task.notes)
    ? task.notes.map((note) => note?.text).filter((value) => typeof value === "string" && value)
    : [];
  const fields = [
    task.title,
    task.description,
    ...(task.contexts || []),
    task.peopleTag,
    task.effortLevel,
    task.timeRequired,
    task.waitingFor,
    task.slug,
    task.id,
    ...noteFields,
  ];
  return fields.some((value) => typeof value === "string" && value.toLowerCase().includes(term));
}

function matchesContextsFilter(taskContexts, filter) {
  if (!filter) return true;
  const list = Array.isArray(filter) ? filter : [filter];
  if (!list.length || list.includes("all")) return true;
  return list.some((item) => {
    if (item === "none") {
      return !taskContexts || taskContexts.length === 0;
    }
    return Array.isArray(taskContexts) && taskContexts.includes(item);
  });
}

function matchesFilterValue(value, filter) {
  if (!filter) return true;
  const list = Array.isArray(filter) ? filter : [filter];
  if (!list.length || list.includes("all")) return true;
  return list.some((item) => {
    if (item === "none") {
      return value === null || value === undefined || value === "";
    }
    return value === item;
  });
}

function matchesPeopleFilter(task, filter) {
  if (!filter) return true;
  const list = Array.isArray(filter) ? filter : [filter];
  if (!list.length || list.includes("all")) return true;
  const taskPeopleTags = collectEntryPeopleTags(task);
  return list.some((item) => {
    if (item === "none") {
      return taskPeopleTags.length === 0;
    }
    const normalized = sanitizePeopleTag(item);
    if (!normalized) return false;
    const target = normalized.toLowerCase();
    return taskPeopleTags.some((tag) => tag.toLowerCase() === target);
  });
}

function matchesTaskFilters(task, filters = {}) {
  if (!filters) return true;
  if (!matchesContextsFilter(task.contexts, filters.contexts ?? filters.context)) {
    return false;
  }
  if (!matchesFilterValue(task.projectId, filters.projectIds ?? filters.projectId)) {
    return false;
  }
  if (!matchesPeopleFilter(task, filters.people ?? filters.person)) {
    return false;
  }
  if (!matchesFilterValue(task.waitingFor, filters.waitingFors ?? filters.waitingFor)) {
    return false;
  }
  if (!matchesFilterValue(task.effortLevel, filters.efforts ?? filters.effort)) {
    return false;
  }
  if (!matchesFilterValue(task.timeRequired, filters.times ?? filters.time)) {
    return false;
  }
  if (!matchesFilterValue(task.myDayDate, filters.myDayDates ?? filters.myDayDate)) {
    return false;
  }
  if (filters.searchTerm && !matchesSearch(task, filters.searchTerm)) {
    return false;
  }
  return true;
}

export function formatFriendlyDate(isoDate) {
  if (!isoDate) return "No date";
  // Plain date strings (YYYY-MM-DD) must be parsed as local time to avoid UTC-midnight
  // shifting the day back by one in negative-offset timezones.
  const dateStr = String(isoDate);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? new Date(dateStr + "T00:00:00")
    : new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  const day = WEEKDAY_NAMES[date.getDay()];
  return `${day}, ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

function formatContextToken(context) {
  const normalized = context.trim().replace(/\s+/g, "_");
  return normalized.startsWith("@") ? normalized : `@${normalized}`;
}

function normalizeContext(value) {
  if (!value) return null;
  const cleaned = value.trim().replace(/^@/, "").replace(/_/g, " ").replace(/\s+/g, " ");
  if (!cleaned) return null;
  return `@${cleaned.trim()}`;
}

function quoteIfNeeded(value) {
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }
  return trimmed;
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unslugify(value) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function normalizeStatusToken(token) {
  if (!token) return null;
  const normalized = token.toLowerCase().trim();
  if (SECTION_STATUS_MAP.has(normalized)) return SECTION_STATUS_MAP.get(normalized);
  if (SECTION_STATUS_MAP.has(normalized.replace(/\s+/g, ""))) {
    return SECTION_STATUS_MAP.get(normalized.replace(/\s+/g, ""));
  }
  return null;
}

function parseMarkdownDocument(markdown, existingProjects) {
  const lines = markdown.split(/\r?\n/);
  let currentStatus = null;
  const tasks = [];

  const projectsBySlug = new Map();
  (existingProjects || []).forEach((project) => {
    const clone = {
      ...project,
      tasks: [],
    };
    projectsBySlug.set(slugify(project.name), clone);
  });

  const ensureProject = (slugToken) => {
    if (!slugToken) return null;
    const slug = slugify(slugToken);
    if (!slug) return null;
    if (!projectsBySlug.has(slug)) {
      projectsBySlug.set(slug, {
        id: generateId("project"),
        name: unslugify(slug),
        vision: "",
        status: "active",
        owner: "",
        tags: [],
        tasks: [],
        isExpanded: true,
        someday: false,
      });
    }
    return projectsBySlug.get(slug);
  };

  const metadataRegex = /([A-Za-z0-9_-]+)::("[^"]+"|\S+)/g;
  const contextRegex = /@\S+/g;
  const projectRegex = /#\S+/g;

  let index = 0;
  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (line.startsWith("## ")) {
      const heading = line.slice(3).trim();
      currentStatus = normalizeStatusToken(heading) || currentStatus;
      index += 1;
      continue;
    }

    const taskMatch = line.match(/^-\s*\[( |x)\]\s*(.*)$/);
    if (taskMatch) {
      const metadata = {};
      let content = taskMatch[2];

      // Key-value metadata
      content = content.replace(metadataRegex, (match, key, value) => {
        const normalizedKey = key.toLowerCase().replace(/[-_]/g, "");
        metadata[normalizedKey] = unquote(value);
        return "";
      });

      // Due dates
      content = content.replace(/📅\s*(\d{4}-\d{2}-\d{2})/g, (match, date) => {
        metadata.due = date;
        return "";
      });

      // Calendar date
      content = content.replace(/📆\s*(\d{4}-\d{2}-\d{2})/g, (match, date) => {
        metadata.calendar = date;
        return "";
      });

      // Context tokens
      const contexts = [];
      content = content.replace(contextRegex, (match) => {
        const value = match.slice(1).replace(/_/g, " ");
        if (value) contexts.push(value);
        return "";
      });

      // Project tokens
      const projectTokens = [];
      content = content.replace(projectRegex, (match) => {
        const value = match.slice(1);
        if (value) projectTokens.push(value);
        return "";
      });

      const resolvedStatus =
        normalizeStatusToken(metadata.status) ||
        currentStatus ||
        STATUS.INBOX;

      const title = content.trim();
      if (!title) {
        index += 1;
        continue;
      }

      // Description lines
      let descriptionLines = [];
      let lookahead = index + 1;
      while (lookahead < lines.length) {
        const nextLine = lines[lookahead];
        if (nextLine.startsWith("  >")) {
          descriptionLines.push(nextLine.replace(/^  >\s?/, ""));
          lookahead += 1;
        } else if (nextLine.trim() === "") {
          lookahead += 1;
        } else {
          break;
        }
      }

      index = lookahead;

      const projectToken = projectTokens[0];
      const projectInstance = ensureProject(projectToken);

      const contextTokens = metadata.context
        ? [metadata.context]
        : contexts.length ? contexts : [];
      const task = {
        id: generateId("task"),
        title,
        description: descriptionLines.join("\n").trim() || "",
        status: resolvedStatus,
        contexts: contextTokens.map((t) => normalizeContext(t)).filter(Boolean),
        dueDate: metadata.due || null,
        projectId: projectInstance ? projectInstance.id : null,
        createdAt: new Date().toISOString(),
        waitingFor: metadata.waiting || metadata["waitingfor"] || metadata.owner || metadata.assignee || null,
        calendarDate: metadata.calendar || null,
      };

      tasks.push(task);

      if (projectInstance) {
        projectInstance.tasks.push(task.id);
      }

      continue;
    }

    index += 1;
  }

  const projects = Array.from(projectsBySlug.values()).map((project) => ({
    ...project,
    tasks: tasks.filter((task) => task.projectId === project.id).map((task) => task.id),
  }));

  return { tasks, projects };
}

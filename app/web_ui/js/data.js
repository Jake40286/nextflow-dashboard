const STORAGE_KEY = "gtd-dashboard-state-v1";
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
export const ENERGY_LEVELS = ["low", "medium", "high"];
export const TIME_REQUIREMENTS = ["<5min", "<15min", "<30min", "30min+"];
export const PROJECT_AREAS = ["Work", "Personal", "Home", "Finance", "Health"];
export const PROJECT_THEMES = ["Networking", "DevOps", "Automations", "Family", "Admin", "Research"];
export const PROJECT_STATUSES = ["Active", "OnHold", "Completed"];
const SLUG_MIN_LENGTH = 5;
const DEVICE_INFO_KEY = "gtd-dashboard-device-info";
export const RECURRENCE_TYPES = Object.freeze({
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
});
export const RECURRING_OPTIONS = ["daily", "weekly", "monthly"];
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
    id: "ocean",
    label: "Tidepool",
    description: "Cool blues with clean high-legibility cards.",
    icon: "◍",
    swatches: Object.freeze(["#eaf5f8", "#0d9488", "#c27803"]),
  }),
  Object.freeze({
    id: "forest",
    label: "Canopy",
    description: "Natural greens with soft low-glare backgrounds.",
    icon: "△",
    swatches: Object.freeze(["#edf4ec", "#2f855a", "#b7791f"]),
  }),
  Object.freeze({
    id: "sunset",
    label: "Terracotta",
    description: "Warm dusk tones with stronger orange highlights.",
    icon: "◐",
    swatches: Object.freeze(["#fff1e7", "#c2410c", "#b45309"]),
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
    id: "clay",
    label: "Clay",
    description: "Earthy neutrals with rust and jade accents.",
    icon: "◓",
    swatches: Object.freeze(["#f6ede5", "#92400e", "#0f766e"]),
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
  googleCalendarEnabled: true,
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
  [STATUS.NEXT]: "Next Actions",
  [STATUS.DOING]: "Doing",
  [STATUS.WAITING]: "Waiting",
  [STATUS.SOMEDAY]: "Someday / Maybe",
};
const STATUS_ORDER = [STATUS.INBOX, STATUS.NEXT, STATUS.DOING, STATUS.WAITING, STATUS.SOMEDAY];
const SECTION_STATUS_MAP = new Map([
  ["inbox", STATUS.INBOX],
  ["capture", STATUS.INBOX],
  ["next actions", STATUS.NEXT],
  ["next-actions", STATUS.NEXT],
  ["next", STATUS.NEXT],
  ["doing", STATUS.DOING],
  ["in progress", STATUS.DOING],
  ["in-progress", STATUS.DOING],
  ["waiting for", STATUS.WAITING],
  ["waiting-for", STATUS.WAITING],
  ["waiting", STATUS.WAITING],
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
};

const defaultSettings = (projects = [], completedProjects = []) => ({
  theme: DEFAULT_THEME,
  customTheme: { ...DEFAULT_CUSTOM_THEME },
  customThemePalettes: [],
  contextOptions: normalizeContextOptions(),
  peopleOptions: normalizePeopleOptions(),
  areaOptions: normalizeAreaOptions(undefined, projects, completedProjects),
  featureFlags: { ...DEFAULT_FEATURE_FLAGS },
  googleCalendarConfig: { ...DEFAULT_GOOGLE_CALENDAR_CONFIG },
});

const defaultState = () => ({
  tasks: [],
  reference: [],
  completionLog: [],
  projects: [],
  completedProjects: [],
  checklist: [
    { id: "c-1", label: "Get inbox to zero", done: false },
    { id: "c-2", label: "Review next actions by context", done: false },
    { id: "c-3", label: "Update waiting-for list", done: false },
    { id: "c-4", label: "Review calendar notes and blockers", done: false },
    { id: "c-5", label: "Look at someday/maybe to activate items", done: false },
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
    ),
    areaOptions: normalizeAreaOptions(
      nextState.settings?.areaOptions,
      nextState.projects,
      nextState.completedProjects
    ),
    featureFlags: normalizeFeatureFlags(nextState.settings?.featureFlags),
    googleCalendarConfig: normalizeGoogleCalendarConfig(nextState.settings?.googleCalendarConfig),
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

async function writeServerState(state) {
  if (typeof fetch === "undefined") {
    throw new Error("Fetch API is unavailable");
  }
  const payload = JSON.stringify(state);
  const methods = ["PUT", "POST"];
  let lastError = null;
  for (const method of methods) {
    try {
      const response = await fetch(STATE_ENDPOINT, {
        method,
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Failed to persist state");
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

export class TaskManager extends EventTarget {
  constructor(storageKey = STORAGE_KEY) {
    super();
    this.storageKey = storageKey;
    this.storage = safeLocalStorage();
    this.state = hydrateState(EMPTY_STATE);
    this.deviceInfo = getDeviceIdentity(this.storage);
    this.remoteSyncEnabled = typeof fetch !== "undefined";
    this.remoteSignature = null;
    this.pendingRemoteState = null;
    this.remoteRetryTimer = null;
    this.lastLocalSignature = hashState(this.state);
    this.lastSyncInfo = null;
    this.connectionStatus = "unknown";
    this.loadFromLocal();
    if (this.remoteSyncEnabled) {
      this.loadRemoteState();
    }
  }

  async loadRemoteState(options = {}) {
    try {
      const remoteState = await readServerState();
      const nextState = options.replaceLocal
        ? hydrateState(remoteState || EMPTY_STATE)
        : hydrateState(mergeStates(remoteState || {}, this.state || {}));
      this.state = nextState;
      this.remoteSignature = hashState(remoteState || {});
      this.setConnectionStatus("online");
      this.emitChange({ persist: false });
    } catch (error) {
      console.error("Failed to load remote state", error);
      this.setConnectionStatus("offline");
      this.notify("warn", "Server storage unavailable. Showing local data until it returns.");
      if (options?.rethrow) {
        throw error;
      }
    }
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

  persistLocally() {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (error) {
      console.error("Failed to cache state locally", error);
    }
  }

  persistRemotely() {
    if (!this.remoteSyncEnabled) return;
    this.flushRemoteQueue();
  }

  async flushRemoteQueue(options = {}) {
    const payload = hydrateState(this.state);
    this.pendingRemoteState = payload;
    try {
      const serverState = await readServerState();
      const serverSig = hashState(serverState || {});
      if (serverSig && serverSig !== this.remoteSignature) {
        // Merge conflicts: prefer most recently updated entities.
        const merged = mergeStates(serverState || {}, payload);
        this.state = hydrateState(merged);
        this.pendingRemoteState = merged;
        this.emitChange({ persist: false });
        const remoteDevice = serverState?.syncMeta?.deviceLabel || "another device";
        this.dispatchEvent(new CustomEvent("syncconflict", { detail: { remoteDevice } }));
      }
      // Stamp which device last wrote and when.
      this.pendingRemoteState = {
        ...this.pendingRemoteState,
        syncMeta: {
          deviceId: this.deviceInfo.id,
          deviceLabel: this.deviceInfo.label,
          syncedAt: nowIso(),
        },
      };
      await writeServerState(this.pendingRemoteState);
      this.remoteSignature = hashState(this.pendingRemoteState);
      this.lastSyncInfo = this.pendingRemoteState.syncMeta;
      this.pendingRemoteState = null;
      this.setConnectionStatus("online");
      if (this.remoteRetryTimer) {
        clearTimeout(this.remoteRetryTimer);
        this.remoteRetryTimer = null;
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
    }
  }

  async checkConnectivity() {
    if (!this.remoteSyncEnabled) {
      this.setConnectionStatus("offline");
      return false;
    }
    try {
      await readServerState();
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
    this.persistLocally();
    await this.flushRemoteQueue({ rethrow: true });
    await this.loadRemoteState({ rethrow: true, replaceLocal: true });
    this.persistLocally();
  }

  save() {
    this.persistLocally();
    this.persistRemotely();
  }

  notify(level, message) {
    this.dispatchEvent(new CustomEvent("toast", { detail: { level, message } }));
  }

  emitChange(options = {}) {
    const { persist = true } = options;
    this.dispatchEvent(new CustomEvent("statechange", { detail: this.state }));
    if (persist) {
      this.lastLocalSignature = hashState(this.state);
      this.save();
    }
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
    energy,
    energies,
    time,
    times,
    myDayDate,
    myDayDates,
    includeCompleted = false,
    includeFutureScheduled = true,
  } = {}) {
    const filterRules = {
      context: contexts ?? context,
      projectId: projectIds ?? projectId,
      person: people ?? person,
      waitingFor: waitingFors ?? waitingFor,
      energy: energies ?? energy,
      time: times ?? time,
      myDayDate: myDayDates ?? myDayDate,
      searchTerm,
    };
    return this.state.tasks.filter((task) => {
      if (!includeCompleted && task.completedAt) return false;
      if (status && task.status !== status) return false;
      if (!matchesTaskFilters(task, filterRules)) return false;
      if (!includeFutureScheduled && task.calendarDate) {
        const today = new Date();
        const y = today.getUTCFullYear();
        const m = today.getUTCMonth();
        const d = today.getUTCDate();
        const cutoff = new Date(Date.UTC(y, m, d));
        const when = new Date(task.calendarDate);
        if (!Number.isNaN(when.getTime()) && when >= cutoff) {
          return false;
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
      context:
        typeof payload.context === "string" && payload.context.trim()
          ? payload.context.trim()
          : null,
      dueDate: payload.dueDate || null,
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
    this.emitChange();
    this.notify("info", `Added "${task.title}" to Inbox.`);
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
    const enforceContext = draft.status !== STATUS.INBOX;
    normalizeTaskTags(draft, { enforceContext });
    const tagError = validateTaskTags(draft, { requireContext: enforceContext });
    if (tagError) {
      this.notify("error", tagError);
      return null;
    }
    Object.assign(task, draft);
    task.updatedAt = nowIso();
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
    return note;
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
    const newItems = lines.map((text) => ({ id: generateId("li"), text, done: false }));
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
    items[index] = { ...items[index], text: trimmed };
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

    task.status = nextStatus;
    task.completedAt = null;
    if (nextStatus === STATUS.WAITING && !task.waitingFor) {
      task.waitingFor = "Pending response";
    }
    if (nextStatus !== STATUS.WAITING) {
      task.waitingFor = task.waitingFor && task.waitingFor.startsWith("Pending") ? null : task.waitingFor;
    }
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
    const [task] = this.state.tasks.splice(taskIndex, 1);
    normalizeTaskTags(task);
    if (typeof closureNotes === "string") {
      const trimmed = closureNotes.trim();
      if (trimmed) {
        task.closureNotes = trimmed;
      }
    }
    const completedAt = new Date().toISOString();
    const archiveType = archive === "reference" ? "reference" : "deleted";
    const snapshot = createCompletionSnapshot(task, completedAt, archiveType);
    if (archive === "reference") {
      this.state.reference.unshift(snapshot);
    } else {
      this.state.completionLog.unshift(snapshot);
    }
    this.state.projects.forEach((project) => {
      project.tasks = project.tasks.filter((taskId) => taskId !== id);
    });
    const scheduled = this.scheduleRecurringTask(task, completedAt);
    this.emitChange();
    const completionMessage =
      archive === "reference" ? `Moved "${task.title}" to Reference.` : `Completed and removed "${task.title}".`;
    const suffix = scheduled ? " Next occurrence scheduled." : "";
    this.notify("info", `${completionMessage}${suffix}`);
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
    };
    clone.calendarTime = sanitizeTime(template.calendarTime) || null;
    const dueDateBase = clone.dueDate ? new Date(clone.dueDate) : null;
    const calendarBase = clone.calendarDate ? new Date(clone.calendarDate) : null;
    const completedDate = completedAt ? new Date(completedAt) : new Date();
    const nextDue = dueDateBase ? advanceRecurrence(dueDateBase, rule) : null;
    const nextCalendar = calendarBase ? advanceRecurrence(calendarBase, rule) : null;
    const fallbackNext = !nextDue && !nextCalendar ? advanceRecurrence(completedDate, rule) : null;
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
    if (!entry) {
      this.notify("error", "Completed task not found.");
      return null;
    }
    const restored = {
      id: entry.sourceId || entry.id || generateId("task"),
      title: entry.title,
      description: entry.description || "",
      status: entry.status || STATUS.NEXT,
      context: entry.context || null,
      peopleTag: entry.peopleTag || null,
      energyLevel: entry.energyLevel || null,
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
    this.state.tasks.unshift(restored);
    if (restored.projectId) {
      const project = this.state.projects.find((p) => p.id === restored.projectId);
      if (project && !project.tasks.includes(restored.id)) {
        project.tasks.push(restored.id);
      }
    }
    this.emitChange();
    this.notify("info", `Restored "${restored.title}" to Next Actions.`);
    return restored;
  }

  refreshFromStorage() {
    const previousTheme = this.getTheme();
    const previousCustomTheme = this.getCustomTheme();
    const previousCustomThemePalettes = this.getCustomThemePalettes();
    const previousFeatureFlags = this.getFeatureFlags();
    const previousContextOptions = this.getContexts();
    const previousPeopleOptions = this.getPeopleTags();
    this.load();
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
    this.emitChange();
    this.notify("info", "Restored starter GTD sample data.");
  }

  deleteTask(id) {
    const taskIndex = this.state.tasks.findIndex((task) => task.id === id);
    if (taskIndex === -1) {
      this.notify("error", "Task not found.");
      return;
    }
    const [task] = this.state.tasks.splice(taskIndex, 1);
    this.state.projects.forEach((project) => {
      project.tasks = project.tasks.filter((taskId) => taskId !== id);
    });
    const snapshot = createCompletionSnapshot(task, nowIso(), "deleted");
    this.state.completionLog = this.state.completionLog || [];
    this.state.completionLog.unshift(snapshot);
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
    this.emitChange();
    this.notify("info", "Removed project from Completed Projects.");
    return true;
  }

  getContexts() {
    const contexts = new Set();
    const addContext = (value) => {
      if (typeof value !== "string") return;
      const normalized = sanitizePhysicalContext(value, { allowEmpty: false });
      if (normalized) contexts.add(normalized);
    };
    (this.state.settings?.contextOptions || []).forEach((value) => addContext(value));
    this.state.tasks.forEach((task) => addContext(task.context));
    (this.state.reference || []).forEach((entry) => addContext(entry.context));
    (this.state.completionLog || []).forEach((entry) => addContext(entry.context));
    if (!contexts.size) {
      PHYSICAL_CONTEXTS.forEach((context) => contexts.add(context));
    }
    return Array.from(contexts).sort((a, b) => a.localeCompare(b));
  }

  getPeopleTags({ includeNoteMentions = true } = {}) {
    const tags = new Set();
    const addTag = (value) => {
      if (typeof value !== "string") return;
      const normalized = sanitizePeopleTag(value);
      if (normalized) tags.add(normalized);
    };
    const addEntryTags = (entry) => {
      collectEntryPeopleTags(entry, { includeNoteMentions }).forEach((tag) => addTag(tag));
    };
    (this.state.settings?.peopleOptions || []).forEach((value) => addTag(value));
    this.state.tasks.forEach((task) => addEntryTags(task));
    (this.state.reference || []).forEach((entry) => addEntryTags(entry));
    (this.state.completionLog || []).forEach((entry) => addEntryTags(entry));
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
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
      [...currentOptions, normalized],
      this.state.tasks,
      this.state.reference,
      this.state.completionLog
    );
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
      [...currentOptions, normalized],
      this.state.tasks,
      this.state.reference,
      this.state.completionLog
    );
    this.emitChange();
    if (notify) {
      this.notify("info", `Added people tag "${normalized}".`);
    }
    return normalized;
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

  renameContext(fromValue, toValue) {
    const from = sanitizePhysicalContext(fromValue, { allowEmpty: false }) || "";
    const to = sanitizePhysicalContext(toValue, { allowEmpty: false }) || "";
    if (!from || !to) {
      this.notify("warn", "Context rename requires both current and new values.");
      return false;
    }
    if (from === to) return false;
    let changed = false;
    this.state.tasks.forEach((task) => {
      if (task.context === from) {
        task.context = to;
        task.updatedAt = nowIso();
        changed = true;
      }
    });
    (this.state.reference || []).forEach((entry) => {
      if (entry.context === from) {
        entry.context = to;
        entry.updatedAt = nowIso();
        changed = true;
      }
    });
    (this.state.completionLog || []).forEach((entry) => {
      if (entry.context === from) {
        entry.context = to;
        entry.updatedAt = nowIso();
        changed = true;
      }
    });
    const contextOptions = Array.isArray(this.state.settings?.contextOptions)
      ? [...this.state.settings.contextOptions]
      : [];
    const optionIndex = contextOptions.findIndex((value) => value.toLowerCase() === from.toLowerCase());
    if (optionIndex !== -1) {
      contextOptions[optionIndex] = to;
      this.state.settings.contextOptions = normalizeContextOptions(
        contextOptions,
        this.state.tasks,
        this.state.reference,
        this.state.completionLog
      );
      changed = true;
    }
    if (!changed) return false;
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
      if (task.context !== target) return;
      task.context = task.status === STATUS.INBOX ? null : fallback;
      task.updatedAt = nowIso();
      changed = true;
    });
    (this.state.reference || []).forEach((entry) => {
      if (entry.context === target) {
        entry.context = null;
        entry.updatedAt = nowIso();
        changed = true;
      }
    });
    (this.state.completionLog || []).forEach((entry) => {
      if (entry.context === target) {
        entry.context = null;
        entry.updatedAt = nowIso();
        changed = true;
      }
    });
    const contextOptions = Array.isArray(this.state.settings?.contextOptions)
      ? this.state.settings.contextOptions
      : [];
    const normalizedOptions = normalizeContextOptions(
      contextOptions.filter((context) => context.toLowerCase() !== target.toLowerCase()),
      this.state.tasks,
      this.state.reference,
      this.state.completionLog
    );
    if (normalizedOptions.length !== contextOptions.length) {
      this.state.settings.contextOptions = normalizedOptions;
      changed = true;
    }
    if (!changed) return false;
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
    let changed = false;
    this.state.tasks.forEach((task) => {
      if (task.peopleTag === from) {
        task.peopleTag = to;
        task.updatedAt = nowIso();
        changed = true;
      }
    });
    (this.state.reference || []).forEach((entry) => {
      if (entry.peopleTag === from) {
        entry.peopleTag = to;
        entry.updatedAt = nowIso();
        changed = true;
      }
    });
    (this.state.completionLog || []).forEach((entry) => {
      if (entry.peopleTag === from) {
        entry.peopleTag = to;
        entry.updatedAt = nowIso();
        changed = true;
      }
    });
    const peopleOptions = Array.isArray(this.state.settings?.peopleOptions)
      ? [...this.state.settings.peopleOptions]
      : [];
    const optionIndex = peopleOptions.findIndex((value) => value.toLowerCase() === from.toLowerCase());
    if (optionIndex !== -1) {
      peopleOptions[optionIndex] = to;
      this.state.settings.peopleOptions = normalizePeopleOptions(
        peopleOptions,
        this.state.tasks,
        this.state.reference,
        this.state.completionLog
      );
      changed = true;
    }
    if (!changed) return false;
    this.emitChange();
    this.notify("info", `Renamed people tag "${from}" to "${to}".`);
    return true;
  }

  deletePeopleTag(value) {
    const target = sanitizePeopleTag(value);
    if (!target) return false;
    let changed = false;
    this.state.tasks.forEach((task) => {
      if (task.peopleTag === target) {
        task.peopleTag = null;
        task.updatedAt = nowIso();
        changed = true;
      }
    });
    (this.state.reference || []).forEach((entry) => {
      if (entry.peopleTag === target) {
        entry.peopleTag = null;
        entry.updatedAt = nowIso();
        changed = true;
      }
    });
    (this.state.completionLog || []).forEach((entry) => {
      if (entry.peopleTag === target) {
        entry.peopleTag = null;
        entry.updatedAt = nowIso();
        changed = true;
      }
    });
    const peopleOptions = Array.isArray(this.state.settings?.peopleOptions)
      ? this.state.settings.peopleOptions
      : [];
    const normalizedOptions = normalizePeopleOptions(
      peopleOptions.filter((tag) => tag.toLowerCase() !== target.toLowerCase()),
      this.state.tasks,
      this.state.reference,
      this.state.completionLog
    );
    if (normalizedOptions.length !== peopleOptions.length) {
      this.state.settings.peopleOptions = normalizedOptions;
      changed = true;
    }
    if (!changed) return false;
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
      this.state.settings.areaOptions = Array.from(new Set(areaOptions));
      changed = true;
    }
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
    this.emitChange();
    this.notify("info", `Renamed area "${from}" to "${to}".`);
    return true;
  }

  deleteAreaOfFocus(value) {
    const target = typeof value === "string" ? value.trim() : "";
    if (!target) return false;
    const areaOptions = Array.isArray(this.state.settings?.areaOptions)
      ? this.state.settings.areaOptions.filter((area) => area !== target)
      : [];
    const fallback =
      areaOptions[0] ||
      this.getAreasOfFocus().find((area) => area !== target) ||
      PROJECT_AREAS[0];
    let changed = false;
    if (!this.state.settings) {
      this.state.settings = defaultSettings(this.state.projects, this.state.completedProjects);
    }
    if (Array.isArray(this.state.settings.areaOptions)) {
      const before = this.state.settings.areaOptions.length;
      this.state.settings.areaOptions = this.state.settings.areaOptions.filter((area) => area !== target);
      if (this.state.settings.areaOptions.length !== before) {
        changed = true;
      }
    }
    this.state.projects.forEach((project) => {
      if (project.areaOfFocus === target) {
        project.areaOfFocus = fallback;
        normalizeProjectTags(project);
        project.updatedAt = nowIso();
        changed = true;
      }
    });
    (this.state.completedProjects || []).forEach((entry) => {
      if (entry?.snapshot?.areaOfFocus === target) {
        entry.snapshot.areaOfFocus = fallback;
        normalizeProjectTags(entry.snapshot);
        entry.updatedAt = nowIso();
        changed = true;
      }
    });
    if (!changed) return false;
    this.emitChange();
    this.notify("info", `Deleted area "${target}". Reassigned to "${fallback}".`);
    return true;
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
    const tasks = this.state.tasks.filter(
      (task) =>
        !task.completedAt &&
        Boolean(task.calendarDate || task.dueDate) &&
        matchesTaskFilters(task, filters)
    );
    const entries = tasks.map((task) => {
      const hasCalendarTime = Boolean(task.calendarDate && task.calendarTime);
      const date = hasCalendarTime ? `${task.calendarDate}T${task.calendarTime}` : task.calendarDate || task.dueDate;
      return {
        date,
        title: task.title,
        context: task.context,
        status: task.status,
        projectId: task.projectId,
        taskId: task.id,
        calendarDate: task.calendarDate || null,
        calendarTime: task.calendarTime || null,
        isDue: Boolean(task.dueDate && !task.calendarDate),
        isCompleted: false,
        raw: task,
      };
    });

    if (includeCompleted) {
      const completions = this.getCompletionEntries().filter(
        (entry) => entry.completedAt && entry.archiveType !== "deleted" && matchesTaskFilters(entry, filters)
      );
      completions.forEach((entry) => {
        entries.push({
          date: entry.completedAt,
          title: entry.title || "Completed task",
          context: entry.context,
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

  getCompletedTasks({ year, context, contexts, projectId, projectIds } = {}) {
    const entries = this.getCompletionEntries();
    return entries.filter((entry) => {
      if (!entry.completedAt) return false;
      if (Number.isFinite(year)) {
        const completedYear = new Date(entry.completedAt).getFullYear();
        if (completedYear !== year) return false;
      }
      if (!matchesFilterValue(entry.context, contexts ?? context)) return false;
      if (!matchesFilterValue(entry.projectId, projectIds ?? projectId)) return false;
      return true;
    });
  }

  getCompletionSummary({ grouping = "week", year, context, contexts, projectId, projectIds } = {}) {
    const formatter = getCompletionFormatter(grouping);
    if (!formatter) return [];
    const tasks = this.getCompletedTasks({
      context,
      contexts,
      projectId,
      projectIds,
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
      "# GTD Dashboard Tasks",
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

        if (task.context) parts.push(formatContextToken(task.context));

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

      this.emitChange();
      this.notify("info", `Imported ${parsed.tasks.length} tasks from Markdown.`);
      return true;
    } catch (error) {
      console.error("Failed to import Markdown", error);
      this.notify("error", "Unable to import Markdown. Please check the file format.");
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

  getFeatureFlag(flag) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_FEATURE_FLAGS, flag)) {
      return false;
    }
    return Boolean(this.getFeatureFlags()[flag]);
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

function normalizeListItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item && typeof item === "object" && typeof item.text === "string" && item.text.trim())
    .map((item) => ({
      id: typeof item.id === "string" && item.id ? item.id : generateId("li"),
      text: item.text.trim(),
      done: Boolean(item.done),
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

function createCompletionSnapshot(task, completedAt, archiveType = "reference") {
  const noteFallback = completedAt || task.updatedAt || task.createdAt || nowIso();
  return {
    id: task.id,
    sourceId: task.id,
    title: task.title,
    description: task.description,
    context: task.context,
    peopleTag: task.peopleTag,
    energyLevel: task.energyLevel,
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
    calendarDate: linkedSchedule.calendarDate,
    calendarTime: linkedSchedule.calendarTime,
    context: task.context ?? task.physicalContext ?? null,
    peopleTag: task.peopleTag ?? task.peopleContext ?? null,
    energyLevel: task.energyLevel ?? null,
    timeRequired: task.timeRequired ?? null,
    myDayDate: linkedSchedule.myDayDate,
    areaOfFocus:
      typeof task.areaOfFocus === "string" && task.areaOfFocus.trim()
        ? task.areaOfFocus.trim()
        : null,
    closureNotes: task.closureNotes ?? null,
    notes: normalizeTaskNotes(task.notes, { fallbackCreatedAt: noteFallback }),
    listItems: normalizeListItems(task.listItems),
    updatedAt: task.updatedAt || task.createdAt || nowIso(),
  };
  const enforceContext = normalized.status && normalized.status !== STATUS.INBOX;
  return normalizeTaskTags(normalized, { enforceContext });
}

function normalizeCompletionEntry(entry) {
  if (!entry) return null;
  const noteFallback = entry.completedAt || entry.archivedAt || entry.updatedAt || entry.createdAt || nowIso();
  return {
    id: entry.id || entry.sourceId || generateId("completed"),
    title: entry.title || "Completed task",
    description: entry.description || "",
    context: entry.context || null,
    peopleTag: entry.peopleTag || null,
    energyLevel: entry.energyLevel || null,
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

function normalizeTaskTags(task, { enforceContext = true } = {}) {
  const sanitizedContext = sanitizePhysicalContext(task.context, { allowEmpty: !enforceContext });
  if (sanitizedContext) {
    task.context = sanitizedContext;
  } else if (enforceContext) {
    task.context = PHYSICAL_CONTEXTS[0];
  } else {
    task.context = null;
  }
  task.peopleTag = sanitizePeopleTag(task.peopleTag);
  task.energyLevel = sanitizeChoice(task.energyLevel, ENERGY_LEVELS, { allowCustom: false });
  task.timeRequired = sanitizeChoice(task.timeRequired, TIME_REQUIREMENTS, { allowCustom: false });
  return task;
}

function validateTaskTags(task, { requireContext = true } = {}) {
  if (requireContext && !task.context) {
    return `Task requires a physical context such as ${PHYSICAL_CONTEXTS.join(", ")}.`;
  }
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
  const values = new Set(PHYSICAL_CONTEXTS);
  const addContext = (value) => {
    const normalized = sanitizePhysicalContext(value, { allowEmpty: false });
    if (normalized) {
      values.add(normalized);
    }
  };
  (Array.isArray(options) ? options : []).forEach((value) => addContext(value));
  (Array.isArray(tasks) ? tasks : []).forEach((entry) => addContext(entry?.context));
  (Array.isArray(reference) ? reference : []).forEach((entry) => addContext(entry?.context));
  (Array.isArray(completionLog) ? completionLog : []).forEach((entry) => addContext(entry?.context));
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function normalizePeopleOptions(options, tasks = [], reference = [], completionLog = []) {
  const values = new Set();
  const addTag = (value) => {
    const normalized = sanitizePeopleTag(value);
    if (normalized) {
      values.add(normalized);
    }
  };
  const addEntryTags = (entry) => {
    collectEntryPeopleTags(entry).forEach((tag) => addTag(tag));
  };
  (Array.isArray(options) ? options : []).forEach((value) => addTag(value));
  (Array.isArray(tasks) ? tasks : []).forEach((entry) => addEntryTags(entry));
  (Array.isArray(reference) ? reference : []).forEach((entry) => addEntryTags(entry));
  (Array.isArray(completionLog) ? completionLog : []).forEach((entry) => addEntryTags(entry));
  return Array.from(values).sort((a, b) => a.localeCompare(b));
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

function hashState(state) {
  try {
    const json = JSON.stringify(state || {});
    let hash = 0;
    for (let i = 0; i < json.length; i += 1) {
      hash = (hash << 5) - hash + json.charCodeAt(i);
      hash |= 0;
    }
    return `h${Math.abs(hash)}`;
  } catch (error) {
    console.error("Failed to hash state", error);
    return null;
  }
}

function mergeStates(remoteState = {}, localState = {}) {
  const merged = {
    ...remoteState,
    ...localState,
  };
  const removalMarkers = collectRemovalMarkers(remoteState, localState);
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
  merged.tasks = mergeTasks(localState.tasks, remoteState.tasks, removalMarkers);
  merged.projects = mergeCollections(localState.projects, remoteState.projects);
  merged.reference = mergeCollections(localState.reference, remoteState.reference);
  merged.completionLog = mergeCollections(localState.completionLog, remoteState.completionLog);
  merged.completedProjects = mergeCollections(localState.completedProjects, remoteState.completedProjects);
  merged.analytics = localState.analytics || remoteState.analytics || {};
  merged.settings = localState.settings || remoteState.settings || {};
  return merged;
}

function toTimestamp(value) {
  if (!value) return 0;
  const date = new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

function collectRemovalMarkers(...states) {
  const markers = new Map();
  const ingest = (entries) => {
    (entries || []).forEach((entry) => {
      if (!entry) return;
      const id = entry.sourceId || entry.id;
      if (!id) return;
      const removedAt = toTimestamp(entry.archivedAt || entry.completedAt || entry.updatedAt || entry.createdAt);
      if (!removedAt) return;
      const current = markers.get(id) || 0;
      if (removedAt > current) {
        markers.set(id, removedAt);
      }
    });
  };
  states.forEach((state) => {
    if (!state) return;
    ingest(state.reference);
    ingest(state.completionLog);
  });
  return markers;
}

function mergeTasks(localTasks = [], remoteTasks = [], removalMarkers = new Map()) {
  const localList = Array.isArray(localTasks) ? localTasks.filter(Boolean) : [];
  const remoteList = Array.isArray(remoteTasks) ? remoteTasks.filter(Boolean) : [];
  // Build a map seeded with local tasks, then apply last-write-wins for remote tasks.
  const map = new Map();
  localList.forEach((task) => {
    if (task?.id) map.set(task.id, task);
  });
  remoteList.forEach((task) => {
    if (!task?.id) return;
    const removedAt = removalMarkers.get(task.id);
    if (removedAt) {
      const updatedAt = toTimestamp(task.updatedAt || task.completedAt || task.archivedAt || task.createdAt);
      if (updatedAt <= removedAt) {
        map.delete(task.id);
        return;
      }
    }
    const existing = map.get(task.id);
    if (!existing) {
      map.set(task.id, task);
      return;
    }
    const existingTime = toTimestamp(existing.updatedAt || existing.createdAt);
    const remoteTime = toTimestamp(task.updatedAt || task.createdAt);
    if (remoteTime > existingTime) {
      map.set(task.id, task);
    }
  });
  return Array.from(map.values());
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
    default:
      return null;
  }
  return next;
}

function formatIsoDate(date) {
  if (!date) return null;
  const clone = new Date(date);
  if (Number.isNaN(clone.getTime())) return null;
  return clone.toISOString().slice(0, 10);
}

export const __testing = {
  mergeStates,
  collectRemovalMarkers,
  toTimestamp,
  advanceRecurrence,
  normalizeRecurrenceRule,
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
    task.context,
    task.peopleTag,
    task.energyLevel,
    task.timeRequired,
    task.waitingFor,
    task.slug,
    task.id,
    ...noteFields,
  ];
  return fields.some((value) => typeof value === "string" && value.toLowerCase().includes(term));
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
  if (!matchesFilterValue(task.context, filters.contexts ?? filters.context)) {
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
  if (!matchesFilterValue(task.energyLevel, filters.energies ?? filters.energy)) {
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
  const date = new Date(isoDate);
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

      const contextToken = metadata.context ? metadata.context : contexts[0] || null;
      const task = {
        id: generateId("task"),
        title,
        description: descriptionLines.join("\n").trim() || "",
        status: resolvedStatus,
        context: normalizeContext(contextToken),
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

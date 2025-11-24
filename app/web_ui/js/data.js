const STORAGE_KEY = "gtd-dashboard-state-v1";
const STATE_ENDPOINT = "/state";

export const STATUS = Object.freeze({
  INBOX: "inbox",
  NEXT: "next",
  WAITING: "waiting",
  SOMEDAY: "someday",
});

export const PHYSICAL_CONTEXTS = ["@Phone", "@Office", "@Home", "@Errands", "@Lab", "@Work", "@Team", "@Desk"];
export const PEOPLE_TAG_PATTERN = /^@[A-Za-z0-9][A-Za-z0-9_-]*$/;
export const ENERGY_LEVELS = ["low", "medium", "high"];
export const TIME_REQUIREMENTS = ["<5min", "<15min", "<30min", "30min+"];
export const PROJECT_AREAS = ["Work", "Personal", "Home", "Finance", "Health"];
export const PROJECT_THEMES = ["Networking", "DevOps", "Automations", "Family", "Admin", "Research"];
export const PROJECT_STATUSES = ["Active", "OnHold", "Completed"];
const SLUG_MIN_LENGTH = 5;
export const RECURRENCE_TYPES = Object.freeze({
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
});
export const RECURRING_OPTIONS = ["daily", "weekly", "monthly"];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const STATUS_LABELS = {
  [STATUS.INBOX]: "Inbox",
  [STATUS.NEXT]: "Next Actions",
  [STATUS.WAITING]: "Waiting For",
  [STATUS.SOMEDAY]: "Someday / Maybe",
};
const STATUS_ORDER = [STATUS.INBOX, STATUS.NEXT, STATUS.WAITING, STATUS.SOMEDAY];
const SECTION_STATUS_MAP = new Map([
  ["inbox", STATUS.INBOX],
  ["capture", STATUS.INBOX],
  ["next actions", STATUS.NEXT],
  ["next-actions", STATUS.NEXT],
  ["next", STATUS.NEXT],
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

const defaultState = () => ({
  tasks: [
    {
      id: "t-101",
      title: "Clarify project handoff notes",
      description: "Process notes from the strategy sync and capture follow-up items.",
      status: STATUS.INBOX,
      context: "@Work",
      dueDate: null,
      projectId: null,
      createdAt: new Date().toISOString(),
      waitingFor: null,
      assignee: null,
      calendarDate: null,
      completedAt: null,
    },
    {
      id: "t-102",
      title: "Schedule annual physical",
      description: "Call primary care office to book appointment.",
      status: STATUS.NEXT,
      context: "@Errands",
      dueDate: addDaysIso(3),
      projectId: null,
      createdAt: new Date().toISOString(),
      waitingFor: null,
      assignee: null,
      calendarDate: addDaysIso(3),
      completedAt: null,
    },
    {
      id: "t-103",
      title: "Outline Q3 roadmap",
      description: "Draft initial roadmap structure before Thursday leadership review.",
      status: STATUS.NEXT,
      context: "@Work",
      dueDate: addDaysIso(2),
      projectId: "p-301",
      createdAt: new Date().toISOString(),
      waitingFor: null,
      assignee: "Avery",
      calendarDate: addDaysIso(2),
      completedAt: null,
    },
    {
      id: "t-104",
      title: "Follow up with vendor on invoice",
      description: "Waiting on updated invoice from Apex Supplies.",
      status: STATUS.WAITING,
      context: "@Work",
      dueDate: addDaysIso(1),
      projectId: null,
      createdAt: new Date().toISOString(),
      waitingFor: "Jordan @ Apex Supplies",
      assignee: null,
      calendarDate: null,
      completedAt: null,
    },
    {
      id: "t-105",
      title: "Plan weekend hiking trip",
      description: "Research trails and reserve campsite if needed.",
      status: STATUS.SOMEDAY,
      context: "@Home",
      dueDate: null,
      projectId: null,
      createdAt: new Date().toISOString(),
      waitingFor: null,
      assignee: null,
      calendarDate: null,
      completedAt: null,
    },
    {
      id: "t-106",
      title: "Record onboarding walkthrough video",
      description: "Screen capture the updated dashboard onboarding flow.",
      status: STATUS.NEXT,
      context: "@Desk",
      dueDate: addDaysIso(1),
      projectId: "p-302",
      createdAt: new Date().toISOString(),
      waitingFor: null,
      assignee: "Jamie",
      calendarDate: addDaysIso(1),
      completedAt: null,
    },
    {
      id: "t-107",
      title: "Send proposal draft for review",
      description: "Waiting on Casey to provide annotated feedback.",
      status: STATUS.WAITING,
      context: "@Work",
      dueDate: addDaysIso(-1),
      projectId: "p-301",
      createdAt: new Date().toISOString(),
      waitingFor: "Casey",
      assignee: null,
      calendarDate: null,
      completedAt: null,
    },
    {
      id: "t-108",
      title: "Prototype focus timer widget",
      description: "Low fidelity draft to explore layout options.",
      status: STATUS.SOMEDAY,
      context: "@Team",
      dueDate: null,
      projectId: "p-303",
      createdAt: new Date().toISOString(),
      waitingFor: null,
      assignee: "Taylor",
      calendarDate: null,
      completedAt: null,
    },
  ],
  reference: [],
  completionLog: [],
  projects: [
    {
      id: "p-301",
      name: "Launch GTD dashboard beta",
      vision: "Deliver a shareable GTD dashboard prototype with actionable insights.",
      status: "active",
      owner: "Avery",
      tags: ["Product", "Team"],
      tasks: ["t-103", "t-107"],
      isExpanded: true,
      someday: false,
      areaOfFocus: "Work",
      themeTag: "Networking",
      statusTag: "Active",
      deadline: addDaysIso(30),
    },
    {
      id: "p-302",
      name: "Revamp onboarding guide",
      vision: "Update the onboarding flow to incorporate recent UI changes.",
      status: "active",
      owner: "Jamie",
      tags: ["Enablement"],
      tasks: ["t-106"],
      isExpanded: false,
      someday: false,
      areaOfFocus: "Work",
      themeTag: "Automations",
      statusTag: "Active",
      deadline: null,
    },
    {
      id: "p-303",
      name: "Explore focus tools",
      vision: "Research timers and habit integrations to extend the engage view.",
      status: "incubating",
      owner: "Taylor",
      tags: ["Research"],
      tasks: ["t-108"],
      isExpanded: false,
      someday: true,
      areaOfFocus: "Personal",
      themeTag: "Research",
      statusTag: "OnHold",
      deadline: null,
    },
  ],
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
  settings: {
    theme: "light",
  },
});

function hydrateState(raw = {}) {
  const nextState = {
    ...defaultState(),
    ...raw,
  };
  nextState.tasks = (nextState.tasks || []).map((task) => normalizeTask(task));
  if ((!raw || raw.tasks === undefined) && nextState.tasks.length === 0) {
    // If no saved tasks exist (e.g., first load, bad state read), fall back to starter data.
    nextState.tasks = defaultState().tasks.map((task) => normalizeTask(task));
  }
  nextState.reference = (nextState.reference || []).map((entry) => normalizeCompletionEntry(entry)).filter(Boolean);
  nextState.completionLog = (nextState.completionLog || [])
    .map((entry) => normalizeCompletionEntry(entry))
    .filter(Boolean);
  nextState.projects = (nextState.projects || []).map((project) => normalizeProjectTags(project));
  nextState.completedProjects = (nextState.completedProjects || [])
    .map((project) => normalizeCompletedProject(project))
    .filter(Boolean);
  return nextState;
}

function addDaysIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
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

export class TaskManager extends EventTarget {
  constructor(storageKey = STORAGE_KEY) {
    super();
    this.storageKey = storageKey;
    this.storage = safeLocalStorage();
    this.state = hydrateState(EMPTY_STATE);
    this.remoteSyncEnabled = typeof fetch !== "undefined";
    this.remoteSignature = null;
    this.pendingRemoteState = null;
    this.remoteRetryTimer = null;
    this.lastLocalSignature = hashState(this.state);
    this.connectionStatus = "unknown";
    this.loadFromLocal();
    if (this.remoteSyncEnabled) {
      this.loadRemoteState();
    }
  }

  async loadRemoteState() {
    try {
      const remoteState = await readServerState();
      const merged = mergeStates(remoteState || {}, this.state || {});
      this.state = hydrateState(merged);
      this.remoteSignature = hashState(this.state);
      this.setConnectionStatus("online");
      this.emitChange({ persist: false });
    } catch (error) {
      console.error("Failed to load remote state", error);
      this.setConnectionStatus("offline");
      this.notify("warn", "Server storage unavailable. Showing local data until it returns.");
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

  async flushRemoteQueue() {
    const payload = hydrateState(this.state);
    this.pendingRemoteState = payload;
    try {
      const serverState = await readServerState();
      const serverSig = hashState(serverState || {});
      if (this.remoteSignature && serverSig && serverSig !== this.remoteSignature) {
        // Merge conflicts: prefer most recently updated entities.
        const merged = mergeStates(serverState || {}, payload);
        this.state = hydrateState(merged);
        this.pendingRemoteState = merged;
        this.emitChange({ persist: false });
      }
      await writeServerState(this.pendingRemoteState);
      this.remoteSignature = hashState(this.pendingRemoteState);
      this.pendingRemoteState = null;
      this.setConnectionStatus("online");
      if (this.remoteRetryTimer) {
        clearTimeout(this.remoteRetryTimer);
        this.remoteRetryTimer = null;
      }
    } catch (error) {
      console.error("Failed to sync remote state", error);
      this.setConnectionStatus("offline");
      if (this.remoteRetryTimer) return;
      this.remoteRetryTimer = setTimeout(() => {
        this.remoteRetryTimer = null;
        this.flushRemoteQueue();
      }, 60000);
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
    energy,
    energies,
    time,
    times,
    includeCompleted = false,
  } = {}) {
    return this.state.tasks.filter((task) => {
      if (!includeCompleted && task.completedAt) return false;
      if (status && task.status !== status) return false;
      if (!matchesFilterValue(task.context, contexts ?? context)) return false;
      if (!matchesFilterValue(task.projectId, projectIds ?? projectId)) return false;
      if (searchTerm && !matchesSearch(task, searchTerm)) return false;
      if (!matchesFilterValue(task.peopleTag, people ?? person)) return false;
      if (!matchesFilterValue(task.energyLevel, energies ?? energy)) return false;
      if (!matchesFilterValue(task.timeRequired, times ?? time)) return false;
      return true;
    });
  }

  getTaskById(id) {
    return this.state.tasks.find((task) => task.id === id);
  }

  addTask(payload) {
    const id = generateId("task");
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
      projectId: payload.projectId || null,
      createdAt: new Date().toISOString(),
      waitingFor: payload.waitingFor || null,
      assignee: payload.assignee || null,
      calendarDate: payload.calendarDate || null,
      completedAt: payload.completedAt || null,
      closureNotes: payload.closureNotes?.trim() || null,
      updatedAt: nowIso(),
      recurrenceRule: normalizeRecurrenceRule(payload.recurrenceRule),
      slug: normalizeSlug(payload.slug, id),
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
    const draft = normalizeTask({ ...task, ...updates });
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

  moveTask(id, nextStatus) {
    const task = this.getTaskById(id);
    if (!task) {
      this.notify("error", "Cannot move missing task.");
      return;
    }

    task.status = nextStatus;
    task.completedAt = null;
    if (nextStatus === STATUS.WAITING && !task.waitingFor) {
      task.waitingFor = "Pending assignee";
    }
    if (nextStatus !== STATUS.WAITING) {
      task.waitingFor = task.waitingFor && task.waitingFor.startsWith("Pending") ? null : task.waitingFor;
    }
    task.updatedAt = nowIso();
    this.emitChange();
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
      slug: null,
    };
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
      projectId: entry.projectId || null,
      assignee: entry.assignee || null,
      waitingFor: entry.waitingFor || null,
      dueDate: entry.dueDate || null,
      calendarDate: entry.calendarDate || null,
      createdAt: entry.createdAt || new Date().toISOString(),
      completedAt: null,
      closureNotes: entry.closureNotes || null,
      updatedAt: nowIso(),
      archiveType: archiveType,
      recurrenceRule: normalizeRecurrenceRule(entry.recurrenceRule),
      slug: normalizeSlug(entry.slug, entry.id || entry.sourceId),
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
    this.load();
    if (!this.state.settings) {
      this.state.settings = { theme: previousTheme };
    } else {
      this.state.settings.theme = this.state.settings.theme || previousTheme;
    }
    this.emitChange();
    this.notify("info", "Reloaded saved dashboard data.");
  }

  resetToDefaults() {
    const theme = this.getTheme();
    this.state = defaultState();
    this.state.settings.theme = theme;
    this.state.tasks = this.state.tasks.map((task) => normalizeTask(task));
    this.state.projects = this.state.projects.map((project) => normalizeProjectTags(project));
    this.state.reference = [];
    this.state.completionLog = [];
    this.state.completedProjects = [];
    this.emitChange();
    this.notify("info", "Restored starter GTD sample data.");
  }

  deleteTask(id) {
    this.state.tasks = this.state.tasks.filter((task) => task.id !== id);
    this.state.projects.forEach((project) => {
      project.tasks = project.tasks.filter((taskId) => taskId !== id);
    });
    this.emitChange();
  }

  getProjects({ includeSomeday = true } = {}) {
    return this.state.projects.filter((project) => includeSomeday || !project.someday);
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
      const normalized = value.trim();
      if (normalized) contexts.add(normalized);
    };
    this.state.tasks.forEach((task) => addContext(task.context));
    (this.state.reference || []).forEach((entry) => addContext(entry.context));
    (this.state.completionLog || []).forEach((entry) => addContext(entry.context));
    if (!contexts.size) {
      PHYSICAL_CONTEXTS.forEach((context) => contexts.add(context));
    }
    return Array.from(contexts).sort((a, b) => a.localeCompare(b));
  }

  getSummary() {
    const todayIso = new Date().toISOString().slice(0, 10);
    const summary = {
      inbox: 0,
      next: 0,
      waiting: 0,
      someday: 0,
      projects: this.state.projects.length,
      overdue: 0,
      dueToday: 0,
    };

    this.state.tasks.forEach((task) => {
      if (task.completedAt) return;
      if (task.status === STATUS.INBOX) summary.inbox += 1;
      if (task.status === STATUS.NEXT) summary.next += 1;
      if (task.status === STATUS.WAITING) summary.waiting += 1;
      if (task.status === STATUS.SOMEDAY) summary.someday += 1;
      if (!task.dueDate) return;

      if (task.dueDate < todayIso) summary.overdue += 1;
      if (task.dueDate === todayIso) summary.dueToday += 1;
    });

    return summary;
  }

  getCalendarEntries({ exactDate } = {}) {
    const tasks = this.state.tasks.filter(
      (task) => !task.completedAt && Boolean(task.calendarDate || task.dueDate)
    );
    const entries = tasks.map((task) => {
      const date = task.calendarDate || task.dueDate;
      return {
        date,
        title: task.title,
        context: task.context,
        status: task.status,
        projectId: task.projectId,
        taskId: task.id,
        isDue: Boolean(task.dueDate && !task.calendarDate),
        isCompleted: false,
      };
    });

    const completions = this.getCompletionEntries().filter((entry) => entry.completedAt);
    completions.forEach((entry) => {
      entries.push({
        date: entry.completedAt,
        title: entry.title || "Completed task",
        context: entry.context,
        status: entry.status || "completed",
        projectId: entry.projectId || null,
        taskId: entry.sourceId || entry.id,
        isDue: false,
        isCompleted: true,
      });
    });

    entries.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    if (exactDate) {
      return entries.filter((entry) => entry.date === exactDate);
    }
    return entries;
  }

  getCompletionEntries() {
    const reference = Array.isArray(this.state.reference) ? this.state.reference : [];
    const logged = Array.isArray(this.state.completionLog) ? this.state.completionLog : [];
    return [...reference, ...logged].map((entry) => normalizeCompletionEntry(entry)).filter(Boolean);
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
        if (task.assignee) parts.push(`owner::${quoteIfNeeded(task.assignee)}`);

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
    this.state.settings.theme = theme;
    this.emitChange();
  }

  getTheme() {
    return this.state.settings.theme;
  }
}

function createCompletionSnapshot(task, completedAt, archiveType = "reference") {
  return {
    id: task.id,
    sourceId: task.id,
    title: task.title,
    description: task.description,
    context: task.context,
    peopleTag: task.peopleTag,
    energyLevel: task.energyLevel,
    timeRequired: task.timeRequired,
    projectId: task.projectId,
    assignee: task.assignee,
    waitingFor: task.waitingFor,
    dueDate: task.dueDate,
    calendarDate: task.calendarDate,
    createdAt: task.createdAt,
    completedAt,
    archivedAt: new Date().toISOString(),
    archiveType,
    closureNotes: task.closureNotes || null,
    updatedAt: completedAt || nowIso(),
    recurrenceRule: normalizeRecurrenceRule(task.recurrenceRule),
    slug: task.slug || normalizeSlug(null, task.id),
  };
}

function normalizeTask(task) {
  const normalized = {
    ...task,
    completedAt: task.completedAt || null,
    archiveType: task.archiveType || null,
    recurrenceRule: normalizeRecurrenceRule(task.recurrenceRule),
    slug: normalizeSlug(task.slug, task.id || task.sourceId || task.title || nowIso()),
    context: task.context ?? task.physicalContext ?? null,
    peopleTag: task.peopleTag ?? task.peopleContext ?? null,
    energyLevel: task.energyLevel ?? null,
    timeRequired: task.timeRequired ?? null,
    closureNotes: task.closureNotes ?? null,
    updatedAt: task.updatedAt || task.createdAt || nowIso(),
  };
  const enforceContext = normalized.status && normalized.status !== STATUS.INBOX;
  return normalizeTaskTags(normalized, { enforceContext });
}

function normalizeCompletionEntry(entry) {
  if (!entry) return null;
  return {
    id: entry.id || entry.sourceId || generateId("completed"),
    title: entry.title || "Completed task",
    description: entry.description || "",
    context: entry.context || null,
    peopleTag: entry.peopleTag || null,
    energyLevel: entry.energyLevel || null,
    timeRequired: entry.timeRequired || null,
    projectId: entry.projectId || null,
    assignee: entry.assignee || null,
    waitingFor: entry.waitingFor || null,
    dueDate: entry.dueDate || null,
    calendarDate: entry.calendarDate || null,
    createdAt: entry.createdAt || null,
    completedAt: entry.completedAt || entry.archivedAt || null,
    archivedAt: entry.archivedAt || entry.completedAt || null,
    archiveType: entry.archiveType || "reference",
    closureNotes: entry.closureNotes || null,
    recurrenceRule: normalizeRecurrenceRule(entry.recurrenceRule),
    slug: normalizeSlug(entry.slug, entry.id || entry.sourceId),
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
    return "People context must start with @ and contain only letters, numbers, underscores, or dashes.";
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
  if (!PEOPLE_TAG_PATTERN.test(trimmed)) return null;
  if (PHYSICAL_CONTEXTS.some((context) => context.toLowerCase() === trimmed.toLowerCase())) {
    return null;
  }
  return trimmed;
}

function sanitizeIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
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
  merged.tasks = mergeCollections(localState.tasks, remoteState.tasks).filter((task) => {
    if (!task?.id) return false;
    const removedAt = removalMarkers.get(task.id);
    if (!removedAt) return true;
    const updatedAt = toTimestamp(task.updatedAt || task.completedAt || task.archivedAt || task.createdAt);
    return updatedAt > removedAt;
  });
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
  const fields = [
    task.title,
    task.description,
    task.context,
    task.peopleTag,
    task.energyLevel,
    task.timeRequired,
    task.assignee,
    task.waitingFor,
    task.slug,
    task.id,
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
        waitingFor: metadata.waiting || metadata["waitingfor"] || null,
        assignee: metadata.owner || metadata.assignee || null,
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

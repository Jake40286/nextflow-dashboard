const STORAGE_KEY = "gtd-dashboard-state-v1";

export const STATUS = Object.freeze({
  INBOX: "inbox",
  NEXT: "next",
  WAITING: "waiting",
  SOMEDAY: "someday",
});

export const DEFAULT_CONTEXTS = ["@Work", "@Home", "@Errands", "@Desk", "@Team"];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
    },
  ],
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
    },
  ],
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

function addDaysIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
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

export class TaskManager extends EventTarget {
  constructor(storageKey = STORAGE_KEY) {
    super();
    this.storageKey = storageKey;
    this.storage = safeLocalStorage();
    this.state = defaultState();
    this.load();
  }

  load() {
    if (!this.storage) {
      this.notify("warn", "Local storage is unavailable. Using in-memory state.");
      return;
    }

    try {
      const raw = this.storage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.state = {
          ...defaultState(),
          ...parsed,
        };
      }
    } catch (error) {
      console.error("Failed to load state", error);
      this.notify("error", "Could not load saved data. Reverting to defaults.");
      this.state = defaultState();
    }
  }

  save() {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (error) {
      console.error("Failed to save state", error);
      this.notify("error", "Unable to save changes. Storage might be full.");
    }
  }

  notify(level, message) {
    this.dispatchEvent(new CustomEvent("toast", { detail: { level, message } }));
  }

  emitChange() {
    this.dispatchEvent(new CustomEvent("statechange", { detail: this.state }));
    this.save();
  }

  getTasks({ status, context, projectId, searchTerm } = {}) {
    return this.state.tasks.filter((task) => {
      if (status && task.status !== status) return false;
      if (context && context !== "all" && task.context !== context) return false;
      if (projectId && projectId !== "all" && task.projectId !== projectId) return false;
      if (searchTerm && !matchesSearch(task, searchTerm)) return false;
      return true;
    });
  }

  getTaskById(id) {
    return this.state.tasks.find((task) => task.id === id);
  }

  addTask(payload) {
    const task = {
      id: generateId("task"),
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
    };

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
    Object.assign(task, updates);
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
    if (nextStatus === STATUS.WAITING && !task.waitingFor) {
      task.waitingFor = "Pending assignee";
    }
    if (nextStatus !== STATUS.WAITING) {
      task.waitingFor = task.waitingFor && task.waitingFor.startsWith("Pending") ? null : task.waitingFor;
    }
    this.emitChange();
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

  addProject(name) {
    const trimmed = name.trim();
    if (!trimmed) {
      this.notify("warn", "Project name cannot be empty.");
      return null;
    }
    const project = {
      id: generateId("project"),
      name: trimmed,
      vision: "",
      status: "active",
      owner: "",
      tags: [],
      tasks: [],
      isExpanded: true,
      someday: false,
    };
    this.state.projects.push(project);
    this.emitChange();
    this.notify("info", `Created project "${project.name}".`);
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

  getContexts() {
    const contexts = new Set([...DEFAULT_CONTEXTS]);
    this.state.tasks.forEach((task) => {
      if (task.context) contexts.add(task.context);
    });
    return Array.from(contexts);
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
    const tasks = this.state.tasks.filter((task) => Boolean(task.calendarDate || task.dueDate));
    const entries = tasks.map((task) => {
      const date = task.calendarDate || task.dueDate;
      return {
        date,
        title: task.title,
        context: task.context,
        status: task.status,
        projectId: task.projectId,
        taskId: task.id,
      };
    });

    entries.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    if (exactDate) {
      return entries.filter((entry) => entry.date === exactDate);
    }
    return entries;
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

function matchesSearch(task, rawTerm) {
  const term = rawTerm.trim().toLowerCase();
  if (!term) return true;
  return (
    task.title.toLowerCase().includes(term) ||
    task.description?.toLowerCase().includes(term) ||
    task.context?.toLowerCase().includes(term) ||
    task.assignee?.toLowerCase().includes(term) ||
    task.waitingFor?.toLowerCase().includes(term)
  );
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

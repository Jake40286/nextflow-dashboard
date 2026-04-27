import {
  STATUS,
  STATUS_LABELS,
  formatFriendlyDate,
  PHYSICAL_CONTEXTS,
  EFFORT_LEVELS,
  TIME_REQUIREMENTS,
  PROJECT_THEMES,
  PROJECT_STATUSES,
  THEME_OPTIONS,
} from "./data.js";
import InboxPanel from "./panels/inbox.js";
import MyDayPanel from "./panels/my-day.js";
import NextPanel from "./panels/next.js";
import KanbanPanel from "./panels/kanban.js";
import ProjectsPanel from "./panels/projects.js";
import WaitingPanel from "./panels/waiting.js";
import SomedayPanel from "./panels/someday.js";
import CalendarPanel from "./panels/calendar.js";
import ReportsPanel from "./panels/reports.js";
import StatisticsPanel from "./panels/statistics.js";
import AllActivePanel from "./panels/all-active.js";
import SettingsPanel from "./panels/settings.js";
import BacklogPanel from "./panels/backlog.js";

const TAB_STORAGE_KEY = "nextflow-active-panel";
const NEXT_FANOUT_KEY = "nextflow-next-fanout";
const NEXT_HIDE_SCHEDULED_KEY = "nextflow-next-hide-scheduled";
const NEXT_GROUP_BY_KEY = "nextflow-next-group-by";
const NEXT_GROUP_LIMIT_KEY = "nextflow-next-group-limit";
const KANBAN_GROUP_BY_KEY = "nextflow-kanban-group-by";
const ACTIVE_AREA_KEY = "nextflow-active-area";
const SIDEBAR_EXPANDED_KEY = "nextflow-sidebar-expanded";

// One-time migration from gtd-dashboard-* preference keys to nextflow-* keys.
(function migrateUiStorageKeys() {
  const pairs = [
    ["gtd-dashboard-active-panel", TAB_STORAGE_KEY],
    ["gtd-dashboard-next-fanout", NEXT_FANOUT_KEY],
    ["gtd-dashboard-next-hide-scheduled", NEXT_HIDE_SCHEDULED_KEY],
    ["gtd-dashboard-next-group-by", NEXT_GROUP_BY_KEY],
    ["gtd-dashboard-next-group-limit", NEXT_GROUP_LIMIT_KEY],
  ];
  try {
    for (const [oldKey, newKey] of pairs) {
      const val = localStorage.getItem(oldKey);
      if (val !== null && localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, val);
      }
      if (val !== null) localStorage.removeItem(oldKey);
    }
  } catch (error) {
    /* noop — localStorage unavailable */
  }
})();
const ENTITY_LINK_TOKEN_PATTERN = /([@#+][A-Za-z0-9][A-Za-z0-9_-]*)/g;
const URL_PATTERN = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/;
const MARKDOWN_INLINE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;

const TRANSITIONS = {
  [STATUS.INBOX]: [
    { label: "Clarify → Next", target: STATUS.NEXT },
    { label: "Hold for later", target: STATUS.SOMEDAY },
    { label: "Delegated", target: STATUS.WAITING },
  ],
  [STATUS.NEXT]: [
    { label: "Start doing", target: STATUS.DOING },
    { label: "Move to Waiting", target: STATUS.WAITING },
    { label: "Move to Backburner", target: STATUS.SOMEDAY },
  ],
  [STATUS.DOING]: [
    { label: "Back to Next", target: STATUS.NEXT },
    { label: "Move to Waiting", target: STATUS.WAITING },
    { label: "Move to Backburner", target: STATUS.SOMEDAY },
  ],
  [STATUS.WAITING]: [
    { label: "Back to Next", target: STATUS.NEXT },
    { label: "Start doing", target: STATUS.DOING },
    { label: "Return to Inbox", target: STATUS.INBOX },
  ],
  [STATUS.SOMEDAY]: [
    { label: "Back to Inbox", target: STATUS.INBOX },
  ],
};

const CUSTOM_THEME_CSS_VARIABLES = Object.freeze([
  "--bg",
  "--bg-alt",
  "--surface",
  "--surface-2",
  "--surface-3",
  "--line",
  "--line-strong",
  "--text",
  "--text-muted",
  "--accent",
  "--accent-strong",
  "--accent-soft",
  "--accent-contrast",
  "--warning",
  "--danger",
  "--ok",
  "--shadow-sm",
  "--shadow-md",
  "--shadow-lg",
  "--ring",
]);

const PANEL_RENDER_FNS = Object.freeze({
  inbox: "renderInbox",
  "my-day": "renderMyDay",
  next: "renderNextActions",
  kanban: "renderKanban",
  projects: "renderProjects",
  waiting: "renderWaitingFor",
  someday: "renderSomeday",
  calendar: "renderCalendar",
  reports: "renderReports",
  statistics: "renderStatistics",
  "all-active": "renderAllActive",
  settings: "renderSettings",
  backlog: "renderBacklog",
});

export class UIController {
  constructor(taskManager, { isAdmin = false } = {}) {
    this.taskManager = taskManager;
    this.isAdmin = isAdmin;
    this.filters = {
      context: ["all"],
      project: ["all"],
      person: ["all"],
      waiting: ["all"],
      effort: ["all"],
      time: ["all"],
      search: "",
      date: "",
    };
    this.taskSort = "default";
    this.elements = mapElements();
    this.dropzones = [];
    this.panelButtons = [];
    this.panels = [];
    this.activePanel = loadStoredPanel() || "inbox";
    this.allowMultipleNextPerProject = loadNextFanoutPreference();
    this.hideScheduledNextActions = loadNextHideScheduledPreference();
    this.nextGroupBy = loadNextGroupByPreference();
    this.nextGroupLimit = loadNextGroupLimitPreference();
    this.nextGroupExpansions = new Map();
    this.kanbanGroupBy = loadKanbanGroupByPreference();
    this.activeArea = loadActiveAreaPreference();
    this.summaryCache = null;
    this.reportFilters = {
      grouping: "week",
      year: new Date().getFullYear(),
      contexts: ["all"],
      projects: ["all"],
      areas: ["all"],
    };
    this.activeReportKey = null;
    this._hiddenReportTaskIds = new Set();
    this.currentFlyoutTaskId = null;
    this.isFlyoutOpen = false;
    this.flyoutContext = { readOnly: false, entry: null };
    this.handleFlyoutKeydown = null;
    this.currentProjectFlyoutId = null;
    this.isProjectFlyoutOpen = false;
    this._handleProjectFlyoutKeydown = null;
    this._historyNavPending = false;
    this.calendarCursor = new Date();
    this.projectCache = null;
    this.projectLookup = new Map();
    this.clarifyState = { taskId: null, actionable: null, currentStep: "describe", actionPlanInitialized: false };
    this.processSession = null;
    this.handleClarifyKeydown = null;
    this.lastClarifyFocus = null;
    this.clarifyDestinationButtons = [];
    this.pendingClosure = null;
    this.projectCompletionState = { projectId: null };
    this.connectionStatus = "online";
    this.connectionCheckTimer = null;
    this.manualSyncInFlight = false;
    this.draggingTaskId = null;
    this.calendarShowCompleted = false;
    this.contextMenuTaskId = null;
    this.contextMenuHandlersBound = false;
    this.handleTaskMenuDismiss = null;
    this.handleTaskMenuEscape = null;
    this.associationFlyoutOpen = false;
    this.noteContextMenuState = null;
    this.noteContextMenuHandlersBound = false;
    this.handleNoteMenuDismiss = null;
    this.handleNoteMenuEscape = null;
    this.listItemContextMenuState = null;
    this.listItemContextMenuHandlersBound = false;
    this.handleListItemMenuDismiss = null;
    this.handleListItemMenuEscape = null;
    this.calendarDayContextMenuDate = null;
    this.calendarDayContextMenuHandlersBound = false;
    this.handleCalendarDayMenuDismiss = null;
    this.handleCalendarDayMenuEscape = null;
    this.contextColumnMenuState = null;
    this.contextColumnMenuHandlersBound = false;
    this.handleContextColumnMenuDismiss = null;
    this.handleContextColumnMenuEscape = null;
    this.showMissingNextOnly = false;
    this.showProjectCompletedTasks = false;
    this.selectedSettingsContext = null;
    this.customPaletteDraftName = "";
    this.statsLookbackDays = 30;
    this.entityMentionAutocompleteState = null;
    this.boundEntityMentionInputs = new WeakSet();
    this.entityMentionDismissHandler = null;
    this.entityMentionRepositionHandler = null;
    this._dirtyPanels = new Set();
    this.selectedTaskIds = new Set();
  }

  init() {
    this.elements = mapElements();
    this.bindListeners();
    this.setupEntityMentionAutocomplete();
    this.setupSummaryTabs();
    this.setupAssociationFlyout();
    this.setupTaskRowDelegation();
    this.setupTaskContextMenu();
    this.setupTaskNoteContextMenu();
    this.setupTaskListItemContextMenu();
    this.setupCalendarDayContextMenu();
    this.setupContextColumnContextMenu();
    this.setupFlyout();
    this.setupProjectFlyout();
    this.setupBackNavigation();
    this.bindClarifyModal();
    this.elements.processInboxBtn?.addEventListener("click", () => this.startProcessSession());
    this.bindProjectCompletionModal();
    this.bindProjectMergeModal();
    this.bindTemplateModals();
    this.setupLightbox();
    this.setupAreaScope();
    if (this.isAdmin) {
      document.body.classList.add("is-admin");
      const backlogTab = document.getElementById("summary-tab-backlog");
      if (backlogTab) backlogTab.hidden = false;
      const feedbackWidget = document.getElementById("feedbackWidget");
      if (feedbackWidget) feedbackWidget.hidden = false;
      this.setupFeedbackWidget();
    }
    this.setupSidebarToggle();
    this.setupMultiEditBar();
    this.renderAll();
    this.syncTheme(this.taskManager.getTheme());
    this.updateFooterYear();
    this.startConnectionChecks();
    this.startDoingBarTimer();
  }

  bindListeners() {
    const {
      searchTasks,
      clearFilters,
      calendarDate,
      reportGrouping,
      reportYear,
      statsLookback,
      randomContext,
      pickRandomTask,
      projectAreaFilter,
      toggleMissingNextAction,
      toggleProjectCompletedTasks,
      calendarPrevMonth,
      calendarNextMonth,
      calendarShowCompleted,
      manualSyncButton,
      summaryAllActive,
      toggleNextProjectFanout,
      toggleHideScheduledNext,
      nextGroupBySelect,
      nextGroupLimitInput,
      taskSortSelect,
      kanbanGroupBySelect,
    } = this.elements;

    searchTasks.addEventListener("input", (event) => {
      this.filters.search = event.target.value;
      this.renderAll();
    });

    searchTasks.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.clearSearch();
      }
    });

    taskSortSelect?.addEventListener("change", () => {
      this.taskSort = taskSortSelect.value;
      this.renderAll();
    });

    const { sortInfoHint, sortInfoPopup } = this.elements;
    if (sortInfoHint && sortInfoPopup) {
      sortInfoHint.addEventListener("click", (event) => {
        event.stopPropagation();
        const isHidden = sortInfoPopup.hidden;
        sortInfoPopup.hidden = !isHidden;
        if (!sortInfoPopup.hidden) {
          const rect = sortInfoHint.getBoundingClientRect();
          const popupWidth = 320;
          const left = Math.max(8, Math.min(rect.left, window.innerWidth - popupWidth - 8));
          const top = rect.bottom + 6;
          sortInfoPopup.style.left = `${left}px`;
          sortInfoPopup.style.top = `${top}px`;
        }
      });
      document.addEventListener("pointerdown", (event) => {
        if (!sortInfoPopup.hidden && !sortInfoPopup.contains(event.target) && event.target !== sortInfoHint) {
          sortInfoPopup.hidden = true;
        }
      }, true);
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !sortInfoPopup.hidden) {
          sortInfoPopup.hidden = true;
        }
      });
    }

    clearFilters.addEventListener("click", () => {
      this.filters = {
        context: ["all"],
        project: ["all"],
        person: ["all"],
        waiting: ["all"],
        effort: ["all"],
        time: ["all"],
        search: "",
        date: "",
      };
      this.taskSort = "default";
      if (taskSortSelect) taskSortSelect.value = "default";
      searchTasks.value = "";
      calendarDate.value = "";
      this.renderAll();
    });


    if (toggleNextProjectFanout) {
      toggleNextProjectFanout.checked = this.allowMultipleNextPerProject;
      toggleNextProjectFanout.addEventListener("change", () => {
        this.allowMultipleNextPerProject = toggleNextProjectFanout.checked;
        storeNextFanoutPreference(this.allowMultipleNextPerProject);
        this.renderNextActions();
        if (this.activePanel === "next") {
          this.updateActivePanelMeta();
        }
      });
    }
    if (toggleHideScheduledNext) {
      toggleHideScheduledNext.checked = this.hideScheduledNextActions;
      toggleHideScheduledNext.addEventListener("change", () => {
        this.hideScheduledNextActions = toggleHideScheduledNext.checked;
        storeNextHideScheduledPreference(this.hideScheduledNextActions);
        this.renderNextActions();
        if (this.activePanel === "next") {
          this.updateActivePanelMeta();
        }
      });
    }
    if (nextGroupBySelect) {
      nextGroupBySelect.value = this.nextGroupBy;
      nextGroupBySelect.addEventListener("change", () => {
        this.nextGroupBy = nextGroupBySelect.value;
        storeNextGroupByPreference(this.nextGroupBy);
        this.renderNextActions();
      });
    }
    if (kanbanGroupBySelect) {
      kanbanGroupBySelect.value = this.kanbanGroupBy;
      kanbanGroupBySelect.addEventListener("change", () => {
        this.kanbanGroupBy = kanbanGroupBySelect.value;
        storeKanbanGroupByPreference(this.kanbanGroupBy);
        this.renderKanban();
      });
    }
    if (nextGroupLimitInput) {
      nextGroupLimitInput.value = this.nextGroupLimit || "";
      nextGroupLimitInput.addEventListener("change", () => {
        const val = parseInt(nextGroupLimitInput.value, 10);
        this.nextGroupLimit = val > 0 ? val : 0;
        this.nextGroupExpansions.clear();
        storeNextGroupLimitPreference(this.nextGroupLimit);
        this.renderNextActions();
      });
    }

    projectAreaFilter?.addEventListener("change", () => {
      this.filters.projectArea = projectAreaFilter.value;
      this.renderProjects();
    });

    this.elements.projectAreaNewBtn?.addEventListener("click", () => {
      if (this.elements.projectAreaSelect) {
        addNewAreaOption(this.elements.projectAreaSelect, this.taskManager);
      }
    });

    this.elements.clarifyAreaNewBtn?.addEventListener("click", () => {
      if (this.elements.clarifyAreaInput) {
        addNewAreaOption(this.elements.clarifyAreaInput, this.taskManager);
      }
    });

    this.elements.clarifyTitleSummary?.addEventListener("input", () => {
      this.clarifyState.previewText = this.elements.clarifyTitleSummary.textContent;
    });
    this.elements.clarifyDescSummary?.addEventListener("input", () => {
      if (this.clarifyState.taskId) {
        const task = this.taskManager.getTaskById(this.clarifyState.taskId);
        if (task) task.description = this.elements.clarifyDescSummary.textContent;
      }
    });

    toggleMissingNextAction?.addEventListener("change", () => {
      this.showMissingNextOnly = toggleMissingNextAction.checked;
      this.renderProjects();
    });
    toggleProjectCompletedTasks?.addEventListener("change", () => {
      this.showProjectCompletedTasks = toggleProjectCompletedTasks.checked;
      this.renderProjects();
    });

    calendarDate.addEventListener("change", () => {
      this.filters.date = calendarDate.value;
      if (calendarDate.value) {
        this.calendarCursor = new Date(calendarDate.value + "T00:00:00");
      }
      this.renderCalendar();
    });
    calendarPrevMonth?.addEventListener("click", () => {
      this.shiftCalendarMonth(-1);
      this.renderCalendar();
    });
    calendarNextMonth?.addEventListener("click", () => {
      this.shiftCalendarMonth(1);
      this.renderCalendar();
    });
    calendarShowCompleted?.addEventListener("change", () => {
      this.calendarShowCompleted = calendarShowCompleted.checked;
      this.renderCalendar();
    });

    reportGrouping?.addEventListener("change", () => {
      this.reportFilters.grouping = reportGrouping.value;
      this.renderReports();
    });
    reportYear?.addEventListener("change", () => {
      const nextYear = parseInt(reportYear.value, 10);
      this.reportFilters.year = Number.isNaN(nextYear) ? new Date().getFullYear() : nextYear;
      this.renderReports();
    });
    statsLookback?.addEventListener("change", () => {
      const parsed = parseInt(statsLookback.value, 10);
      this.statsLookbackDays = Number.isNaN(parsed) ? 30 : Math.max(7, parsed);
      this.renderStatistics();
      if (this.activePanel === "statistics") {
        this.updateActivePanelMeta();
      }
    });
    randomContext?.addEventListener("change", () => {
      this.randomContext = randomContext.value;
    });
    pickRandomTask?.addEventListener("click", () => {
      this.pickRandomTask(randomContext?.value || "all");
    });

    manualSyncButton?.addEventListener("click", () => {
      this.triggerManualSync();
    });
    this.elements.topbarInboxBtn?.addEventListener("click", () => {
      this.setActivePanel("inbox");
    });
    this.elements.topbarDueTodayBtn?.addEventListener("click", () => {
      this.setActivePanel("my-day");
    });
    this.elements.topbarOverdueBtn?.addEventListener("click", () => {
      this.setActivePanel("next");
    });
    this.elements.topbarSettings?.addEventListener("click", () => {
      this.setActivePanel("settings");
    });
    // Accordion: close siblings when one opens
    document.getElementById("panel-settings")?.addEventListener("toggle", (event) => {
      if (!event.target.matches("details.settings-accordion") || !event.target.open) return;
      document.querySelectorAll("#panel-settings details.settings-accordion").forEach((el) => {
        if (el !== event.target) el.removeAttribute("open");
      });
    }, { capture: true });
    const settingsLists = [
      this.elements.settingsContextsList,
      this.elements.settingsPeopleList,
      this.elements.settingsAreasList,
    ].filter(Boolean);
    settingsLists.forEach((list) => {
      list.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-settings-action]");
        if (button) {
          const action = button.dataset.settingsAction;
          const type = button.dataset.settingsType;
          const value = button.dataset.settingsValue;
          const areaValue = button.dataset.settingsArea;
          this.handleSettingsAction({ action, type, value, areaValue });
          return;
        }
        if (event.target.closest(".settings-context-inline")) {
          return;
        }
        const contextItem = event.target.closest('li.settings-item[data-settings-type="context"]');
        if (!contextItem) return;
        const selected = contextItem.dataset.settingsValue;
        this.selectedSettingsContext = selected || null;
        this.renderSettings();
      });
    });
    this.elements.settingsContextsList?.addEventListener("change", (event) => {
      const select = event.target.closest("select[data-settings-task-id], select[data-settings-completed-task-id]");
      if (!select) return;
      const fromContext = select.dataset.settingsContextFrom || null;
      const toContext = select.value || null;
      if (select.dataset.settingsCompletedTaskId) {
        const taskId = select.dataset.settingsCompletedTaskId;
        const entry = this.taskManager.getCompletedTasks().find((t) => t.id === taskId);
        if (!entry) return;
        let nextContexts = Array.isArray(entry.contexts) ? [...entry.contexts] : [];
        if (fromContext && toContext && fromContext !== toContext) {
          const idx = nextContexts.indexOf(fromContext);
          if (idx !== -1) nextContexts[idx] = toContext;
          else nextContexts.push(toContext);
        } else if (toContext && !nextContexts.includes(toContext)) {
          nextContexts.push(toContext);
        }
        const updated = this.taskManager.updateCompletedTask(taskId, { contexts: nextContexts });
        if (!updated) return;
      } else {
        const taskId = select.dataset.settingsTaskId;
        const task = this.taskManager.getTasks().find((t) => t.id === taskId);
        if (!task) return;
        let nextContexts = Array.isArray(task.contexts) ? [...task.contexts] : [];
        if (fromContext && toContext && fromContext !== toContext) {
          const idx = nextContexts.indexOf(fromContext);
          if (idx !== -1) nextContexts[idx] = toContext;
          else nextContexts.push(toContext);
        } else if (toContext && !nextContexts.includes(toContext)) {
          nextContexts.push(toContext);
        }
        const updated = this.taskManager.updateTask(taskId, { contexts: nextContexts });
        if (!updated) return;
      }
      this.renderSettings();
    });
    this.elements.settingsFeatureFlagsList?.addEventListener("change", (event) => {
      const input = event.target.closest("input[data-feature-flag]");
      if (!input) return;
      this.taskManager.updateFeatureFlag(input.dataset.featureFlag, input.checked);
    });

    this.elements.settingsCleanupBtn?.addEventListener("click", async () => {
      const btn = this.elements.settingsCleanupBtn;
      btn.disabled = true;
      btn.textContent = "Cleaning…";
      try {
        const response = await fetch("/admin/cleanup-images", { method: "POST" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Cleanup failed");
        const mb = (data.bytes_freed / (1024 * 1024)).toFixed(2);
        const msg = data.removed === 0
          ? "No orphaned images found."
          : `Removed ${data.removed} orphaned image${data.removed === 1 ? "" : "s"} (${mb} MB freed).`;
        this.showToast("info", msg);
      } catch (error) {
        this.showToast("error", error.message || "Image cleanup failed.");
      } finally {
        btn.disabled = false;
        btn.textContent = "Clean up now";
      }
    });

    this.elements.settingsBacklogLink?.addEventListener("click", (e) => {
      e.preventDefault();
      this.setActivePanel("backlog");
    });

    this.elements.exportJSON?.addEventListener("click", async () => {
      const btn = this.elements.exportJSON;
      btn.disabled = true;
      btn.textContent = "Exporting…";
      try {
        const [stateRes, completedRes] = await Promise.all([
          fetch("/state"),
          fetch("/completed"),
        ]);
        const state = await stateRes.json();
        const completed = await completedRes.json();
        const full = { ...state, ...completed };
        const blob = new Blob([JSON.stringify(full, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `nextflow-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast("info", "Export complete.");
      } catch (error) {
        this.showToast("error", error.message || "Export failed.");
      } finally {
        btn.disabled = false;
        btn.textContent = "Export JSON";
      }
    });

    this.elements.importJSON?.addEventListener("click", () => {
      this.elements.jsonFileInput?.click();
    });

    this.elements.jsonFileInput?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const confirmed = await this.showConfirm(
        `Import "${file.name}"? This will overwrite all current data.`,
        { title: "Import data", okLabel: "Import", danger: true }
      );
      if (!confirmed) {
        this.elements.jsonFileInput.value = "";
        return;
      }
      const btn = this.elements.importJSON;
      btn.disabled = true;
      btn.textContent = "Importing…";
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const res = await fetch("/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Import failed (${res.status})`);
        }
        await this.taskManager.loadRemoteState();
        this.showToast("info", "Import complete — state refreshed.");
      } catch (error) {
        this.showToast("error", error.message || "Import failed.");
      } finally {
        btn.disabled = false;
        btn.textContent = "Import JSON";
        this.elements.jsonFileInput.value = "";
      }
    });

    this.elements.settingsDeviceNameInput?.addEventListener("change", () => {
      const input = this.elements.settingsDeviceNameInput;
      let newLabel = input.value.trim();
      try {
        const stored = JSON.parse(localStorage.getItem("nextflow-device-info") || "{}");
        if (!newLabel) newLabel = stored.label || stored.id || "";
        stored.label = newLabel;
        localStorage.setItem("nextflow-device-info", JSON.stringify(stored));
        if (this.taskManager.deviceInfo) this.taskManager.deviceInfo.label = newLabel;
        input.value = newLabel.replace(/\s*\([a-f0-9]{4}\)$/i, "");
      } catch { /* ignore */ }
      this.showToast("info", "Device name saved.");
    });

    this.elements.syncDiagRefreshBtn?.addEventListener("click", () => {
      this.renderSyncDiagnostics();
    });

    this.elements.syncDiagCopyBtn?.addEventListener("click", () => {
      const entries = this._readOpLog();
      navigator.clipboard?.writeText(JSON.stringify(entries, null, 2))
        .then(() => this.showToast("info", "Sync log copied to clipboard."))
        .catch(() => this.showToast("error", "Could not copy to clipboard."));
    });

    this.elements.syncDiagClearBtn?.addEventListener("click", () => {
      try { localStorage.removeItem("nextflow-op-log"); } catch { /* ignore */ }
      this.renderSyncDiagnostics();
      this.showToast("info", "Sync log cleared.");
    });

    this.taskManager.addEventListener("statechange", () => {
      this.renderAll();

      // Refresh project flyout if open
      if (this.isProjectFlyoutOpen && this.currentProjectFlyoutId) {
        const latestProject = this.getProjectCache().find((p) => p.id === this.currentProjectFlyoutId);
        if (latestProject) {
          this.renderProjectFlyout(latestProject);
        } else {
          this.closeProjectFlyout();
        }
      }

      if (!this.isFlyoutOpen || !this.currentFlyoutTaskId) return;
      if (this.flyoutContext?.readOnly) {
        const latestArchived = this.taskManager.getCompletedTaskById(this.currentFlyoutTaskId, { includeDeleted: true });
        if (!latestArchived) {
          this.closeTaskFlyout();
          return;
        }
        this.flyoutContext.entry = latestArchived;
        this.renderTaskFlyout(latestArchived, { readOnly: true, entry: latestArchived });
        return;
      }
      const latest = this.taskManager.getTaskById(this.currentFlyoutTaskId);
      if (latest) {
        this.renderTaskFlyout(latest);
      } else {
        this.closeTaskFlyout();
      }
    });

    this.taskManager.addEventListener("toast", (event) => {
      this.showToast(event.detail.level, event.detail.message, {
        action: event.detail.action,
        actions: event.detail.actions,
      });
    });

    this.taskManager.addEventListener("connection", (event) => {
      this.updateConnectionIndicator(event.detail.status);
      if (event.detail.status === "online") {
        this.updateSyncButtonTitle();
        this._flushFeedbackQueue();
      }
    });

    this.taskManager.addEventListener("syncconflict", (event) => {
      const { remoteDevice, summary } = event.detail;
      this._lastConflictSummary = summary || null;
      this.showToast("warn", `Merged with ${remoteDevice}.`, {
        action: { label: "Review", onClick: () => this.showConflictModal() },
      });
    });

    this.taskManager.addEventListener("versionchange", () => {
      this.showUpdateBanner();
      this.updateFooterVersion();
    });
  }

  setupSummaryTabs() {
    this.panelButtons = Array.from(document.querySelectorAll("[data-panel-target]"));
    this.panels = Array.from(document.querySelectorAll(".workspace [data-panel]"));
    if (!this.panelButtons.length || !this.panels.length) return;

    this.panelButtons.forEach((button, index) => {
      button.addEventListener("click", () => {
        this.setActivePanel(button.dataset.panelTarget, { focus: false });
      });
      button.addEventListener("keydown", (event) => {
        if (["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)) {
          event.preventDefault();
          const increment = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
          const nextIndex = (index + increment + this.panelButtons.length) % this.panelButtons.length;
          const nextButton = this.panelButtons[nextIndex];
          nextButton.focus();
          this.setActivePanel(nextButton.dataset.panelTarget, { focus: false });
        }
      });
      if (button.dataset.statusTarget) {
        this.attachDropzone(button, button.dataset.statusTarget);
      }
    });

    this.setActivePanel(this.activePanel, { focus: false });
  }

  _renderPanelIfDirty(panelId) {
    if (!this._dirtyPanels.has(panelId)) return;
    const method = PANEL_RENDER_FNS[panelId];
    if (method) this[method]();
    this._dirtyPanels.delete(panelId);
  }

  setActivePanel(panelName, { focus = false } = {}) {
    if (!panelName) return;
    if (panelName === "backlog" && !this.isAdmin) panelName = "inbox";
    if (!this.panels?.some((panel) => panel.dataset.panel === panelName)) {
      panelName = "inbox";
    }
    if (this.activePanel !== panelName) this.nextGroupExpansions.clear();
    this.activePanel = panelName;
    storeActivePanel(panelName);
    this.applyPanelVisibility();
    window.scrollTo({ top: 0, behavior: "instant" });
    // Backlog always re-fetches on activation (feedback lives outside state)
    if (panelName === "backlog") this._dirtyPanels.add("backlog");
    this._renderPanelIfDirty(panelName);
    if (panelName === "settings") {
      this.renderSyncDiagnostics();
    }
    if (panelName === "statistics" || panelName === "reports") {
      this.taskManager.ensureCompletedLoaded().then(() => {
        // Re-render the panel once the completion data arrives, but only if still active.
        if (this.activePanel === panelName) {
          const method = PANEL_RENDER_FNS[panelName];
          if (method) this[method]();
          this.updateActivePanelMeta();
        }
      });
    }
    if (focus) {
      const activeButton = this.panelButtons?.find((btn) => btn.dataset.panelTarget === panelName);
      activeButton?.focus();
    }
  }

  applyPanelVisibility() {
    if (!this.panelButtons || !this.panels) return;
    this.panelButtons.forEach((button) => {
      const isActive = button.dataset.panelTarget === this.activePanel;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
      button.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    this.panels.forEach((panel) => {
      const isActive = panel.dataset.panel === this.activePanel;
      panel.classList.toggle("is-active", isActive);
      if (isActive) {
        panel.removeAttribute("hidden");
      } else {
        panel.setAttribute("hidden", "");
      }
    });
    this.updateActivePanelMeta();
    this.updateToolbarContext();
  }

  updateToolbarContext() {
    const {
      workspaceToolbar,
      toolbarSearchSection,
      toolbarTaskPickerSection,
      toolbarActionsSection,
      toolbarActionsTitle,
      toolbarActionsNote,
      nextProjectFanoutControl,
      nextHideScheduledControl,
      nextGroupBySelect,
      nextGroupByLabel,
      nextGroupLimitInput,
      nextGroupLimitLabel,
      clearFilters,
      projectCompletedTasksControl,
      kanbanGroupBySelect,
      kanbanGroupByLabel,
    } = this.elements;
    const panel = this.activePanel;
    const taskPanels = new Set(["inbox", "my-day", "next", "kanban", "waiting", "someday", "projects", "calendar", "all-active"]);
    const supportsSearch = taskPanels.has(panel);
    const supportsTaskPicker = panel === "next";
    const supportsNextFanout = panel === "next";
    const supportsKanbanGroupBy = panel === "kanban";
    const supportsExpandProjects = panel === "projects";
    const supportsClearFilters = taskPanels.has(panel);

    if (toolbarSearchSection) {
      toolbarSearchSection.hidden = !supportsSearch;
    }
    if (toolbarTaskPickerSection) {
      toolbarTaskPickerSection.hidden = !supportsTaskPicker;
    }
    if (nextProjectFanoutControl) {
      nextProjectFanoutControl.hidden = !supportsNextFanout;
    }
    if (nextHideScheduledControl) {
      nextHideScheduledControl.hidden = !supportsNextFanout;
    }
    if (nextGroupBySelect) {
      nextGroupBySelect.hidden = !supportsNextFanout;
    }
    if (nextGroupByLabel) {
      nextGroupByLabel.hidden = !supportsNextFanout;
    }
    if (nextGroupLimitInput) {
      nextGroupLimitInput.hidden = !supportsNextFanout;
    }
    if (nextGroupLimitLabel) {
      nextGroupLimitLabel.hidden = !supportsNextFanout;
    }
    if (kanbanGroupBySelect) {
      kanbanGroupBySelect.hidden = !supportsKanbanGroupBy;
    }
    if (kanbanGroupByLabel) {
      kanbanGroupByLabel.hidden = !supportsKanbanGroupBy;
    }
    if (projectCompletedTasksControl) {
      projectCompletedTasksControl.hidden = !supportsExpandProjects;
    }
    if (clearFilters) {
      clearFilters.hidden = !supportsClearFilters;
    }

    const hasActions =
      Boolean(nextProjectFanoutControl && !nextProjectFanoutControl.hidden) ||
      Boolean(nextHideScheduledControl && !nextHideScheduledControl.hidden) ||
      Boolean(kanbanGroupBySelect && !kanbanGroupBySelect.hidden) ||
      Boolean(clearFilters && !clearFilters.hidden) ||
      Boolean(expandProjects && !expandProjects.hidden) ||
      Boolean(projectCompletedTasksControl && !projectCompletedTasksControl.hidden);

    if (toolbarActionsSection) {
      toolbarActionsSection.hidden = !hasActions;
    }

    if (toolbarActionsTitle && toolbarActionsNote) {
      if (supportsNextFanout) {
        toolbarActionsTitle.textContent = "Pending Tasks Controls";
        toolbarActionsNote.textContent = "Tune how pending tasks are grouped and filtered.";
      } else if (supportsKanbanGroupBy) {
        toolbarActionsTitle.textContent = "Kanban Controls";
        toolbarActionsNote.textContent = "Choose how tasks are grouped into swimlanes.";
      } else if (supportsExpandProjects) {
        toolbarActionsTitle.textContent = "Project Controls";
        toolbarActionsNote.textContent = "Expand projects and reset project filters quickly.";
      } else {
        toolbarActionsTitle.textContent = "Panel Controls";
        toolbarActionsNote.textContent = "Reset filters for this view.";
      }
    }

    if (workspaceToolbar) {
      const showToolbar =
        Boolean(toolbarSearchSection && !toolbarSearchSection.hidden) ||
        Boolean(toolbarTaskPickerSection && !toolbarTaskPickerSection.hidden) ||
        Boolean(toolbarActionsSection && !toolbarActionsSection.hidden);
      workspaceToolbar.hidden = !showToolbar;
      if (!workspaceToolbar.hidden) {
        if (supportsTaskPicker) {
          workspaceToolbar.dataset.toolbarMode = "next";
        } else if (supportsExpandProjects) {
          workspaceToolbar.dataset.toolbarMode = "projects";
        } else {
          workspaceToolbar.dataset.toolbarMode = "list";
        }
      } else {
        delete workspaceToolbar.dataset.toolbarMode;
      }
    }
  }

  updateActivePanelMeta() {
    const heading = this.elements.activePanelHeading;
    const count = this.elements.activePanelCount;
    if (!heading || !count) return;
    heading.textContent = this.getPanelLabel(this.activePanel);
    count.textContent = this.getPanelCountText(this.activePanel);
  }

  getPanelLabel(panel) {
    if (STATUS_LABELS[panel]) return STATUS_LABELS[panel];
    if (panel === "my-day") return "My Day";
    if (panel === "kanban") return "Kanban";
    if (panel === "projects") return "Active Projects";
    if (panel === "calendar") return "Calendar";
    if (panel === "reports") return "Complete";
    if (panel === "statistics") return "Statistics";
    if (panel === "settings") return "Settings";
    return "Overview";
  }

  getPanelCountText(panel) {
    const summary = this.summaryCache || this.taskManager.getSummary();
    if (panel === "my-day") {
      const myDayTasks = this.getMyDayTasks({ applyFilters: false });
      const pastScheduled = this.getPastScheduledIncompleteTasks({ applyFilters: true }).length;
      if (!pastScheduled) {
        return `${myDayTasks.length} selected today`;
      }
      return `${myDayTasks.length} today • ${pastScheduled} past scheduled`;
    }
    if (panel === "projects") {
      return `${summary.projects} active projects`;
    }
    if (panel === "kanban") {
      const activeKanban = this.taskManager
        .getTasks(this.buildTaskFilters())
        .filter((task) => [STATUS.INBOX, STATUS.NEXT, STATUS.DOING, STATUS.WAITING].includes(task.status)).length;
      return `${activeKanban} cards`;
    }
    if (panel === "calendar") {
      const entries = this.taskManager.getCalendarEntries({
        exactDate: this.filters.date || undefined,
        includeCompleted: this.calendarShowCompleted,
      });
      return `${entries.length} scheduled`;
    }
    if (panel === "reports") {
      const completed = this.taskManager.getCompletedTasks().length;
      return `${completed} completed`;
    }
    if (panel === "statistics") {
      const active = this.taskManager.getTasks({ includeCompleted: false }).length;
      const completed = this.taskManager.getCompletedTasks().length;
      return `${active} active • ${completed} completed`;
    }
    if (panel === "settings") {
      const totalSettings =
        THEME_OPTIONS.length +
        this.taskManager.getContexts().length +
        this.taskManager.getPeopleTags().length +
        this.taskManager.getAreasOfFocus().length +
        Object.keys(this.taskManager.getFeatureFlags()).length;
      return `${totalSettings} values`;
    }
    switch (panel) {
      case STATUS.INBOX:
        return `${summary.inbox} items`;
      case STATUS.NEXT:
        return `${summary.next} items`;
      case STATUS.WAITING:
        return `${summary.waiting} items`;
      case STATUS.DOING:
        return `${summary.doing} items`;
      case STATUS.SOMEDAY:
        return `${summary.someday} items`;
      default:
        return "";
    }
  }

  renderAll() {
    this.draggingTaskId = null;
    this.closeTaskContextMenu();
    this.closeTaskNoteContextMenu();
    this.closeCalendarDayContextMenu();
    this.projectCache = this.taskManager.getProjects({ includeSomeday: true });
    this.projectLookup = new Map(this.projectCache.map((project) => [project.id, project]));
    // Always-unconditional: summary bar, flyout, global UI state
    this.updateSuggestionLists();
    this.renderAreaScopeRow();
    this.renderSummary();
    this.renderDoingBar();
    this.renderAssociationFlyout();
    this.applySearchVisibility();
    this.updateCounts();
    this.syncTheme(this.taskManager.getTheme());
    this.updateFooterVersion();
    this.applyPanelVisibility();
    // Mark all panels dirty; only render the visible one now.
    // Hidden panels render on-demand when the user switches to them.
    Object.keys(PANEL_RENDER_FNS).forEach((id) => this._dirtyPanels.add(id));
    this._renderPanelIfDirty(this.activePanel);
  }

  setupAreaScope() {
    const { areaScopeRow } = this.elements;
    if (!areaScopeRow) return;
    areaScopeRow.addEventListener("click", (event) => {
      const pill = event.target.closest(".area-scope-pill");
      if (!pill) return;
      const area = pill.dataset.area || null;
      this.activeArea = area;
      storeActiveAreaPreference(area);
      this.renderAll();
    });
  }

  renderAreaScopeRow() {
    const { areaScopeRow } = this.elements;
    if (!areaScopeRow) return;
    const areas = this.taskManager.getAreasOfFocus();
    areaScopeRow.innerHTML = "";

    const makePill = (label, areaValue) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "area-scope-pill";
      btn.textContent = label;
      btn.dataset.area = areaValue || "";
      if (this.activeArea === areaValue) btn.classList.add("is-active");
      return btn;
    };

    areaScopeRow.append(makePill("All", null));
    areas.forEach((area) => areaScopeRow.append(makePill(area, area)));
  }

  applySearchVisibility() {
    const { searchTasks } = this.elements;
    if (searchTasks) {
      searchTasks.value = this.filters.search || "";
    }
  }

  clearSearch() {
    const { searchTasks } = this.elements;
    if (searchTasks) {
      searchTasks.value = "";
      searchTasks.focus();
    }
    this.filters.search = "";
    this.renderAll();
  }

  updateSuggestionLists() {
    const {
      contextSuggestions,
      effortSuggestions,
      timeSuggestions,
      projectAreaSuggestions,
      projectThemeSuggestions,
      projectStatusSuggestions,
    } = this.elements;
    const allTasks = this.taskManager.getTasks({ includeCompleted: true });
    const archiveEntries = [
      ...(this.taskManager.state?.reference || []),
      ...(this.taskManager.state?.completionLog || []),
    ];
    const contexts = new Set(this.taskManager.getContexts());
    const energies = new Set([...EFFORT_LEVELS]);
    const times = new Set([...TIME_REQUIREMENTS]);
    allTasks.forEach((task) => {
      (task.contexts || []).forEach((c) => contexts.add(c));
      if (task.effortLevel) energies.add(task.effortLevel);
      if (task.timeRequired) times.add(task.timeRequired);
    });
    archiveEntries.forEach((entry) => {
      (entry.contexts || []).forEach((c) => contexts.add(c));
      if (entry.effortLevel) energies.add(entry.effortLevel);
      if (entry.timeRequired) times.add(entry.timeRequired);
    });
    fillDatalist(contextSuggestions, Array.from(contexts));
    fillDatalist(effortSuggestions, Array.from(energies));
    fillDatalist(timeSuggestions, Array.from(times));

    const areas = new Set(this.taskManager.getAreasOfFocus());
    const themes = new Set([...PROJECT_THEMES]);
    const statuses = new Set([...PROJECT_STATUSES]);
    (this.projectCache || []).forEach((project) => {
      if (project.areaOfFocus) areas.add(project.areaOfFocus);
      if (project.themeTag) themes.add(project.themeTag);
      if (project.statusTag) statuses.add(project.statusTag);
    });
    fillDatalist(projectAreaSuggestions, Array.from(areas));
    fillDatalist(projectThemeSuggestions, Array.from(themes));
    fillDatalist(projectStatusSuggestions, Array.from(statuses));
  }

  renderDoingBar() {
    const { doingBar } = this.elements;
    if (!doingBar) return;
    const doingTasks = this.taskManager.getTasks({ status: STATUS.DOING });
    if (!doingTasks.length) {
      doingBar.hidden = true;
      doingBar.innerHTML = "";
      document.body.classList.remove("doing-bar-visible");
      return;
    }
    doingBar.hidden = false;
    document.body.classList.add("doing-bar-visible");
    const label = document.createElement("span");
    label.className = "doing-bar-label";
    label.textContent = "Doing";
    const fragment = document.createDocumentFragment();
    fragment.append(label);
    for (const task of doingTasks) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "doing-chip";
      chip.dataset.taskId = task.id;
      chip.dataset.startedAt = task.doingStartedAt || "";
      chip.dataset.baseSecs = String(task.totalDoingSeconds || 0);
      chip.addEventListener("click", () => this.openTaskFlyout(task.id));
      const titleEl = document.createElement("span");
      titleEl.className = "doing-chip-title";
      titleEl.textContent = task.title;
      const timerEl = document.createElement("span");
      timerEl.className = "doing-chip-timer";
      timerEl.textContent = this._formatDoingElapsed(task.doingStartedAt, task.totalDoingSeconds || 0);
      chip.append(titleEl, timerEl);
      fragment.append(chip);
    }
    doingBar.innerHTML = "";
    doingBar.append(fragment);
  }

  _formatDoingElapsed(startedAt, baseSecs = 0) {
    const sessionSecs = startedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
      : 0;
    const total = baseSecs + sessionSecs;
    if (total === 0 && !startedAt) return "—";
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  _tickDoingTimers() {
    const { doingBar } = this.elements;
    if (!doingBar || doingBar.hidden) return;
    doingBar.querySelectorAll(".doing-chip").forEach((chip) => {
      const timerEl = chip.querySelector(".doing-chip-timer");
      if (timerEl) {
        timerEl.textContent = this._formatDoingElapsed(
          chip.dataset.startedAt || "",
          parseInt(chip.dataset.baseSecs, 10) || 0,
        );
      }
    });
  }

  startDoingBarTimer() {
    window.setInterval(() => this._tickDoingTimers(), 1000);
  }

  renderSummary() {
    const summary = this.taskManager.getSummary();
    const taskFilters = this.buildTaskFilters();
    const filteredTasks = this.taskManager.getTasks(taskFilters);
    const calendarTotal = this.taskManager.getCalendarEntries({ filters: taskFilters }).length;
    const currentYear = new Date().getFullYear();
    const completedThisYear = this.taskManager.getCompletedTasks({ year: currentYear }).length;
    const {
      summaryInbox,
      summaryNext,
      summaryDoing,
      summaryMyDay,
      summaryKanban,
      summaryWaiting,
      summarySomeday,
      summaryProjects,
      summaryCalendar,
      summaryCompleted,
      summaryStatistics,
      summaryAllActive,
    } = this.elements;
    summaryInbox.textContent = summary.inbox;
    summaryNext.textContent = summary.next;
    if (summaryDoing) summaryDoing.textContent = summary.doing;
    if (summaryMyDay) {
      summaryMyDay.textContent = this.getMyDayTasks({ applyFilters: false }).length;
    }
    if (summaryKanban) {
      const kanbanCount = filteredTasks
        .filter((task) => [STATUS.INBOX, STATUS.NEXT, STATUS.DOING, STATUS.WAITING].includes(task.status)).length;
      summaryKanban.textContent = kanbanCount;
    }
    summaryWaiting.textContent = summary.waiting;
    summarySomeday.textContent = summary.someday;
    summaryProjects.textContent = summary.projects;
    summaryCalendar.textContent = calendarTotal;
    if (summaryCompleted) {
      summaryCompleted.textContent = completedThisYear;
    }
    if (summaryStatistics) {
      const completedAll = this.taskManager.getCompletedTasks().length;
      summaryStatistics.textContent = summary.next + summary.waiting + summary.projects + completedAll;
    }
    if (summaryAllActive) {
      summaryAllActive.textContent = filteredTasks.length;
    }
  }


  updateFilterSelection(key, value, checked) {
    const current = Array.isArray(this.filters[key]) ? [...this.filters[key]] : [this.filters[key]];
    const selections = new Set(current);
    if (value === "all") {
      if (checked || selections.size === 0 || selections.has("all")) {
        this.filters[key] = ["all"];
      }
      return;
    }
    selections.delete("all");
    if (checked) {
      selections.add(value);
    } else {
      selections.delete(value);
    }
    if (!selections.size) {
      selections.add("all");
    }
    this.filters[key] = Array.from(selections);
  }

  isFilterValueSelected(key, value) {
    const selections = Array.isArray(this.filters[key]) ? this.filters[key] : [this.filters[key]];
    if (value === "all") {
      return selections.includes("all") || !selections.length;
    }
    if (selections.includes("all")) {
      return false;
    }
    return selections.includes(value);
  }

  setupAssociationFlyout() {
    const toggle = this.elements.associationFlyoutToggle;
    const panel = this.elements.associationFlyoutPanel;
    if (!toggle || !panel) return;

    toggle.addEventListener("click", () => {
      this.associationFlyoutOpen = !this.associationFlyoutOpen;
      this.applyAssociationFlyoutState();
    });

    document.addEventListener("click", (event) => {
      if (!this.associationFlyoutOpen) return;
      if (this.elements.associationFlyout?.contains(event.target)) return;
      this.associationFlyoutOpen = false;
      this.applyAssociationFlyoutState();
    });

    document.addEventListener("click", (event) => {
      document.querySelectorAll("details.multi-select[open]").forEach((details) => {
        if (!details.contains(event.target)) {
          details.open = false;
        }
      });
    });

    panel.addEventListener("change", (event) => {
      const checkbox = event.target.closest("input[data-association-filter-key][data-association-filter-value]");
      if (!checkbox) return;
      const key = checkbox.dataset.associationFilterKey;
      const value = checkbox.dataset.associationFilterValue;
      if (!key || value === undefined) return;
      this.updateFilterSelection(key, value, checkbox.checked);
      this.renderAll();
    });

    this.elements.associationFlyoutClear?.addEventListener("click", () => {
      this.filters.context = ["all"];
      this.filters.project = ["all"];
      this.filters.person = ["all"];
      this.filters.waiting = ["all"];
      this.filters.effort = ["all"];
      this.filters.time = ["all"];
      this.renderAll();
    });

    this.applyAssociationFlyoutState();
  }

  setupBackNavigation() {
    // Replace any stale layer state from a previous session with a clean base marker
    // so hardware-back works correctly from the first interaction.
    if (history.state?.nextflowLayer) {
      history.replaceState({ nextflowBase: true }, "");
    }

    window.addEventListener("popstate", () => {
      // If we triggered this pop ourselves (closing a layer via UI), skip.
      if (this._historyNavPending) {
        this._historyNavPending = false;
        return;
      }
      // Hardware back button: close the topmost visible layer.
      const clarifyModal = this.elements.clarifyModal;
      if (clarifyModal?.classList.contains("is-open")) {
        this.closeClarifyModal({ fromPopstate: true });
      } else if (this.isProjectFlyoutOpen) {
        this.closeProjectFlyout({ fromPopstate: true });
      } else if (this.isFlyoutOpen) {
        this.closeTaskFlyout({ fromPopstate: true });
      } else if (this.associationFlyoutOpen) {
        this.associationFlyoutOpen = false;
        this.applyAssociationFlyoutState({ fromPopstate: true });
      }
    });
  }

  applyAssociationFlyoutState({ fromPopstate = false } = {}) {
    const wrapper = this.elements.associationFlyout;
    const toggle = this.elements.associationFlyoutToggle;
    const glyph = this.elements.associationFlyoutToggleGlyph;
    if (!wrapper || !toggle) return;
    wrapper.classList.toggle("is-open", this.associationFlyoutOpen);
    toggle.setAttribute("aria-expanded", this.associationFlyoutOpen ? "true" : "false");
    toggle.setAttribute(
      "aria-label",
      this.associationFlyoutOpen ? "Hide association filters" : "Show association filters"
    );
    if (glyph) {
      glyph.textContent = this.associationFlyoutOpen ? "◂" : "▸";
    }
    if (!fromPopstate) {
      if (this.associationFlyoutOpen) {
        history.pushState({ nextflowLayer: "association" }, "");
      } else if (history.state?.nextflowLayer === "association") {
        this._historyNavPending = true;
        history.back();
      }
    }
  }

  hasAssociationSelections() {
    return ["person", "context", "project"].some((key) => {
      const selections = Array.isArray(this.filters[key]) ? this.filters[key] : [this.filters[key]];
      return selections.length > 0 && !selections.includes("all");
    });
  }

  getFilterSelections(key) {
    const selections = Array.isArray(this.filters[key]) ? this.filters[key] : [this.filters[key]];
    return selections.filter((value) => value && value !== "all");
  }

  formatAssociationExpression() {
    const clauses = [];
    const people = this.getFilterSelections("person");
    if (people.length) clauses.push(`(${people.join(" OR ")})`);
    const contexts = this.getFilterSelections("context");
    if (contexts.length) clauses.push(`(${contexts.join(" OR ")})`);
    const projects = this.getFilterSelections("project").map((projectId) => {
      if (projectId === "none") return "No project";
      return this.projectLookup.get(projectId)?.name || "Unknown project";
    });
    if (projects.length) clauses.push(`(${projects.join(" OR ")})`);
    const waiting = this.getFilterSelections("waiting");
    if (waiting.length) clauses.push(`(${waiting.join(" OR ")})`);
    const effort = this.getFilterSelections("effort");
    if (effort.length) clauses.push(`(${effort.join(" OR ")})`);
    const time = this.getFilterSelections("time");
    if (time.length) clauses.push(`(${time.join(" OR ")})`);
    return clauses.length ? clauses.join(" AND ") : "All tasks";
  }

  renderAssociationFlyout() {
    const contextContainer = this.elements.associationContextOptions;
    const peopleContainer = this.elements.associationPeopleOptions;
    const projectContainer = this.elements.associationProjectOptions;
    const waitingContainer = this.elements.associationWaitingOptions;
    const effortContainer = this.elements.associationEffortOptions;
    const timeContainer = this.elements.associationTimeOptions;
    if (!contextContainer || !peopleContainer || !projectContainer) return;

    const contexts = this.taskManager
      .getContexts({ areaLens: this.activeArea })
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: value.startsWith("@") ? value.slice(1) : value }));
    const people = this.taskManager
      .getPeopleTags({ areaLens: this.activeArea })
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: value.startsWith("+") ? value.slice(1) : value }));
    const projects = [
      { value: "none", label: "No project" },
      ...(this.projectCache || [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((project) => ({
          value: project.id,
          label: project.name + (project.someday ? " (Backburner)" : ""),
        })),
    ];

    const allTasks = this.taskManager.getTasks({ includeCompleted: true });
    const waitingOn = new Set();
    const effortLevels = new Set([...EFFORT_LEVELS]);
    const timeEstimates = new Set([...TIME_REQUIREMENTS]);
    allTasks.forEach((task) => {
      if (task.waitingFor) waitingOn.add(task.waitingFor);
      if (task.effortLevel) effortLevels.add(task.effortLevel);
      if (task.timeRequired) timeEstimates.add(task.timeRequired);
    });
    const waiting = Array.from(waitingOn).filter(Boolean).sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
    const effort = Array.from(effortLevels).filter(Boolean).sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
    const time = Array.from(timeEstimates).filter(Boolean).sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));

    this.renderAssociationFlyoutGroup("person", peopleContainer, people, "No people tags yet.");
    this.renderAssociationFlyoutGroup("context", contextContainer, contexts, "No contexts yet.");
    this.renderAssociationFlyoutGroup("project", projectContainer, projects, "No projects yet.");
    this.renderAssociationFlyoutGroup("waiting", waitingContainer, waiting, "No waiting items.");
    this.renderAssociationFlyoutGroup("effort", effortContainer, effort, "No effort levels used.");
    this.renderAssociationFlyoutGroup("time", timeContainer, time, "No time estimates used.");

    if (this.elements.associationFlyoutSummary) {
      this.elements.associationFlyoutSummary.textContent = this.formatAssociationExpression();
    }
    this.applyAssociationFlyoutState();
  }

  renderAssociationFlyoutGroup(key, container, options, emptyMessage) {
    if (!container) return;
    container.innerHTML = "";
    if (!options.length) {
      const empty = document.createElement("p");
      empty.className = "association-flyout-empty";
      empty.textContent = emptyMessage;
      container.append(empty);
      return;
    }
    options.forEach((option, index) => {
      const idSafe = option.value.toString().replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "option";
      const id = `association-${key}-${idSafe}-${index}`;
      const label = document.createElement("label");
      label.setAttribute("for", id);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = id;
      checkbox.value = option.value;
      checkbox.dataset.associationFilterKey = key;
      checkbox.dataset.associationFilterValue = option.value;
      checkbox.checked = this.isFilterValueSelected(key, option.value);
      const text = document.createElement("span");
      text.textContent = option.label;
      label.append(checkbox, text);
      container.append(label);
    });
  }

  extractEntityMentionTokens(rawText) {
    const source = typeof rawText === "string" ? rawText : "";
    if (!source) return [];
    const matches = [];
    const tokenRegex = /(?:^|[\s([{,;])([@#+][A-Za-z0-9][A-Za-z0-9_-]*)/g;
    let match = tokenRegex.exec(source);
    while (match) {
      matches.push(match[1]);
      match = tokenRegex.exec(source);
    }
    const seen = new Set();
    return matches.filter((token) => {
      const key = token.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  formatProjectNameFromMentionToken(token) {
    if (typeof token !== "string" || !token.startsWith("#")) return "";
    const raw = token.slice(1).replace(/[_-]+/g, " ").trim();
    if (!raw) return "";
    return raw.replace(/\s+/g, " ");
  }

  async ensureMentionedEntitiesExist(rawText) {
    const tokens = this.extractEntityMentionTokens(rawText);
    if (!tokens.length) return;

    const contextSet = new Set(this.taskManager.getContexts().map((value) => value.toLowerCase()));
    const peopleSet = new Set(
      this.taskManager.getPeopleTags({ includeNoteMentions: false }).map((value) => value.toLowerCase())
    );
    let addedContexts = 0;
    let addedPeople = 0;

    for (const token of tokens) {
      if (token.startsWith("+")) {
        const key = token.toLowerCase();
        if (peopleSet.has(key)) continue;
        const confirmed = await this.showConfirm(`Create people tag "${token}" from this note mention?`, { okLabel: "Create tag" });
        if (!confirmed) continue;
        const added = this.taskManager.addPeopleTagOption(token, { notify: false });
        if (!added) continue;
        peopleSet.add(added.toLowerCase());
        addedPeople += 1;
        continue;
      }

      if (token.startsWith("@")) {
        const key = token.toLowerCase();
        if (contextSet.has(key)) continue;
        const confirmed = await this.showConfirm(`Create context "${token}" from this note mention?`, { okLabel: "Create context" });
        if (!confirmed) continue;
        const added = this.taskManager.addContextOption(token, { notify: false });
        if (!added) continue;
        contextSet.add(added.toLowerCase());
        addedContexts += 1;
        continue;
      }

      if (token.startsWith("#")) {
        const key = this.normalizeProjectTagKey(token.slice(1));
        if (!key) continue;
        if (this.findProjectByTagKey(key)) continue;
        const suggestedName = this.formatProjectNameFromMentionToken(token);
        if (!suggestedName) continue;
        const confirmed = await this.showConfirm(`Create project "${suggestedName}" from note mention?`, { okLabel: "Create project" });
        if (!confirmed) continue;
        this.taskManager.addProject(suggestedName);
      }
    }

    const messages = [];
    if (addedPeople) {
      messages.push(`added ${addedPeople} people tag${addedPeople === 1 ? "" : "s"}`);
    }
    if (addedContexts) {
      messages.push(`added ${addedContexts} context${addedContexts === 1 ? "" : "s"}`);
    }
    if (messages.length) {
      this.taskManager.notify("info", `Mention sync: ${messages.join(" and ")}.`);
    }
  }

  buildTaskFilters(overrides = {}) {
    return {
      context: overrides.context ?? this.filters.context,
      projectId: overrides.projectId ?? this.filters.project,
      person: overrides.person ?? this.filters.person,
      waitingFor: overrides.waitingFor ?? this.filters.waiting,
      effort: overrides.effort ?? this.filters.effort,
      time: overrides.time ?? this.filters.time,
      searchTerm: overrides.searchTerm ?? this.filters.search,
      areaLens: overrides.areaLens ?? this.activeArea,
    };
  }

  sortTasks(tasks) {
    const sorted = [...tasks];
    const blockedIds = new Set(sorted.filter((t) => this.taskManager.isBlocked(t.id)).map((t) => t.id));
    const blockedLast = (a, b) => (blockedIds.has(a.id) ? 1 : 0) - (blockedIds.has(b.id) ? 1 : 0);
    switch (this.taskSort) {
      case "updated-asc":
        return sorted.sort((a, b) => blockedLast(a, b) || (a.updatedAt || "").localeCompare(b.updatedAt || ""));
      case "updated-desc":
        return sorted.sort((a, b) => blockedLast(a, b) || (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      case "title-asc":
        return sorted.sort((a, b) => blockedLast(a, b) || (a.title || "").localeCompare(b.title || ""));
      case "title-desc":
        return sorted.sort((a, b) => blockedLast(a, b) || (b.title || "").localeCompare(a.title || ""));
      case "due-asc":
        return sorted.sort((a, b) => {
          const bl = blockedLast(a, b);
          if (bl !== 0) return bl;
          const da = a.dueDate || a.calendarDate || "9999";
          const db = b.dueDate || b.calendarDate || "9999";
          return da.localeCompare(db);
        });
      case "stale-first":
        return sorted.sort((a, b) => blockedLast(a, b) || (a.updatedAt || "").localeCompare(b.updatedAt || ""));
      default: {
        const todayIso = new Date().toISOString().slice(0, 10);
        const taskRiskScore = (task) => {
          const overdue = (task.dueDate && task.dueDate < todayIso) || (task.followUpDate && task.followUpDate < todayIso);
          if (overdue) return 3;
          if (task.dueDate || task.followUpDate) return 2;
          if (task.updatedAt) return 1;
          return 0;
        };
        return sorted.sort((a, b) => {
          const bl = blockedLast(a, b);
          if (bl !== 0) return bl;
          const sa = taskRiskScore(a), sb = taskRiskScore(b);
          if (sa !== sb) return sb - sa;
          // stale tier: oldest-touched first
          if (sa === 1) return (a.updatedAt || "").localeCompare(b.updatedAt || "");
          return (a.title || "").localeCompare(b.title || "");
        });
      }
    }
  }

  getMyDayTasks({ applyFilters = true } = {}) {
    const filters = applyFilters ? this.buildTaskFilters() : {};
    const todayKey = this.getTodayDateKey();
    return this.taskManager
      .getTasks({
        ...filters,
        includeCompleted: false,
      })
      .filter((task) => task.myDayDate === todayKey);
  }

  getPastScheduledIncompleteTasks({ applyFilters = true } = {}) {
    const filters = applyFilters ? this.buildTaskFilters() : {};
    const todayKey = this.getTodayDateKey();
    return this.taskManager
      .getTasks({
        ...filters,
        includeCompleted: false,
      })
      .filter((task) => this.isTaskScheduledInPast(task, todayKey))
      .sort((a, b) => {
        const dateA = a.calendarDate || a.myDayDate || "";
        const dateB = b.calendarDate || b.myDayDate || "";
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB);
        }
        return (a.title || "").localeCompare(b.title || "");
      });
  }

  isTaskScheduledInPast(task, todayKey = this.getTodayDateKey()) {
    if (task?.calendarDate && task.calendarDate < todayKey) return true;
    if (task?.myDayDate && task.myDayDate < todayKey) return true;
    return false;
  }

  isTaskInMyDay(task) {
    return Boolean(task?.myDayDate && task.myDayDate === this.getTodayDateKey());
  }

  toggleTaskMyDay(task) {
    if (!task?.id) return;
    const inMyDay = this.isTaskInMyDay(task);
    const todayKey = this.getTodayDateKey();
    const updates = inMyDay
      ? { myDayDate: null, calendarDate: null, calendarTime: null }
      : {
          myDayDate: todayKey,
          // Adding to My Day also schedules it for today on the calendar.
          calendarDate: todayKey,
        };
    const updated = this.taskManager.updateTask(task.id, updates);
    if (!updated) return;
    if (inMyDay) {
      this.taskManager.notify("info", `Removed "${task.title}" from My Day.`);
    } else {
      this.taskManager.notify("info", `Added "${task.title}" to My Day and scheduled it for today.`);
    }
  }

  buildNextActionsGroups(tasks, groupBy) {
    if (groupBy === "context") {
      const contexts = this.taskManager.getContexts({ areaLens: this.activeArea });
      const byContext = new Map(contexts.map((c) => [c, []]));
      const noContext = [];
      tasks.forEach((task) => {
        if (!task.contexts?.length) { noContext.push(task); return; }
        task.contexts.forEach((c) => { if (byContext.has(c)) byContext.get(c).push(task); });
      });
      if (noContext.length && !contexts.includes("No context")) contexts.push("No context");
      return contexts
        .map((context) => ({
          key: context,
          label: stripTagPrefix(context),
          tasks: context === "No context" ? noContext : (byContext.get(context) || []),
        }))
        .filter((g) => g.tasks.length);
    }

    if (groupBy === "project") {
      const byProject = new Map();
      const noProject = [];
      tasks.forEach((task) => {
        if (!task.projectId) { noProject.push(task); return; }
        if (!byProject.has(task.projectId)) byProject.set(task.projectId, []);
        byProject.get(task.projectId).push(task);
      });
      const groups = Array.from(byProject.entries())
        .map(([id, t]) => ({ key: id, label: this.getProjectName(id) || "Unknown project", tasks: t }))
        .sort((a, b) => a.label.localeCompare(b.label));
      if (noProject.length) groups.push({ key: "no-project", label: "No project", tasks: noProject });
      return groups;
    }

    if (groupBy === "area") {
      const byArea = new Map();
      tasks.forEach((task) => {
        const area = this.getTaskAreaOfFocus(task);
        if (!byArea.has(area)) byArea.set(area, []);
        byArea.get(area).push(task);
      });
      return Array.from(byArea.entries())
        .map(([key, t]) => ({ key, label: key, tasks: t }))
        .sort((a, b) => {
          if (a.key === "No Area") return 1;
          if (b.key === "No Area") return -1;
          return a.label.localeCompare(b.label);
        });
    }

    if (groupBy === "effort") {
      const order = ["low", "medium", "high"];
      const labels = { low: "Low effort", medium: "Medium effort", high: "High effort" };
      const byEffort = new Map(order.map((k) => [k, []]));
      const noEffort = [];
      tasks.forEach((task) => {
        if (task.effortLevel && byEffort.has(task.effortLevel)) byEffort.get(task.effortLevel).push(task);
        else noEffort.push(task);
      });
      const groups = order
        .filter((k) => byEffort.get(k).length)
        .map((k) => ({ key: k, label: labels[k], tasks: byEffort.get(k) }));
      if (noEffort.length) groups.push({ key: "no-effort", label: "No effort set", tasks: noEffort });
      return groups;
    }

    // "none" — flat
    return tasks.length ? [{ key: "all", label: "All pending tasks", tasks }] : [];
  }

  // ─── Project Flyout ─────────────────────────────���─────────────────────────

  openProjectFlyout(projectId) {
    const flyout = this.elements.projectFlyout;
    if (!flyout) return;
    const project = this.getProjectCache().find((p) => p.id === projectId);
    if (!project) return;
    const wasOpen = this.isProjectFlyoutOpen;
    this.currentProjectFlyoutId = projectId;
    this._flyoutNavList = Array.from(
      this.elements.projectList?.querySelectorAll("[data-project-id]") || []
    ).map((el) => el.dataset.projectId).filter(Boolean);
    this.renderProjectFlyout(project);
    flyout.classList.add("is-open");
    flyout.classList.add("is-top");
    this.elements.taskFlyout?.classList.remove("is-top");
    flyout.setAttribute("aria-hidden", "false");
    this.isProjectFlyoutOpen = true;
    if (!wasOpen) {
      history.pushState({ nextflowLayer: "projectFlyout" }, "");
      this._handleProjectFlyoutKeydown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          this.closeProjectFlyout();
        }
      };
      document.addEventListener("keydown", this._handleProjectFlyoutKeydown);
      this.elements.closeProjectFlyout?.focus();
    }
  }

  closeProjectFlyout({ fromPopstate = false } = {}) {
    const flyout = this.elements.projectFlyout;
    if (!flyout) return;
    const wasOpen = this.isProjectFlyoutOpen;
    flyout.classList.remove("is-open");
    flyout.setAttribute("aria-hidden", "true");
    this.isProjectFlyoutOpen = false;
    this.currentProjectFlyoutId = null;
    if (this._handleProjectFlyoutKeydown) {
      document.removeEventListener("keydown", this._handleProjectFlyoutKeydown);
      this._handleProjectFlyoutKeydown = null;
    }
    if (this.isFlyoutOpen) {
      this.elements.taskFlyout?.classList.add("is-top");
    }
    if (wasOpen && !fromPopstate && history.state?.nextflowLayer === "projectFlyout") {
      this._historyNavPending = true;
      history.back();
    }
  }

  renderProjectFlyout(project) {
    const titleEl = this.elements.projectFlyoutTitle;
    const chipsEl = this.elements.projectFlyoutChips;
    const content = this.elements.projectFlyoutContent;
    if (!content) return;

    if (titleEl) titleEl.textContent = project.name;

    if (titleEl && this._flyoutNavList?.length > 1) {
      const navList = this._flyoutNavList;
      const currentIdx = navList.indexOf(project.id);
      const prevId = currentIdx > 0 ? navList[currentIdx - 1] : null;
      const nextId = currentIdx < navList.length - 1 ? navList[currentIdx + 1] : null;

      titleEl.parentElement?.querySelector(".project-flyout-nav")?.remove();

      const makeNavBtn = (label, glyph, targetId) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "project-flyout-nav-btn";
        btn.setAttribute("aria-label", label);
        btn.textContent = glyph;
        btn.disabled = !targetId;
        if (targetId) {
          btn.addEventListener("click", () => {
            const target = (this.projectCache || []).find((p) => p.id === targetId);
            if (target) this.renderProjectFlyout(target);
          });
        }
        return btn;
      };

      const nav = document.createElement("div");
      nav.className = "project-flyout-nav";
      nav.setAttribute("aria-label", "Navigate projects");
      nav.append(
        makeNavBtn("Previous project", "‹", prevId),
        makeNavBtn("Next project", "›", nextId),
      );
      titleEl.insertAdjacentElement("afterend", nav);
    }

    // Header chips
    if (chipsEl) {
      chipsEl.innerHTML = "";
      const todayIso = new Date().toISOString().slice(0, 10);
      const deadlineOverdue = Boolean(project.deadline && project.deadline < todayIso);
      [
        project.areaOfFocus && `Area: ${project.areaOfFocus}`,
        project.themeTag && `Theme: ${project.themeTag}`,
        project.statusTag && `Status: ${project.statusTag}`,
        project.deadline && `Deadline: ${formatFriendlyDate(project.deadline)}`,
      ].forEach((text, idx) => {
        if (!text) return;
        const chip = document.createElement("span");
        const isDeadlineChip = idx === 3;
        if (isDeadlineChip && deadlineOverdue) {
          chip.className = "project-flyout-chip project-flyout-chip--overdue";
        } else if (isDeadlineChip) {
          chip.className = "project-flyout-chip project-flyout-chip--deadline";
        } else {
          chip.className = "project-flyout-chip";
        }
        chip.textContent = text;
        chipsEl.append(chip);
      });
    }

    content.innerHTML = "";

    const allTasks = this.taskManager.getTasks({ includeCompleted: false });
    const filteredTasks = allTasks.filter((t) => t.projectId === project.id);
    const projectTasks = filteredTasks.filter((t) =>
      project.someday ? t.status !== STATUS.SOMEDAY : true
    );

    // Desired outcome
    const outcome = document.createElement("div");
    outcome.className = "project-outcome";
    const outcomeLabel = document.createElement("span");
    outcomeLabel.className = "muted small-text project-outcome-label";
    outcomeLabel.textContent = "Desired outcome";
    const outcomeText = document.createElement("p");
    outcomeText.className = "project-outcome-text";
    outcomeText.textContent = project.vision || "Define what \u201cdone\u201d looks like for this project.";
    outcome.append(outcomeLabel, outcomeText);
    content.append(outcome);

    // Notes section (collapsible) — shown right after outcome, before task list
    const allProjectTasks = this.taskManager.getTasks({ projectId: project.id });
    const allNotes = allProjectTasks
      .flatMap((t) => (Array.isArray(t.notes) ? t.notes : []).map((note) => ({ ...note, taskTitle: t.title })))
      .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
    if (allNotes.length) {
      const notesDetails = document.createElement("details");
      notesDetails.className = "project-notes-section";
      const notesSummary = document.createElement("summary");
      notesSummary.textContent = `Notes (${allNotes.length})`;
      notesDetails.append(notesSummary);
      const notesList = document.createElement("ul");
      notesList.className = "project-notes-list";
      allNotes.forEach((note) => {
        const li = document.createElement("li");
        li.className = "project-note-item";
        const noteMeta = document.createElement("span");
        noteMeta.className = "project-note-meta";
        const noteDate = note.createdAt ? new Date(note.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
        noteMeta.textContent = [note.taskTitle, noteDate].filter(Boolean).join(" \u2022 ");
        const noteText = document.createElement("p");
        noteText.className = "project-note-text";
        noteText.textContent = note.text;
        li.append(noteMeta, noteText);
        notesList.append(li);
      });
      notesDetails.append(notesList);
      content.append(notesDetails);
    }

    // Add task form
    const addForm = document.createElement("form");
    addForm.className = "project-quick-add-form";
    const addTextarea = document.createElement("textarea");
    addTextarea.rows = 2;
    addTextarea.placeholder = "Add tasks — one per line";
    addTextarea.setAttribute("aria-label", `Add tasks for ${project.name}`);
    const addActions = document.createElement("div");
    addActions.className = "project-quick-add-actions";
    const addBtn = document.createElement("button");
    addBtn.type = "submit";
    addBtn.className = "btn btn-primary";
    addBtn.textContent = "Add";
    addActions.append(addBtn);
    addForm.append(addTextarea, addActions);
    addForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const lines = addTextarea.value.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lines.length) {
        addTextarea.focus();
        return;
      }
      lines.forEach((title) => {
        this.taskManager.addTask({ title, status: STATUS.INBOX, projectId: project.id });
      });
      // statechange re-renders the flyout synchronously, so focus the replacement textarea
      const newTextarea = content.querySelector(".project-quick-add-form textarea");
      if (newTextarea) newTextarea.focus();
    });
    content.append(addForm);

    // Task groups
    if (projectTasks.length) {
      const grouped = {
        [STATUS.INBOX]: [],
        [STATUS.NEXT]: [],
        [STATUS.DOING]: [],
        [STATUS.WAITING]: [],
        [STATUS.SOMEDAY]: [],
      };
      projectTasks.forEach((task) => {
        if (grouped[task.status]) grouped[task.status].push(task);
      });

      const groups = [
        { status: STATUS.NEXT, label: "Pending Tasks", empty: "No pending tasks defined." },
        { status: STATUS.DOING, label: "Doing", empty: "Nothing currently in progress." },
        { status: STATUS.WAITING, label: "Delegated", empty: "Nothing delegated at the moment." },
        { status: STATUS.INBOX, label: "Inbox", empty: "", hideEmpty: true },
        { status: STATUS.SOMEDAY, label: "Backburner", empty: "No ideas parked here yet." },
      ];

      const sectionsWrapper = document.createElement("div");
      sectionsWrapper.className = "project-task-groups";

      groups.forEach((group) => {
        const items = grouped[group.status] || [];
        if (!items.length && group.hideEmpty) return;

        const section = document.createElement("section");
        section.className = "project-task-group";
        section.dataset.projectId = project.id;
        const heading = document.createElement("h4");
        heading.textContent = group.label;
        section.append(heading);

        if (!items.length) {
          const empty = document.createElement("p");
          empty.className = "muted small-text";
          empty.textContent = group.empty;
          section.append(empty);
        } else {
          items.forEach((task, index) => {
            const card = this.createTaskCard(task);
            if (group.status === STATUS.NEXT) {
              if (index === 0) card.classList.add("task-card-primary");
              card.addEventListener("dragover", (event) => {
                const sourceId = this.draggingTaskId
                  || event.dataTransfer?.getData("text/task-id")
                  || event.dataTransfer?.getData("text/plain");
                if (!sourceId || sourceId === task.id) return;
                const sourceTask = this.taskManager.getTaskById(sourceId);
                if (!sourceTask || sourceTask.status !== STATUS.NEXT || sourceTask.projectId !== project.id || task.projectId !== project.id) return;
                event.preventDefault();
                event.stopPropagation();
                const bounds = card.getBoundingClientRect();
                const dropBefore = this.resolveProjectNextDropBefore({ sourceId, targetId: task.id, projectId: project.id, clientY: event.clientY, bounds });
                card.classList.toggle("is-drop-before", dropBefore);
                card.classList.toggle("is-drop-after", !dropBefore);
              });
              card.addEventListener("dragleave", () => card.classList.remove("is-drop-before", "is-drop-after"));
              card.addEventListener("drop", (event) => {
                const sourceId = this.draggingTaskId
                  || event.dataTransfer?.getData("text/task-id")
                  || event.dataTransfer?.getData("text/plain");
                if (!sourceId || sourceId === task.id) return;
                const sourceTask = this.taskManager.getTaskById(sourceId);
                if (!sourceTask || sourceTask.status !== STATUS.NEXT || sourceTask.projectId !== project.id || task.projectId !== project.id) return;
                event.preventDefault();
                event.stopPropagation();
                const bounds = card.getBoundingClientRect();
                const dropBefore = this.resolveProjectNextDropBefore({ sourceId, targetId: task.id, projectId: project.id, clientY: event.clientY, bounds });
                this.handleProjectNextReorderDrop({ sourceId, targetId: task.id, projectId: project.id, before: dropBefore });
                card.classList.remove("is-drop-before", "is-drop-after");
              });
            }
            section.append(card);
          });
        }
        sectionsWrapper.append(section);
        this.attachDropzone(section, group.status, undefined, project.id);
      });

      if (this.showProjectCompletedTasks) {
        const completedTasks = this.taskManager.getCompletedTasks({ projectId: project.id });
        const completedSection = document.createElement("section");
        completedSection.className = "project-task-group";
        const completedHeading = document.createElement("h4");
        completedHeading.textContent = "Completed";
        completedSection.append(completedHeading);
        if (!completedTasks.length) {
          const empty = document.createElement("p");
          empty.className = "muted small-text";
          empty.textContent = "Drop a task here to complete it, or complete tasks from their flyout.";
          completedSection.append(empty);
        } else {
          completedTasks.forEach((task) => {
            const card = this.createTaskCard(task);
            card.classList.add("task-card-completed");
            completedSection.append(card);
          });
        }
        sectionsWrapper.append(completedSection);
        this.attachDropzone(completedSection, "complete", undefined, project.id);
      }

      content.append(sectionsWrapper);
    } else {
      const empty = document.createElement("p");
      empty.className = "muted small-text";
      empty.textContent = "No tasks linked to this project yet.";
      content.append(empty);
    }

    // Footer actions
    const footer = document.createElement("div");
    footer.className = "project-flyout-footer";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "btn btn-light";
    editButton.textContent = "Edit project";
    editButton.addEventListener("click", () => this.renderProjectEditor(project));
    footer.append(editButton);

    const activeProjects = (this.projectCache || []).filter((p) => p.id !== project.id && p.status !== "Completed");
    if (activeProjects.length > 0) {
      const mergeBtn = document.createElement("button");
      mergeBtn.type = "button";
      mergeBtn.className = "btn btn-light";
      mergeBtn.textContent = "Merge into\u2026";
      mergeBtn.addEventListener("click", () => {
        this.closeProjectFlyout();
        this.openProjectMergeModal(project);
      });
      footer.append(mergeBtn);
    }

    if (project.someday) {
      const activateBtn = document.createElement("button");
      activateBtn.type = "button";
      activateBtn.className = "btn btn-primary";
      activateBtn.textContent = "Activate project";
      activateBtn.addEventListener("click", () => this.taskManager.activateProject(project.id));
      footer.append(activateBtn);
    } else {
      const somedayBtn = document.createElement("button");
      somedayBtn.type = "button";
      somedayBtn.className = "btn btn-light";
      somedayBtn.textContent = "Move to Backburner";
      somedayBtn.addEventListener("click", () => this.taskManager.moveProjectToSomeday(project.id));
      footer.append(somedayBtn);
    }

    const completeBtn = document.createElement("button");
    completeBtn.type = "button";
    completeBtn.className = "btn btn-primary";
    completeBtn.textContent = "Mark complete";
    completeBtn.addEventListener("click", () => {
      this.closeProjectFlyout();
      this.openProjectCompleteModal(project);
    });
    footer.append(completeBtn);

    const saveAsTemplateBtn = document.createElement("button");
    saveAsTemplateBtn.type = "button";
    saveAsTemplateBtn.className = "btn btn-light";
    saveAsTemplateBtn.textContent = "Save as template\u2026";
    saveAsTemplateBtn.addEventListener("click", () => {
      const draft = this.taskManager.buildTemplateFromProject(project.id);
      if (!draft) return;
      this.closeProjectFlyout();
      this.openTemplateEditor(draft);
    });
    footer.append(saveAsTemplateBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Delete project";
    deleteBtn.addEventListener("click", async () => {
      const confirmed = await this.showConfirm(
        `Delete project "${project.name}"? Tasks will remain but lose their project link.`,
        { title: "Delete project", okLabel: "Delete", danger: true }
      );
      if (confirmed) {
        this.closeProjectFlyout();
        this.taskManager.deleteProject(project.id);
      }
    });
    footer.append(deleteBtn);

    content.append(footer);
  }

  renderProjectEditor(project) {
    const content = this.elements.projectFlyoutContent;
    const titleEl = this.elements.projectFlyoutTitle;
    if (!content) return;
    if (titleEl) titleEl.textContent = "Edit project";

    content.innerHTML = "";

    const form = document.createElement("form");
    form.className = "project-edit";
    form.setAttribute("aria-label", "Edit project");

    const nameField = document.createElement("label");
    nameField.className = "project-edit-field";
    nameField.textContent = "Project name";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = project.name;
    nameInput.required = true;
    nameField.append(nameInput);

    const visionField = document.createElement("label");
    visionField.className = "project-edit-field";
    visionField.textContent = "Desired outcome";
    const visionInput = document.createElement("textarea");
    visionInput.rows = 3;
    visionInput.value = project.vision || "";
    visionField.append(visionInput);

    const areaField = document.createElement("div");
    areaField.className = "project-edit-field";
    const areaLabel = document.createElement("span");
    areaLabel.textContent = "Area of focus";
    const areaSelect = document.createElement("select");
    populateAreaSelect(areaSelect, this.taskManager.getAreasOfFocus(), project.areaOfFocus || "");
    const areaNewBtn = document.createElement("button");
    areaNewBtn.type = "button";
    areaNewBtn.className = "btn btn-light btn-small";
    areaNewBtn.textContent = "+ New";
    areaNewBtn.addEventListener("click", () => addNewAreaOption(areaSelect, this.taskManager));
    const areaWrapper = document.createElement("div");
    areaWrapper.className = "area-select-group";
    areaWrapper.append(areaSelect, areaNewBtn);
    areaField.append(areaLabel, areaWrapper);

    const themeField = document.createElement("label");
    themeField.className = "project-edit-field";
    themeField.textContent = "Theme";
    const themeInput = document.createElement("input");
    themeInput.type = "text";
    themeInput.setAttribute("list", "projectThemeSuggestions");
    themeInput.placeholder = "Theme (optional)";
    themeInput.value = project.themeTag || "";
    themeField.append(themeInput);

    const statusField = document.createElement("label");
    statusField.className = "project-edit-field";
    statusField.textContent = "Status tag";
    const statusInput = document.createElement("input");
    statusInput.type = "text";
    statusInput.setAttribute("list", "projectStatusSuggestions");
    statusInput.placeholder = "Status";
    statusInput.value = project.statusTag || "";
    statusField.append(statusInput);

    const deadlineField = document.createElement("label");
    deadlineField.className = "project-edit-field";
    deadlineField.textContent = "Deadline";
    const deadlineInput = document.createElement("input");
    deadlineInput.type = "date";
    deadlineInput.value = project.deadline || "";
    deadlineField.append(deadlineInput);

    const actions = document.createElement("div");
    actions.className = "project-edit-actions";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "btn btn-light";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => {
      const latest = this.getProjectCache().find((p) => p.id === project.id);
      if (latest) this.renderProjectFlyout(latest);
    });

    const saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.className = "btn btn-primary";
    saveButton.textContent = "Save";

    actions.append(cancelButton, saveButton);
    form.append(nameField, visionField, areaField, themeField, statusField, deadlineField, actions);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const trimmedName = nameInput.value.trim();
      if (!trimmedName) {
        this.taskManager.notify("warn", "Project name cannot be empty.");
        return;
      }
      this.taskManager.updateProject(project.id, {
        name: trimmedName,
        vision: visionInput.value.trim(),
        areaOfFocus: areaSelect.value || null,
        themeTag: themeInput.value.trim() || null,
        statusTag: statusInput.value.trim() || null,
        deadline: deadlineInput.value || null,
      });
    });

    content.append(form);
  }

  setupProjectFlyout() {
    const { closeProjectFlyout, projectFlyoutBackdrop } = this.elements;
    closeProjectFlyout?.addEventListener("click", () => this.closeProjectFlyout());
    projectFlyoutBackdrop?.addEventListener("click", () => this.closeProjectFlyout());
  }

  // ─── End Project Flyout ───────────────────────────────��───────────────────

  bindProjectCompletionModal() {
    const {
      projectCompleteModal,
      closeProjectCompleteModal,
      projectCompleteBackdrop,
      projectCompleteCancel,
      projectCompleteForm,
    } = this.elements;
    if (!projectCompleteModal) return;
    const close = () => this.closeProjectCompleteModal();
    closeProjectCompleteModal?.addEventListener("click", close);
    projectCompleteBackdrop?.addEventListener("click", close);
    projectCompleteCancel?.addEventListener("click", close);
    projectCompleteForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      this.handleProjectCompletionSubmit();
    });
  }

  openProjectCompleteModal(project) {
    const modal = this.elements.projectCompleteModal;
    if (!modal || !project) return;
    this.projectCompletionState = { projectId: project.id };
    this.elements.projectCompleteForm?.reset();
    if (this.elements.projectCompleteName) {
      this.elements.projectCompleteName.textContent = project.name;
    }
    modal.classList.add("is-open");
    modal.removeAttribute("hidden");
    this.elements.projectCompleteAchieved?.focus();
  }

  closeProjectCompleteModal() {
    const modal = this.elements.projectCompleteModal;
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("hidden", "");
    this.projectCompletionState = { projectId: null };
    this.elements.projectCompleteForm?.reset();
  }

  bindProjectMergeModal() {
    const { projectMergeModal, projectMergeBackdrop, closeProjectMergeModal, projectMergeCancelBtn, projectMergeTargetSelect, projectMergeConfirmBtn, projectMergeSummary } = this.elements;
    if (!projectMergeModal) return;
    const close = () => this.closeProjectMergeModal();
    closeProjectMergeModal?.addEventListener("click", close);
    projectMergeBackdrop?.addEventListener("click", close);
    projectMergeCancelBtn?.addEventListener("click", close);

    projectMergeTargetSelect?.addEventListener("change", () => {
      const targetId = projectMergeTargetSelect.value;
      const hasTarget = Boolean(targetId);
      if (projectMergeConfirmBtn) projectMergeConfirmBtn.disabled = !hasTarget;
      if (projectMergeSummary) {
        if (hasTarget) {
          const target = (this.projectCache || []).find((p) => p.id === targetId);
          const sourceName = this.elements.projectMergeSourceName?.textContent || "this project";
          const taskCount = parseInt(this.elements.projectMergeSourceCount?.textContent || "0", 10);
          const taskWord = taskCount === 1 ? "task" : "tasks";
          projectMergeSummary.textContent = `${taskCount} ${taskWord} will move to "${target?.name ?? targetId}". "${sourceName}" will be deleted.`;
          projectMergeSummary.hidden = false;
        } else {
          projectMergeSummary.hidden = true;
        }
      }
    });

    projectMergeConfirmBtn?.addEventListener("click", () => {
      const sourceId = this._projectMergeSourceId;
      const targetId = projectMergeTargetSelect?.value;
      if (!sourceId || !targetId) return;
      const moved = this.taskManager.mergeProjects(sourceId, targetId);
      const target = (this.projectCache || []).find((p) => p.id === targetId);
      this.closeProjectMergeModal();
      const taskWord = moved === 1 ? "task" : "tasks";
      this.taskManager.notify("info", `Merged into "${target?.name ?? targetId}". ${moved} ${taskWord} moved.`);
    });

    projectMergeModal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
    });
  }

  openProjectMergeModal(project) {
    const { projectMergeModal, projectMergeSourceName, projectMergeSourceCount, projectMergeTargetSelect, projectMergeSummary, projectMergeConfirmBtn } = this.elements;
    if (!projectMergeModal || !project) return;

    this._projectMergeSourceId = project.id;

    if (projectMergeSourceName) projectMergeSourceName.textContent = project.name;

    const allTasks = this.taskManager.getTasks({ includeCompleted: false });
    const sourceTaskCount = allTasks.filter((t) => t.projectId === project.id).length;
    if (projectMergeSourceCount) projectMergeSourceCount.textContent = String(sourceTaskCount);

    if (projectMergeTargetSelect) {
      projectMergeTargetSelect.innerHTML = "";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "— select a project —";
      projectMergeTargetSelect.append(placeholder);

      const targets = (this.projectCache || [])
        .filter((p) => p.id !== project.id && p.status !== "Completed")
        .sort((a, b) => a.name.localeCompare(b.name));

      const taskCountByProject = new Map();
      allTasks.forEach((t) => {
        if (t.projectId) taskCountByProject.set(t.projectId, (taskCountByProject.get(t.projectId) || 0) + 1);
      });

      targets.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        const count = taskCountByProject.get(p.id) || 0;
        opt.textContent = `${p.name} (${count} task${count !== 1 ? "s" : ""})`;
        projectMergeTargetSelect.append(opt);
      });

      projectMergeTargetSelect.value = "";
    }

    if (projectMergeSummary) projectMergeSummary.hidden = true;
    if (projectMergeConfirmBtn) projectMergeConfirmBtn.disabled = true;

    projectMergeModal.removeAttribute("hidden");
    projectMergeModal.classList.add("is-open");
    projectMergeTargetSelect?.focus();
  }

  closeProjectMergeModal() {
    const { projectMergeModal } = this.elements;
    if (!projectMergeModal) return;
    projectMergeModal.classList.remove("is-open");
    projectMergeModal.setAttribute("hidden", "");
    this._projectMergeSourceId = null;
  }

  handleProjectCompletionSubmit() {
    if (!this.projectCompletionState?.projectId) {
      this.closeProjectCompleteModal();
      return;
    }
    const payload = {
      achieved: this.elements.projectCompleteAchieved?.value || "",
      lessons: this.elements.projectCompleteLessons?.value || "",
      followUp: this.elements.projectCompleteFollowUp?.value || "",
    };
    this.taskManager.completeProject(this.projectCompletionState.projectId, payload);
    this.closeProjectCompleteModal();
  }

  // ─── Template Modals ─────────────────────────────────────────────────────

  bindTemplateModals() {
    const {
      useTemplateModal, useTemplateModalBackdrop, closeUseTemplateModal,
      useTemplateCancelBtn, useTemplateForm,
      templateEditorModal, templateEditorModalBackdrop, closeTemplateEditorModal,
      templateEditorCancelBtn, templateEditorForm, templateEditorAddTask,
    } = this.elements;

    // Use-template modal
    const closeUse = () => this.closeUseTemplateModal();
    closeUseTemplateModal?.addEventListener("click", closeUse);
    useTemplateModalBackdrop?.addEventListener("click", closeUse);
    useTemplateCancelBtn?.addEventListener("click", closeUse);
    useTemplateModal?.addEventListener("keydown", (e) => { if (e.key === "Escape") closeUse(); });
    useTemplateForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const projectName = this.elements.useTemplateProjectName?.value?.trim() || "";
      const templateId = this._useTemplateId;
      if (!templateId) return;
      const project = this.taskManager.createProjectFromTemplate(templateId, projectName);
      if (project) {
        this.closeUseTemplateModal();
        this.openProjectFlyout(project.id);
      }
    });

    // Template-editor modal
    const closeEditor = () => this.closeTemplateEditorModal();
    closeTemplateEditorModal?.addEventListener("click", closeEditor);
    templateEditorModalBackdrop?.addEventListener("click", closeEditor);
    templateEditorCancelBtn?.addEventListener("click", closeEditor);
    templateEditorModal?.addEventListener("keydown", (e) => { if (e.key === "Escape") closeEditor(); });
    templateEditorAddTask?.addEventListener("click", () => this._addTemplateTaskRow());
    templateEditorForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      this._saveTemplateFromEditor();
    });
  }

  openUseTemplateModal(template) {
    const { useTemplateModal, useTemplateName, useTemplateProjectName, useTemplateForm } = this.elements;
    if (!useTemplateModal || !template) return;
    this._useTemplateId = template.id;
    if (useTemplateName) useTemplateName.textContent = template.name;
    useTemplateForm?.reset();
    if (useTemplateProjectName) {
      useTemplateProjectName.value = template.name;
      useTemplateProjectName.select();
    }
    useTemplateModal.removeAttribute("hidden");
    useTemplateModal.classList.add("is-open");
    useTemplateProjectName?.focus();
  }

  closeUseTemplateModal() {
    const { useTemplateModal } = this.elements;
    if (!useTemplateModal) return;
    useTemplateModal.classList.remove("is-open");
    useTemplateModal.setAttribute("hidden", "");
    this._useTemplateId = null;
  }

  openTemplateEditor(template = null) {
    const {
      templateEditorModal, templateEditorModalTitle, templateEditorName,
      templateEditorArea, templateEditorTheme, templateEditorStatus,
      templateEditorTasks, templateEditorForm,
    } = this.elements;
    if (!templateEditorModal) return;
    this._editingTemplateId = template?.id || null;
    if (templateEditorModalTitle) {
      templateEditorModalTitle.textContent = template ? "Edit template" : "New template";
    }
    templateEditorForm?.reset();
    if (templateEditorName) templateEditorName.value = template?.name || "";
    const areas = this.taskManager.getAreasOfFocus();
    populateAreaSelect(templateEditorArea, areas, template?.areaOfFocus || "");
    if (templateEditorTheme) templateEditorTheme.value = template?.themeTag || "";
    if (templateEditorStatus) templateEditorStatus.value = template?.statusTag || "Active";
    if (templateEditorTasks) {
      templateEditorTasks.innerHTML = "";
      (template?.tasks || []).forEach((t) => this._addTemplateTaskRow(t));
    }
    templateEditorModal.removeAttribute("hidden");
    templateEditorModal.classList.add("is-open");
    templateEditorName?.focus();
  }

  closeTemplateEditorModal() {
    this._closeTemplateTaskPopover();
    const { templateEditorModal } = this.elements;
    if (!templateEditorModal) return;
    templateEditorModal.classList.remove("is-open");
    templateEditorModal.setAttribute("hidden", "");
    this._editingTemplateId = null;
  }

  // ─── Template task row chip/popover system ────────────────────────────────

  // Short display labels for status chips (STATUS_LABELS uses the long GTD names)
  static _TMPL_STATUS_LABELS = {
    inbox: "Inbox", next: "Next", doing: "Doing", waiting: "Waiting", someday: "Someday",
  };

  _addTemplateTaskRow(task = null) {
    const container = this.elements.templateEditorTasks;
    if (!container) return;

    this._taskRowSeq = (this._taskRowSeq || 0) + 1;
    const rowId = this._taskRowSeq;

    const row = document.createElement("div");
    row.className = "template-task-row";
    row.dataset.rowId = rowId;

    // Mutable state object for this row — source of truth for all properties
    row._taskData = {
      status: task?.status || "inbox",
      contexts: Array.isArray(task?.contexts) ? [...task.contexts] : [],
      effortLevel: task?.effortLevel || null,
      timeRequired: task?.timeRequired || null,
      description: task?.description || "",
    };

    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.className = "template-task-title";
    titleInput.placeholder = "Task title";
    titleInput.value = task?.title || "";
    titleInput.required = true;

    const chipStrip = document.createElement("div");
    chipStrip.className = "tmpl-chip-strip";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn btn-light btn-small template-task-remove";
    removeBtn.textContent = "✕";
    removeBtn.setAttribute("aria-label", "Remove task");
    removeBtn.addEventListener("click", () => {
      this._closeTemplateTaskPopover();
      row.remove();
    });

    row.append(titleInput, chipStrip, removeBtn);
    container.append(row);
    this._renderTaskChips(row);
    titleInput.focus();
  }

  _makeTaskChip(label, extraClass = "") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `tmpl-chip${extraClass ? " " + extraClass : ""}`;
    btn.textContent = label;
    return btn;
  }

  _renderTaskChips(row) {
    const chipStrip = row.querySelector(".tmpl-chip-strip");
    if (!chipStrip) return;
    const td = row._taskData;
    chipStrip.innerHTML = "";

    // Chips are display-only — no click handlers
    chipStrip.append(this._makeTaskChip(
      UIController._TMPL_STATUS_LABELS[td.status] || td.status,
      `tmpl-chip--${td.status}`,
    ));

    if (td.contexts?.length) {
      chipStrip.append(this._makeTaskChip(td.contexts.join(" ")));
    }

    if (td.effortLevel) {
      chipStrip.append(this._makeTaskChip(td.effortLevel));
    }

    if (td.timeRequired) {
      chipStrip.append(this._makeTaskChip(td.timeRequired));
    }

    if (td.description?.trim()) {
      const descChip = this._makeTaskChip("✏");
      descChip.title = td.description.trim();
      chipStrip.append(descChip);
    }

    // Single edit button — the only interactive trigger
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "tmpl-chip-add";
    editBtn.textContent = "···";
    editBtn.setAttribute("aria-label", "Edit task properties");
    editBtn.addEventListener("click", () => this._openTemplateTaskPopover(row, editBtn));
    chipStrip.append(editBtn);
  }

  _makePopSection(label) {
    const section = document.createElement("div");
    section.className = "tmpl-pop-section";
    const lbl = document.createElement("div");
    lbl.className = "tmpl-pop-label";
    lbl.textContent = label;
    section.append(lbl);
    return section;
  }

  _buildTaskPopover(row) {
    const td = row._taskData;
    const rowId = row.dataset.rowId;
    const popover = document.createElement("div");
    popover.className = "tmpl-popover";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "Task properties");

    // ── Status ──────────────────────────────────────────────────────────────
    const statusSection = this._makePopSection("Status");
    const statusGroup = document.createElement("div");
    statusGroup.className = "tmpl-pop-radio-group";
    [
      { value: "inbox", label: "Inbox" },
      { value: "next", label: "Next" },
      { value: "doing", label: "Doing" },
      { value: "waiting", label: "Waiting" },
      { value: "someday", label: "Someday" },
    ].forEach(({ value, label }) => {
      const lbl = document.createElement("label");
      lbl.className = "tmpl-pop-radio";
      const inp = document.createElement("input");
      inp.type = "radio";
      inp.name = `tmpl-status-${rowId}`;
      inp.value = value;
      inp.checked = td.status === value;
      inp.addEventListener("change", () => {
        if (inp.checked) { td.status = value; this._renderTaskChips(row); }
      });
      lbl.append(inp, document.createTextNode(label));
      statusGroup.append(lbl);
    });
    statusSection.append(statusGroup);
    popover.append(statusSection);

    // ── Contexts ─────────────────────────────────────────────────────────────
    const ctxSection = this._makePopSection("Contexts");
    const ctxGrid = document.createElement("div");
    ctxGrid.className = "tmpl-pop-check-grid";
    this.taskManager.getContexts().forEach((ctx) => {
      const lbl = document.createElement("label");
      lbl.className = "tmpl-pop-check";
      const inp = document.createElement("input");
      inp.type = "checkbox";
      inp.value = ctx;
      inp.checked = (td.contexts || []).includes(ctx);
      inp.addEventListener("change", () => {
        const set = new Set(td.contexts || []);
        if (inp.checked) set.add(ctx); else set.delete(ctx);
        td.contexts = Array.from(set);
        this._renderTaskChips(row);
      });
      lbl.append(inp, document.createTextNode(" " + ctx));
      ctxGrid.append(lbl);
    });
    ctxSection.append(ctxGrid);
    popover.append(ctxSection);

    // ── Effort ───────────────────────────────────────────────────────────────
    const effortSection = this._makePopSection("Effort");
    const effortGroup = document.createElement("div");
    effortGroup.className = "tmpl-pop-radio-group";
    [{ value: "", label: "None" }, ...EFFORT_LEVELS.map((v) => ({ value: v, label: v }))].forEach(({ value, label }) => {
      const lbl = document.createElement("label");
      lbl.className = "tmpl-pop-radio";
      const inp = document.createElement("input");
      inp.type = "radio";
      inp.name = `tmpl-effort-${rowId}`;
      inp.value = value;
      inp.checked = (td.effortLevel || "") === value;
      inp.addEventListener("change", () => {
        if (inp.checked) { td.effortLevel = value || null; this._renderTaskChips(row); }
      });
      lbl.append(inp, document.createTextNode(label));
      effortGroup.append(lbl);
    });
    effortSection.append(effortGroup);
    popover.append(effortSection);

    // ── Time required ────────────────────────────────────────────────────────
    const timeSection = this._makePopSection("Time required");
    const timeGroup = document.createElement("div");
    timeGroup.className = "tmpl-pop-radio-group";
    [{ value: "", label: "None" }, ...TIME_REQUIREMENTS.map((v) => ({ value: v, label: v }))].forEach(({ value, label }) => {
      const lbl = document.createElement("label");
      lbl.className = "tmpl-pop-radio";
      const inp = document.createElement("input");
      inp.type = "radio";
      inp.name = `tmpl-time-${rowId}`;
      inp.value = value;
      inp.checked = (td.timeRequired || "") === value;
      inp.addEventListener("change", () => {
        if (inp.checked) { td.timeRequired = value || null; this._renderTaskChips(row); }
      });
      lbl.append(inp, document.createTextNode(label));
      timeGroup.append(lbl);
    });
    timeSection.append(timeGroup);
    popover.append(timeSection);

    // ── Description ──────────────────────────────────────────────────────────
    const descSection = this._makePopSection("Description");
    const textarea = document.createElement("textarea");
    textarea.className = "tmpl-pop-textarea";
    textarea.rows = 3;
    textarea.placeholder = "Optional task description…";
    textarea.value = td.description || "";
    textarea.addEventListener("input", () => {
      td.description = textarea.value;
      this._renderTaskChips(row);
    });
    descSection.append(textarea);
    popover.append(descSection);

    return popover;
  }

  _openTemplateTaskPopover(row, anchorEl) {
    this._closeTemplateTaskPopover();

    const popover = this._buildTaskPopover(row);
    document.body.append(popover);
    this._activeTaskPopover = popover;
    this._activeTaskPopoverRow = row;

    // Position: fixed, anchored below the trigger element
    const rect = anchorEl.getBoundingClientRect();
    const popW = 280;
    let left = rect.left;
    const maxLeft = window.innerWidth - popW - 12;
    popover.style.top = `${rect.bottom + 4}px`;
    popover.style.left = `${Math.max(8, Math.min(left, maxLeft))}px`;

    // Focus first focusable element in the popover
    requestAnimationFrame(() => popover.querySelector("input, textarea")?.focus());

    const onOutside = (e) => {
      if (!popover.contains(e.target) && !row.contains(e.target)) {
        this._closeTemplateTaskPopover();
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this._closeTemplateTaskPopover();
        anchorEl.focus();
      }
    };
    // Delay pointerdown listener one tick so the opening click doesn't immediately close it
    const pointerdownTimerId = setTimeout(() => document.addEventListener("pointerdown", onOutside), 0);
    document.addEventListener("keydown", onKey, { capture: true });

    this._popoverCleanup = () => {
      clearTimeout(pointerdownTimerId);
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onKey, { capture: true });
    };
  }

  _closeTemplateTaskPopover() {
    if (!this._activeTaskPopover) return;
    this._popoverCleanup?.();
    this._popoverCleanup = null;
    this._activeTaskPopover.remove();
    this._activeTaskPopover = null;
    this._activeTaskPopoverRow = null;
  }

  _saveTemplateFromEditor() {
    // Close any open popover first so its data is already applied to _taskData
    this._closeTemplateTaskPopover();
    const {
      templateEditorName, templateEditorArea, templateEditorTheme,
      templateEditorStatus, templateEditorTasks,
    } = this.elements;
    const name = (templateEditorName?.value || "").trim();
    if (!name) {
      this.taskManager.notify("warn", "Template name cannot be empty.");
      return;
    }
    const tasks = Array.from(templateEditorTasks?.querySelectorAll(".template-task-row") || []).map((row) => {
      const td = row._taskData || {};
      return {
        title: row.querySelector(".template-task-title")?.value?.trim() || "",
        status: td.status || "inbox",
        contexts: td.contexts || [],
        effortLevel: td.effortLevel || null,
        timeRequired: td.timeRequired || null,
        description: td.description?.trim() || null,
      };
    }).filter((t) => t.title);
    const updates = {
      name,
      areaOfFocus: templateEditorArea?.value || null,
      themeTag: (templateEditorTheme?.value || "").trim() || null,
      statusTag: (templateEditorStatus?.value || "").trim() || "Active",
      tasks,
    };
    if (this._editingTemplateId) {
      this.taskManager.updateTemplate(this._editingTemplateId, updates);
    } else {
      this.taskManager.addTemplate(name, updates);
    }
    this.closeTemplateEditorModal();
    this.renderProjects();
  }

  toPercent(value, total) {
    if (!total || total <= 0) return 0;
    return Math.round((value / total) * 100);
  }

  formatCount(value) {
    return Number(value || 0).toLocaleString();
  }

  startOfDay(dateValue) {
    const date = new Date(dateValue);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  shiftIsoDate(isoDate, days) {
    const date = new Date(`${isoDate}T00:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  getAgeInDays(dateValue, referenceDate = new Date()) {
    if (!dateValue) return null;
    const date = new Date(dateValue);
    if (!Number.isFinite(date.getTime())) return null;
    const diff = referenceDate.getTime() - date.getTime();
    return Math.floor(diff / 86400000);
  }

  _readOpLog() {
    try {
      const raw = localStorage.getItem("nextflow-op-log");
      const entries = raw ? JSON.parse(raw) : [];
      return Array.isArray(entries) ? entries : [];
    } catch {
      return [];
    }
  }

  renderSyncDiagnostics() {
    const container = this.elements.syncDiagContainer;
    if (!container) return;
    const entries = this._readOpLog();
    container.innerHTML = "";
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "sync-diag-empty";
      empty.textContent = "No field changes recorded yet. Changes to status, My Day, due date, and follow-up date will appear here.";
      container.append(empty);
      return;
    }
    const table = document.createElement("table");
    table.className = "sync-diag-table";
    const head = document.createElement("thead");
    head.innerHTML = "<tr><th>Time</th><th>Device</th><th>Task</th><th>Field</th><th>Was</th><th>Now</th></tr>";
    table.append(head);
    const body = document.createElement("tbody");
    entries.slice(0, 100).forEach((entry) => {
      const tr = document.createElement("tr");
      const cells = [
        entry.ts ? new Date(entry.ts).toLocaleString() : "—",
        entry.deviceLabel || entry.deviceId || "—",
        entry.taskTitle ? entry.taskTitle.slice(0, 30) : entry.taskId || "—",
        entry.field || "—",
        entry.prev !== undefined ? String(entry.prev) || "(empty)" : "—",
        entry.next !== undefined ? String(entry.next) || "(empty)" : "—",
      ];
      cells.forEach((text, i) => {
        const td = document.createElement("td");
        td.textContent = text;
        if (i === 2 && entry.taskTitle) td.title = entry.taskTitle;
        if (i === 1 && entry.deviceId && this.taskManager.deviceInfo?.id === entry.deviceId) {
          const badge = document.createElement("span");
          badge.className = "sync-diag-self-badge";
          badge.textContent = "you";
          td.append(badge);
        }
        tr.append(td);
      });
      body.append(tr);
    });
    table.append(body);
    container.append(table);
  }

  updateStaleTaskThresholdsFromPanel(panel) {
    if (!panel) return;

    const inputs = Array.from(panel.querySelectorAll("input[data-stale-threshold-key]"));
    const values = {};

    inputs.forEach((input) => {
      const key = input.dataset.staleThresholdKey;
      const parsed = Number.parseInt(input.value, 10);
      values[key] = Number.isFinite(parsed) ? parsed : null;
    });

    if (
      values.warn === null ||
      values.stale === null ||
      values.old === null ||
      values.ancient === null
    ) {
      this.taskManager.notify("warn", "All stale thresholds must be numeric.");
      return;
    }

    if (values.warn < 1 || values.stale < 1 || values.old < 1 || values.ancient < 1) {
      this.taskManager.notify("warn", "Thresholds must be at least 1 day.");
      return;
    }

    if (!(values.warn < values.stale && values.stale < values.old && values.old < values.ancient)) {
      this.taskManager.notify("warn", "Thresholds must be strictly increasing.");
      return;
    }

    if (!this.taskManager.updateStaleTaskThresholds(values)) {
      return;
    }

    this.taskManager.notify("info", "Stale task thresholds updated.");
    this.renderAll();
  }

  async handleSettingsAction({ action, type, value, areaValue }) {
    if (!action || !type || !value) return;
    if (action === "toggle-area") {
      if (!areaValue) return;
      if (type === "context") {
        const opts = this.taskManager.getContextOptionsWithAreas();
        const opt = opts.find((o) => o.name === value);
        const currentAreas = opt?.areas || [];
        const newAreas = currentAreas.includes(areaValue)
          ? currentAreas.filter((a) => a !== areaValue)
          : [...currentAreas, areaValue];
        this.taskManager.setContextAreas(value, newAreas);
      }
      if (type === "people") {
        const opts = this.taskManager.getPeopleTagOptionsWithAreas();
        const opt = opts.find((o) => o.name === value);
        const currentAreas = opt?.areas || [];
        const newAreas = currentAreas.includes(areaValue)
          ? currentAreas.filter((a) => a !== areaValue)
          : [...currentAreas, areaValue];
        this.taskManager.setPeopleTagAreas(value, newAreas);
      }
      return;
    }
    if (action === "rename") {
      const displayValue = stripTagPrefix(value);
      const candidate = await this.showPrompt(`Rename "${displayValue}" to:`, displayValue);
      if (!candidate || !candidate.trim()) return;
      const stripped = candidate.trim();
      if (stripped === displayValue) return;
      // Re-apply the prefix that the raw value had so the rename function gets a valid value
      const prefix = (value.startsWith("+") || value.startsWith("@")) ? value[0] : "";
      const nextValue = prefix && !stripped.startsWith(prefix) ? `${prefix}${stripped}` : stripped;
      if (type === "context") {
        const changed = this.taskManager.renameContext(value, nextValue);
        if (changed && this.selectedSettingsContext === value) {
          this.selectedSettingsContext = nextValue;
        }
      }
      if (type === "people") this.taskManager.renamePeopleTag(value, nextValue);
      if (type === "area") this.taskManager.renameAreaOfFocus(value, nextValue);
      return;
    }
    if (action === "delete") {
      if (type === "area") {
        const otherAreas = this.taskManager.getAreasOfFocus().filter((a) => a !== value);
        const taskCount = this.taskManager.getTasks({ includeCompleted: false })
          .filter((t) => t.areaOfFocus === value).length;
        const projectCount = this.taskManager.getProjects({ includeSomeday: true })
          .filter((p) => p.areaOfFocus === value).length;
        const ctxCount = this.taskManager.getContextOptionsWithAreas()
          .filter((o) => o.areas.includes(value)).length;
        const pplCount = this.taskManager.getPeopleTagOptionsWithAreas()
          .filter((o) => o.areas.includes(value)).length;
        const result = await this.showAreaDeleteDialog(value, otherAreas, {
          tasks: taskCount, projects: projectCount, contexts: ctxCount, people: pplCount,
        });
        if (!result?.confirmed) return;
        this.taskManager.migrateAreaReferences(value, result.target);
        if (this.activeArea === value) {
          this.activeArea = null;
          storeActiveAreaPreference(null);
        }
        return;
      }
      const confirmed = await this.showConfirm(`Delete "${value}"?`, { title: "Delete option", okLabel: "Delete", danger: true });
      if (!confirmed) return;
      if (type === "context") {
        const changed = this.taskManager.deleteContext(value);
        if (changed && this.selectedSettingsContext === value) {
          this.selectedSettingsContext = null;
        }
      }
      if (type === "people") this.taskManager.deletePeopleTag(value);
    }
  }

  pickRandomTask(contextValue = "all") {
    const filters = this.buildTaskFilters({
      context: contextValue === "all" ? this.filters.context : [contextValue],
    });
    const tasks = this.taskManager.getTasks({
      ...filters,
      status: STATUS.NEXT,
      includeCompleted: false,
      includeFutureScheduled: !this.hideScheduledNextActions,
    });
    if (!tasks.length) {
      this.taskManager.notify("warn", contextValue === "all" ? "No pending tasks available." : `No pending tasks found for ${contextValue}.`);
      return;
    }
    const easy = tasks.filter((t) => t.effortLevel === "low" && (t.timeRequired === "<5min" || t.timeRequired === "<15min"));
    const pool = easy.length ? easy : tasks;
    const random = pool[Math.floor(Math.random() * pool.length)];
    this.setActivePanel("next");
    this.openTaskFlyout(random.id);
    this.taskManager.notify("info", `Try "${random.title}" next.`);
  }

  getReportYears(tasks) {
    const years = new Set();
    tasks.forEach((task) => {
      if (!task.completedAt) return;
      const date = new Date(task.completedAt);
      const year = date.getFullYear();
      if (Number.isFinite(year)) years.add(year);
    });
    if (!years.size) {
      years.add(new Date().getFullYear());
    }
    return Array.from(years).sort((a, b) => b - a);
  }

  updateCounts() {
    const summary = this.taskManager.getSummary();
    this.summaryCache = summary;
    this.elements.inboxCount.textContent = summary.inbox;
    this.elements.dueTodayCount.textContent = summary.dueToday;
    if (this.elements.overdueCount) {
      this.elements.overdueCount.textContent = summary.overdue;
    }
    if (this.elements.processInboxBtn) {
      this.elements.processInboxBtn.hidden = summary.inbox <= 0;
    }
    if (this.elements.processInboxCount) {
      this.elements.processInboxCount.textContent = summary.inbox;
    }
    this.updateActivePanelMeta();
  }

  createTaskCard(task) {
    const row = document.createElement("div");
    row.className = "task-row";
    row.tabIndex = 0;
    row.setAttribute("role", "listitem");
    row.draggable = true;
    row.dataset.taskId = task.id;
    row.dataset.status = task.status;

    if (this.taskManager.getFeatureFlag("highlightStaleTasks") && task.updatedAt) {
      const msPerDay = 86400000;
      const ageDays = Math.floor((Date.now() - new Date(task.updatedAt).getTime()) / msPerDay);
      const thresholds = this.taskManager.getStaleTaskThresholds();
      if (ageDays >= thresholds.ancient) {
        row.classList.add("task-row-stale-90plus");
      } else if (ageDays >= thresholds.old) {
        row.classList.add("task-row-stale-30plus");
      } else if (ageDays >= thresholds.stale) {
        row.classList.add("task-row-stale-14plus");
      } else if (ageDays >= thresholds.warn) {
        row.classList.add("task-row-stale-7plus");
      }
    }

    const blockers = this.taskManager.getBlockers(task.id);
    if (blockers.length > 0) {
      row.classList.add("task-row--blocked");
      row.title = `Blocked by: ${blockers.map((t) => t.title).join(", ")}`;
    }

    const main = document.createElement("div");
    main.className = "task-row-main";

    const title = document.createElement("span");
    title.className = "task-row-title";
    if (blockers.length > 0) {
      const lockIcon = document.createElement("span");
      lockIcon.className = "task-row-blocked-icon";
      lockIcon.setAttribute("aria-hidden", "true");
      lockIcon.textContent = "🔒 ";
      title.append(lockIcon);
    }
    this.setEntityLinkedText(title, task.title || "Untitled task");

    const meta = document.createElement("div");
    meta.className = "task-row-meta";
    const metaItems = [];
    if (this.isTaskOverdue(task)) {
      metaItems.push(this.createMetaSpan("OVERDUE", "task-meta-pill task-meta-overdue"));
    }
    if (this.isTaskInMyDay(task)) {
      metaItems.push(this.createMetaSpan("MY DAY", "task-meta-pill task-meta-my-day"));
    }
    if (task.status !== STATUS.INBOX) {
      metaItems.push(this.createMetaSpan(STATUS_LABELS[task.status] || task.status, `task-meta-pill task-meta-status-${task.status}`));
    }
    if (task.contexts?.length) task.contexts.forEach((ctx) => metaItems.push(this.createMetaSpan(stripTagPrefix(ctx))));
    const projectName = this.getProjectName(task.projectId);
    if (projectName) metaItems.push(this.createMetaSpan(projectName));
    if (task.waitingFor) {
      const referencedTask = this.taskManager.getReferencedTask(task.waitingFor);
      if (referencedTask) {
        metaItems.push(this.createMetaSpan(`Blocking: ${referencedTask.slug || referencedTask.id}`));
      } else {
        metaItems.push(this.createMetaSpan(`Delegated: ${task.waitingFor}`));
      }
    }
    if (task.effortLevel) metaItems.push(this.createMetaSpan(`Effort: ${task.effortLevel}`));
    if (task.timeRequired) metaItems.push(this.createMetaSpan(`Time: ${task.timeRequired}`));
    if (task.dueDate) {
      const dueClass = this.getDueUrgencyClass(task.dueDate);
      metaItems.push(this.createMetaSpan(`Due ${formatFriendlyDate(task.dueDate)}`, dueClass));
    } else if (task.calendarDate) {
      metaItems.push(this.createMetaSpan(`📅 ${formatFriendlyDate(task.calendarDate)}`));
    }
    if (task.followUpDate) {
      metaItems.push(this.createMetaSpan(`Follow up ${formatFriendlyDate(task.followUpDate)}`));
    }
    if (this.taskManager.getFeatureFlag("showDaysSinceTouched") && task.updatedAt) {
      const msPerDay = 86400000;
      const days = Math.floor((Date.now() - new Date(task.updatedAt).getTime()) / msPerDay);
      const label = days === 0 ? "Touched today" : days === 1 ? "1 day ago" : `${days} days ago`;
      const ageClass = days >= 14 ? "task-meta-age-stale" : days >= 7 ? "task-meta-age-warn" : "task-meta-age";
      metaItems.push(this.createMetaSpan(label, ageClass));
    }

    metaItems.forEach((item, index) => {
      if (index > 0) {
        meta.append(this.createMetaBullet());
      }
      meta.append(item);
    });

    if (metaItems.length) {
      main.append(title, meta);
    } else {
      main.append(title);
    }

    const caret = document.createElement("span");
    caret.className = "task-row-caret";
    caret.setAttribute("aria-hidden", "true");
    caret.textContent = "›";

    // Multi-select checkbox — hidden by CSS until row is hovered or selected
    const selectSlot = document.createElement("span");
    selectSlot.className = "task-row-select";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.tabIndex = -1;
    checkbox.setAttribute("aria-label", `Select task "${task.title || "Untitled"}"`);
    checkbox.checked = this.selectedTaskIds.has(task.id);
    selectSlot.append(checkbox);

    if (this.selectedTaskIds.has(task.id)) {
      row.classList.add("is-selected");
    }

    row.append(selectSlot, main, caret);
    return row;
  }

  _activateTaskRow(taskId, row) {
    if (row.classList.contains("is-dragging")) return;
    if (this.selectedTaskIds.size > 0) {
      this.toggleTaskSelection(taskId);
      return;
    }
    this.closeTaskContextMenu();
    this.closeCalendarDayContextMenu();
    const task = this.taskManager.getTaskById(taskId);
    if (!task) return;
    if (task.status === STATUS.INBOX) {
      this.openClarifyModal(taskId);
    } else {
      this.openTaskFlyout(taskId);
    }
  }

  setupTaskRowDelegation() {
    const workspace = this.elements.workspace;
    if (!workspace) return;

    workspace.addEventListener("click", (event) => {
      const checkbox = event.target.closest(".task-row-select input[type=checkbox]");
      if (checkbox) {
        event.stopPropagation();
        const row = checkbox.closest(".task-row");
        if (row?.dataset.taskId) this.toggleTaskSelection(row.dataset.taskId);
        return;
      }
      const row = event.target.closest(".task-row");
      if (!row?.dataset.taskId) return;
      this._activateTaskRow(row.dataset.taskId, row);
    });

    workspace.addEventListener("keydown", (event) => {
      const row = event.target.closest(".task-row");
      if (!row?.dataset.taskId) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this._activateTaskRow(row.dataset.taskId, row);
        return;
      }
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        this.openTaskContextMenuForTask(row.dataset.taskId, row);
      }
    });

    workspace.addEventListener("contextmenu", (event) => {
      const row = event.target.closest(".task-row");
      if (!row?.dataset.taskId || row.classList.contains("is-dragging")) return;
      event.preventDefault();
      this.openTaskContextMenu(row.dataset.taskId, event.clientX, event.clientY);
    });

    workspace.addEventListener("dragstart", (event) => {
      const row = event.target.closest(".task-row");
      if (!row?.dataset.taskId) return;
      const taskId = row.dataset.taskId;
      event.dataTransfer?.setData("text/task-id", taskId);
      event.dataTransfer?.setData("text/plain", taskId);
      row.classList.add("is-dragging");
      this.draggingTaskId = taskId;
    });

    workspace.addEventListener("dragend", (event) => {
      const row = event.target.closest(".task-row");
      if (!row) return;
      row.classList.remove("is-dragging", "is-drop-before", "is-drop-after");
      this.draggingTaskId = null;
    });
  }

  setupTaskContextMenu() {
    const menu = this.elements.taskContextMenu;
    if (!menu) return;
    menu.addEventListener("click", async (event) => {
      const actionButton = event.target.closest("[data-task-menu-action]");
      if (!actionButton) return;
      const task = this.contextMenuTaskId ? this.taskManager.getTaskById(this.contextMenuTaskId) : null;
      const action = actionButton.dataset.taskMenuAction;
      this.closeTaskContextMenu();
      if (!task) return;
      if (action === "open") {
        this.openTaskFlyout(task.id);
        return;
      }
      if (action === "open-project") {
        this.openProjectFromTask(task);
        return;
      }
      if (action === "my-day") {
        this.toggleTaskMyDay(task);
        return;
      }
      if (action === "skip-instance") {
        this.taskManager.skipRecurringTaskInstance(task.id);
        return;
      }
      if (action === "delete") {
        if (task.recurrenceRule?.type) {
          const choice = await this.showRecurringDeleteDialog(task);
          if (!choice) return;
          if (choice === "series") {
            const confirmed = await this.showConfirm(
              `This will permanently delete "${task.title}" and stop all future recurrences. This cannot be undone.`,
              { title: "Cancel recurring series?", okLabel: "Yes, cancel the series", danger: true }
            );
            if (!confirmed) return;
          }
        } else {
          const confirmed = await this.showConfirm(`Delete "${task.title}"?`, { title: "Delete task", okLabel: "Delete", danger: true });
          if (!confirmed) return;
        }
        this.taskManager.deleteTask(task.id);
      }
    });
  }

  // ─── Multi-select & bulk edit ─────────────────────────────────────────────

  toggleTaskSelection(taskId) {
    if (this.selectedTaskIds.has(taskId)) {
      this.selectedTaskIds.delete(taskId);
    } else {
      this.selectedTaskIds.add(taskId);
    }
    // Sync checked state + is-selected class on any rendered row for this task
    document.querySelectorAll(`.task-row[data-task-id="${CSS.escape(taskId)}"]`).forEach((row) => {
      const checkbox = row.querySelector(".task-row-select input");
      const selected = this.selectedTaskIds.has(taskId);
      row.classList.toggle("is-selected", selected);
      if (checkbox) checkbox.checked = selected;
    });
    this.updateMultiEditBar();
  }

  clearSelection() {
    const ids = Array.from(this.selectedTaskIds);
    this.selectedTaskIds.clear();
    ids.forEach((taskId) => {
      document.querySelectorAll(`.task-row[data-task-id="${CSS.escape(taskId)}"]`).forEach((row) => {
        row.classList.remove("is-selected");
        const checkbox = row.querySelector(".task-row-select input");
        if (checkbox) checkbox.checked = false;
      });
    });
    this.updateMultiEditBar();
  }

  updateMultiEditBar() {
    const { multiEditBar, multiEditCount, multiEditStatus, multiEditProject, multiEditArea } = this.elements;
    if (!multiEditBar) return;
    const count = this.selectedTaskIds.size;
    if (count === 0) {
      multiEditBar.classList.remove("is-visible");
      // Let slide-out animation finish before hiding
      setTimeout(() => {
        if (this.selectedTaskIds.size === 0) multiEditBar.hidden = true;
      }, 260);
      return;
    }
    multiEditBar.hidden = false;
    // Force reflow so the transition fires from the hidden position
    multiEditBar.getBoundingClientRect();
    multiEditBar.classList.add("is-visible");

    if (multiEditCount) {
      multiEditCount.textContent = `${count} task${count === 1 ? "" : "s"} selected`;
    }

    // Populate status options (once — they never change)
    if (multiEditStatus && multiEditStatus.options.length === 1) {
      const statusOrder = [STATUS.INBOX, STATUS.NEXT, STATUS.DOING, STATUS.WAITING, STATUS.SOMEDAY];
      statusOrder.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = STATUS_LABELS[s] || s;
        multiEditStatus.append(opt);
      });
    }

    // Populate project options from current state
    if (multiEditProject) {
      const currentProjectVal = multiEditProject.value;
      while (multiEditProject.options.length > 1) multiEditProject.remove(1);
      const noneOpt = document.createElement("option");
      noneOpt.value = "__none__";
      noneOpt.textContent = "No project";
      multiEditProject.append(noneOpt);
      this.taskManager.getProjects().forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        multiEditProject.append(opt);
      });
      if (currentProjectVal) multiEditProject.value = currentProjectVal;
    }

    // Populate area options from current state
    if (multiEditArea) {
      const currentAreaVal = multiEditArea.value;
      while (multiEditArea.options.length > 1) multiEditArea.remove(1);
      const noneOpt = document.createElement("option");
      noneOpt.value = "__none__";
      noneOpt.textContent = "No area";
      multiEditArea.append(noneOpt);
      this.taskManager.getAreasOfFocus().forEach((area) => {
        const opt = document.createElement("option");
        opt.value = area;
        opt.textContent = area;
        multiEditArea.append(opt);
      });
      if (currentAreaVal) multiEditArea.value = currentAreaVal;
    }
  }

  applyBulkField(field, value) {
    if (!value || !this.selectedTaskIds.size) return;
    const ids = Array.from(this.selectedTaskIds);
    const resolvedValue = value === "__none__" ? null : value;
    ids.forEach((taskId) => {
      this.taskManager.updateTask(taskId, { [field]: resolvedValue });
    });
    this.taskManager.notify("info", `Updated ${ids.length} task${ids.length === 1 ? "" : "s"}.`);
    this.clearSelection();
  }

  setupSidebarToggle() {
    const { sidebar, sidebarToggle } = this.elements;
    if (!sidebar || !sidebarToggle) return;
    const isCollapsed = localStorage.getItem(SIDEBAR_EXPANDED_KEY) !== "true";
    sidebar.classList.toggle("sidebar-collapsed", isCollapsed);
    sidebarToggle.setAttribute("aria-expanded", String(!isCollapsed));
    sidebarToggle.addEventListener("click", () => {
      const collapsed = sidebar.classList.toggle("sidebar-collapsed");
      sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
      try { localStorage.setItem(SIDEBAR_EXPANDED_KEY, String(!collapsed)); } catch (_) {}
    });
  }

  setupMultiEditBar() {
    const { multiEditStatus, multiEditProject, multiEditArea, multiEditClear, multiEditBar } = this.elements;
    if (!multiEditBar) return;

    multiEditStatus?.addEventListener("change", () => {
      if (multiEditStatus.value) {
        this.applyBulkField("status", multiEditStatus.value);
        multiEditStatus.value = "";
      }
    });
    multiEditProject?.addEventListener("change", () => {
      if (multiEditProject.value) {
        this.applyBulkField("projectId", multiEditProject.value);
        multiEditProject.value = "";
      }
    });
    multiEditArea?.addEventListener("change", () => {
      if (multiEditArea.value) {
        this.applyBulkField("areaOfFocus", multiEditArea.value);
        multiEditArea.value = "";
      }
    });
    multiEditClear?.addEventListener("click", () => this.clearSelection());

    // Escape key clears selection when bar is visible
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.selectedTaskIds.size > 0) {
        this.clearSelection();
      }
    });
  }

  // ──────────────────────────────────────────────────────────────────────────

  openTaskContextMenuForTask(taskId, anchor) {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const x = rect.left + Math.min(120, Math.max(20, rect.width * 0.3));
    const y = rect.top + Math.min(rect.height, 36);
    this.openTaskContextMenu(taskId, x, y);
  }

  openTaskContextMenu(taskId, x, y) {
    const menu = this.elements.taskContextMenu;
    if (!menu || !taskId) return;
    const task = this.taskManager.getTaskById(taskId);
    if (!task) return;

    this.closeTaskNoteContextMenu();
    this.closeCalendarDayContextMenu();
    this.contextMenuTaskId = taskId;
    const myDayAction = menu.querySelector('[data-task-menu-action="my-day"]');
    if (myDayAction) {
      myDayAction.textContent = this.isTaskInMyDay(task) ? "Remove from My Day" : "Add to My Day";
    }
    const openProjectAction = menu.querySelector('[data-task-menu-action="open-project"]');
    if (openProjectAction) {
      const hasProject = Boolean(task.projectId);
      openProjectAction.hidden = !hasProject;
      openProjectAction.disabled = !hasProject;
    }
    const skipInstanceAction = menu.querySelector('[data-task-menu-action="skip-instance"]');
    if (skipInstanceAction) {
      const isRecurring = Boolean(task.recurrenceRule?.type);
      skipInstanceAction.hidden = !isRecurring;
      skipInstanceAction.disabled = !isRecurring;
    }

    menu.hidden = false;
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
    this.positionTaskContextMenu(x, y);
    this.bindTaskContextMenuDismiss();
  }

  positionTaskContextMenu(x, y) {
    this.positionFloatingMenu(this.elements.taskContextMenu, x, y);
  }

  positionFloatingMenu(menu, x, y) {
    if (!menu) return;
    const viewportPadding = 8;
    const rect = menu.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - viewportPadding;
    const maxY = window.innerHeight - rect.height - viewportPadding;
    const left = Math.max(viewportPadding, Math.min(x, maxX));
    const top = Math.max(viewportPadding, Math.min(y, maxY));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  bindTaskContextMenuDismiss() {
    if (this.contextMenuHandlersBound) return;
    this.handleTaskMenuDismiss = (event) => {
      const menu = this.elements.taskContextMenu;
      if (!menu) return;
      if (event?.target instanceof Node && menu.contains(event.target)) return;
      this.closeTaskContextMenu();
    };
    this.handleTaskMenuEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      this.closeTaskContextMenu();
    };
    document.addEventListener("pointerdown", this.handleTaskMenuDismiss, true);
    document.addEventListener("scroll", this.handleTaskMenuDismiss, true);
    window.addEventListener("resize", this.handleTaskMenuDismiss);
    document.addEventListener("keydown", this.handleTaskMenuEscape);
    this.contextMenuHandlersBound = true;
  }

  closeTaskContextMenu() {
    const menu = this.elements.taskContextMenu;
    if (menu) {
      menu.classList.remove("is-open");
      menu.setAttribute("aria-hidden", "true");
      menu.hidden = true;
      menu.style.left = "";
      menu.style.top = "";
    }
    this.contextMenuTaskId = null;
    if (this.contextMenuHandlersBound) {
      document.removeEventListener("pointerdown", this.handleTaskMenuDismiss, true);
      document.removeEventListener("scroll", this.handleTaskMenuDismiss, true);
      window.removeEventListener("resize", this.handleTaskMenuDismiss);
      document.removeEventListener("keydown", this.handleTaskMenuEscape);
      this.contextMenuHandlersBound = false;
    }
  }

  setupTaskNoteContextMenu() {
    const menu = this.elements.taskNoteContextMenu;
    if (!menu) return;
    menu.addEventListener("click", async (event) => {
      const actionButton = event.target.closest("[data-note-menu-action]");
      if (!actionButton) return;
      const action = actionButton.dataset.noteMenuAction;
      const context = this.resolveTaskNoteContext();
      this.closeTaskNoteContextMenu();
      if (!context) return;
      if (action === "edit") {
        const nextText = await this.showPrompt("Edit note", context.note.text || "", { multiline: true });
        if (nextText === null) return;
        const trimmed = nextText.trim();
        if (!trimmed) {
          this.taskManager.notify("warn", "Note cannot be empty.");
          return;
        }
        if (trimmed === context.note.text) return;
        const updated = context.isArchived
          ? this.taskManager.updateCompletedTaskNote(context.archiveEntryId, context.note.id, trimmed)
          : this.taskManager.updateTaskNote(context.taskId, context.note.id, trimmed);
        if (updated) {
          this.ensureMentionedEntitiesExist(trimmed);
          this.taskManager.notify("info", "Note updated.");
        }
        return;
      }
      if (action === "delete") {
        const confirmed = await this.showConfirm("Delete this note?", { title: "Delete note", okLabel: "Delete", danger: true });
        if (!confirmed) return;
        const deleted = context.isArchived
          ? this.taskManager.deleteCompletedTaskNote(context.archiveEntryId, context.note.id)
          : this.taskManager.deleteTaskNote(context.taskId, context.note.id);
        if (deleted) {
          this.taskManager.notify("info", "Note deleted.");
        }
      }
    });
  }

  resolveTaskNoteContext() {
    const state = this.noteContextMenuState;
    if (!state?.noteId) return null;
    if (state.archiveEntryId) {
      const entry = this.taskManager.getCompletedTaskById(state.archiveEntryId, { includeDeleted: true });
      if (!entry) return null;
      const note = Array.isArray(entry.notes) ? entry.notes.find((item) => item?.id === state.noteId) : null;
      if (!note) return null;
      return {
        ...state,
        note,
        isArchived: true,
      };
    }
    const task = state.taskId ? this.taskManager.getTaskById(state.taskId) : null;
    if (!task) return null;
    const note = Array.isArray(task.notes) ? task.notes.find((item) => item?.id === state.noteId) : null;
    if (!note) return null;
    return {
      ...state,
      note,
      isArchived: false,
    };
  }

  openTaskNoteContextMenu(noteContext, x, y) {
    const menu = this.elements.taskNoteContextMenu;
    if (!menu || !noteContext?.noteId) return;
    if (!noteContext.taskId && !noteContext.archiveEntryId) return;
    this.closeTaskContextMenu();
    this.closeCalendarDayContextMenu();
    this.noteContextMenuState = {
      taskId: noteContext.taskId || null,
      archiveEntryId: noteContext.archiveEntryId || null,
      noteId: noteContext.noteId,
    };
    menu.hidden = false;
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
    this.positionFloatingMenu(menu, x, y);
    this.bindTaskNoteContextMenuDismiss();
  }

  bindTaskNoteContextMenuDismiss() {
    if (this.noteContextMenuHandlersBound) return;
    this.handleNoteMenuDismiss = (event) => {
      const menu = this.elements.taskNoteContextMenu;
      if (!menu) return;
      if (event?.target instanceof Node && menu.contains(event.target)) return;
      this.closeTaskNoteContextMenu();
    };
    this.handleNoteMenuEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      this.closeTaskNoteContextMenu();
    };
    document.addEventListener("pointerdown", this.handleNoteMenuDismiss, true);
    document.addEventListener("scroll", this.handleNoteMenuDismiss, true);
    window.addEventListener("resize", this.handleNoteMenuDismiss);
    document.addEventListener("keydown", this.handleNoteMenuEscape);
    this.noteContextMenuHandlersBound = true;
  }

  closeTaskNoteContextMenu() {
    const menu = this.elements.taskNoteContextMenu;
    if (menu) {
      menu.classList.remove("is-open");
      menu.setAttribute("aria-hidden", "true");
      menu.hidden = true;
      menu.style.left = "";
      menu.style.top = "";
    }
    this.noteContextMenuState = null;
    if (this.noteContextMenuHandlersBound) {
      document.removeEventListener("pointerdown", this.handleNoteMenuDismiss, true);
      document.removeEventListener("scroll", this.handleNoteMenuDismiss, true);
      window.removeEventListener("resize", this.handleNoteMenuDismiss);
      document.removeEventListener("keydown", this.handleNoteMenuEscape);
      this.noteContextMenuHandlersBound = false;
    }
  }

  setupTaskListItemContextMenu() {
    const menu = this.elements.taskListItemContextMenu;
    if (!menu) return;
    menu.addEventListener("click", async (event) => {
      const actionButton = event.target.closest("[data-list-item-action]");
      if (!actionButton) return;
      const action = actionButton.dataset.listItemAction;
      const state = this.listItemContextMenuState;
      this.closeTaskListItemContextMenu();
      if (!state?.taskId || !state?.itemId) return;
      if (action === "edit") {
        const task = this.taskManager.getTaskById(state.taskId);
        const item = Array.isArray(task?.listItems) ? task.listItems.find((i) => i?.id === state.itemId) : null;
        if (!item) return;
        const nextText = await this.showPrompt("Edit list item", item.text || "");
        if (nextText === null) return;
        const trimmed = nextText.trim();
        if (!trimmed) {
          this.taskManager.notify("warn", "List item cannot be empty.");
          return;
        }
        if (trimmed !== item.text) {
          this.taskManager.updateTaskListItem(state.taskId, state.itemId, trimmed);
        }
        return;
      }
      if (action === "delete") {
        const confirmed = await this.showConfirm("Delete this list item?", { title: "Delete item", okLabel: "Delete", danger: true });
        if (!confirmed) return;
        this.taskManager.deleteTaskListItem(state.taskId, state.itemId);
      }
    });
  }

  openTaskListItemContextMenu(taskId, itemId, x, y) {
    const menu = this.elements.taskListItemContextMenu;
    if (!menu || !taskId || !itemId) return;
    this.closeTaskContextMenu();
    this.closeTaskNoteContextMenu();
    this.closeCalendarDayContextMenu();
    this.listItemContextMenuState = { taskId, itemId };
    menu.hidden = false;
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
    this.positionFloatingMenu(menu, x, y);
    this.bindTaskListItemContextMenuDismiss();
  }

  bindTaskListItemContextMenuDismiss() {
    if (this.listItemContextMenuHandlersBound) return;
    this.handleListItemMenuDismiss = (event) => {
      const menu = this.elements.taskListItemContextMenu;
      if (!menu) return;
      if (event?.target instanceof Node && menu.contains(event.target)) return;
      this.closeTaskListItemContextMenu();
    };
    this.handleListItemMenuEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      this.closeTaskListItemContextMenu();
    };
    document.addEventListener("pointerdown", this.handleListItemMenuDismiss, true);
    document.addEventListener("scroll", this.handleListItemMenuDismiss, true);
    window.addEventListener("resize", this.handleListItemMenuDismiss);
    document.addEventListener("keydown", this.handleListItemMenuEscape);
    this.listItemContextMenuHandlersBound = true;
  }

  closeTaskListItemContextMenu() {
    const menu = this.elements.taskListItemContextMenu;
    if (menu) {
      menu.classList.remove("is-open");
      menu.setAttribute("aria-hidden", "true");
      menu.hidden = true;
      menu.style.left = "";
      menu.style.top = "";
    }
    this.listItemContextMenuState = null;
    if (this.listItemContextMenuHandlersBound) {
      document.removeEventListener("pointerdown", this.handleListItemMenuDismiss, true);
      document.removeEventListener("scroll", this.handleListItemMenuDismiss, true);
      window.removeEventListener("resize", this.handleListItemMenuDismiss);
      document.removeEventListener("keydown", this.handleListItemMenuEscape);
      this.listItemContextMenuHandlersBound = false;
    }
  }

  createTaskListSection(task, { readOnly = false } = {}) {
    const section = document.createElement("section");
    section.className = "task-list-section";

    // Header row — always visible
    const header = document.createElement("div");
    header.className = "task-list-header";
    const title = document.createElement("h3");
    title.textContent = "List";
    const count = document.createElement("span");
    count.className = "muted small-text";

    // Collapsible body — list + form
    const body = document.createElement("div");
    body.className = "task-list-body";

    const list = document.createElement("ul");
    list.className = "task-list-items";

    const setExpanded = (expanded) => {
      body.hidden = !expanded;
      toggleBtn.setAttribute("aria-expanded", String(expanded));
      toggleBtn.classList.toggle("is-active", expanded);
    };

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "btn btn-icon task-list-toggle";
    toggleBtn.setAttribute("aria-label", "Toggle list");
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.textContent = "☰";
    header.style.cursor = "pointer";
    header.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (btn && btn !== toggleBtn) return;
      const willExpand = body.hidden;
      setExpanded(willExpand);
      if (willExpand && !readOnly) {
        textarea?.focus();
      }
    });

    const renderItems = () => {
      list.innerHTML = "";
      const currentTask = readOnly ? task : (this.taskManager.getTaskById(task.id) || task);
      const currentItems = Array.isArray(currentTask.listItems) ? currentTask.listItems : [];
      const doneNow = currentItems.filter((i) => i.done).length;
      count.textContent = currentItems.length ? `${doneNow}/${currentItems.length} done` : "";

      // Auto-expand when items exist; keep collapsed when empty
      if (currentItems.length && body.hidden) {
        setExpanded(true);
      }

      currentItems.forEach((item) => {
        const li = document.createElement("li");
        li.className = "task-list-item" + (item.done ? " task-list-item--done" : "");
        li.dataset.itemId = item.id;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = item.done;
        checkbox.setAttribute("aria-label", item.text);
        if (!readOnly) {
          checkbox.addEventListener("click", (e) => {
            e.stopPropagation();
            this.taskManager.toggleTaskListItem(task.id, item.id);
          });
        } else {
          checkbox.disabled = true;
        }

        const text = document.createElement("p");
        text.className = "task-list-item-text";
        text.textContent = item.text;

        li.append(checkbox, text);

        if (!readOnly) {
          li.addEventListener("click", (e) => {
            if (e.target === checkbox) return;
            this.taskManager.toggleTaskListItem(task.id, item.id);
          });
          li.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.openTaskListItemContextMenu(task.id, item.id, e.clientX, e.clientY);
          });
        }

        list.append(li);
      });
    };

    const initialItems = Array.isArray(task.listItems) ? task.listItems : [];
    body.hidden = initialItems.length === 0;
    toggleBtn.setAttribute("aria-expanded", String(initialItems.length > 0));
    toggleBtn.classList.toggle("is-active", initialItems.length > 0);
    renderItems();

    // Re-render list when task changes
    if (!readOnly) {
      const onTaskChange = () => {
        const updated = this.taskManager.getTaskById(task.id);
        if (!updated) return;
        renderItems();
      };
      this.taskManager.addEventListener("change", onTaskChange);
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.removedNodes) {
            if (node === section || (node instanceof Element && node.contains(section))) {
              this.taskManager.removeEventListener("change", onTaskChange);
              observer.disconnect();
            }
          }
        }
      });
      const attachObserver = () => {
        if (section.parentElement) {
          observer.observe(section.parentElement, { childList: true, subtree: true });
        } else {
          requestAnimationFrame(attachObserver);
        }
      };
      requestAnimationFrame(attachObserver);
    }

    header.append(title, count, toggleBtn);
    body.append(list);
    section.append(header, body);

    if (readOnly) return section;

    const form = document.createElement("form");
    form.className = "task-list-add-form";
    form.setAttribute("aria-label", "Add list items");
    const textarea = document.createElement("textarea");
    textarea.rows = 2;
    textarea.placeholder = "Add items — one per line";
    const actions = document.createElement("div");
    actions.className = "task-list-add-actions";
    const addButton = document.createElement("button");
    addButton.type = "submit";
    addButton.className = "btn btn-light";
    addButton.textContent = "Add";
    actions.append(addButton);
    form.append(textarea, actions);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const lines = textarea.value.split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return;
      const added = this.taskManager.addTaskListItems(task.id, lines);
      if (added) {
        textarea.value = "";
        textarea.focus();
      }
    });
    body.append(form);
    return section;
  }

  setupCalendarDayContextMenu() {
    const menu = this.elements.calendarDayContextMenu;
    if (!menu) return;
    menu.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-calendar-day-action]");
      if (!actionButton) return;
      const dateKey = this.calendarDayContextMenuDate;
      const action = actionButton.dataset.calendarDayAction;
      this.closeCalendarDayContextMenu();
      if (!dateKey) return;
      if (action === "add-task") {
        this.promptCalendarTaskCreate(dateKey);
      }
    });
  }

  openCalendarDayContextMenu(dateKey, x, y) {
    const menu = this.elements.calendarDayContextMenu;
    if (!menu || !dateKey) return;
    this.closeTaskNoteContextMenu();
    this.closeTaskContextMenu();
    this.calendarDayContextMenuDate = dateKey;
    menu.hidden = false;
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
    this.positionFloatingMenu(menu, x, y);
    this.bindCalendarDayContextMenuDismiss();
  }

  bindCalendarDayContextMenuDismiss() {
    if (this.calendarDayContextMenuHandlersBound) return;
    this.handleCalendarDayMenuDismiss = (event) => {
      const menu = this.elements.calendarDayContextMenu;
      if (!menu) return;
      if (event?.target instanceof Node && menu.contains(event.target)) return;
      this.closeCalendarDayContextMenu();
    };
    this.handleCalendarDayMenuEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      this.closeCalendarDayContextMenu();
    };
    document.addEventListener("pointerdown", this.handleCalendarDayMenuDismiss, true);
    document.addEventListener("scroll", this.handleCalendarDayMenuDismiss, true);
    window.addEventListener("resize", this.handleCalendarDayMenuDismiss);
    document.addEventListener("keydown", this.handleCalendarDayMenuEscape);
    this.calendarDayContextMenuHandlersBound = true;
  }

  closeCalendarDayContextMenu() {
    const menu = this.elements.calendarDayContextMenu;
    if (menu) {
      menu.classList.remove("is-open");
      menu.setAttribute("aria-hidden", "true");
      menu.hidden = true;
      menu.style.left = "";
      menu.style.top = "";
    }
    this.calendarDayContextMenuDate = null;
    if (this.calendarDayContextMenuHandlersBound) {
      document.removeEventListener("pointerdown", this.handleCalendarDayMenuDismiss, true);
      document.removeEventListener("scroll", this.handleCalendarDayMenuDismiss, true);
      window.removeEventListener("resize", this.handleCalendarDayMenuDismiss);
      document.removeEventListener("keydown", this.handleCalendarDayMenuEscape);
      this.calendarDayContextMenuHandlersBound = false;
    }
  }

  async promptCalendarTaskCreate(dateKey) {
    const dateLabel = formatFriendlyDate(dateKey);
    const title = await this.showPrompt(`New task for ${dateLabel}:`);
    if (title === null) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      this.taskManager.notify("warn", "Task title cannot be empty.");
      return;
    }
    const created = this.taskManager.addTask({
      title: trimmedTitle,
      status: STATUS.INBOX,
      calendarDate: dateKey,
    });
    if (!created) return;
  }

  setupContextColumnContextMenu() {
    const menu = this.elements.contextColumnContextMenu;
    if (!menu) return;
    menu.addEventListener("click", async (event) => {
      const actionButton = event.target.closest("[data-col-action]");
      if (!actionButton) return;
      const action = actionButton.dataset.colAction;
      const state = this.contextColumnMenuState;
      this.closeContextColumnContextMenu();
      if (!state) return;
      if (action === "add-task") {
        this.promptContextColumnTaskCreate(state, STATUS.NEXT);
      } else if (action === "add-to-inbox") {
        this.promptContextColumnTaskCreate(state, STATUS.INBOX);
      }
    });
  }

  openContextColumnContextMenu(groupKey, groupBy, groupLabel, x, y) {
    const menu = this.elements.contextColumnContextMenu;
    if (!menu) return;
    this.closeTaskContextMenu();
    this.closeTaskNoteContextMenu();
    this.closeCalendarDayContextMenu();
    this.contextColumnMenuState = { groupKey, groupBy, groupLabel };

    // Update the "add task here" label to reflect the group
    const addHereBtn = menu.querySelector("[data-col-action='add-task']");
    if (addHereBtn) {
      addHereBtn.textContent = groupBy === "none" ? "Add next action" : `Add to "${groupLabel}"`;
    }

    menu.hidden = false;
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
    this.positionFloatingMenu(menu, x, y);
    this.bindContextColumnContextMenuDismiss();
  }

  bindContextColumnContextMenuDismiss() {
    if (this.contextColumnMenuHandlersBound) return;
    this.handleContextColumnMenuDismiss = (event) => {
      const menu = this.elements.contextColumnContextMenu;
      if (!menu) return;
      if (event?.target instanceof Node && menu.contains(event.target)) return;
      this.closeContextColumnContextMenu();
    };
    this.handleContextColumnMenuEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      this.closeContextColumnContextMenu();
    };
    document.addEventListener("pointerdown", this.handleContextColumnMenuDismiss, true);
    document.addEventListener("scroll", this.handleContextColumnMenuDismiss, true);
    window.addEventListener("resize", this.handleContextColumnMenuDismiss);
    document.addEventListener("keydown", this.handleContextColumnMenuEscape);
    this.contextColumnMenuHandlersBound = true;
  }

  closeContextColumnContextMenu() {
    const menu = this.elements.contextColumnContextMenu;
    if (menu) {
      menu.classList.remove("is-open");
      menu.setAttribute("aria-hidden", "true");
      menu.hidden = true;
      menu.style.left = "";
      menu.style.top = "";
    }
    this.contextColumnMenuState = null;
    if (this.contextColumnMenuHandlersBound) {
      document.removeEventListener("pointerdown", this.handleContextColumnMenuDismiss, true);
      document.removeEventListener("scroll", this.handleContextColumnMenuDismiss, true);
      window.removeEventListener("resize", this.handleContextColumnMenuDismiss);
      document.removeEventListener("keydown", this.handleContextColumnMenuEscape);
      this.contextColumnMenuHandlersBound = false;
    }
  }

  async promptContextColumnTaskCreate({ groupKey, groupBy, groupLabel }, status) {
    const label = groupBy === "none" ? "new next action" : `task in "${groupLabel}"`;
    const title = await this.showPrompt(`Add ${label}:`);
    if (title === null) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      this.taskManager.notify("warn", "Task title cannot be empty.");
      return;
    }
    const payload = { title: trimmedTitle, status };
    if (status === STATUS.NEXT) {
      if (groupBy === "context") payload.contexts = [groupKey];
      else if (groupBy === "project") payload.projectId = groupKey;
      else if (groupBy === "area") payload.areaOfFocus = groupKey === "No Area" ? null : groupKey;
      else if (groupBy === "effort") payload.effortLevel = groupKey === "no-effort" ? null : groupKey;
    }
    this.taskManager.addTask(payload);
  }

  openProjectFromTask(task) {
    if (!task?.projectId) {
      this.taskManager.notify("warn", "This task is not linked to a project.");
      return;
    }
    const projectId = task.projectId;
    const project = this.getProjectCache().find((item) => item.id === projectId);
    if (!project) {
      this.setActivePanel("projects");
      this.taskManager.notify("warn", "Linked project no longer exists.");
      return;
    }
    this.setActivePanel("projects");
    this.openProjectFlyout(projectId);
  }

  focusProjectCard(projectId) {
    if (!projectId) return;
    requestAnimationFrame(() => {
      const row = document.querySelector(`.project-row[data-project-id="${projectId}"]`);
      if (!row) return;
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      row.focus({ preventScroll: true });
    });
  }

  setupFlyout() {
    const flyout = this.elements.taskFlyout;
    if (!flyout) return;
    const closeButton = this.elements.closeTaskFlyout;
    const backdrop = this.elements.taskFlyoutBackdrop;
    closeButton?.addEventListener("click", () => this.closeTaskFlyout());
    backdrop?.addEventListener("click", () => this.closeTaskFlyout());
    this.elements.taskFlyoutPrev?.addEventListener("click", () => this.navigateFlyout(-1));
    this.elements.taskFlyoutNext?.addEventListener("click", () => this.navigateFlyout(1));
    this.handleFlyoutKeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeTaskFlyout();
        return;
      }
      if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowLeft")) {
        event.preventDefault();
        this.navigateFlyout(-1);
      } else if (event.altKey && (event.key === "ArrowDown" || event.key === "ArrowRight")) {
        event.preventDefault();
        this.navigateFlyout(1);
      }
    };
  }

  getFlyoutTaskIds() {
    const activePanel = document.querySelector(".workspace-view.is-active");
    if (!activePanel) return [];
    return Array.from(activePanel.querySelectorAll("[data-task-id]"))
      .map((el) => el.dataset.taskId)
      .filter(Boolean);
  }

  navigateFlyout(direction) {
    if (!this.currentFlyoutTaskId || this.flyoutContext?.readOnly) return;
    const taskIds = this.getFlyoutTaskIds();
    const currentIndex = taskIds.indexOf(this.currentFlyoutTaskId);
    if (currentIndex === -1) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= taskIds.length) return;
    this.openTaskFlyout(taskIds[nextIndex]);
  }

  setupFeedbackWidget() {
    const toggle = document.getElementById("feedbackToggle");
    const popover = document.getElementById("feedbackPopover");
    const closeBtn = document.getElementById("feedbackClose");
    const form = document.getElementById("feedbackForm");
    const textarea = document.getElementById("feedbackDescription");
    if (!toggle || !popover || !form) return;

    const setOpen = (open) => {
      popover.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? "×" : "+";
      if (open) textarea?.focus();
    };

    toggle.addEventListener("click", () => setOpen(popover.hidden));
    closeBtn?.addEventListener("click", () => setOpen(false));

    document.addEventListener("click", (event) => {
      if (!popover.hidden && !event.target.closest("#feedbackWidget")) {
        setOpen(false);
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const type = data.get("feedbackType");
      const description = textarea.value.trim();
      if (!type || !description) return;
      const submitBtn = form.querySelector(".feedback-submit");
      submitBtn.disabled = true;
      const item = {
        type,
        description,
        panel: this.activePanel || "",
        createdAt: new Date().toISOString(),
      };
      try {
        const response = await fetch("/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
        if (!response.ok) throw new Error("Submit failed");
        form.reset();
        setOpen(false);
        this.showToast("info", "Feedback received. Thanks!");
        this._dirtyPanels.add("backlog");
        if (this.activePanel === "backlog") this._renderPanelIfDirty("backlog");
      } catch {
        this._enqueueFeedback(item);
        form.reset();
        setOpen(false);
        this.showToast("warn", "Offline — feedback saved and will send when reconnected.");
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  _enqueueFeedback(item) {
    const QUEUE_KEY = "nextflow-feedback-queue";
    let queue = [];
    try { queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { /* ignore */ }
    queue.push(item);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }

  async _flushFeedbackQueue() {
    if (!this.isAdmin) return;
    const QUEUE_KEY = "nextflow-feedback-queue";
    let queue = [];
    try { queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return; }
    if (!queue.length) return;
    const remaining = [];
    for (const item of queue) {
      try {
        const response = await fetch("/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
        if (!response.ok) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    if (remaining.length < queue.length) {
      const sent = queue.length - remaining.length;
      this.showToast("info", `Sent ${sent} queued feedback item${sent === 1 ? "" : "s"}.`);
    }
    if (remaining.length) {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    } else {
      localStorage.removeItem(QUEUE_KEY);
    }
  }

  setupLightbox() {
    const dialog = document.getElementById("lightboxDialog");
    const img = document.getElementById("lightboxImg");
    if (!dialog || !img) return;

    // --- pinch-zoom state ---
    let scale = 1;
    let originX = 0; // transform origin within the image (px from top-left)
    let originY = 0;
    let panX = 0;
    let panY = 0;
    let lastPinchDist = null;
    let lastPanX = null;
    let lastPanY = null;
    const MIN_SCALE = 1;
    const MAX_SCALE = 8;

    const applyTransform = () => {
      img.style.transformOrigin = `${originX}px ${originY}px`;
      img.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    };

    const resetTransform = () => {
      scale = 1; originX = 0; originY = 0; panX = 0; panY = 0;
      lastPinchDist = null; lastPanX = null; lastPanY = null;
      img.style.transform = "";
      img.style.transformOrigin = "";
    };

    const pinchDist = (touches) =>
      Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

    const pinchMidpoint = (touches) => ({
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    });

    dialog.addEventListener("touchstart", (event) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        lastPinchDist = pinchDist(event.touches);
        const mid = pinchMidpoint(event.touches);
        const rect = img.getBoundingClientRect();
        // Set transform origin to the pinch midpoint relative to the image
        originX = (mid.x - rect.left) / scale;
        originY = (mid.y - rect.top) / scale;
        lastPanX = null;
      } else if (event.touches.length === 1 && scale > 1) {
        event.preventDefault();
        lastPanX = event.touches[0].clientX;
        lastPanY = event.touches[0].clientY;
      }
    }, { passive: false });

    dialog.addEventListener("touchmove", (event) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        const dist = pinchDist(event.touches);
        if (lastPinchDist !== null) {
          const ratio = dist / lastPinchDist;
          scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * ratio));
        }
        lastPinchDist = dist;
        applyTransform();
      } else if (event.touches.length === 1 && scale > 1 && lastPanX !== null) {
        event.preventDefault();
        panX += event.touches[0].clientX - lastPanX;
        panY += event.touches[0].clientY - lastPanY;
        lastPanX = event.touches[0].clientX;
        lastPanY = event.touches[0].clientY;
        applyTransform();
      }
    }, { passive: false });

    dialog.addEventListener("touchend", (event) => {
      if (event.touches.length < 2) lastPinchDist = null;
      if (event.touches.length === 0) {
        // Reset pan origin tracking
        lastPanX = null;
        // Snap back to fit if over-zoomed out
        if (scale <= MIN_SCALE) resetTransform();
      }
    });

    // Event delegation — works for all .note-image elements rendered at any time
    document.addEventListener("click", (event) => {
      const target = event.target.closest(".note-image");
      if (!target) return;
      img.src = target.src;
      img.alt = target.alt;
      resetTransform();
      dialog.showModal();
    });

    // Click on backdrop (outside the image) closes the dialog
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });

    // Clear src and transform after close
    dialog.addEventListener("close", () => {
      img.src = "";
      resetTransform();
    });
  }

  bindClarifyModal() {
    const {
      clarifyModal,
      closeClarifyModal,
      clarifyBackdrop,
      clarifyActionableYes,
      clarifyActionSingle,
      clarifyActionAddExisting,
      clarifyConvertProject,
      clarifyTwoMinuteYes,
      clarifyTwoMinuteNo,
      clarifyTwoMinuteFollowup,
      clarifyTwoMinuteExpectNo,
      clarifyWhoSelf,
      clarifyWhoDelegate,
      clarifyDelegateNameInput,
      clarifyDateOptionSpecific,
      clarifyDateOptionDue,
      clarifyDateOptionNone,
      clarifyProjectSelect,
      clarifyProjectPicker,
      clarifyEffortSelect,
      clarifyTimeSelect,
      clarifyAddContext,
      clarifyAddPerson,
      clarifyPreviewText,
      clarifyRecurrenceType,
      clarifyRecurrenceInterval,
    } = this.elements;
    if (!clarifyModal) return;
    this.handleClarifyKeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeClarifyModal();
      }
    };
    closeClarifyModal?.addEventListener("click", () => this.closeClarifyModal());
    clarifyBackdrop?.addEventListener("click", () => this.closeClarifyModal());

    // Helper: toggle is-selected among a button group
    const selectChoice = (group, chosen) => {
      group.forEach((btn) => btn?.classList.toggle("is-selected", btn === chosen));
    };
    const projectChoices = [clarifyActionSingle, clarifyActionAddExisting, clarifyConvertProject];
    const twoMinChoices = [clarifyTwoMinuteNo, clarifyTwoMinuteYes];
    const whoChoices = [clarifyWhoSelf, clarifyWhoDelegate];

    // Non-action destinations (Someday, Trash)
    this.clarifyDestinationButtons = Array.from(
      clarifyModal.querySelectorAll("[data-clarify-nonaction]")
    );
    this.clarifyDestinationButtons.forEach((button) => {
      button.addEventListener("click", () =>
        this.handleClarifyNonAction(button.dataset.clarifyNonaction)
      );
    });

    // Actionable Yes — collapse the question, show the form
    clarifyActionableYes?.addEventListener("click", () => {
      this.handleClarifyActionableChoice(true);
      this.clarifyState.actionableConfirmed = true;
      const fields = document.getElementById("clarifyActionableFields");
      if (fields) fields.hidden = false;
      const question = document.getElementById("clarifyActionableQuestion");
      if (question) question.hidden = true;
      const summary = document.getElementById("clarifyActionableSummary");
      if (this.elements.clarifyTitleSummary) {
        const task = this.clarifyState.taskId ? this.taskManager.getTaskById(this.clarifyState.taskId) : null;
        this.elements.clarifyTitleSummary.textContent = this.clarifyState.previewText || task?.title || "";
        this.elements.clarifyDescSummary.textContent = task?.description || "";
      }
      if (summary) summary.hidden = false;
      if (this.elements.clarifyFooter) this.elements.clarifyFooter.hidden = false;
      this.showClarifySegment("time");
      this.renderClaritySummary();
    });

    // Breadcrumb segment navigation
    clarifyModal.querySelectorAll("[data-clarify-step]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.showClarifySegment(btn.dataset.clarifyStep);
      });
    });

    // Re-render summary rail on any field change inside the actionable form
    const actionableFields = document.getElementById("clarifyActionableFields");
    if (actionableFields) {
      actionableFields.addEventListener("change", () => this.renderClaritySummary());
      actionableFields.addEventListener("input", () => this.renderClaritySummary());
      actionableFields.addEventListener("click", () => {
        // delay one tick so handlers update state first
        setTimeout(() => this.renderClaritySummary(), 0);
      });
    }

    // Cmd/Ctrl+Enter routes; arrow keys move between segments while modal open
    const segmentOrder = ["time", "who", "project", "when", "details"];
    this._clarifyExtraKeydown = (event) => {
      if (!clarifyModal.classList.contains("is-open")) return;
      const target = event.target;
      const inEditable = target instanceof HTMLElement && (target.isContentEditable
        || target.tagName === "TEXTAREA"
        || (target.tagName === "INPUT" && target.type !== "radio" && target.type !== "checkbox"));
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        document.getElementById("clarifyDoneButton")?.click();
        return;
      }
      if (inEditable) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        const current = segmentOrder.indexOf(this.clarifyState.activeSegment || "time");
        if (current === -1) return;
        const next = event.key === "ArrowRight"
          ? Math.min(current + 1, segmentOrder.length - 1)
          : Math.max(current - 1, 0);
        if (next !== current) {
          event.preventDefault();
          this.showClarifySegment(segmentOrder[next]);
        }
      }
    };
    document.addEventListener("keydown", this._clarifyExtraKeydown);

    // Project section
    clarifyActionSingle?.addEventListener("click", () => {
      selectChoice(projectChoices, clarifyActionSingle);
      if (clarifyProjectPicker) clarifyProjectPicker.hidden = true;
      this.clarifyState.projectId = null;
      this.clarifyState.projectName = "";
    });
    clarifyActionAddExisting?.addEventListener("click", () => {
      selectChoice(projectChoices, clarifyActionAddExisting);
      this.showClarifyProjectPicker();
    });
    clarifyConvertProject?.addEventListener("click", () => {
      selectChoice(projectChoices, clarifyConvertProject);
      this.handleClarifyConvertToProject();
    });

    // 2-minute section
    clarifyTwoMinuteNo?.addEventListener("click", () => {
      selectChoice(twoMinChoices, clarifyTwoMinuteNo);
      if (clarifyTwoMinuteFollowup) clarifyTwoMinuteFollowup.hidden = true;
      const normalFields = document.getElementById("clarifyNormalActionFields");
      if (normalFields) normalFields.hidden = false;
      this.showClarifySegment("who");
    });
    clarifyTwoMinuteYes?.addEventListener("click", () => {
      selectChoice(twoMinChoices, clarifyTwoMinuteYes);
      this.handleClarifyTwoMinuteYes();
      const normalFields = document.getElementById("clarifyNormalActionFields");
      if (normalFields) normalFields.hidden = true;
    });
    clarifyTwoMinuteExpectNo?.addEventListener("click", () => this.handleTwoMinuteFollowup());

    // Who section
    clarifyWhoSelf?.addEventListener("click", () => {
      selectChoice(whoChoices, clarifyWhoSelf);
      this.clarifyState.whoChoice = "self";
      const row = document.getElementById("clarifyDelegateRow");
      if (row) row.hidden = true;
      this._applyDelegateBranchVisibility(false);
    });
    clarifyWhoDelegate?.addEventListener("click", () => {
      selectChoice(whoChoices, clarifyWhoDelegate);
      this.clarifyState.whoChoice = "delegate";
      const row = document.getElementById("clarifyDelegateRow");
      if (row) {
        row.hidden = false;
        this._populateDelegateSuggestions();
        clarifyDelegateNameInput?.focus();
      }
      this._applyDelegateBranchVisibility(true);
    });

    // Inline new-project name input
    const newProjectInput = this.elements.clarifyNewProjectNameInput;
    const finalizeNewProject = () => {
      const name = newProjectInput?.value?.trim();
      if (!name) return;
      const project = this.taskManager.addProject(name);
      if (!project) return;
      this.clarifyState.projectId = project.id;
      this.clarifyState.projectName = project.name;
      if (this.elements.clarifyNewProjectInline) this.elements.clarifyNewProjectInline.hidden = true;
      if (this.elements.clarifyProjectPicker) this.elements.clarifyProjectPicker.hidden = false;
      this.populateProjectSelect();
      if (this.elements.clarifyProjectSelect) this.elements.clarifyProjectSelect.value = project.id;
      newProjectInput.value = "";
      this.taskManager.notify("info", `Created project "${project.name}".`);
    };
    newProjectInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finalizeNewProject();
      } else if (event.key === "Escape") {
        if (this.elements.clarifyNewProjectInline) this.elements.clarifyNewProjectInline.hidden = true;
        newProjectInput.value = "";
      }
    });
    newProjectInput?.addEventListener("blur", () => {
      if (newProjectInput.value.trim()) finalizeNewProject();
    });

    clarifyDelegateNameInput?.addEventListener("input", () => {
      this.clarifyState.waitingFor = clarifyDelegateNameInput.value.trim();
      this._showClarifyDelegateSuggestions(clarifyDelegateNameInput);
    });
    clarifyDelegateNameInput?.addEventListener("blur", () => {
      window.setTimeout(() => {
        const dropdown = document.getElementById("clarifyDelegateDropdown");
        if (dropdown) dropdown.hidden = true;
      }, 120);
    });

    // Date radios — show/hide date inputs inline and sync state
    const clarifyDateOptionFollowUp = this.elements.clarifyDateOptionFollowUp;
    const updateDateInputs = () => {
      const specificFields = document.getElementById("clarifySpecificDateFields");
      const dueDateFields = document.getElementById("clarifyDueDateFields");
      const followUpFields = this.elements.clarifyFollowUpFields;
      if (specificFields) specificFields.hidden = !clarifyDateOptionSpecific?.checked;
      if (dueDateFields) dueDateFields.hidden = !clarifyDateOptionDue?.checked;
      if (followUpFields) followUpFields.hidden = !clarifyDateOptionFollowUp?.checked;
      if (clarifyDateOptionSpecific?.checked) {
        this.clarifyState.dueType = "calendar";
      } else if (clarifyDateOptionDue?.checked) {
        this.clarifyState.dueType = "due";
      } else if (clarifyDateOptionFollowUp?.checked) {
        this.clarifyState.dueType = "followUp";
      } else {
        this.clarifyState.dueType = "none";
        this.clarifyState.calendarDate = "";
        this.clarifyState.calendarTime = "";
        this.clarifyState.dueDate = "";
        this.clarifyState.followUpDate = "";
      }
      this._applyRecurrenceGate();
    };
    [clarifyDateOptionSpecific, clarifyDateOptionDue, clarifyDateOptionNone, clarifyDateOptionFollowUp].forEach((radio) => {
      radio?.addEventListener("change", updateDateInputs);
    });
    this.elements.clarifyFollowUpDateInput?.addEventListener("change", () => {
      this.clarifyState.followUpDate = this.elements.clarifyFollowUpDateInput.value;
    });
    this.elements.clarifySpecificDateInput?.addEventListener("change", () => {
      this.clarifyState.calendarDate = this.elements.clarifySpecificDateInput.value;
    });
    this.elements.clarifySpecificTimeInput?.addEventListener("change", () => {
      this.clarifyState.calendarTime = this.elements.clarifySpecificTimeInput.value;
    });
    this.elements.clarifyDueDateInput?.addEventListener("change", () => {
      this.clarifyState.dueDate = this.elements.clarifyDueDateInput.value;
    });
    clarifyProjectSelect?.addEventListener("change", () => {
      const id = clarifyProjectSelect.value;
      this.clarifyState.projectId = id && id !== "none" ? id : null;
      this.clarifyState.projectName = this.clarifyState.projectId ? (this.getProjectName(this.clarifyState.projectId) || "") : "";
    });

    // Recurrence — enable/disable interval input and sync state
    const syncRecurrenceState = () => {
      const type = clarifyRecurrenceType?.value || "";
      if (clarifyRecurrenceInterval) clarifyRecurrenceInterval.disabled = !type;
      const interval = parseInt(clarifyRecurrenceInterval?.value, 10) || 1;
      this.clarifyState.recurrenceRule = type
        ? { type, interval: Math.max(1, interval) }
        : null;
    };
    clarifyRecurrenceType?.addEventListener("change", syncRecurrenceState);
    clarifyRecurrenceInterval?.addEventListener("input", syncRecurrenceState);

    // Metadata live updates
    [clarifyEffortSelect, clarifyTimeSelect].forEach((select) => {
      select?.addEventListener("change", () => {
        this.clarifyState.effort = clarifyEffortSelect?.value || "";
        this.clarifyState.time = clarifyTimeSelect?.value || "";
      });
    });
    this.elements.clarifyAreaInput?.addEventListener("change", () => {
      this.clarifyState.areaOfFocus = this.elements.clarifyAreaInput.value.trim() || "";
    });

    // Add context
    clarifyAddContext?.addEventListener("click", () => this.handleClarifyAddContext());

    // Add person
    clarifyAddPerson?.addEventListener("click", () => this.handleClarifyAddPerson());

    // Preview text editing
    if (clarifyPreviewText) {
      clarifyPreviewText.addEventListener("input", () => this.handleClarifyPreviewEdit(false));
      clarifyPreviewText.addEventListener("blur", () => this.handleClarifyPreviewEdit(true));
    }

    // Route task — Done button
    const doneButton = document.getElementById("clarifyDoneButton");
    doneButton?.addEventListener("click", () => {
      // Read project selection
      const projectId = clarifyProjectSelect?.value;
      if (
        clarifyActionAddExisting?.classList.contains("is-selected") &&
        (!projectId || projectId === "none")
      ) {
        this.taskManager.notify("warn", "Pick a project before routing.");
        clarifyProjectSelect?.focus();
        return;
      }
      if (projectId && projectId !== "none") {
        this.clarifyState.projectId = projectId;
        this.clarifyState.projectName = this.getProjectName(projectId) || "";
      }
      // Read delegate if chosen
      if (clarifyWhoDelegate?.classList.contains("is-selected")) {
        const name = clarifyDelegateNameInput?.value?.trim();
        if (!name) {
          this.taskManager.notify("warn", "Enter who you are delegating to.");
          clarifyDelegateNameInput?.focus();
          return;
        }
        this.clarifyState.statusTarget = STATUS.WAITING;
        this.clarifyState.waitingFor = name;
      } else {
        this.clarifyState.statusTarget = null;
        this.clarifyState.waitingFor = "";
      }
      // Read date
      if (!this.readClarifyDateState()) return;
      // Read metadata
      this.clarifyState.contexts = this._readClarifyContextCheckboxes();
      this.clarifyState.peopleTags = this._readClarifyPeopleCheckboxes();
      this.clarifyState.areaOfFocus = this.elements.clarifyAreaInput?.value.trim() || "";
      this.clarifyState.effort = clarifyEffortSelect?.value || "";
      this.clarifyState.time = clarifyTimeSelect?.value || "";
      // Finalize
      this.finalizeClarifyRouting();
    });

    // Closure modal bindings (unchanged)
    const {
      closureModal,
      closureBackdrop,
      closeClosureModal,
      cancelClosureNotes,
      saveClosureNotes,
      closureNotesInput,
    } = this.elements;
    if (closureModal) {
      const closeModal = () => {
        closureModal.classList.remove("is-open");
        closureModal.setAttribute("hidden", "");
        this.pendingClosure = null;
      };
      closeClosureModal?.addEventListener("click", closeModal);
      cancelClosureNotes?.addEventListener("click", closeModal);
      closureBackdrop?.addEventListener("click", closeModal);
      saveClosureNotes?.addEventListener("click", () => {
        const notes = closureNotesInput?.value?.trim() || "";
        if (this.pendingClosure) {
          this.taskManager.completeTask(this.pendingClosure.taskId, {
            archive: this.pendingClosure.archive,
            closureNotes: notes,
          });
        }
        closeModal();
      });
    }
  }

  setClarifyModalOpen(open) {
    const modal = this.elements.clarifyModal;
    if (!modal) return;
    if (open) {
      this.lastClarifyFocus = document.activeElement;
      modal.classList.add("is-open");
      modal.removeAttribute("hidden");
      history.pushState({ nextflowLayer: "clarify" }, "");
      if (this.handleClarifyKeydown) {
        document.addEventListener("keydown", this.handleClarifyKeydown);
      }
    } else {
      modal.classList.remove("is-open");
      modal.setAttribute("hidden", "");
      if (this.handleClarifyKeydown) {
        document.removeEventListener("keydown", this.handleClarifyKeydown);
      }
      if (this.lastClarifyFocus && typeof this.lastClarifyFocus.focus === "function") {
        this.lastClarifyFocus.focus();
      }
      if (!this._clarifyCompleting && this.clarifyState.taskId) {
        this._saveClarifyDraft();
      }
      this._clarifyCompleting = false;
      this.resetClarifyState();
    }
  }

  _saveClarifyDraft() {
    try {
      localStorage.setItem(`clarify-draft-${this.clarifyState.taskId}`, JSON.stringify(this.clarifyState));
    } catch (e) { /* storage full — ignore */ }
  }

  _clearClarifyDraft(taskId) {
    if (taskId) localStorage.removeItem(`clarify-draft-${taskId}`);
  }

  resetClarifyState() {
    this.clarifyState = {
      taskId: null,
      currentStep: "identify",
      actionableConfirmed: false,
      whoChoice: "self",
      projectId: null,
      projectName: "",
      dueType: "none",
      calendarDate: "",
      dueDate: "",
      followUpDate: "",
      calendarTime: "",
      context: "",
      peopleTags: [],
      effort: "",
      time: "",
      delegateTo: "",
      statusTarget: null,
      waitingFor: "",
      previewField: "title",
      previewText: "",
      actionPlanInitialized: false,
      expectResponse: false,
      recurrenceRule: null,
    };
    const actionableFields = document.getElementById("clarifyActionableFields");
    if (actionableFields) actionableFields.hidden = true;

    const actionableQuestion = document.getElementById("clarifyActionableQuestion");
    if (actionableQuestion) actionableQuestion.hidden = false;
    const actionableSummary = document.getElementById("clarifyActionableSummary");
    if (actionableSummary) actionableSummary.hidden = true;
    const normalFields = document.getElementById("clarifyNormalActionFields");
    if (normalFields) normalFields.hidden = false;
    const delegateRow = document.getElementById("clarifyDelegateRow");
    if (delegateRow) delegateRow.hidden = true;
    const specificDateFields = document.getElementById("clarifySpecificDateFields");
    if (specificDateFields) specificDateFields.hidden = true;
    const dueDateFields = document.getElementById("clarifyDueDateFields");
    if (dueDateFields) dueDateFields.hidden = true;
    [
      ["clarifyActionSingle", "clarifyActionSingle"],
      ["clarifyTwoMinuteNo", "clarifyTwoMinuteNo"],
      ["clarifyWhoSelf", "clarifyWhoSelf"],
    ].forEach(([selectedId, ...groupIds]) => {
      const allIds = groupIds.length ? groupIds : [selectedId];
      allIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle("is-selected", id === selectedId);
      });
    });
    document.getElementById("clarifyActionableYes")?.classList.remove("is-selected");
    ["clarifyActionAddExisting", "clarifyConvertProject", "clarifyTwoMinuteYes", "clarifyWhoDelegate"].forEach(id => {
      document.getElementById(id)?.classList.remove("is-selected");
    });
  }

  _completeClarifyStep(outcome = "routed") {
    this._clarifyCompleting = true;
    this._clearClarifyDraft(this.clarifyState.taskId);
    if (this.processSession) {
      const stats = this.processSession.stats;
      if (stats && stats[outcome] !== undefined) stats[outcome] += 1;
      this._persistProcessSession();
      this.advanceProcessSession();
    } else {
      this.closeClarifyModal();
      this.setActivePanel("inbox");
    }
  }

  startProcessSession() {
    const existing = this._loadProcessSession();
    let queue;
    let cursor = 0;
    let startedAt = Date.now();
    let completedIds = new Set();
    let stats = { routed: 0, deferred: 0, deleted: 0, referenced: 0, twoMinDone: 0 };
    if (existing) {
      queue = existing.queue;
      cursor = existing.cursor || 0;
      startedAt = existing.startedAt || Date.now();
      completedIds = new Set(existing.completedIds || []);
      stats = { ...stats, ...(existing.stats || {}) };
    } else {
      queue = this.taskManager.getInboxQueue();
      if (!queue.length) {
        this.taskManager.notify("info", "Inbox is already clear.");
        return;
      }
    }
    this.processSession = { queue, cursor, startedAt, completedIds, stats };
    this._persistProcessSession();
    this._startHudTimer();
    this.setActivePanel("inbox");
    if (cursor < queue.length) {
      this.openClarifyModal(queue[cursor]);
    } else {
      this.showInboxZeroCelebration();
    }
  }

  advanceProcessSession() {
    const session = this.processSession;
    if (!session) return;
    if (this.clarifyState.taskId) {
      session.completedIds.add(this.clarifyState.taskId);
    }
    session.cursor += 1;
    while (session.cursor < session.queue.length) {
      const nextId = session.queue[session.cursor];
      const task = this.taskManager.getTaskById(nextId);
      if (task && !task.completedAt && task.status === STATUS.INBOX) {
        this._persistProcessSession();
        this.openClarifyModal(nextId);
        return;
      }
      session.cursor += 1;
    }
    this.showInboxZeroCelebration();
  }

  endProcessSession() {
    this.processSession = null;
    this._stopHudTimer();
    this._clearProcessSession();
    this._updateClarifyProgress();
  }

  _persistProcessSession() {
    if (!this.processSession) return;
    try {
      const s = this.processSession;
      const payload = {
        queue: s.queue,
        cursor: s.cursor,
        startedAt: s.startedAt,
        expiresAt: s.startedAt + 12 * 60 * 60 * 1000,
        completedIds: Array.from(s.completedIds),
        stats: s.stats,
      };
      localStorage.setItem("nextflow-clarify-session", JSON.stringify(payload));
    } catch (e) {
      // ignore quota errors
    }
  }

  _loadProcessSession() {
    try {
      const raw = localStorage.getItem("nextflow-clarify-session");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.queue) return null;
      if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
        localStorage.removeItem("nextflow-clarify-session");
        return null;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }

  _clearProcessSession() {
    try {
      localStorage.removeItem("nextflow-clarify-session");
    } catch (e) {
      // ignore
    }
  }

  _startHudTimer() {
    this._stopHudTimer();
    this._hudTimer = setInterval(() => this._updateClarifyProgress(), 1000);
  }

  _stopHudTimer() {
    if (this._hudTimer) {
      clearInterval(this._hudTimer);
      this._hudTimer = null;
    }
  }

  _formatElapsed(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      return `${h}:${String(mm).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  _updateClarifyProgress() {
    const el = this.elements.clarifyProgress;
    if (!el) return;
    const session = this.processSession;
    if (!session) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    const elapsed = this._formatElapsed(Date.now() - session.startedAt);
    el.textContent = `${session.cursor + 1} / ${session.queue.length} · ${elapsed}`;
  }

  _clearCelebrationCard() {
    const modal = this.elements.clarifyModal;
    if (!modal) return;
    const body = modal.querySelector(".modal-body");
    if (!body) return;
    const card = body.querySelector(".clarify-celebration");
    if (card) card.remove();
    body.querySelectorAll('[data-clarify-hidden-for-celebration="1"]').forEach((el) => {
      el.hidden = false;
      delete el.dataset.clarifyHiddenForCelebration;
    });
  }

  showInboxZeroCelebration() {
    const modal = this.elements.clarifyModal;
    const session = this.processSession;
    this._stopHudTimer();
    this.processSession = null;
    this._clearProcessSession();
    this._updateClarifyProgress();
    if (!modal) {
      this.taskManager.notify("info", "Inbox cleared.");
      return;
    }
    const body = modal.querySelector(".modal-body");
    if (!body) {
      this.closeClarifyModal();
      return;
    }
    const count = session ? session.completedIds.size : 0;
    const elapsed = session ? this._formatElapsed(Date.now() - session.startedAt) : "0:00";
    const stats = session?.stats || {};
    // Hide the original modal-body children rather than wiping innerHTML —
    // the cached element refs (clarifyPreviewText, etc.) need to stay attached
    // for the next open.
    Array.from(body.children).forEach((child) => {
      if (child.classList.contains("clarify-celebration")) {
        child.remove();
        return;
      }
      child.dataset.clarifyHiddenForCelebration = "1";
      child.hidden = true;
    });
    const card = document.createElement("div");
    card.className = "inbox-zero clarify-celebration";
    card.innerHTML = `
      <strong>✓ Inbox cleared</strong>
      <span class="muted">${count} item${count === 1 ? "" : "s"} · ${elapsed}</span>
      <span class="muted small-text">
        ${stats.routed || 0} routed · ${stats.deferred || 0} deferred · ${stats.deleted || 0} deleted${stats.twoMinDone ? ` · ${stats.twoMinDone} 2-min done` : ""}
      </span>
      <button type="button" class="btn btn-primary" id="clarifyCelebrationClose">Close</button>
    `;
    body.append(card);
    card.querySelector("#clarifyCelebrationClose")?.addEventListener("click", () => {
      this.closeClarifyModal();
    });
    if (!modal.classList.contains("is-open")) {
      this.setClarifyModalOpen(true);
    }
  }

  openClarifyModal(taskId) {
    const modal = this.elements.clarifyModal;
    if (!modal) {
      this.openTaskFlyout(taskId);
      return;
    }
    this._clearCelebrationCard();
    const task = this.taskManager.getTaskById(taskId);
    if (!task) return;
    this.resetClarifyState();

    let restoredDraft = false;
    const draftKey = `clarify-draft-${taskId}`;
    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        if (draft.taskId === taskId) {
          Object.assign(this.clarifyState, draft);
          restoredDraft = true;
        }
      } catch (e) {
        localStorage.removeItem(draftKey);
      }
    }

    if (!restoredDraft) {
      this.clarifyState.taskId = task.id;
      this.clarifyState.contexts = task.contexts ? [...task.contexts] : [];
      this.clarifyState.peopleTags = task.peopleTags ? [...task.peopleTags] : [];
      this.clarifyState.areaOfFocus = task.areaOfFocus || "";
      this.clarifyState.effort = task.effortLevel || "";
      this.clarifyState.time = task.timeRequired || "";
      this.clarifyState.previewField = "title";
      this.clarifyState.previewText = task.title || "";
      this.clarifyState.projectId = task.projectId || null;
      this.clarifyState.projectName = task.projectId ? (this.getProjectName(task.projectId) || "") : "";
    }

    this.populateClarifyPreview(task);
    this.populateClarifyContexts();
    this.populateClarifyPeople();
    populateAreaSelect(
      this.elements.clarifyAreaInput,
      this.taskManager.getAreasOfFocus(),
      this.clarifyState.areaOfFocus || task.areaOfFocus || ""
    );
    this.populateProjectSelect();

    if (restoredDraft) {
      this._restoreClarifyDraftDOM();
    } else if (task.projectId) {
      // Pre-select "Add to existing project" and show the picker when the task
      // already belongs to a project, so the user sees the association and
      // doesn't accidentally clear it by choosing "Single action".
      if (this.elements.clarifyProjectPicker) {
        this.elements.clarifyProjectPicker.hidden = false;
      }
      document.getElementById("clarifyActionAddExisting")?.classList.add("is-selected");
      document.getElementById("clarifyActionSingle")?.classList.remove("is-selected");
    }

    this._updateClarifyProgress();
    this.setClarifyModalOpen(true);
  }

  _restoreClarifyDraftDOM() {
    const s = this.clarifyState;

    // If the user had confirmed actionable (clicked "Yes"), restore that view
    const postActionableSteps = new Set(["action-plan", "two-minute", "who", "dates", "metadata", "final"]);
    if (s.actionableConfirmed || postActionableSteps.has(s.currentStep)) {
      document.getElementById("clarifyActionableFields")?.removeAttribute("hidden");
      const q = document.getElementById("clarifyActionableQuestion");
      if (q) q.hidden = true;
      const sum = document.getElementById("clarifyActionableSummary");
      if (sum) sum.hidden = false;
      // Also populate the editable title shown after Yes is clicked
      if (this.elements.clarifyTitleSummary && s.previewText) {
        this.elements.clarifyTitleSummary.textContent = s.previewText;
      }
      if (this.elements.clarifyFooter) this.elements.clarifyFooter.hidden = false;
      this.showClarifySegment(s.activeSegment || "time");
    }

    // Draft-restored chip on the summary rail
    const rail = this.elements.claritySummaryRail;
    if (rail) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "clarify-draft-chip";
      chip.textContent = "Draft restored — Start over";
      chip.addEventListener("click", () => {
        const taskId = s.taskId;
        this._clearClarifyDraft(taskId);
        this.resetClarifyState();
        if (taskId) this.openClarifyModal(taskId);
      });
      rail.prepend(chip);
    }

    // Restore date selection
    if (s.dueType === "calendar" && this.elements.clarifyDateOptionSpecific) {
      this.elements.clarifyDateOptionSpecific.checked = true;
      if (this.elements.clarifySpecificDateInput && s.calendarDate) {
        this.elements.clarifySpecificDateInput.value = s.calendarDate;
      }
      if (this.elements.clarifySpecificTimeInput && s.calendarTime) {
        this.elements.clarifySpecificTimeInput.value = s.calendarTime;
      }
      const specificFields = document.getElementById("clarifySpecificDateFields");
      if (specificFields) specificFields.hidden = false;
    } else if (s.dueType === "due" && this.elements.clarifyDateOptionDue) {
      this.elements.clarifyDateOptionDue.checked = true;
      if (this.elements.clarifyDueDateInput && s.dueDate) {
        this.elements.clarifyDueDateInput.value = s.dueDate;
      }
      const dueDateFields = document.getElementById("clarifyDueDateFields");
      if (dueDateFields) dueDateFields.hidden = false;
    }

    // Restore project picker visibility if a project was chosen
    if (s.projectId && this.elements.clarifyProjectPicker) {
      this.elements.clarifyProjectPicker.hidden = false;
      document.getElementById("clarifyActionAddExisting")?.classList.add("is-selected");
      document.getElementById("clarifyActionSingle")?.classList.remove("is-selected");
    }

    // Restore delegate/waiting state
    if (s.whoChoice === "delegate") {
      const delegateRow = document.getElementById("clarifyDelegateRow");
      if (delegateRow) delegateRow.hidden = false;
      if (this.elements.clarifyDelegateNameInput && s.waitingFor) {
        this.elements.clarifyDelegateNameInput.value = s.waitingFor;
      }
      document.getElementById("clarifyWhoDelegate")?.classList.add("is-selected");
      document.getElementById("clarifyWhoSelf")?.classList.remove("is-selected");
      const normalFields = document.getElementById("clarifyNormalActionFields");
      if (normalFields) normalFields.hidden = true;
    }

    // Restore recurrence (populateClarifyPreview always resets it to empty)
    if (s.recurrenceRule?.type && this.elements.clarifyRecurrenceType) {
      this.elements.clarifyRecurrenceType.value = s.recurrenceRule.type;
      if (this.elements.clarifyRecurrenceInterval) {
        this.elements.clarifyRecurrenceInterval.value = String(s.recurrenceRule.interval || 1);
        this.elements.clarifyRecurrenceInterval.disabled = false;
      }
    }

    // Navigate to the saved step
    const validSteps = ["actionable", "action-plan", "two-minute", "who", "dates", "metadata", "final"];
    if (validSteps.includes(s.currentStep)) {
      this.showClarifyStep(s.currentStep);
    }
  }

  closeClarifyModal({ fromPopstate = false } = {}) {
    const wasOpen = this.elements.clarifyModal?.classList.contains("is-open");
    this.setClarifyModalOpen(false);
    this._clearCelebrationCard();
    if (this.processSession) {
      this.endProcessSession();
    }
    if (wasOpen && !fromPopstate && history.state?.nextflowLayer === "clarify") {
      this._historyNavPending = true;
      history.back();
    }
  }

  showClarifyStep(step) {
    const sections = [
      ["actionable", this.elements.clarifyStepActionable],
      ["action-plan", this.elements.clarifyStepActionPlan],
      ["two-minute", this.elements.clarifyTwoMinuteStep],
      ["who", this.elements.clarifyWhoStep],
      ["dates", this.elements.clarifyStepDates],
      ["metadata", this.elements.clarifyStepMetadata],
      ["final", this.elements.clarifyStepFinal],
    ];
    sections.forEach(([name, element]) => {
      if (element) {
        element.hidden = name !== step;
      }
    });
    this.clarifyState.currentStep = step;
    const focusTargets = {
      "actionable": this.elements.clarifyActionableYes,
      "action-plan": this.elements.clarifyActionSingle,
      "two-minute": this.elements.clarifyTwoMinuteYes,
      "who": this.elements.clarifyWhoSelf,
      "dates": this.elements.clarifyDateOptionNone,
      "metadata": this.elements.clarifyContextList,
      "final": this.elements.clarifyFinalReturn,
    };
    const focusTarget = focusTargets[step];
    if (focusTarget && typeof focusTarget.focus === "function") {
      focusTarget.focus();
    }
  }

  showClarifySegment(name) {
    const modal = this.elements.clarifyModal;
    if (!modal) return;
    const segments = modal.querySelectorAll("[data-segment]");
    let matched = false;
    segments.forEach((seg) => {
      const isActive = seg.dataset.segment === name;
      seg.hidden = !isActive;
      if (isActive) matched = true;
    });
    if (!matched) return;
    modal.querySelectorAll("[data-clarify-step]").forEach((btn) => {
      const isActive = btn.dataset.clarifyStep === name;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
    });
    this.clarifyState.activeSegment = name;
    this.renderClaritySummary();
  }

  renderClaritySummary() {
    const rail = this.elements.claritySummaryRail;
    if (!rail) return;
    const s = this.clarifyState;
    if (!s.actionableConfirmed) {
      rail.textContent = "";
      return;
    }
    const parts = [];
    const title = (s.previewText || "").trim();
    if (title) parts.push(`"${title.length > 40 ? title.slice(0, 40) + "…" : title}"`);
    if (s.whoChoice === "delegate" && s.waitingFor) {
      parts.push(`→ Delegated to ${s.waitingFor}`);
    } else if (s.statusTarget) {
      parts.push(`→ ${this._segmentStatusLabel(s.statusTarget)}`);
    } else {
      parts.push("→ Next");
    }
    if (s.contexts && s.contexts.length) parts.push(s.contexts[0]);
    if (s.projectName) parts.push(`Project: ${s.projectName}`);
    if (s.dueType === "calendar" && s.calendarDate) {
      parts.push(`📅 ${s.calendarDate}${s.calendarTime ? " " + s.calendarTime : ""}`);
    } else if (s.dueType === "due" && s.dueDate) {
      parts.push(`due ${s.dueDate}`);
    } else if (s.dueType === "followUp" && s.followUpDate) {
      parts.push(`follow up ${s.followUpDate}`);
    }
    rail.textContent = parts.join(" · ");
  }

  _segmentStatusLabel(status) {
    if (status === STATUS.WAITING) return "Delegated";
    if (status === STATUS.DOING) return "Doing";
    if (status === STATUS.SOMEDAY) return "Later";
    return "Next";
  }

  populateClarifyPreview(task) {
    if (this.elements.clarifyPreviewText) {
      this.elements.clarifyPreviewText.textContent = task.title || "(No title)";
    }
    document.querySelectorAll(".clarify-preview").forEach((el) => {
      el.textContent = task.title || "(No title)";
    });
    if (this.elements.clarifyProjectPicker) {
      this.elements.clarifyProjectPicker.hidden = true;
    }
    if (this.elements.clarifySpecificDateInput) {
      this.elements.clarifySpecificDateInput.value = "";
    }
    if (this.elements.clarifySpecificTimeInput) {
      this.elements.clarifySpecificTimeInput.value = "";
    }
    if (this.elements.clarifyDueDateInput) {
      this.elements.clarifyDueDateInput.value = "";
    }
    if (this.elements.clarifyDelegateNameInput) {
      this.elements.clarifyDelegateNameInput.value = "";
    }
    if (this.elements.clarifyTwoMinuteClosureNotes) {
      this.elements.clarifyTwoMinuteClosureNotes.value = "";
    }
    if (this.elements.clarifyTwoMinuteFollowup) {
      this.elements.clarifyTwoMinuteFollowup.hidden = true;
    }
    if (this.elements.clarifyProjectSelect) {
      this.populateProjectSelect();
    }
    if (this.elements.clarifyDateOptionNone) {
      this.elements.clarifyDateOptionNone.checked = true;
    }
    this.populateClarifyContexts();
    this.populateClarifyPeople();
    if (this.elements.clarifyEffortSelect) {
      this.elements.clarifyEffortSelect.value = this.clarifyState.effort || "";
    }
    if (this.elements.clarifyTimeSelect) {
      this.elements.clarifyTimeSelect.value = this.clarifyState.time || "";
    }
    if (this.elements.clarifyRecurrenceType) {
      this.elements.clarifyRecurrenceType.value = "";
    }
    if (this.elements.clarifyRecurrenceInterval) {
      this.elements.clarifyRecurrenceInterval.value = "1";
      this.elements.clarifyRecurrenceInterval.disabled = true;
    }
    if (this.elements.clarifyFollowUpDateInput) {
      this.elements.clarifyFollowUpDateInput.value = "";
    }
    if (this.elements.clarifyFollowUpFields) {
      this.elements.clarifyFollowUpFields.hidden = true;
    }
    if (this.elements.clarifyNewProjectInline) {
      this.elements.clarifyNewProjectInline.hidden = true;
    }
    if (this.elements.clarifyNewProjectNameInput) {
      this.elements.clarifyNewProjectNameInput.value = "";
    }
    this._applyDelegateBranchVisibility(false);
    this._applyRecurrenceGate();
    if (this.elements.clarifyFooter) this.elements.clarifyFooter.hidden = true;
    if (this.elements.claritySummaryRail) this.elements.claritySummaryRail.textContent = "";
    this.clarifyState.activeSegment = "time";
    const modal = this.elements.clarifyModal;
    if (modal) {
      modal.querySelectorAll("[data-segment]").forEach((seg) => {
        seg.hidden = seg.dataset.segment !== "time";
      });
      modal.querySelectorAll("[data-clarify-step]").forEach((btn) => {
        const isActive = btn.dataset.clarifyStep === "time";
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-selected", String(isActive));
      });
    }
  }

  populateClarifyContexts() {
    const container = this.elements.clarifyContextList;
    if (!container) return;
    container.innerHTML = "";
    const selected = new Set(this.clarifyState.contexts || []);
    const contexts = this.taskManager.getContexts();
    contexts.forEach((context) => {
      const label = document.createElement("label");
      label.className = "clarify-context-checkbox";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = context;
      checkbox.checked = selected.has(context);
      checkbox.addEventListener("change", () => {
        this.clarifyState.contexts = this._readClarifyContextCheckboxes();
      });
      label.append(checkbox, document.createTextNode(stripTagPrefix(context)));
      container.append(label);
    });
  }

  _readClarifyContextCheckboxes() {
    const container = this.elements.clarifyContextList;
    if (!container) return [];
    return Array.from(container.querySelectorAll("input[type=checkbox]:checked")).map((cb) => cb.value);
  }

  populateClarifyPeople() {
    const container = this.elements.clarifyPeopleList;
    if (!container) return;
    container.innerHTML = "";
    const selected = new Set(this.clarifyState.peopleTags || []);
    const people = this.taskManager.getPeopleTags({ includeNoteMentions: false });
    people.forEach((tag) => {
      const label = document.createElement("label");
      label.className = "clarify-context-checkbox";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = tag;
      checkbox.checked = selected.has(tag);
      checkbox.addEventListener("change", () => {
        this.clarifyState.peopleTags = this._readClarifyPeopleCheckboxes();
      });
      label.append(checkbox, document.createTextNode(stripTagPrefix(tag)));
      container.append(label);
    });
  }

  _readClarifyPeopleCheckboxes() {
    const container = this.elements.clarifyPeopleList;
    if (!container) return [];
    return Array.from(container.querySelectorAll("input[type=checkbox]:checked")).map((cb) => cb.value);
  }

  async handleClarifyAddPerson() {
    const input = await this.showPrompt("New person tag (+ prefix optional):");
    if (!input || !input.trim()) return;
    const container = this.elements.clarifyPeopleList;
    if (!container) return;
    let normalized = input.trim();
    if (!normalized.startsWith("+")) normalized = "+" + normalized;
    if (normalized.length < 2) {
      this.taskManager.notify("warn", "Person tag must have a name after +.");
      return;
    }
    const label = document.createElement("label");
    label.className = "clarify-context-checkbox";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = normalized;
    checkbox.checked = true;
    checkbox.addEventListener("change", () => {
      this.clarifyState.peopleTags = this._readClarifyPeopleCheckboxes();
    });
    label.append(checkbox, document.createTextNode(stripTagPrefix(normalized)));
    container.append(label);
    if (!Array.isArray(this.clarifyState.peopleTags)) this.clarifyState.peopleTags = [];
    if (!this.clarifyState.peopleTags.includes(normalized)) this.clarifyState.peopleTags.push(normalized);
  }

  _populateDelegateSuggestions() {
    const datalist = document.getElementById("clarifyDelegateNameSuggestions");
    if (!datalist) return;
    datalist.innerHTML = "";
    for (const name of this.taskManager.getKnownDelegateNames()) {
      const opt = document.createElement("option");
      opt.value = name;
      datalist.append(opt);
    }
  }

  _showClarifyDelegateSuggestions(input) {
    const dropdown = document.getElementById("clarifyDelegateDropdown");
    if (!dropdown) return;
    const value = input.value.trim();
    dropdown.innerHTML = "";
    dropdown.hidden = true;
    const names = this.taskManager.getKnownDelegateNames();
    const lower = value.toLowerCase();
    const matches = lower
      ? names.filter((n) => n.toLowerCase().startsWith(lower))
      : names;
    if (matches.length === 0) return;
    dropdown.hidden = false;
    matches.forEach((name) => {
      const item = document.createElement("div");
      item.className = "suggestion-item";
      item.textContent = name;
      item.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        input.value = name;
        dropdown.hidden = true;
        dropdown.innerHTML = "";
      });
      dropdown.append(item);
    });
  }

  populateProjectSelect() {
    const select = this.elements.clarifyProjectSelect;
    if (!select) return;
    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "none";
    placeholder.textContent = "Choose a project";
    select.append(placeholder);
    const projects = this.taskManager
      .getProjects({ includeSomeday: true })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    projects.forEach((project) => {
      const option = document.createElement("option");
      option.value = project.id;
      option.textContent = project.name + (project.someday ? " (Backburner)" : "");
      select.append(option);
    });
    select.value = this.clarifyState.projectId || "none";
  }

  handleClarifyActionableChoice(isActionable) {
    if (!this.clarifyState.taskId || !isActionable) return;
  }

  async handleClarifyNonAction(destination) {
    if (!this.clarifyState.taskId || !destination) return;
    const sessionActive = !!this.processSession;
    if (destination === "trash") {
      const task = this.taskManager.getTaskById(this.clarifyState.taskId);
      const label = task?.title || "this capture";
      const taskId = this.clarifyState.taskId;
      this.taskManager.deleteTask(taskId);
      const actions = [
        { label: "Undo", onClick: () => this.taskManager.restoreCompletedTask(taskId) },
      ];
      if (sessionActive) actions.push({ label: "Next item →", onClick: () => {} });
      this.taskManager.notify("info", `Deleted "${label}"`, { actions });
    } else if (destination === "someday") {
      const taskId = this.clarifyState.taskId;
      const prev = this.taskManager.getTaskById(taskId);
      const prevStatus = prev?.status || STATUS.INBOX;
      this.taskManager.moveTask(taskId, STATUS.SOMEDAY);
      const actions = [
        { label: "Undo", onClick: () => this.taskManager.moveTask(taskId, prevStatus) },
      ];
      if (sessionActive) actions.push({ label: "Next item →", onClick: () => {} });
      this.taskManager.notify("info", "✓ Routed to Later", { actions });
    }
    this._completeClarifyStep(destination === "trash" ? "deleted" : "deferred");
  }

  handleClarifySingleAction() {
    if (!this.clarifyState.taskId) return;
    this.clarifyState.projectId = null;
    this.clarifyState.projectName = "";
    if (this.elements.clarifyProjectPicker) {
      this.elements.clarifyProjectPicker.hidden = true;
    }
  }

  _applyDelegateBranchVisibility(isDelegate) {
    const followUpRow = this.elements.clarifyFollowUpRow;
    const detailsSection = this.elements.clarifyDetailsSection;
    if (followUpRow) followUpRow.hidden = !isDelegate;
    if (detailsSection) detailsSection.hidden = !!isDelegate;
    if (isDelegate) {
      // Hide specific/due rows in favor of follow-up
      const specificFields = document.getElementById("clarifySpecificDateFields");
      const dueDateFields = document.getElementById("clarifyDueDateFields");
      if (specificFields) specificFields.hidden = true;
      if (dueDateFields) dueDateFields.hidden = true;
      const specificLabel = this.elements.clarifyDateOptionSpecific?.closest(".clarify-project-option");
      const dueLabel = this.elements.clarifyDateOptionDue?.closest(".clarify-project-option");
      if (specificLabel) specificLabel.hidden = true;
      if (dueLabel) dueLabel.hidden = true;
      // Pre-select follow-up + default to today + 14 days
      if (this.elements.clarifyDateOptionFollowUp) {
        this.elements.clarifyDateOptionFollowUp.checked = true;
      }
      const followUpInput = this.elements.clarifyFollowUpDateInput;
      if (followUpInput && !followUpInput.value) {
        const d = new Date();
        d.setDate(d.getDate() + 14);
        const iso = d.toISOString().slice(0, 10);
        followUpInput.value = iso;
        this.clarifyState.followUpDate = iso;
      }
      if (this.elements.clarifyFollowUpFields) this.elements.clarifyFollowUpFields.hidden = false;
      this.clarifyState.dueType = "followUp";
    } else {
      const specificLabel = this.elements.clarifyDateOptionSpecific?.closest(".clarify-project-option");
      const dueLabel = this.elements.clarifyDateOptionDue?.closest(".clarify-project-option");
      if (specificLabel) specificLabel.hidden = false;
      if (dueLabel) dueLabel.hidden = false;
    }
    this._applyRecurrenceGate();
  }

  _applyRecurrenceGate() {
    const select = this.elements.clarifyRecurrenceType;
    const interval = this.elements.clarifyRecurrenceInterval;
    const hint = this.elements.clarifyRecurrenceHint;
    const hasDate = this.clarifyState.dueType && this.clarifyState.dueType !== "none";
    if (select) {
      if (!hasDate) {
        select.value = "";
        select.disabled = true;
        if (interval) {
          interval.disabled = true;
          interval.value = "1";
        }
        this.clarifyState.recurrenceRule = null;
      } else {
        select.disabled = false;
        if (interval) interval.disabled = !select.value;
      }
    }
    if (hint) hint.hidden = !!hasDate;
  }

  handleClarifyConvertToProject() {
    if (!this.clarifyState.taskId) return;
    const inline = this.elements.clarifyNewProjectInline;
    const input = this.elements.clarifyNewProjectNameInput;
    if (this.elements.clarifyProjectPicker) this.elements.clarifyProjectPicker.hidden = true;
    if (inline) inline.hidden = false;
    if (input) {
      input.value = "";
      input.focus();
    }
  }

  showClarifyProjectPicker() {
    const picker = this.elements.clarifyProjectPicker;
    if (!picker) return;
    picker.hidden = false;
    this.populateProjectSelect();
    this.elements.clarifyProjectSelect?.focus();
  }

  handleClarifyExistingProjectContinue() {
    if (!this.clarifyState.taskId) return;
    const selectedId = this.elements.clarifyProjectSelect?.value;
    if (!selectedId || selectedId === "none") {
      this.taskManager.notify("warn", "Pick a project before continuing.");
      this.elements.clarifyProjectSelect?.focus();
      return;
    }
    this.clarifyState.projectId = selectedId;
    const name = this.getProjectName(selectedId);
    this.clarifyState.projectName = name || "";
    if (this.elements.clarifyProjectPicker) {
      this.elements.clarifyProjectPicker.hidden = true;
    }
    this.showClarifyStep("two-minute");
  }

  handleClarifyDateDecision() {
    if (!this.clarifyState.taskId) return;
    const specific = this.elements.clarifyDateOptionSpecific?.checked;
    const due = this.elements.clarifyDateOptionDue?.checked;
    const none = this.elements.clarifyDateOptionNone?.checked;
    if (specific) {
      const date = this.elements.clarifySpecificDateInput?.value;
      const time = this.elements.clarifySpecificTimeInput?.value;
      if (!date) {
        this.taskManager.notify("warn", "Choose a calendar date.");
        return;
      }
      this.clarifyState.dueType = "calendar";
      this.clarifyState.calendarDate = date;
      this.clarifyState.calendarTime = time || "";
      this.clarifyState.dueDate = "";
    } else if (due) {
      const date = this.elements.clarifyDueDateInput?.value;
      if (!date) {
        this.taskManager.notify("warn", "Choose a due date.");
        return;
      }
      this.clarifyState.dueType = "due";
      this.clarifyState.dueDate = date;
      this.clarifyState.calendarDate = "";
    } else if (none) {
      this.clarifyState.dueType = "none";
      this.clarifyState.dueDate = "";
      this.clarifyState.calendarDate = "";
    }
    this.showClarifyStep("metadata");
  }

  async handleClarifyAddContext() {
    const nextContext = await this.showPrompt("New context name (include @ if desired):");
    if (!nextContext || !nextContext.trim()) return;
    const container = this.elements.clarifyContextList;
    if (!container) return;
    const normalized = nextContext.trim();
    if (normalized.startsWith("+")) {
      this.taskManager.notify("warn", "Use + prefixes for people tags, not contexts. Assign a person in the Who step.");
      return;
    }
    const label = document.createElement("label");
    label.className = "clarify-context-checkbox";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = normalized;
    checkbox.checked = true;
    checkbox.addEventListener("change", () => {
      this.clarifyState.contexts = this._readClarifyContextCheckboxes();
    });
    label.append(checkbox, document.createTextNode(normalized));
    container.append(label);
    if (!Array.isArray(this.clarifyState.contexts)) this.clarifyState.contexts = [];
    if (!this.clarifyState.contexts.includes(normalized)) this.clarifyState.contexts.push(normalized);
  }

  readClarifyDateState() {
    const specific = this.elements.clarifyDateOptionSpecific?.checked;
    const due = this.elements.clarifyDateOptionDue?.checked;
    if (specific) {
      const date = this.elements.clarifySpecificDateInput?.value;
      const time = this.elements.clarifySpecificTimeInput?.value;
      if (!date) {
        this.taskManager.notify("warn", "Choose a calendar date.");
        return false;
      }
      this.clarifyState.dueType = "calendar";
      this.clarifyState.calendarDate = date;
      this.clarifyState.calendarTime = time || "";
      this.clarifyState.dueDate = "";
    } else if (due) {
      const date = this.elements.clarifyDueDateInput?.value;
      if (!date) {
        this.taskManager.notify("warn", "Choose a due date.");
        return false;
      }
      this.clarifyState.dueType = "due";
      this.clarifyState.dueDate = date;
      this.clarifyState.calendarDate = "";
    } else {
      this.clarifyState.dueType = "none";
      this.clarifyState.dueDate = "";
      this.clarifyState.calendarDate = "";
    }
    return true;
  }

  handleClarifyTwoMinuteYes() {
    if (!this.clarifyState.taskId) return;
    const followup = this.elements.clarifyTwoMinuteFollowup;
    if (followup) {
      followup.hidden = false;
      // If recurrence is set, surface the implication.
      if (this.clarifyState.recurrenceRule?.type) {
        let hint = followup.querySelector(".clarify-recurrence-yes-hint");
        if (!hint) {
          hint = document.createElement("p");
          hint.className = "muted small-text clarify-recurrence-yes-hint";
          hint.textContent = "This task repeats — completing it will schedule the next occurrence.";
          followup.prepend(hint);
        }
      }
    }
    this.elements.clarifyTwoMinuteClosureNotes?.focus();
  }

  resolveFollowupDate(choice = "24h", customValue = "") {
    if (choice === "24h" || choice === "7d") {
      const days = choice === "24h" ? 1 : 7;
      const date = new Date();
      date.setDate(date.getDate() + days);
      return date.toISOString().slice(0, 10);
    }
    if (choice === "custom") {
      const value = (customValue || "").trim();
      return value || null;
    }
    return null;
  }

  handleTwoMinuteFollowup() {
    if (!this.clarifyState.taskId) return;
    const task = this.taskManager.getTaskById(this.clarifyState.taskId);
    if (!task) {
      this.closeClarifyModal();
      return;
    }
    const closureNotes = this.elements.clarifyTwoMinuteClosureNotes?.value?.trim() || task.closureNotes;
    const taskId = task.id;
    this.taskManager.completeTask(taskId, { archive: "reference", closureNotes });
    const sessionActive = !!this.processSession;
    const actions = [
      { label: "Undo", onClick: () => this.taskManager.restoreCompletedTask(taskId) },
    ];
    if (sessionActive) actions.push({ label: "Next item →", onClick: () => {} });
    this.taskManager.notify("info", "✓ Completed in under two minutes", { actions });
    this._completeClarifyStep("twoMinDone");
  }

  handleClarifyDelegation(name) {
    if (!this.clarifyState.taskId) return;
    const delegateName = name?.trim() || this.elements.clarifyDelegateNameInput?.value?.trim();
    if (!delegateName) {
      this.taskManager.notify("warn", "Provide who you're waiting on.");
      this.elements.clarifyDelegateNameInput?.focus();
      return;
    }
    this.clarifyState.statusTarget = STATUS.WAITING;
    this.clarifyState.waitingFor = delegateName;
    this.showClarifyStep("dates");
  }

  handleClarifyMetadata({ skip = false } = {}) {
    if (!this.clarifyState.taskId) return;
    if (!skip) {
      this.clarifyState.contexts = this._readClarifyContextCheckboxes();
      this.clarifyState.areaOfFocus = this.elements.clarifyAreaInput?.value.trim() || "";
      this.clarifyState.effort = this.elements.clarifyEffortSelect?.value || "";
      this.clarifyState.time = this.elements.clarifyTimeSelect?.value || "";
    }
    this.finalizeClarifyRouting();
  }

  handleClarifyPreviewEdit(commitEmpty = false) {
    const preview = this.elements.clarifyPreviewText;
    if (!preview || !this.clarifyState.taskId) return;
    const text = preview.textContent?.trim() || "";
    if (!text) {
      if (commitEmpty) {
        preview.textContent = this.clarifyState.previewText || "(No details captured)";
      }
      return;
    }
    const previousText = this.clarifyState.previewText;
    if (text === previousText) return;
    this.clarifyState.previewText = text;
    document.querySelectorAll(".clarify-preview").forEach((el) => {
      el.textContent = text;
    });
    const field = this.clarifyState.previewField || "title";
    this.taskManager.updateTask(this.clarifyState.taskId, { [field]: text });
  }

  finalizeClarifyRouting({ early = false } = {}) {
    const task = this.taskManager.getTaskById(this.clarifyState.taskId);
    if (!task) {
      this.closeClarifyModal();
      return;
    }
    const statusTarget = this.clarifyState.statusTarget || STATUS.NEXT;
    const nextActionTitle = this.clarifyState.previewText?.trim() || task.title;
    const recurrenceType = this.elements.clarifyRecurrenceType?.value || "";
    const recurrenceInterval = parseInt(this.elements.clarifyRecurrenceInterval?.value, 10) || 1;
    const recurrenceRule = recurrenceType
      ? { type: recurrenceType, interval: Math.max(1, recurrenceInterval) }
      : null;
    const updates = {
      title: nextActionTitle,
      description: task.description,
      contexts: this.clarifyState.contexts?.length ? this.clarifyState.contexts : (task.contexts || []),
      peopleTags: this.clarifyState.peopleTags?.length ? this.clarifyState.peopleTags : (task.peopleTags || []),
      areaOfFocus: this.clarifyState.areaOfFocus || null,
      effortLevel: this.clarifyState.effort || null,
      timeRequired: this.clarifyState.time || null,
      projectId: this.clarifyState.projectId || null,
      calendarDate: null,
      dueDate: null,
      followUpDate: null,
      waitingFor: statusTarget === STATUS.WAITING ? this.clarifyState.waitingFor || task.waitingFor || null : null,
      status: statusTarget,
      recurrenceRule,
    };
    if (this.clarifyState.dueType === "calendar" && this.clarifyState.calendarDate) {
      updates.calendarDate = this.clarifyState.calendarTime
        ? `${this.clarifyState.calendarDate}T${this.clarifyState.calendarTime}`
        : this.clarifyState.calendarDate;
    } else if (this.clarifyState.dueType === "due" && this.clarifyState.dueDate) {
      updates.dueDate = this.clarifyState.dueDate;
    } else if (this.clarifyState.dueType === "followUp" && this.clarifyState.followUpDate) {
      updates.followUpDate = this.clarifyState.followUpDate;
    }
    const prevSnapshot = {};
    Object.keys(updates).forEach((key) => {
      prevSnapshot[key] = task[key] === undefined ? null : task[key];
    });
    this.taskManager.updateTask(task.id, updates);
    const dest = this._computeRouteDestination(updates);
    const taskId = task.id;
    const sessionActive = !!this.processSession;
    const actions = [
      { label: "Undo", onClick: () => this.taskManager.updateTask(taskId, prevSnapshot) },
    ];
    if (sessionActive) {
      actions.push({ label: "Next item →", onClick: () => {} });
    }
    this.taskManager.notify("info", `✓ Routed to ${dest}`, { actions });
    this._completeClarifyStep("routed");
  }

  _computeRouteDestination(updates) {
    let primary;
    if (updates.status === STATUS.WAITING) primary = "Delegated";
    else if (updates.status === STATUS.DOING) primary = "Doing";
    else if (updates.status === STATUS.SOMEDAY) primary = "Later";
    else if (updates.status === STATUS.INBOX) primary = "Inbox";
    else if (updates.calendarDate) primary = "Calendar";
    else if (updates.dueDate) primary = "Pending Tasks (due)";
    else primary = "Next";
    const parts = [primary];
    const contexts = updates.contexts || [];
    if (contexts.length) parts.push(contexts[0]);
    if (updates.projectId) {
      const name = this.getProjectName(updates.projectId);
      if (name) parts.push(`Project: ${name}`);
    }
    return parts.join(" · ");
  }

  setClarifyFinalMessage(updates) {
    const messageEl = this.elements.clarifyFinalMessage;
    if (!messageEl) return;
    messageEl.textContent = `Routed to ${this._computeRouteDestination(updates)}.`;
  }

  closeClarifyFlowToInbox() {
    this.closeClarifyModal();
    this.setActivePanel("inbox");
  }

  openTaskFlyout(taskInput, options = {}) {
    const flyout = this.elements.taskFlyout;
    if (!flyout) return;
    this.closeTaskContextMenu();
    this.closeTaskNoteContextMenu();
    this.closeTaskListItemContextMenu();
    const { readOnly = false, entry = null } = options;
    let task = typeof taskInput === "string" ? this.taskManager.getTaskById(taskInput) : taskInput;
    if (!task && entry) {
      task = entry;
    }
    if (!task) return;
    const wasOpen = this.isFlyoutOpen;
    this.currentFlyoutTaskId = task.id;
    this.flyoutContext = { readOnly, entry };
    this.renderTaskFlyout(task, { readOnly, entry });
    flyout.classList.add("is-open");
    flyout.classList.add("is-top");
    this.elements.projectFlyout?.classList.remove("is-top");
    flyout.setAttribute("aria-hidden", "false");
    document.body.classList.add("flyout-open");
    this.isFlyoutOpen = true;
    if (!wasOpen) {
      history.pushState({ nextflowLayer: "flyout" }, "");
    }
    if (!wasOpen && this.handleFlyoutKeydown) {
      document.addEventListener("keydown", this.handleFlyoutKeydown);
    }
    if (!wasOpen) {
      this.elements.closeTaskFlyout?.focus();
    }
  }

  closeTaskFlyout({ fromPopstate = false } = {}) {
    const flyout = this.elements.taskFlyout;
    if (!flyout) return;
    const wasOpen = this.isFlyoutOpen;
    this.closeTaskNoteContextMenu();
    this.closeTaskListItemContextMenu();
    flyout.classList.remove("is-open");
    flyout.setAttribute("aria-hidden", "true");
    document.body.classList.remove("flyout-open");
    this.isFlyoutOpen = false;
    this.currentFlyoutTaskId = null;
    this.flyoutContext = { readOnly: false, entry: null };
    if (this.handleFlyoutKeydown) {
      document.removeEventListener("keydown", this.handleFlyoutKeydown);
    }
    const infoToggle = this.elements.taskFlyoutInfoToggle;
    if (infoToggle) {
      infoToggle.setAttribute("aria-pressed", "false");
      infoToggle.classList.remove("is-active");
    }
    if (wasOpen && !fromPopstate && history.state?.nextflowLayer === "flyout") {
      this._historyNavPending = true;
      history.back();
    }
  }

  renderTaskFlyout(task, options = {}) {
    const { readOnly = false, entry = null } = options;
    this.closeTaskNoteContextMenu();
    this.closeTaskListItemContextMenu();
    const content = this.elements.taskFlyoutContent;
    if (!content) return;
    const isCompleted = Boolean(task.completedAt);
    const titleEl = this.elements.taskFlyoutTitle;
    const statusEl = this.elements.taskFlyoutStatus;
    if (titleEl) this.setEntityLinkedText(titleEl, task.title || "Untitled task");
    if (statusEl) statusEl.textContent = STATUS_LABELS[task.status] || task.status;
    content.innerHTML = "";

    const taskIds = this.getFlyoutTaskIds();
    const currentIndex = taskIds.indexOf(task.id);
    const isNavigable = !readOnly && taskIds.length > 1;
    if (this.elements.taskFlyoutPrev) {
      this.elements.taskFlyoutPrev.disabled = !isNavigable || currentIndex <= 0;
    }
    if (this.elements.taskFlyoutNext) {
      this.elements.taskFlyoutNext.disabled = !isNavigable || currentIndex >= taskIds.length - 1;
    }

    const descriptionText = task.description?.trim();
    const description = descriptionText ? document.createElement("div") : null;
    if (description) {
      this.renderMarkdownDescription(description, descriptionText);
      description.className = "muted task-flyout-description";
    }
    const archiveEntryId = readOnly ? entry?.id || entry?.sourceId || task.id : null;
    const notesSection = this.createTaskNotesSection(task, {
      readOnly: readOnly && !archiveEntryId,
      archiveEntryId,
    });
    const listSection = this.createTaskListSection(task, { readOnly: Boolean(readOnly && !archiveEntryId) });

    const infoToggle = this.elements.taskFlyoutInfoToggle;
    const meta = document.createElement("div");
    meta.className = "task-flyout-meta";
    meta.hidden = true;
    if (infoToggle) {
      infoToggle.setAttribute("aria-pressed", "false");
      // Replace any previous listener by cloning the button
      const freshToggle = infoToggle.cloneNode(true);
      infoToggle.replaceWith(freshToggle);
      this.elements.taskFlyoutInfoToggle = freshToggle;
      freshToggle.addEventListener("click", () => {
        const visible = !meta.hidden;
        meta.hidden = visible;
        freshToggle.setAttribute("aria-pressed", String(!visible));
        freshToggle.classList.toggle("is-active", !visible);
      });
    }
    meta.append(this.buildMetaRow("Task ID", task.slug || task.id));
    meta.append(this.buildMetaRow("Area of focus", task.areaOfFocus || "—"));
    meta.append(this.buildMetaRow("Context", task.contexts?.map(stripTagPrefix).join(", ") || "—"));
    meta.append(this.buildMetaRow("Project", this.getProjectName(task.projectId) || "—"));
    meta.append(this.buildMetaRow("Effort level", task.effortLevel || "—"));
    meta.append(this.buildMetaRow("Time required", task.timeRequired || "—"));
    meta.append(
      this.buildMetaRow(
        "My Day",
        this.isTaskInMyDay(task) ? "Today" : task.myDayDate ? formatFriendlyDate(task.myDayDate) : "—"
      )
    );
    meta.append(this.buildMetaRow("Due date", task.dueDate ? formatFriendlyDate(task.dueDate) : "—"));
    if (task.followUpDate) {
      meta.append(this.buildMetaRow("Follow up by", formatFriendlyDate(task.followUpDate)));
    }
    meta.append(this.buildMetaRow("Calendar", this.formatCalendarMeta(task)));
    if (isCompleted && task.waitingFor) {
      const referencedTask = this.taskManager.getReferencedTask(task.waitingFor);
      if (referencedTask) {
        const linkedTaskEl = this.buildMetaRow(
          "Waiting on task",
          `${referencedTask.slug || referencedTask.id} — ${referencedTask.title} [${STATUS_LABELS[referencedTask.status] || referencedTask.status}]`
        );
        meta.append(linkedTaskEl);
      } else {
        meta.append(this.buildMetaRow("Waiting on", task.waitingFor || "—"));
      }
    }
    meta.append(this.buildMetaRow("Completed", task.completedAt ? formatFriendlyDate(task.completedAt) : "—"));
    meta.append(this.buildMetaRow("Recurs", this.describeRecurrence(task.recurrenceRule) || "—"));
    meta.append(this.buildMetaRow("Created on", task.originDevice || "Unknown device"));

    let projectChip = null;
    if (task.projectId && !readOnly) {
      const projectName = this.getProjectName(task.projectId);
      if (projectName) {
        projectChip = document.createElement("button");
        projectChip.type = "button";
        projectChip.className = "btn btn-pill btn-small";
        projectChip.textContent = `${projectName} ↗`;
        projectChip.addEventListener("click", () => {
          this.openProjectFromTask(task);
          this.closeTaskFlyout();
        });
      }
    }

    if (task.status === STATUS.INBOX) {
      const inboxPanel = document.createElement("div");
      inboxPanel.className = "inbox-process-panel";
      const instructions = document.createElement("p");
      instructions.textContent = "Get clear on what this item means, then route it to the right list.";
      const processButton = document.createElement("button");
      processButton.type = "button";
      processButton.className = "btn btn-primary";
      processButton.textContent = "Process";
      processButton.addEventListener("click", () => {
        this.closeTaskFlyout();
        this.openClarifyModal(task.id);
      });
      const myDayButton = document.createElement("button");
      myDayButton.type = "button";
      myDayButton.className = "btn btn-light";
      myDayButton.textContent = this.isTaskInMyDay(task) ? "Remove from My Day" : "Add to My Day";
      myDayButton.addEventListener("click", () => this.toggleTaskMyDay(task));
      const inboxActions = document.createElement("div");
      inboxActions.className = "task-flyout-actions";
      inboxActions.append(processButton, myDayButton);
      const reminder = document.createElement("p");
      reminder.className = "muted small-text";
      reminder.textContent = "Processing will walk through Clarify → Organize.";
      inboxPanel.append(instructions, inboxActions, reminder);
      content.append(...[description, projectChip, inboxPanel, listSection, notesSection, meta].filter(Boolean));
      return;
    }

    const actionToolbar = document.createElement("div");
    actionToolbar.className = "task-flyout-actions";
    actionToolbar.setAttribute("role", "group");
    actionToolbar.setAttribute("aria-label", "Task actions");
    const transitions = TRANSITIONS[task.status] || [];

    if (readOnly) {
      const restoreButton = document.createElement("button");
      restoreButton.type = "button";
      restoreButton.className = "btn btn-primary";
      restoreButton.textContent = "Restore task";
      restoreButton.addEventListener("click", () => {
        const restored = this.taskManager.restoreCompletedTask(entry?.id || entry?.sourceId || task.id);
        if (restored) {
          this.flyoutContext = { readOnly: false, entry: null };
          this.setActivePanel("next");
          this.openTaskFlyout(restored.id);
        }
      });
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "btn btn-light";
      closeButton.textContent = "Close";
      closeButton.addEventListener("click", () => this.closeTaskFlyout());
      actionToolbar.append(restoreButton, closeButton);
      const readOnlyNote = document.createElement("p");
      readOnlyNote.className = "muted";
      readOnlyNote.textContent = "Archived task. Changes are saved to the archive. Restore to reactivate it.";
      content.append(...[description, actionToolbar, listSection, notesSection, readOnlyNote, meta].filter(Boolean));
      content.append(this.createTaskForm(task, { archiveEntryId }));
      return;
    }

    let completeSection = null;
    if (!isCompleted) {
      if (task.status !== STATUS.SOMEDAY) {
        const myDayButton = document.createElement("button");
        myDayButton.type = "button";
        myDayButton.className = "btn btn-light";
        myDayButton.textContent = this.isTaskInMyDay(task) ? "Remove from My Day" : "Add to My Day";
        myDayButton.addEventListener("click", () => this.toggleTaskMyDay(task));
        actionToolbar.append(myDayButton);
      }
      transitions.forEach((transition) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-light";
        button.textContent = transition.label;
        button.addEventListener("click", () => {
          this.taskManager.moveTask(task.id, transition.target);
        });
        actionToolbar.append(button);
      });
      if (actionToolbar.childElementCount > 0) {
        const workflowLabel = document.createElement("p");
        workflowLabel.className = "task-flyout-workflow-label";
        workflowLabel.textContent = "Move to";
        actionToolbar.prepend(workflowLabel);
      }

      completeSection = document.createElement("div");
      completeSection.className = "task-flyout-complete";
      const completeButton = document.createElement("button");
      completeButton.type = "button";
      completeButton.className = "btn btn-primary task-flyout-complete-btn";
      completeButton.textContent = "Complete";
      completeButton.addEventListener("click", async () => {
        if (this.taskManager.getFeatureFlag("confirmOnCompletion")) {
          const ok = await this.showConfirm(`Complete "${task.title}"?`, { okLabel: "Complete" });
          if (!ok) return;
        }
        this.taskManager.completeTask(task.id, { archive: "log" });
        this.closeTaskFlyout();
      });
      const completeArchiveButton = document.createElement("button");
      completeArchiveButton.type = "button";
      completeArchiveButton.className = "task-flyout-complete-secondary";
      completeArchiveButton.textContent = "Archive on completion \u2192";
      completeArchiveButton.addEventListener("click", () => {
        this.openClosureNotes(task.id, "reference");
      });
      if (task.recurrenceRule?.type) {
        const skipButton = document.createElement("button");
        skipButton.type = "button";
        skipButton.className = "task-flyout-complete-secondary";
        skipButton.textContent = "Skip this instance \u2192";
        skipButton.title = "Advance to next recurrence without completing";
        skipButton.addEventListener("click", () => {
          this.taskManager.skipRecurringTaskInstance(task.id);
          this.closeTaskFlyout();
        });
        completeSection.append(completeButton, skipButton, completeArchiveButton);
      } else {
        completeSection.append(completeButton, completeArchiveButton);
      }
    }

    const sessionsSection = this.createSessionsSection(task, { readOnly });
    const prerequisiteSection = readOnly ? null : this.createPrerequisiteSection(task);
    if (!isCompleted) {
      content.append(...[description, projectChip, completeSection, actionToolbar, listSection, notesSection, this.createFollowupSection(task), prerequisiteSection, sessionsSection, meta].filter(Boolean));
    } else {
      content.append(...[description, projectChip, actionToolbar, listSection, notesSection, sessionsSection, meta].filter(Boolean));
    }
    content.append(this.createTaskForm(task));
  }

  // ── Session log section ─────────────────────────────────────────────────

  _isoToDatetimeLocal(iso) {
    if (!iso) return "";
    // Convert ISO string to the value format expected by <input type="datetime-local">
    // e.g. "2026-04-13T10:30:00.000Z" → "2026-04-13T10:30" (local time)
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  _formatSessionDuration(startIso, endIso) {
    if (!startIso || !endIso) return null;
    const secs = Math.max(0, Math.floor((new Date(endIso) - new Date(startIso)) / 1000));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  createSessionsSection(task, { readOnly = false } = {}) {
    const sessions = task.doingSessions || [];
    const isActiveDoing = task.status === STATUS.DOING && task.doingStartedAt;
    // Only render if there's something to show (or active session).
    if (sessions.length === 0 && !isActiveDoing && (task.totalDoingSeconds || 0) === 0) return null;

    const section = document.createElement("section");
    section.className = "session-log";

    // ── Header ──
    const header = document.createElement("div");
    header.className = "session-log-header";
    const heading = document.createElement("h3");
    heading.textContent = "Time Tracked";

    const totalEl = document.createElement("span");
    totalEl.className = "session-log-total";
    totalEl.textContent = this._formatDoingElapsed(task.doingStartedAt, task.totalDoingSeconds || 0);

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "btn btn-icon session-log-toggle";
    toggleBtn.setAttribute("aria-label", "Toggle session log");
    toggleBtn.textContent = "⏱";

    header.append(heading, totalEl, toggleBtn);
    section.append(header);

    // ── Body (collapsible) ──
    const hasEntries = sessions.length > 0 || isActiveDoing;
    const body = document.createElement("div");
    body.className = "session-log-body";
    body.hidden = !hasEntries; // expand when there are entries, collapse when legacy-only
    toggleBtn.setAttribute("aria-expanded", String(!body.hidden));
    toggleBtn.classList.toggle("is-active", !body.hidden);
    toggleBtn.addEventListener("click", () => {
      const willExpand = body.hidden;
      body.hidden = !willExpand;
      toggleBtn.setAttribute("aria-expanded", String(willExpand));
      toggleBtn.classList.toggle("is-active", willExpand);
    });

    // ── Session list ──
    const list = document.createElement("div");
    list.className = "session-list";
    body.append(list);

    const renderList = () => {
      list.innerHTML = "";
      const currentTask = this.taskManager.getTaskById(task.id) || task;
      const currentSessions = currentTask.doingSessions || [];
      const activeDoing = currentTask.status === STATUS.DOING && currentTask.doingStartedAt;

      // Active (open) session badge at top
      if (activeDoing) {
        const activeRow = document.createElement("div");
        activeRow.className = "session-entry session-entry--active";
        const activeLabel = document.createElement("span");
        activeLabel.className = "session-entry-range";
        activeLabel.textContent = `${new Date(currentTask.doingStartedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })} → in progress`;
        const activeBadge = document.createElement("span");
        activeBadge.className = "session-entry-badge";
        activeBadge.textContent = "Active";
        activeRow.append(activeLabel, activeBadge);
        list.append(activeRow);
      }

      // Closed sessions (newest first)
      [...currentSessions].reverse().forEach((sess) => {
        if (!sess.end) return; // skip the open session (shown above)
        const row = document.createElement("div");
        row.className = "session-entry";

        const rangeEl = document.createElement("span");
        rangeEl.className = "session-entry-range";
        const startStr = new Date(sess.start).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
        const endStr = new Date(sess.end).toLocaleString([], { timeStyle: "short" });
        const dur = this._formatSessionDuration(sess.start, sess.end);
        rangeEl.textContent = `${startStr} → ${endStr}`;

        const durEl = document.createElement("span");
        durEl.className = "session-entry-duration";
        durEl.textContent = dur || "";

        row.append(rangeEl, durEl);

        if (!readOnly) {
          const actions = document.createElement("span");
          actions.className = "session-entry-actions";

          const editBtn = document.createElement("button");
          editBtn.type = "button";
          editBtn.className = "btn-link";
          editBtn.textContent = "Edit";
          editBtn.addEventListener("click", () => {
            if (row.querySelector(".session-edit-form")) return;
            const form = this._buildSessionEditForm(task.id, sess, () => renderList());
            row.append(form);
            editBtn.disabled = true;
          });

          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "btn-link btn-link--danger";
          delBtn.textContent = "Delete";
          delBtn.addEventListener("click", () => {
            this.taskManager.deleteDoingSession(task.id, sess.id);
            // Update the total in the header
            const refreshedTask = this.taskManager.getTaskById(task.id) || task;
            totalEl.textContent = this._formatDoingElapsed(refreshedTask.doingStartedAt, refreshedTask.totalDoingSeconds || 0);
            renderList();
          });

          actions.append(editBtn, delBtn);
          row.append(actions);
        }

        list.append(row);
      });

      // Empty state
      if (!activeDoing && currentSessions.filter((s) => s.end).length === 0) {
        const empty = document.createElement("p");
        empty.className = "session-log-empty muted small-text";
        empty.textContent = "No sessions logged yet.";
        list.append(empty);
      }
    };

    renderList();

    // ── Add session form ──
    if (!readOnly) {
      const addRow = document.createElement("div");
      addRow.className = "session-log-add";
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn btn-small btn-light";
      addBtn.textContent = "+ Add session";
      addBtn.addEventListener("click", () => {
        if (addRow.querySelector(".session-edit-form")) return;
        const form = this._buildSessionAddForm(task.id, () => {
          const refreshedTask = this.taskManager.getTaskById(task.id) || task;
          totalEl.textContent = this._formatDoingElapsed(refreshedTask.doingStartedAt, refreshedTask.totalDoingSeconds || 0);
          renderList();
          form.remove();
        });
        addRow.append(form);
      });
      addRow.append(addBtn);
      body.append(addRow);
    }

    section.append(body);
    return section;
  }

  _buildSessionEditForm(taskId, sess, onSave) {
    const form = document.createElement("div");
    form.className = "session-edit-form";

    const startInput = document.createElement("input");
    startInput.type = "datetime-local";
    startInput.className = "session-time-input";
    startInput.value = this._isoToDatetimeLocal(sess.start);

    const endInput = document.createElement("input");
    endInput.type = "datetime-local";
    endInput.className = "session-time-input";
    endInput.value = this._isoToDatetimeLocal(sess.end);

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn-small btn-primary";
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", () => {
      const newStart = startInput.value ? new Date(startInput.value).toISOString() : sess.start;
      const newEnd = endInput.value ? new Date(endInput.value).toISOString() : sess.end;
      if (newEnd && newStart > newEnd) {
        this.taskManager.notify("warn", "Session end must be after start.");
        return;
      }
      this.taskManager.updateDoingSession(taskId, sess.id, { start: newStart, end: newEnd });
      onSave();
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn-small btn-light";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => form.remove());

    const startLabel = document.createElement("label");
    startLabel.textContent = "Start";
    const endLabel = document.createElement("label");
    endLabel.textContent = "End";

    const btnRow = document.createElement("div");
    btnRow.className = "session-edit-btns";
    btnRow.append(saveBtn, cancelBtn);

    form.append(startLabel, startInput, endLabel, endInput, btnRow);
    return form;
  }

  _buildSessionAddForm(taskId, onSave) {
    const form = document.createElement("div");
    form.className = "session-edit-form session-add-form";

    const now = this._isoToDatetimeLocal(new Date().toISOString());

    const startInput = document.createElement("input");
    startInput.type = "datetime-local";
    startInput.className = "session-time-input";
    startInput.value = now;

    const endInput = document.createElement("input");
    endInput.type = "datetime-local";
    endInput.className = "session-time-input";
    endInput.value = now;

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn-small btn-primary";
    saveBtn.textContent = "Add";
    saveBtn.addEventListener("click", () => {
      if (!startInput.value || !endInput.value) {
        this.taskManager.notify("warn", "Both start and end are required.");
        return;
      }
      const start = new Date(startInput.value).toISOString();
      const end = new Date(endInput.value).toISOString();
      if (start >= end) {
        this.taskManager.notify("warn", "Session end must be after start.");
        return;
      }
      this.taskManager.addDoingSession(taskId, { start, end });
      onSave();
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn-small btn-light";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => form.remove());

    const startLabel = document.createElement("label");
    startLabel.textContent = "Start";
    const endLabel = document.createElement("label");
    endLabel.textContent = "End";

    const btnRow = document.createElement("div");
    btnRow.className = "session-edit-btns";
    btnRow.append(saveBtn, cancelBtn);

    form.append(startLabel, startInput, endLabel, endInput, btnRow);
    return form;
  }

  createPrerequisiteSection(task) {
    const prereqIds = task.prerequisiteTaskIds || [];
    const allPrereqs = prereqIds.map((id) => ({
      id,
      task: this.taskManager.getTaskById(id),
    }));

    const section = document.createElement("section");
    section.className = "task-prereq-section";

    const header = document.createElement("div");
    header.className = "task-prereq-header";
    const heading = document.createElement("h3");
    heading.textContent = "Prerequisites";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "btn btn-icon task-prereq-toggle";
    toggleBtn.setAttribute("aria-label", "Toggle prerequisites");
    const hasPrereqs = allPrereqs.length > 0;
    toggleBtn.textContent = "🔗";
    toggleBtn.classList.toggle("is-active", hasPrereqs);

    const body = document.createElement("div");
    body.className = "task-prereq-body";
    body.hidden = !hasPrereqs;

    toggleBtn.setAttribute("aria-expanded", String(hasPrereqs));
    toggleBtn.addEventListener("click", () => {
      const willExpand = body.hidden;
      body.hidden = !willExpand;
      toggleBtn.setAttribute("aria-expanded", String(willExpand));
      toggleBtn.classList.toggle("is-active", willExpand);
    });

    header.append(heading, toggleBtn);
    section.append(header, body);

    // Chip list
    const chipList = document.createElement("div");
    chipList.className = "task-prereq-chips";

    allPrereqs.forEach(({ id, task: prereq }) => {
      const chip = document.createElement("span");
      chip.className = "task-prereq-chip" + (prereq ? "" : " task-prereq-chip--missing");
      const labelEl = document.createElement("span");
      if (prereq?.completedAt) {
        const s = document.createElement("s");
        s.textContent = prereq.title;
        labelEl.append(s);
      } else {
        labelEl.textContent = prereq ? prereq.title : `Unknown (${id.slice(0, 8)})`;
      }
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "task-prereq-chip-remove";
      removeBtn.setAttribute("aria-label", "Remove prerequisite");
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        this.taskManager.removePrerequisite(task.id, id);
      });
      chip.append(labelEl, removeBtn);
      chipList.append(chip);
    });

    // Search input for adding prerequisites
    const addRow = document.createElement("div");
    addRow.className = "task-prereq-add-row";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn-link task-prereq-add-btn";
    addBtn.textContent = "+ Add prerequisite";

    const searchWrap = document.createElement("div");
    searchWrap.className = "task-prereq-search-wrap";
    searchWrap.hidden = true;

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "task-prereq-search";
    searchInput.placeholder = "Search tasks…";

    const resultsList = document.createElement("ul");
    resultsList.className = "task-prereq-results";
    resultsList.hidden = true;

    searchInput.addEventListener("input", () => {
      const term = searchInput.value;
      const results = this.taskManager.searchTasksForReference(term, { excludeTaskId: task.id });
      resultsList.innerHTML = "";
      resultsList.hidden = results.length === 0;
      results.forEach((result) => {
        if ((result.prerequisiteTaskIds || []).includes(task.id)) return; // skip if reverse dep
        const li = document.createElement("li");
        li.className = "task-prereq-result-item";
        li.textContent = result.title;
        const statusSpan = document.createElement("span");
        statusSpan.className = "task-prereq-result-status";
        statusSpan.textContent = STATUS_LABELS[result.status] || result.status;
        li.append(statusSpan);
        li.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          const added = this.taskManager.addPrerequisite(task.id, result.id);
          if (added) {
            searchInput.value = "";
            resultsList.hidden = true;
            searchWrap.hidden = true;
            addBtn.hidden = false;
          }
        });
        resultsList.append(li);
      });
    });

    searchInput.addEventListener("blur", () => {
      setTimeout(() => {
        resultsList.hidden = true;
        searchWrap.hidden = true;
        addBtn.hidden = false;
      }, 150);
    });

    addBtn.addEventListener("click", () => {
      addBtn.hidden = true;
      searchWrap.hidden = false;
      searchInput.focus();
    });

    searchWrap.append(searchInput, resultsList);
    addRow.append(addBtn, searchWrap);

    body.append(chipList, addRow);
    return section;
  }

  createFollowupSection(task) {
    const isWaiting = task.status === STATUS.WAITING;

    const section = document.createElement("section");
    section.className = "task-followup";

    // Header row — always visible
    const header = document.createElement("div");
    header.className = "task-followup-header";
    const heading = document.createElement("h3");
    heading.textContent = "Follow up";

    const body = document.createElement("div");
    body.className = "task-followup-body";
    body.hidden = !isWaiting;

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "btn btn-icon task-followup-toggle";
    toggleBtn.setAttribute("aria-label", "Toggle follow up");
    toggleBtn.setAttribute("aria-expanded", String(isWaiting));
    toggleBtn.classList.toggle("is-active", isWaiting);
    toggleBtn.textContent = "⏱";
    toggleBtn.addEventListener("click", () => {
      const willExpand = body.hidden;
      body.hidden = !willExpand;
      toggleBtn.setAttribute("aria-expanded", String(willExpand));
      toggleBtn.classList.toggle("is-active", willExpand);
    });

    header.append(heading, toggleBtn);
    section.append(header, body);

    // Detect existing type and strip prefix for display
    const existingWaiting = task.waitingFor || "";
    let selectedType = "person";
    let initialDisplay = existingWaiting;
    if (existingWaiting.startsWith("+")) {
      selectedType = "person";
      initialDisplay = existingWaiting.slice(1);
    } else if (existingWaiting.startsWith("@")) {
      selectedType = "context";
      initialDisplay = existingWaiting.slice(1);
    } else if (/^task:/i.test(existingWaiting)) {
      selectedType = "task";
      initialDisplay = existingWaiting.slice(5);
    }

    const waitingField = document.createElement("div");
    waitingField.className = "task-edit-field";
    const waitingLabel = document.createElement("span");
    waitingLabel.textContent = "Waiting on";

    const typeSelector = document.createElement("div");
    typeSelector.className = "waitingfor-type-selector";
    const waitingTypes = [
      { value: "person", label: "Person" },
      { value: "context", label: "Context" },
      { value: "task", label: "Task" },
    ];
    waitingTypes.forEach(({ value, label }) => {
      const pill = document.createElement("label");
      pill.className = "waitingfor-type-pill";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `waitingfor-type-${task.id}`;
      radio.value = value;
      radio.checked = value === selectedType;
      pill.append(radio, document.createTextNode(label));
      typeSelector.append(pill);
    });

    const waitingInput = document.createElement("input");
    waitingInput.type = "text";
    waitingInput.value = initialDisplay;

    const placeholders = { person: "Name (e.g., Alice)", context: "Context (e.g., Office)", task: "Search for a task…" };
    waitingInput.placeholder = placeholders[selectedType];

    typeSelector.addEventListener("change", (e) => {
      if (e.target.type !== "radio") return;
      selectedType = e.target.value;
      waitingInput.placeholder = placeholders[selectedType] || "";
      suggestionList.style.display = "none";
      suggestionList.innerHTML = "";
    });

    waitingField.append(waitingLabel, typeSelector, waitingInput);

    // Task reference suggestion list
    const suggestionList = document.createElement("div");
    suggestionList.className = "task-reference-suggestions";
    suggestionList.style.display = "none";
    suggestionList.style.maxHeight = "200px";
    suggestionList.style.overflowY = "auto";
    suggestionList.style.border = "1px solid var(--line)";
    suggestionList.style.borderRadius = "4px";
    suggestionList.style.marginTop = "4px";
    suggestionList.style.background = "var(--surface)";
    suggestionList.style.zIndex = "10";

    waitingInput.addEventListener("input", () => {
      const value = waitingInput.value.trim();
      suggestionList.innerHTML = "";
      suggestionList.style.display = "none";
      if (selectedType === "task") {
        if (value.length < 2) return;
        const suggestions = this.taskManager.searchTasksForReference(value, { excludeTaskId: task.id });
        if (suggestions.length === 0) return;
        suggestionList.style.display = "block";
        suggestions.forEach((suggestionTask) => {
          const item = document.createElement("div");
          item.style.padding = "8px";
          item.style.borderBottom = "1px solid var(--line)";
          item.style.cursor = "pointer";
          item.style.fontSize = "0.9em";
          item.textContent = `${suggestionTask.slug || suggestionTask.id} — ${suggestionTask.title} [${STATUS_LABELS[suggestionTask.status] || suggestionTask.status}]`;
          item.addEventListener("click", () => {
            waitingInput.value = suggestionTask.slug || suggestionTask.id;
            suggestionList.style.display = "none";
            suggestionList.innerHTML = "";
          });
          item.addEventListener("pointerover", () => { item.style.background = "var(--surface-2)"; });
          item.addEventListener("pointerout", () => { item.style.background = "transparent"; });
          suggestionList.append(item);
        });
      } else if (selectedType === "person") {
        if (value.length < 1) return;
        const lower = value.toLowerCase();
        const matches = this.taskManager.getKnownDelegateNames().filter((n) => n.toLowerCase().startsWith(lower));
        if (matches.length === 0) return;
        suggestionList.style.display = "block";
        matches.forEach((name) => {
          const item = document.createElement("div");
          item.style.padding = "8px";
          item.style.borderBottom = "1px solid var(--line)";
          item.style.cursor = "pointer";
          item.style.fontSize = "0.9em";
          item.textContent = name;
          item.addEventListener("click", () => {
            waitingInput.value = name;
            suggestionList.style.display = "none";
            suggestionList.innerHTML = "";
          });
          item.addEventListener("pointerover", () => { item.style.background = "var(--surface-2)"; });
          item.addEventListener("pointerout", () => { item.style.background = "transparent"; });
          suggestionList.append(item);
        });
      }
    });

    waitingField.append(suggestionList);

    const timingField = document.createElement("label");
    timingField.className = "task-edit-field";
    timingField.textContent = "Follow-up timing";
    const timingSelect = document.createElement("select");
    const timingOptions = [
      { label: "Follow up tomorrow", value: "24h" },
      { label: "Follow up in 7 days", value: "7d" },
      { label: "Custom date", value: "custom" },
    ];
    timingOptions.forEach((option) => {
      const node = document.createElement("option");
      node.value = option.value;
      node.textContent = option.label;
      timingSelect.append(node);
    });
    timingField.append(timingSelect);

    const customField = document.createElement("label");
    customField.className = "task-edit-field";
    customField.textContent = "Custom follow-up date";
    const customDate = document.createElement("input");
    customDate.type = "date";
    customField.append(customDate);
    customField.hidden = true;
    if (task.dueDate) {
      timingSelect.value = "custom";
      customField.hidden = false;
      customDate.value = task.dueDate;
    }
    timingSelect.addEventListener("change", () => {
      const isCustom = timingSelect.value === "custom";
      customField.hidden = !isCustom;
      if (!isCustom) customDate.value = "";
    });

    const actions = document.createElement("div");
    actions.className = "task-edit-actions-group";
    const setButton = document.createElement("button");
    setButton.type = "button";
    setButton.className = "btn btn-primary";
    setButton.textContent = "Set follow-up";
    setButton.addEventListener("click", () => {
      const raw = waitingInput.value.trim();
      let waitingFor;
      if (!raw) {
        waitingFor = "Pending response";
      } else if (selectedType === "person") {
        waitingFor = `+${raw}`;
      } else if (selectedType === "context") {
        waitingFor = `@${raw}`;
      } else {
        waitingFor = `task:${raw}`;
      }
      const dueDate = this.resolveFollowupDate(timingSelect.value, customDate.value);
      if (!dueDate) {
        this.taskManager.notify("warn", "Choose a follow-up timeframe.");
        return;
      }
      const updates = {
        status: STATUS.WAITING,
        waitingFor,
        dueDate,
      };
      this.taskManager.updateTask(task.id, updates);
      this.taskManager.notify("info", `Follow-up set for ${formatFriendlyDate(dueDate)}.`);
    });
    actions.append(setButton);

    body.append(waitingField, timingField, customField, actions);
    return section;
  }

  createTaskNotesSection(task, { readOnly = false, archiveEntryId = null } = {}) {
    const section = document.createElement("section");
    section.className = "task-notes";

    const notes = Array.isArray(task.notes) ? [...task.notes] : [];
    const hasNotes = notes.length > 0;

    // Header — always visible
    const header = document.createElement("div");
    header.className = "task-notes-header";
    const title = document.createElement("h3");
    title.textContent = "Notes";
    const count = document.createElement("span");
    count.className = "muted small-text";
    count.textContent = hasNotes ? `${notes.length} entr${notes.length === 1 ? "y" : "ies"}` : "";

    // Collapsible body
    const body = document.createElement("div");
    body.className = "task-notes-body";
    body.hidden = !hasNotes;

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "btn btn-icon task-notes-toggle";
    toggleBtn.setAttribute("aria-label", "Toggle notes");
    toggleBtn.setAttribute("aria-expanded", String(hasNotes));
    toggleBtn.classList.toggle("is-active", hasNotes);
    toggleBtn.textContent = "✎";
    header.style.cursor = "pointer";
    header.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (btn && btn !== toggleBtn) return;
      const willExpand = body.hidden;
      body.hidden = !willExpand;
      toggleBtn.setAttribute("aria-expanded", String(willExpand));
      toggleBtn.classList.toggle("is-active", willExpand);
      if (willExpand && noteInput) noteInput.focus();
    });

    header.append(title, count, toggleBtn);

    const list = document.createElement("ul");
    list.className = "task-notes-list";
    notes
      .sort((a, b) => new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0))
      .forEach((note) => {
        const item = document.createElement("li");
        item.className = "task-note-item";
        if (!readOnly) {
          item.dataset.noteId = note.id;
          item.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.openTaskNoteContextMenu(
              { taskId: task.id, archiveEntryId: archiveEntryId || null, noteId: note.id },
              event.clientX,
              event.clientY
            );
          });
        }
        const meta = document.createElement("div");
        meta.className = "task-note-meta";
        const timestamp = document.createElement("time");
        timestamp.dateTime = note.createdAt || "";
        timestamp.textContent = this.formatTimestampDisplay(note.createdAt);
        meta.append(timestamp);
        const text = document.createElement("div");
        text.className = "task-note-text";
        this.setEntityLinkedTextWithImages(text, note.text || "");
        item.append(meta, text);
        list.append(item);
      });

    body.append(list);

    if (readOnly) {
      const helper = document.createElement("p");
      helper.className = "muted small-text";
      helper.textContent = "Restore this task to add or edit notes.";
      body.append(helper);
      header.append(title, count, toggleBtn);
      section.append(header, body);
      return section;
    }

    let noteInput = null;
    const form = document.createElement("form");
    form.className = "task-note-form";
    form.setAttribute("aria-label", "Add task note");
    noteInput = document.createElement("textarea");
    noteInput.rows = 3;
    noteInput.placeholder = "Capture findings, blockers, and progress updates... (e.g., +Alice for a person, @Home for a context, #ProjectName for a project)";
    this.attachEntityMentionAutocomplete(noteInput);
    noteInput.addEventListener("paste", (event) => {
      const imageItem = Array.from(event.clipboardData?.items || []).find((i) => i.type.startsWith("image/"));
      if (!imageItem) return;
      event.preventDefault();
      const blob = imageItem.getAsFile();
      if (!blob) return;
      this.uploadImage(blob).then((url) => {
        if (!url) return;
        const md = `![](${url})`;
        const start = noteInput.selectionStart;
        noteInput.value = noteInput.value.slice(0, start) + md + noteInput.value.slice(noteInput.selectionEnd);
        noteInput.selectionStart = noteInput.selectionEnd = start + md.length;
      });
    });
    const actions = document.createElement("div");
    actions.className = "task-note-actions";
    const addButton = document.createElement("button");
    addButton.type = "submit";
    addButton.className = "btn btn-light";
    addButton.textContent = "Add note";
    actions.append(addButton);
    form.append(noteInput, actions);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const noteText = noteInput.value;
      const added = archiveEntryId
        ? this.taskManager.addCompletedTaskNote(archiveEntryId, noteText)
        : this.taskManager.addTaskNote(task.id, noteText);
      if (!added) return;
      this.ensureMentionedEntitiesExist(noteText);
      noteInput.value = "";
      noteInput.focus();
    });
    body.append(form);
    section.append(header, body);
    return section;
  }

  createTaskForm(task, { archiveEntryId = null } = {}) {
    const isArchivedEntry = Boolean(archiveEntryId);
    const form = document.createElement("form");
    form.className = "task-edit";
    form.setAttribute("aria-label", "Edit task");

    const editDivider = document.createElement("div");
    editDivider.className = "task-section-divider";
    const editDividerLabel = document.createElement("span");
    editDividerLabel.textContent = "Edit details";
    editDivider.append(editDividerLabel);
    form.append(editDivider);

    const titleGroup = document.createElement("label");
    titleGroup.className = "task-edit-field";
    titleGroup.textContent = "Title";
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.value = task.title || "";
    titleInput.required = true;
    this.attachEntityMentionAutocomplete(titleInput);
    titleGroup.append(titleInput);

    const descriptionGroup = document.createElement("label");
    descriptionGroup.className = "task-edit-field";
    descriptionGroup.textContent = "Description";
    const descriptionInput = document.createElement("textarea");
    descriptionInput.rows = 3;
    descriptionInput.value = task.description || "";
    this.attachEntityMentionAutocomplete(descriptionInput);
    descriptionInput.addEventListener("paste", (event) => {
      const imageItem = Array.from(event.clipboardData?.items || []).find((i) => i.type.startsWith("image/"));
      if (!imageItem) return;
      event.preventDefault();
      const blob = imageItem.getAsFile();
      if (!blob) return;
      this.uploadImage(blob).then((url) => {
        if (!url) return;
        const md = `![](${url})`;
        const start = descriptionInput.selectionStart;
        descriptionInput.value = descriptionInput.value.slice(0, start) + md + descriptionInput.value.slice(descriptionInput.selectionEnd);
        descriptionInput.selectionStart = descriptionInput.selectionEnd = start + md.length;
      });
    });
    descriptionGroup.append(descriptionInput);

    const slugGroup = document.createElement("label");
    slugGroup.className = "task-edit-field";
    slugGroup.textContent = "Short ID";
    const slugInput = document.createElement("input");
    slugInput.type = "text";
    slugInput.value = task.slug || task.id;
    slugInput.readOnly = true;
    slugInput.className = "task-slug-input";
    slugGroup.append(slugInput);

    const contextGroup = document.createElement("div");
    contextGroup.className = "task-edit-field";
    const contextLabel = document.createElement("span");
    contextLabel.textContent = "Context";
    contextGroup.append(contextLabel);
    const contextList = document.createElement("div");
    contextList.className = "task-edit-context-list";
    const selectedContexts = new Set(task.contexts || []);
    const allContexts = Array.from(new Set([
      ...this.taskManager.getContexts(),
      ...(task.contexts || []),
    ]));
    allContexts.forEach((ctx) => {
      const lbl = document.createElement("label");
      lbl.className = "task-edit-context-checkbox";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = ctx;
      cb.checked = selectedContexts.has(ctx);
      lbl.append(cb, document.createTextNode(stripTagPrefix(ctx)));
      contextList.append(lbl);
    });
    const contextInput = {
      getValues: () => Array.from(contextList.querySelectorAll("input:checked")).map((cb) => cb.value),
      _contextList: contextList,
    };
    contextGroup.append(contextList);

    const effortGroup = document.createElement("label");
    effortGroup.className = "task-edit-field";
    effortGroup.textContent = "Effort level";
    const effortInput = document.createElement("select");
    const emptyEffort = document.createElement("option");
    emptyEffort.value = "";
    emptyEffort.textContent = "Select effort";
    effortInput.append(emptyEffort);
    const effortTooltips = { low: "Low — routine tasks needing little mental energy", medium: "Medium — tasks requiring sustained focus", high: "High — complex tasks needing deep concentration" };
    EFFORT_LEVELS.forEach((level) => {
      const option = document.createElement("option");
      option.value = level;
      option.textContent = level.charAt(0).toUpperCase() + level.slice(1);
      option.title = effortTooltips[level] || "";
      effortInput.append(option);
    });
    effortInput.value = task.effortLevel || "";
    effortGroup.append(effortInput);

    const timeGroup = document.createElement("label");
    timeGroup.className = "task-edit-field";
    timeGroup.textContent = "Time required";
    const timeInput = document.createElement("select");
    const emptyTime = document.createElement("option");
    emptyTime.value = "";
    emptyTime.textContent = "Select duration";
    timeInput.append(emptyTime);
    TIME_REQUIREMENTS.forEach((duration) => {
      const option = document.createElement("option");
      option.value = duration;
      option.textContent = duration;
      timeInput.append(option);
    });
    timeInput.value = task.timeRequired || "";
    timeGroup.append(timeInput);

    const statusGroup = document.createElement("label");
    statusGroup.className = "task-edit-field";
    statusGroup.textContent = "Status";
    const statusValue = document.createElement("div");
    statusValue.className = "muted";
    statusValue.textContent = isArchivedEntry
      ? `${STATUS_LABELS[task.status] || task.status} (archived record)`
      : `${STATUS_LABELS[task.status] || task.status} (use workflow buttons to change)`;
    statusGroup.append(statusValue);

    const projectGroup = document.createElement("label");
    projectGroup.className = "task-edit-field";
    projectGroup.textContent = "Project";
    const projectControls = document.createElement("div");
    projectControls.className = "task-project-controls";
    const projectSelect = document.createElement("select");
    const noProjectOption = document.createElement("option");
    noProjectOption.value = "";
    noProjectOption.textContent = "No project";
    projectSelect.append(noProjectOption);
    const allProjects = [...this.getProjectCache()].sort((a, b) => a.name.localeCompare(b.name));
    const activeProjects = allProjects.filter((p) => !p.someday && p.statusTag !== "Completed" && p.statusTag !== "OnHold");
    const onHoldProjects = allProjects.filter((p) => !p.someday && p.statusTag === "OnHold");
    const backburnerProjects = allProjects.filter((p) => p.someday);
    const appendGroup = (label, projects) => {
      if (!projects.length) return;
      const group = document.createElement("optgroup");
      group.label = label;
      projects.forEach((project) => {
        const option = document.createElement("option");
        option.value = project.id;
        option.textContent = project.areaOfFocus ? `[${project.areaOfFocus}] ${project.name}` : project.name;
        group.append(option);
      });
      projectSelect.append(group);
    };
    appendGroup("Active", activeProjects);
    appendGroup("On Hold", onHoldProjects);
    appendGroup("Backburner", backburnerProjects);
    projectSelect.value = task.projectId || "";
    const createProjectButton = document.createElement("button");
    createProjectButton.type = "button";
    createProjectButton.className = "btn btn-link task-project-create";
    createProjectButton.textContent = "New project";
    createProjectButton.addEventListener("click", () => this.createProjectForTask(task, { archiveEntryId }));
    const viewProjectBtn = document.createElement("button");
    viewProjectBtn.type = "button";
    viewProjectBtn.className = "btn btn-link task-project-create";
    viewProjectBtn.textContent = "→ View";
    viewProjectBtn.hidden = !projectSelect.value;
    viewProjectBtn.addEventListener("click", () => {
      const pid = projectSelect.value;
      if (!pid) return;
      this.openProjectFromTask({ projectId: pid });
      this.closeTaskFlyout();
    });
    projectSelect.addEventListener("change", () => {
      viewProjectBtn.hidden = !projectSelect.value;
    });
    projectControls.append(projectSelect, createProjectButton, viewProjectBtn);
    projectGroup.append(projectControls);

    let convertRow = null;
    if (!isArchivedEntry && !task.completedAt) {
      convertRow = document.createElement("div");
      convertRow.className = "task-edit-convert";
      const convertBtn = document.createElement("button");
      convertBtn.type = "button";
      convertBtn.className = "btn btn-link";
      convertBtn.textContent = "Convert task to project \u2192";
      convertBtn.addEventListener("click", () => this.convertTaskToProject(task));
      convertRow.append(convertBtn);
    }

    const areaGroup = document.createElement("div");
    areaGroup.className = "task-edit-field";
    const areaLabel = document.createElement("span");
    areaLabel.textContent = "Area of focus";
    const areaInput = document.createElement("select");
    populateAreaSelect(areaInput, this.taskManager.getAreasOfFocus(), task.areaOfFocus || "");
    const areaNewBtn = document.createElement("button");
    areaNewBtn.type = "button";
    areaNewBtn.className = "btn btn-light btn-small";
    areaNewBtn.textContent = "+ New";
    areaNewBtn.addEventListener("click", () => addNewAreaOption(areaInput, this.taskManager));
    const areaWrapper = document.createElement("div");
    areaWrapper.className = "area-select-group";
    areaWrapper.append(areaInput, areaNewBtn);
    areaGroup.append(areaLabel, areaWrapper);

    const dueGroup = document.createElement("label");
    dueGroup.className = "task-edit-field";
    dueGroup.textContent = "Due date";
    const dueInput = document.createElement("input");
    dueInput.type = "date";
    dueInput.value = task.dueDate || "";
    dueGroup.append(dueInput);

    const followUpGroup = document.createElement("label");
    followUpGroup.className = "task-edit-field";
    followUpGroup.textContent = "Follow up by";
    const followUpInput = document.createElement("input");
    followUpInput.type = "date";
    followUpInput.value = task.followUpDate || "";
    followUpGroup.append(followUpInput);

    const calendarGroup = document.createElement("label");
    calendarGroup.className = "task-edit-field";
    calendarGroup.textContent = "Calendar date";
    const calendarControls = document.createElement("div");
    calendarControls.className = "task-calendar-controls";
    const calendarInput = document.createElement("input");
    calendarInput.type = "date";
    calendarInput.value = task.calendarDate || "";
    const calendarTimeInput = document.createElement("input");
    calendarTimeInput.type = "time";
    calendarTimeInput.value = task.calendarTime || "";
    const calendarEndTimeInput = document.createElement("input");
    calendarEndTimeInput.type = "time";
    calendarEndTimeInput.value = task.calendarEndTime || "";
    calendarEndTimeInput.title = "End time";
    const syncEndTimeVisibility = () => {
      calendarEndTimeInput.hidden = !calendarTimeInput.value;
      if (!calendarTimeInput.value) calendarEndTimeInput.value = "";
    };
    calendarTimeInput.addEventListener("change", syncEndTimeVisibility);
    syncEndTimeVisibility();
    calendarControls.append(calendarInput, calendarTimeInput, calendarEndTimeInput);
    calendarGroup.append(calendarControls);

    const waitingGroup = document.createElement("label");
    waitingGroup.className = "task-edit-field";
    waitingGroup.textContent = "Waiting on";
    const waitingInput = document.createElement("input");
    waitingInput.type = "text";
    waitingInput.placeholder = "Person or task reference (e.g., task:abc123)";
    waitingInput.value = task.waitingFor || "";
    this.attachEntityMentionAutocomplete(waitingInput);
    waitingGroup.append(waitingInput);

    // Show referenced task info if applicable
    const referencedTask = this.taskManager.getReferencedTask(task.waitingFor);
    if (referencedTask) {
      const refInfo = document.createElement("p");
      refInfo.className = "muted small-text";
      refInfo.style.marginTop = "4px";
      refInfo.textContent = `→ Waiting for: ${referencedTask.slug || referencedTask.id} "${referencedTask.title}" [${STATUS_LABELS[referencedTask.status]}]`;
      waitingGroup.append(refInfo);
    }

    const closureGroup = document.createElement("label");
    closureGroup.className = "task-edit-field";
    closureGroup.textContent = "Closure notes";
    const closureInput = document.createElement("textarea");
    closureInput.rows = 3;
    closureInput.placeholder = "Optional wrap-up notes when completing this task.";
    closureInput.value = task.closureNotes || "";
    this.attachEntityMentionAutocomplete(closureInput);
    closureGroup.append(closureInput);

    const recurrenceGroup = document.createElement("label");
    recurrenceGroup.className = "task-edit-field";
    recurrenceGroup.textContent = "Recurring";
    const recurrenceControls = document.createElement("div");
    recurrenceControls.className = "task-recurrence-controls";
    const recurrenceSelect = document.createElement("select");
    const recurrenceNone = document.createElement("option");
    recurrenceNone.value = "";
    recurrenceNone.textContent = "Does not repeat";
    recurrenceSelect.append(recurrenceNone);
    [
      { value: "daily", label: "Daily" },
      { value: "weekly", label: "Weekly" },
      { value: "monthly", label: "Monthly" },
      { value: "yearly", label: "Yearly" },
    ].forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.label;
      recurrenceSelect.append(opt);
    });
    recurrenceSelect.value = task.recurrenceRule?.type || "";
    const recurrenceInterval = document.createElement("input");
    recurrenceInterval.type = "number";
    recurrenceInterval.min = "1";
    recurrenceInterval.step = "1";
    recurrenceInterval.value = task.recurrenceRule?.interval || 1;
    recurrenceInterval.className = "task-recurrence-interval";
    recurrenceControls.append(recurrenceSelect, recurrenceInterval);
    const updateRecurrenceControls = () => {
      const active = Boolean(recurrenceSelect.value);
      recurrenceInterval.disabled = !active;
    };
    updateRecurrenceControls();
    recurrenceSelect.addEventListener("change", updateRecurrenceControls);
    const recurrenceHint = document.createElement("small");
    recurrenceHint.className = "muted";
    recurrenceHint.textContent = "Next occurrence appears after you complete the task.";
    recurrenceGroup.append(recurrenceControls, recurrenceHint);

    const buildTaskUpdates = () => {
      const trimmedTitle = titleInput.value.trim();
      if (!trimmedTitle) {
        return null;
      }
      const updates = {
        title: trimmedTitle,
        description: descriptionInput.value.trim(),
        contexts: contextInput.getValues(),
        areaOfFocus: areaInput.value.trim() || null,
        effortLevel: effortInput.value || null,
        timeRequired: timeInput.value || null,
        projectId: projectSelect.value || null,
        dueDate: dueInput.value || null,
        followUpDate: followUpInput.value || null,
        calendarDate: calendarInput.value || null,
        calendarTime: calendarTimeInput.value || null,
        calendarEndTime: calendarEndTimeInput.value || null,
        waitingFor: waitingInput.value.trim() || null,
        closureNotes: closureInput.value.trim() || null,
        recurrenceRule:
          recurrenceSelect.value && recurrenceSelect.value !== ""
            ? {
                type: recurrenceSelect.value,
                interval: Math.max(1, parseInt(recurrenceInterval.value, 10) || 1),
              }
            : null,
      };
      if (task.status === STATUS.WAITING && !updates.waitingFor) {
        updates.waitingFor = "Pending response";
      }
      if (task.status !== STATUS.WAITING && updates.waitingFor && updates.waitingFor.startsWith("Pending")) {
        updates.waitingFor = null;
      }
      return updates;
    };

    const applyTaskUpdates = ({ showTitleWarning = false } = {}) => {
      const updates = buildTaskUpdates();
      if (!updates) {
        if (showTitleWarning) {
          this.taskManager.notify("warn", "Task title cannot be empty.");
          titleInput.focus();
        }
        return false;
      }
      // Parse inline #Project / +Person refs from the title when fields are unset.
      if (!isArchivedEntry && updates.title !== task.title) {
        const refs = this.parseInlineTitleRefs(updates.title, {
          currentProjectId: updates.projectId,
          currentPeopleTag: task.peopleTag,
        });
        if (refs.projectId) {
          updates.projectId = refs.projectId;
          if (projectSelect) projectSelect.value = refs.projectId;
        }
        if (refs.peopleTag) updates.peopleTag = refs.peopleTag;
        refs.messages.forEach((msg) => this.taskManager.notify("info", msg));
      }
      const updated = isArchivedEntry
        ? this.taskManager.updateCompletedTask(archiveEntryId, updates)
        : this.taskManager.updateTask(task.id, updates);
      return Boolean(updated);
    };

    // Keep a lightweight auto-save so sidebar edits persist without clicking Save.
    let autoSaveTimer = null;
    const scheduleAutoSave = () => {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
      }
      autoSaveTimer = setTimeout(() => applyTaskUpdates(), 200);
    };

    const autoSaveFields = [
      titleInput,
      descriptionInput,
      areaInput,
      effortInput,
      timeInput,
      projectSelect,
      dueInput,
      followUpInput,
      calendarInput,
      calendarTimeInput,
      calendarEndTimeInput,
      waitingInput,
      closureInput,
      recurrenceSelect,
      recurrenceInterval,
    ];
    autoSaveFields.forEach((field) => {
      field.addEventListener("change", scheduleAutoSave);
    });
    contextInput._contextList.addEventListener("change", scheduleAutoSave);

    const actions = document.createElement("div");
    actions.className = "task-edit-actions";

    const actionButtons = document.createElement("div");
    actionButtons.className = "task-edit-actions-group";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "btn btn-light";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => this.closeTaskFlyout());

    actionButtons.append(closeButton);
    if (!isArchivedEntry) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "btn btn-danger";
      deleteButton.textContent = "Delete task";
      deleteButton.addEventListener("click", async () => {
        const confirmed = await this.showConfirm(`Delete "${task.title}"?`, { title: "Delete task", okLabel: "Delete", danger: true });
        if (confirmed) {
          this.taskManager.deleteTask(task.id);
          this.closeTaskFlyout();
        }
      });
      actions.append(deleteButton, actionButtons);
    } else {
      actions.append(actionButtons);
    }

    form.append(
      titleGroup,
      descriptionGroup,
      slugGroup,
      contextGroup,
      areaGroup,
      effortGroup,
      timeGroup,
      statusGroup,
      projectGroup,
      ...(convertRow ? [convertRow] : []),
      dueGroup,
      followUpGroup,
      calendarGroup,
      ...(task.completedAt ? [closureGroup] : []),
      recurrenceGroup,
      actions
    );

    form.addEventListener("submit", (event) => {
      event.preventDefault();
    });

    return form;
  }

  async createProjectForTask(task, { archiveEntryId = null } = {}) {
    if (!task) return;
    const proposedName = await this.showPrompt("New project name:");
    if (!proposedName || !proposedName.trim()) return;
    const trimmedName = proposedName.trim();
    const confirmMessage = `Create project "${trimmedName}" and assign it to "${task.title || "this task"}"?`;
    if (!await this.showConfirm(confirmMessage, { okLabel: "Create project" })) {
      return;
    }
    const project = this.taskManager.addProject(trimmedName);
    if (project) {
      if (archiveEntryId) {
        this.taskManager.updateCompletedTask(archiveEntryId, { projectId: project.id });
      } else {
        this.taskManager.updateTask(task.id, { projectId: project.id });
      }
    }
  }

  async convertTaskToProject(task) {
    if (!task) return;

    // Step 1: confirm project name (default to the task's title)
    const proposedName = await this.showPrompt("Project name:", task.title || "");
    if (!proposedName || !proposedName.trim()) return;
    const projectName = proposedName.trim();

    // Step 2: create the project, inheriting area of focus from the task
    const project = this.taskManager.addProject(projectName, "", {
      areaOfFocus: task.areaOfFocus || null,
    });
    if (!project) return;

    // Step 3: convert the original task into a next action under the new project
    this.taskManager.updateTask(task.id, {
      projectId: project.id,
      status: STATUS.NEXT,
    });

    // Step 4: optionally add a first next action
    const firstAction = await this.showPrompt("Add a next action for this project (or leave blank to skip):");
    if (firstAction && firstAction.trim()) {
      this.taskManager.addTask({
        title: firstAction.trim(),
        status: STATUS.NEXT,
        projectId: project.id,
        contexts: task.contexts ? [...task.contexts] : [],
        areaOfFocus: task.areaOfFocus || null,
      });
    }

    this.closeTaskFlyout();
    this.setActivePanel("projects");
    this.taskManager.notify("info", `"${task.title}" converted to project "${projectName}".`);
  }

  setupEntityMentionAutocomplete() {
    this.ensureEntityMentionMenu();
    [
      this.elements.quickAddInput,
      this.elements.quickAddDescription,
      this.elements.closureNotesInput,
    ].forEach((input) => this.attachEntityMentionAutocomplete(input));
  }

  ensureEntityMentionMenu() {
    if (this.entityMentionAutocompleteState?.menu) return;
    const menu = document.createElement("div");
    menu.className = "mention-autocomplete-menu";
    menu.hidden = true;
    menu.setAttribute("role", "listbox");
    document.body.append(menu);

    this.entityMentionAutocompleteState = {
      menu,
      input: null,
      suggestions: [],
      activeIndex: 0,
      tokenStart: 0,
      tokenEnd: 0,
      trigger: null,
    };

    if (!this.entityMentionDismissHandler) {
      this.entityMentionDismissHandler = (event) => {
        const state = this.entityMentionAutocompleteState;
        if (!state?.menu || state.menu.hidden) return;
        if (state.menu.contains(event.target)) return;
        if (state.input && state.input.contains && state.input.contains(event.target)) return;
        if (state.input === event.target) return;
        this.closeEntityMentionMenu();
      };
      document.addEventListener("pointerdown", this.entityMentionDismissHandler, true);
    }
    if (!this.entityMentionRepositionHandler) {
      this.entityMentionRepositionHandler = () => {
        this.positionEntityMentionMenu();
      };
      window.addEventListener("resize", this.entityMentionRepositionHandler);
      window.addEventListener("scroll", this.entityMentionRepositionHandler, true);
    }
  }

  attachEntityMentionAutocomplete(input) {
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
    if (input.readOnly || input.disabled) return;
    if (this.boundEntityMentionInputs.has(input)) return;
    this.boundEntityMentionInputs.add(input);

    const refresh = () => this.refreshEntityMentionMenu(input);
    input.addEventListener("input", refresh);
    input.addEventListener("click", refresh);
    input.addEventListener("keyup", (event) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
        refresh();
      }
    });
    input.addEventListener("keydown", (event) => {
      this.handleEntityMentionKeydown(event, input);
    });
    input.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (this.entityMentionAutocompleteState?.input !== input) return;
        this.closeEntityMentionMenu();
      }, 120);
    });
  }

  handleEntityMentionKeydown(event, input) {
    const state = this.entityMentionAutocompleteState;
    if (!state || state.menu.hidden || state.input !== input) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.moveEntityMentionSelection(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.moveEntityMentionSelection(-1);
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      this.applyEntityMentionSelection(state.activeIndex);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.closeEntityMentionMenu();
    }
  }

  moveEntityMentionSelection(delta) {
    const state = this.entityMentionAutocompleteState;
    if (!state || !state.suggestions.length) return;
    const count = state.suggestions.length;
    state.activeIndex = (state.activeIndex + delta + count) % count;
    this.renderEntityMentionMenu();
  }

  refreshEntityMentionMenu(input) {
    const query = this.getEntityMentionQueryAtCaret(input);
    if (!query) {
      this.closeEntityMentionMenu();
      return;
    }
    const suggestions = this.getEntityMentionSuggestions(query.trigger, query.term);
    if (!suggestions.length) {
      this.closeEntityMentionMenu();
      return;
    }
    const state = this.entityMentionAutocompleteState;
    if (!state) return;
    state.input = input;
    state.suggestions = suggestions.slice(0, 8);
    state.activeIndex = 0;
    state.tokenStart = query.tokenStart;
    state.tokenEnd = query.tokenEnd;
    state.trigger = query.trigger;
    this.renderEntityMentionMenu();
    this.positionEntityMentionMenu();
  }

  getEntityMentionQueryAtCaret(input) {
    if (!input || typeof input.selectionStart !== "number" || typeof input.selectionEnd !== "number") return null;
    if (input.selectionStart !== input.selectionEnd) return null;
    const caret = input.selectionStart;
    const before = input.value.slice(0, caret);
    const match = before.match(/(?:^|[\s([{,;])([@#+][A-Za-z0-9_-]*)$/);
    if (!match) return null;
    const token = match[1] || "";
    if (!token || token.length < 1) return null;
    const trigger = token[0];
    if (trigger !== "@" && trigger !== "+" && trigger !== "#") return null;
    return {
      trigger,
      term: token.slice(1).toLowerCase(),
      tokenStart: caret - token.length,
      tokenEnd: caret,
    };
  }

  getEntityMentionSuggestions(trigger, term = "") {
    const query = term.toLowerCase();
    if (trigger === "@") {
      return this.taskManager
        .getContexts({ areaLens: this.activeArea })
        .map((value) => ({
          key: value.toLowerCase(),
          label: value,
          value,
          kind: "Context",
        }))
        .filter((entry) => !query || entry.label.toLowerCase().includes(query))
        .sort((a, b) => a.label.localeCompare(b.label));
    }
    if (trigger === "+") {
      return this.taskManager
        .getPeopleTags({ areaLens: this.activeArea })
        .map((value) => ({
          key: value.toLowerCase(),
          label: value,
          value,
          kind: "Person",
        }))
        .filter((entry) => !query || entry.label.toLowerCase().includes(query))
        .sort((a, b) => a.label.localeCompare(b.label));
    }
    if (trigger === "#") {
      const projects = this.taskManager.getProjects({ includeSomeday: true });
      const seen = new Set();
      return projects
        .map((project) => {
          const token = `#${this.normalizeProjectTagKey(project.name)}`;
          return {
            key: token.toLowerCase(),
            label: token,
            value: token,
            kind: "Project",
            detail: project.name,
          };
        })
        .filter((entry) => {
          if (!entry.value || seen.has(entry.key)) return false;
          const matchesQuery =
            !query ||
            entry.label.toLowerCase().includes(query) ||
            entry.detail.toLowerCase().includes(query);
          if (!matchesQuery) return false;
          seen.add(entry.key);
          return true;
        })
        .sort((a, b) => a.detail.localeCompare(b.detail));
    }
    return [];
  }

  renderEntityMentionMenu() {
    const state = this.entityMentionAutocompleteState;
    if (!state?.menu) return;
    const { menu, suggestions, activeIndex } = state;
    menu.innerHTML = "";
    suggestions.forEach((suggestion, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mention-autocomplete-item";
      if (index === activeIndex) {
        button.classList.add("is-active");
      }
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", index === activeIndex ? "true" : "false");
      button.dataset.suggestionIndex = String(index);

      const label = document.createElement("span");
      label.className = "mention-autocomplete-label";
      label.textContent = suggestion.label;
      const meta = document.createElement("span");
      meta.className = "mention-autocomplete-meta";
      meta.textContent = suggestion.detail ? `${suggestion.kind} • ${suggestion.detail}` : suggestion.kind;

      button.append(label, meta);
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        this.applyEntityMentionSelection(index);
      });
      menu.append(button);
    });
    menu.hidden = !suggestions.length;
  }

  positionEntityMentionMenu() {
    const state = this.entityMentionAutocompleteState;
    if (!state?.menu || state.menu.hidden || !state.input) return;
    const rect = state.input.getBoundingClientRect();
    const estimatedHeight = Math.min(240, Math.max(120, state.suggestions.length * 46));
    const preferTop = rect.bottom + estimatedHeight > window.innerHeight - 8 && rect.top > estimatedHeight;
    const top = preferTop ? Math.max(8, rect.top - estimatedHeight - 6) : Math.min(window.innerHeight - 8, rect.bottom + 6);
    const width = Math.max(220, Math.min(360, rect.width));
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left));
    state.menu.style.top = `${top}px`;
    state.menu.style.left = `${left}px`;
    state.menu.style.width = `${width}px`;
  }

  applyEntityMentionSelection(index) {
    const state = this.entityMentionAutocompleteState;
    if (!state || !state.input || !state.suggestions.length) return;
    const suggestion = state.suggestions[index];
    if (!suggestion) return;
    const input = state.input;
    const value = input.value || "";
    const before = value.slice(0, state.tokenStart);
    const after = value.slice(state.tokenEnd);
    const nextChar = after.slice(0, 1);
    const spacer = !nextChar || /[\s.,!?;:)\]}]/.test(nextChar) ? "" : " ";
    input.value = `${before}${suggestion.value}${spacer}${after}`;
    const caret = before.length + suggestion.value.length + spacer.length;
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    this.closeEntityMentionMenu();
    input.focus();
  }

  closeEntityMentionMenu() {
    const state = this.entityMentionAutocompleteState;
    if (!state?.menu) return;
    state.menu.hidden = true;
    state.menu.innerHTML = "";
    state.input = null;
    state.suggestions = [];
    state.activeIndex = 0;
  }

  setEntityLinkedText(element, text) {
    if (!element) return;
    const source = typeof text === "string" ? text : "";
    element.textContent = "";
    element.append(this.createEntityLinkFragment(source));
  }

  // Like setEntityLinkedText but also renders ![alt](src) as inline <img> elements.
  // Only /images/ paths (served by our own server) are rendered; all other src values
  // are emitted as plain text to prevent XSS.
  setEntityLinkedTextWithImages(element, text) {
    if (!element) return;
    const source = typeof text === "string" ? text : "";
    element.textContent = "";
    if (!source) return;
    const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    while ((match = imagePattern.exec(source)) !== null) {
      if (match.index > lastIndex) {
        fragment.append(this.createEntityLinkFragment(source.slice(lastIndex, match.index)));
      }
      const [, alt, src] = match;
      if (src.startsWith("/images/")) {
        const img = document.createElement("img");
        img.src = src;
        img.alt = alt;
        img.className = "note-image";
        img.loading = "lazy";
        fragment.append(img);
      } else {
        fragment.append(document.createTextNode(match[0]));
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < source.length) {
      fragment.append(this.createEntityLinkFragment(source.slice(lastIndex)));
    }
    element.append(fragment);
  }

  // Renders markdown-formatted text into element. Supports: **bold**, *italic*, `code`,
  // [text](url), ![alt](/images/path), bare URLs, entity links, and newlines → <br>.
  renderMarkdownDescription(element, text) {
    if (!element) return;
    const source = typeof text === "string" ? text : "";
    element.textContent = "";
    if (!source) return;
    const fragment = document.createDocumentFragment();
    const lines = source.split("\n");
    lines.forEach((line, lineIdx) => {
      if (lineIdx > 0) fragment.append(document.createElement("br"));
      fragment.append(this._parseMarkdownLine(line));
    });
    element.append(fragment);
  }

  _parseMarkdownLine(text) {
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    MARKDOWN_INLINE_PATTERN.lastIndex = 0;
    while ((match = MARKDOWN_INLINE_PATTERN.exec(text)) !== null) {
      if (match.index > lastIndex) {
        fragment.append(this.createEntityLinkFragment(text.slice(lastIndex, match.index)));
      }
      if (match[0].startsWith("![")) {
        const src = match[2];
        if (src.startsWith("/images/")) {
          const img = document.createElement("img");
          img.src = src;
          img.alt = match[1];
          img.className = "note-image";
          img.loading = "lazy";
          fragment.append(img);
        } else {
          fragment.append(document.createTextNode(match[0]));
        }
      } else if (match[3] !== undefined || match[4] !== undefined) {
        const el = document.createElement("strong");
        el.textContent = match[3] ?? match[4];
        fragment.append(el);
      } else if (match[5] !== undefined || match[6] !== undefined) {
        const el = document.createElement("em");
        el.textContent = match[5] ?? match[6];
        fragment.append(el);
      } else if (match[7] !== undefined) {
        const el = document.createElement("code");
        el.className = "inline-code";
        el.textContent = match[7];
        fragment.append(el);
      } else if (match[8] !== undefined) {
        fragment.append(createURLLink(match[9], match[8]));
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      fragment.append(this.createEntityLinkFragment(text.slice(lastIndex)));
    }
    return fragment;
  }

  async uploadImage(blob) {
    try {
      const response = await fetch("/upload", {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Upload failed (${response.status})`);
      }
      const data = await response.json();
      return data.url || null;
    } catch (error) {
      console.error("Image upload failed", error);
      this.showToast("error", error.message || "Image upload failed.");
      return null;
    }
  }

  createEntityLinkFragment(text) {
    const fragment = document.createDocumentFragment();
    const source = typeof text === "string" ? text : "";
    if (!source) return fragment;

    const parts = source.split(ENTITY_LINK_TOKEN_PATTERN);
    parts.forEach((part) => {
      if (!part) return;
      const target = this.resolveEntityLinkTarget(part);
      if (!target) {
        part.split(URL_PATTERN).forEach((seg) => {
          if (!seg) return;
          fragment.append(URL_PATTERN.test(seg) ? createURLLink(seg) : document.createTextNode(seg));
        });
        return;
      }
      const link = document.createElement("a");
      link.href = "#";
      link.className = `inline-tag-link inline-tag-link-${target.type}`;
      link.textContent = part;
      link.addEventListener("click", (event) => {
        this.activateEntityLinkTarget(target, event);
      });
      fragment.append(link);
    });
    return fragment;
  }

  resolveEntityLinkTarget(token) {
    if (typeof token !== "string" || token.length < 2) return null;
    const normalizedToken = token.toLowerCase();
    if (token.startsWith("@")) {
      const context = this.taskManager
        .getContexts()
        .find((value) => typeof value === "string" && value.toLowerCase() === normalizedToken);
      if (context) {
        return { type: "context", value: context };
      }
      return null;
    }
    if (token.startsWith("+")) {
      const person = this.taskManager
        .getPeopleTags()
        .find((value) => typeof value === "string" && value.toLowerCase() === normalizedToken);
      if (person) {
        return { type: "person", value: person };
      }
      return null;
    }
    if (token.startsWith("#")) {
      const key = this.normalizeProjectTagKey(token.slice(1));
      if (!key) return null;
      const project = this.findProjectByTagKey(key);
      if (!project) return null;
      return { type: "project", value: project.id };
    }
    return null;
  }

  normalizeProjectTagKey(value) {
    if (typeof value !== "string") return "";
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  findProjectByTagKey(key) {
    if (!key) return null;
    return this.getProjectCache().find((project) => this.normalizeProjectTagKey(project.name) === key) || null;
  }

  // Parse #Project and +Person inline tokens from a title string.
  // Returns { projectId, peopleTag, messages } for any found and unset fields.
  parseInlineTitleRefs(title, { currentProjectId = null, currentPeopleTag = null } = {}) {
    const result = { projectId: null, peopleTag: null, messages: [] };
    if (typeof title !== "string" || !title) return result;

    if (!currentProjectId) {
      for (const match of title.matchAll(/#([A-Za-z0-9][A-Za-z0-9_-]*)/g)) {
        const project = this.findProjectByTagKey(this.normalizeProjectTagKey(match[1]));
        if (project) {
          result.projectId = project.id;
          result.messages.push(`Linked to project "${project.name}".`);
          break;
        }
      }
    }

    if (!currentPeopleTag) {
      for (const match of title.matchAll(/\+([A-Za-z0-9][A-Za-z0-9_-]*)/g)) {
        const token = `+${match[1]}`;
        const existing = this.taskManager
          .getPeopleTags()
          .find((t) => typeof t === "string" && t.toLowerCase() === token.toLowerCase());
        if (existing) {
          result.peopleTag = existing;
          result.messages.push(`Linked to ${existing}.`);
          break;
        }
      }
    }

    return result;
  }

  activateEntityLinkTarget(target, event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!target?.type) return;

    if (target.type === "context") {
      this.filters.context = [target.value];
      this.setActivePanel("next");
      this.renderAll();
      this.taskManager.notify("info", `Filtered by context ${target.value}.`);
      return;
    }
    if (target.type === "person") {
      this.filters.person = [target.value];
      this.setActivePanel("all-active");
      this.renderAll();
      this.taskManager.notify("info", `Filtered by person ${target.value}.`);
      return;
    }
    if (target.type === "project") {
      const project = this.getProjectCache().find((item) => item.id === target.value);
      if (!project) {
        this.taskManager.notify("warn", "Linked project no longer exists.");
        return;
      }
      this.setActivePanel("projects");
      this.openProjectFlyout(project.id);
    }
  }

  buildMetaRow(label, value) {
    const row = document.createElement("span");
    const labelEl = document.createElement("strong");
    labelEl.textContent = label;
    const valueEl = document.createElement("span");
    valueEl.textContent = value;
    row.append(labelEl, valueEl);
    return row;
  }

  createMetaSpan(text, className) {
    const span = document.createElement("span");
    span.textContent = text;
    if (className) {
      span.className = className;
    }
    return span;
  }

  createMetaBullet() {
    const bullet = document.createElement("span");
    bullet.className = "bullet";
    return bullet;
  }

  describeRecurrence(rule) {
    if (!rule || !rule.type) return null;
    const interval = Math.max(1, Number.parseInt(rule.interval, 10) || 1);
    const labelMap = {
      daily: "day",
      weekly: "week",
      monthly: "month",
      yearly: "year",
    };
    const unit = labelMap[rule.type];
    if (!unit) return null;
    if (interval === 1) {
      if (rule.type === "daily") return "Daily";
      return `Every ${unit}`;
    }
    return `Every ${interval} ${unit}${interval > 1 ? "s" : ""}`;
  }

  formatCalendarMeta(task) {
    if (!task?.calendarDate) return "—";
    const dateText = formatFriendlyDate(task.calendarDate);
    if (!task.calendarTime) return dateText;
    return `${dateText} at ${this.formatTimeDisplay(task.calendarTime)}`;
  }

  formatTimestampDisplay(value) {
    if (!value) return "Unknown time";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown time";
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  formatTimeDisplay(value) {
    if (!value) return "";
    const [rawHours, rawMinutes] = value.split(":");
    const hours = Number.parseInt(rawHours, 10);
    if (!Number.isFinite(hours)) return value;
    const minutes = rawMinutes ?? "00";
    const period = hours >= 12 ? "PM" : "AM";
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${minutes} ${period}`;
  }

  getTaskAreaOfFocus(task) {
    const project = task?.projectId ? this.projectLookup?.get(task.projectId) : null;
    if (project?.areaOfFocus) {
      return project.areaOfFocus;
    }
    if (typeof task?.areaOfFocus === "string" && task.areaOfFocus.trim()) {
      return task.areaOfFocus.trim();
    }
    return "No Area";
  }

  getProjectName(projectId) {
    if (!projectId) return null;
    return this.projectLookup?.get(projectId)?.name || null;
  }

  isTaskOverdue(task) {
    if (!task?.dueDate || task.completedAt) return false;
    const due = new Date(task.dueDate + "T00:00:00");
    if (Number.isNaN(due.getTime())) return false;
    return due < this.getTodayStart();
  }

  getDueUrgencyClass(dueDate) {
    if (!dueDate) return "";
    const due = new Date(dueDate + "T00:00:00");
    if (Number.isNaN(due.getTime())) return "";
    const now = new Date();
    const diffMs = due.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours <= 72) {
      return "task-meta-due-critical";
    }
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays <= 7) {
      return "task-meta-due-warning";
    }
    return "";
  }

  getTodayStart() {
    if (!this.todayStart || Date.now() - this.todayStart.getTime() > 1000 * 60 * 60) {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      this.todayStart = now;
    }
    return this.todayStart;
  }

  getTodayDateKey() {
    const today = this.getTodayStart();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  getProjectCache() {
    if (!this.projectCache) {
      this.projectCache = this.taskManager.getProjects({ includeSomeday: true });
      this.projectLookup = new Map(this.projectCache.map((project) => [project.id, project]));
    }
    return this.projectCache;
  }


  attachDropzone(element, status, context, projectId) {
    if (!element) return;
    if (!element.dataset.dropzone) element.dataset.dropzone = status;
    if (context) element.dataset.context = context;
    if (projectId) element.dataset.projectId = projectId;
    if (this.dropzones.includes(element)) return;
    this.dropzones.push(element);

    const helper = window.DragDropHelper;
    if (helper) {
      helper.setupDropzone(element, {
        onDrop: (taskId) => this.handleDrop(taskId, status, context, projectId),
      });
    } else {
      element.addEventListener("dragover", (event) => {
        event.preventDefault();
        element.classList.add("is-drag-over");
      });
      element.addEventListener("dragleave", () => {
        element.classList.remove("is-drag-over");
      });
      element.addEventListener("drop", (event) => {
        event.preventDefault();
        element.classList.remove("is-drag-over");
        const taskId = event.dataTransfer?.getData("text/task-id");
        if (taskId) this.handleDrop(taskId, status, context, projectId);
      });
    }
  }

  async handleDrop(taskId, status, context, projectId) {
    const task = this.taskManager.getTaskById(taskId);
    if (!task) {
      this.taskManager.notify("error", "Cannot drop missing task.");
      return;
    }
    if (projectId && task.projectId !== projectId) {
      this.taskManager.notify("warn", "Only tasks from this project can be dropped here.");
      return;
    }
    if (status === "complete") {
      if (this.taskManager.getFeatureFlag("confirmOnCompletion")) {
        const ok = await this.showConfirm(`Complete "${task.title}"?`, { okLabel: "Complete" });
        if (!ok) return;
      }
      this.taskManager.completeTask(taskId);
    } else if (status === STATUS.NEXT) {
      const updates = { status };
      if (context !== undefined) {
        updates.contexts = context === "No context" ? [] : [context];
      }
      this.taskManager.updateTask(taskId, updates);
    } else {
      this.taskManager.moveTask(taskId, status);
    }
  }

  attachNextGroupDropzone(element, groupBy, groupKey) {
    if (!element) return;
    if (this.dropzones.includes(element)) return;
    this.dropzones.push(element);

    const onDrop = (taskId) => {
      const task = this.taskManager.getTaskById(taskId);
      if (!task) { this.taskManager.notify("error", "Cannot drop missing task."); return; }
      const updates = { status: STATUS.NEXT };
      switch (groupBy) {
        case "context":
          updates.contexts = groupKey === "No context" ? [] : [groupKey];
          break;
        case "project":
          updates.projectId = groupKey === "no-project" ? null : groupKey;
          break;
        case "area":
          updates.areaOfFocus = groupKey === "No Area" ? null : groupKey;
          break;
        case "effort":
          updates.effortLevel = groupKey === "no-effort" ? null : groupKey;
          break;
        // "none" groupBy: only status change needed (already in updates)
      }
      this.taskManager.updateTask(taskId, updates);
    };

    const helper = window.DragDropHelper;
    if (helper) {
      helper.setupDropzone(element, { onDrop });
    } else {
      element.addEventListener("dragover", (event) => {
        event.preventDefault();
        element.classList.add("is-drag-over");
      });
      element.addEventListener("dragleave", () => {
        element.classList.remove("is-drag-over");
      });
      element.addEventListener("drop", (event) => {
        event.preventDefault();
        element.classList.remove("is-drag-over");
        const taskId = event.dataTransfer?.getData("text/task-id");
        if (taskId) onDrop(taskId);
      });
    }
  }

  handleProjectNextReorderDrop({ sourceId, targetId, projectId, before }) {
    if (!sourceId || !targetId || !projectId || sourceId === targetId) {
      return;
    }
    const sourceTask = this.taskManager.getTaskById(sourceId);
    const targetTask = this.taskManager.getTaskById(targetId);
    if (!sourceTask || !targetTask) {
      return;
    }
    if (
      sourceTask.status !== STATUS.NEXT ||
      targetTask.status !== STATUS.NEXT ||
      sourceTask.projectId !== projectId ||
      targetTask.projectId !== projectId
    ) {
      return;
    }
    this.taskManager.reorderProjectNextTask(sourceId, targetId, { before: before !== false });
  }

  resolveProjectNextDropBefore({ sourceId, targetId, projectId, clientY, bounds }) {
    const fallback = Boolean(bounds) ? clientY < bounds.top + bounds.height / 2 : true;
    if (!sourceId || !targetId || !projectId || sourceId === targetId) {
      return fallback;
    }
    const orderedProjectNextTasks = this.taskManager
      .getTasks({ status: STATUS.NEXT, includeCompleted: false })
      .filter((task) => task.projectId === projectId);
    const sourceIndex = orderedProjectNextTasks.findIndex((task) => task.id === sourceId);
    const targetIndex = orderedProjectNextTasks.findIndex((task) => task.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) {
      return fallback;
    }
    if (sourceIndex > targetIndex) {
      return true;
    }
    if (sourceIndex < targetIndex) {
      return false;
    }
    return fallback;
  }

  showPrompt(title, defaultValue = "", { multiline = false } = {}) {
    return new Promise((resolve) => {
      const modal = this.elements.promptModal;
      if (!modal) { resolve(window.prompt(title, defaultValue)); return; }
      const input = this.elements.promptModalInput;
      const textarea = this.elements.promptModalTextarea;
      const activeField = multiline ? textarea : input;
      const titleEl = this.elements.promptModalTitle;
      const hint = this.elements.promptModalHint;
      const okBtn = this.elements.promptModalOk;
      const cancelBtn = this.elements.promptModalCancel;
      if (titleEl) titleEl.textContent = title;
      if (input) input.hidden = multiline;
      if (textarea) textarea.hidden = !multiline;
      if (hint) hint.hidden = !multiline;
      if (activeField) { activeField.value = defaultValue; }
      const cleanup = () => {
        modal.classList.remove("is-open");
        modal.setAttribute("hidden", "");
        okBtn?.removeEventListener("click", onOk);
        cancelBtn?.removeEventListener("click", onCancel);
        document.removeEventListener("keydown", onKeydown);
      };
      const onOk = () => {
        const val = activeField?.value?.trim() || "";
        cleanup();
        resolve(val || null);
      };
      const onCancel = () => { cleanup(); resolve(null); };
      const onKeydown = (e) => {
        if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) { e.preventDefault(); onOk(); }
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      };
      okBtn?.addEventListener("click", onOk);
      cancelBtn?.addEventListener("click", onCancel);
      document.addEventListener("keydown", onKeydown);
      modal.classList.add("is-open");
      modal.removeAttribute("hidden");
      setTimeout(() => { activeField?.focus(); if (!multiline) activeField?.select(); }, 50);
    });
  }

  showRecurringDeleteDialog(task) {
    return new Promise((resolve) => {
      const modal = this.elements.recurringDeleteModal;
      if (!modal) { resolve(window.confirm(`Delete "${task.title}"?`) ? "instance" : null); return; }
      const msgEl = this.elements.recurringDeleteModalMessage;
      const instanceBtn = this.elements.recurringDeleteModalInstance;
      const seriesBtn = this.elements.recurringDeleteModalSeries;
      const cancelBtn = this.elements.recurringDeleteModalCancel;
      const recurrenceDesc = this.describeRecurrence(task.recurrenceRule) || "recurring";
      if (msgEl) msgEl.textContent = `"${task.title}" repeats ${recurrenceDesc.toLowerCase()}. Would you like to delete just this instance, or cancel the entire recurring series?`;
      const cleanup = () => {
        modal.classList.remove("is-open");
        modal.setAttribute("hidden", "");
        instanceBtn?.removeEventListener("click", onInstance);
        seriesBtn?.removeEventListener("click", onSeries);
        cancelBtn?.removeEventListener("click", onCancel);
        document.removeEventListener("keydown", onKeydown);
      };
      const onInstance = () => { cleanup(); resolve("instance"); };
      const onSeries = () => { cleanup(); resolve("series"); };
      const onCancel = () => { cleanup(); resolve(null); };
      const onKeydown = (e) => { if (e.key === "Escape") { e.preventDefault(); onCancel(); } };
      instanceBtn?.addEventListener("click", onInstance);
      seriesBtn?.addEventListener("click", onSeries);
      cancelBtn?.addEventListener("click", onCancel);
      document.addEventListener("keydown", onKeydown);
      modal.classList.add("is-open");
      modal.removeAttribute("hidden");
      setTimeout(() => instanceBtn?.focus(), 50);
    });
  }

  showConfirm(message, { title = "Confirm", okLabel = "Confirm", danger = false } = {}) {
    return new Promise((resolve) => {
      const modal = this.elements.confirmModal;
      if (!modal) { resolve(window.confirm(message)); return; }
      const msgEl = this.elements.confirmModalMessage;
      const titleEl = this.elements.confirmModalHeading;
      const okBtn = this.elements.confirmModalOk;
      const cancelBtn = this.elements.confirmModalCancel;
      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;
      if (okBtn) {
        okBtn.textContent = okLabel;
        okBtn.className = danger ? "btn btn-danger" : "btn btn-primary";
      }
      const cleanup = () => {
        modal.classList.remove("is-open");
        modal.setAttribute("hidden", "");
        okBtn?.removeEventListener("click", onOk);
        cancelBtn?.removeEventListener("click", onCancel);
        document.removeEventListener("keydown", onKeydown);
      };
      const onOk = () => { cleanup(); resolve(true); };
      const onCancel = () => { cleanup(); resolve(false); };
      const onKeydown = (e) => {
        if (e.key === "Enter") { e.preventDefault(); onOk(); }
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      };
      okBtn?.addEventListener("click", onOk);
      cancelBtn?.addEventListener("click", onCancel);
      document.addEventListener("keydown", onKeydown);
      modal.classList.add("is-open");
      modal.removeAttribute("hidden");
      setTimeout(() => okBtn?.focus(), 50);
    });
  }

  // Shows a dialog to choose how to handle references before deleting an area.
  // Returns { confirmed: true, target: string|null } or null if cancelled.
  showAreaDeleteDialog(area, otherAreas, refCounts) {
    return new Promise((resolve) => {
      const modal = this.elements.areaDeleteModal;
      if (!modal) {
        const ok = window.confirm(`Delete area "${area}"? References will be cleared.`);
        resolve(ok ? { confirmed: true, target: null } : null);
        return;
      }
      const { areaDeleteModalHeading, areaDeleteModalMessage, areaDeleteModalNote,
              areaDeleteModalSelect, areaDeleteModalOk, areaDeleteModalCancel } = this.elements;
      if (areaDeleteModalHeading) areaDeleteModalHeading.textContent = `Delete area "${area}"`;
      if (areaDeleteModalMessage) {
        const parts = [];
        if (refCounts.tasks > 0) parts.push(`${refCounts.tasks} task${refCounts.tasks === 1 ? "" : "s"}`);
        if (refCounts.projects > 0) parts.push(`${refCounts.projects} project${refCounts.projects === 1 ? "" : "s"}`);
        areaDeleteModalMessage.textContent = parts.length
          ? `This area is directly referenced by ${parts.join(" and ")}.`
          : "No tasks or projects directly reference this area.";
      }
      if (areaDeleteModalNote) {
        const tagCount = refCounts.contexts + refCounts.people;
        areaDeleteModalNote.textContent = tagCount > 0
          ? `${tagCount} context/people tag${tagCount === 1 ? "" : "s"} assigned to this area will become universal.`
          : "No contexts or people tags are assigned to this area.";
      }
      if (areaDeleteModalSelect) {
        areaDeleteModalSelect.innerHTML = "";
        const clearOpt = document.createElement("option");
        clearOpt.value = "";
        clearOpt.textContent = "— Unassign (leave without area) —";
        areaDeleteModalSelect.append(clearOpt);
        otherAreas.forEach((a) => {
          const opt = document.createElement("option");
          opt.value = a;
          opt.textContent = a;
          areaDeleteModalSelect.append(opt);
        });
      }
      const cleanup = () => {
        modal.classList.remove("is-open");
        modal.setAttribute("hidden", "");
        areaDeleteModalOk?.removeEventListener("click", onOk);
        areaDeleteModalCancel?.removeEventListener("click", onCancel);
        document.removeEventListener("keydown", onKeydown);
      };
      const onOk = () => {
        const target = areaDeleteModalSelect?.value || null;
        cleanup();
        resolve({ confirmed: true, target: target || null });
      };
      const onCancel = () => { cleanup(); resolve(null); };
      const onKeydown = (e) => {
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      };
      areaDeleteModalOk?.addEventListener("click", onOk);
      areaDeleteModalCancel?.addEventListener("click", onCancel);
      document.addEventListener("keydown", onKeydown);
      modal.classList.add("is-open");
      modal.removeAttribute("hidden");
      setTimeout(() => areaDeleteModalOk?.focus(), 50);
    });
  }

  showConflictModal() {
    const modal    = this.elements.conflictModal;
    const body     = this.elements.conflictModalBody;
    const dismiss  = this.elements.conflictModalDismiss;
    const backdrop = this.elements.conflictModalBackdrop;
    if (!modal || !body) return;

    const SETTINGS_LABELS = {
      appearance: "Theme & colors",
      calendar:   "Google Calendar",
      flags:      "Feature flags & stale thresholds",
      lists:      "Contexts, people tags & areas",
    };

    const summary = this._lastConflictSummary;
    body.innerHTML = "";

    if (!summary) {
      const p = document.createElement("p");
      p.textContent = "No change details available for this conflict.";
      body.appendChild(p);
    } else {
      const { changedTasks = [], addedTasks = [], removedTasks = [], changedSettingsGroups = [] } = summary;
      const hasTaskChanges    = changedTasks.length || addedTasks.length || removedTasks.length;
      const hasSettingChanges = changedSettingsGroups.length;

      if (!hasTaskChanges && !hasSettingChanges) {
        const p = document.createElement("p");
        p.textContent = "No specific changes detected.";
        body.appendChild(p);
      } else {
        if (hasTaskChanges) {
          const section = document.createElement("section");
          const h3 = document.createElement("h3");
          h3.className = "conflict-modal-section-title";
          h3.textContent = "Tasks affected";
          section.appendChild(h3);
          const ul = document.createElement("ul");
          ul.className = "conflict-modal-list";
          for (const t of changedTasks) {
            const li = document.createElement("li");
            li.textContent = `Updated: ${t.title}`;
            ul.appendChild(li);
          }
          for (const t of addedTasks) {
            const li = document.createElement("li");
            li.textContent = `Added: ${t.title}`;
            ul.appendChild(li);
          }
          for (const t of removedTasks) {
            const li = document.createElement("li");
            li.textContent = `Removed: ${t.title}`;
            ul.appendChild(li);
          }
          section.appendChild(ul);
          body.appendChild(section);
        }

        if (hasSettingChanges) {
          const section = document.createElement("section");
          const h3 = document.createElement("h3");
          h3.className = "conflict-modal-section-title";
          h3.textContent = "Settings changed";
          section.appendChild(h3);
          const ul = document.createElement("ul");
          ul.className = "conflict-modal-list";
          for (const group of changedSettingsGroups) {
            const li = document.createElement("li");
            li.textContent = SETTINGS_LABELS[group] || group;
            ul.appendChild(li);
          }
          section.appendChild(ul);
          body.appendChild(section);
        }
      }
    }

    const closeModal = () => {
      modal.classList.remove("is-open");
      modal.setAttribute("hidden", "");
      dismiss?.removeEventListener("click", closeModal);
      backdrop?.removeEventListener("click", closeModal);
      document.removeEventListener("keydown", onKeydown);
    };
    const onKeydown = (e) => {
      if (e.key === "Escape") { e.preventDefault(); closeModal(); }
    };
    dismiss?.addEventListener("click", closeModal);
    backdrop?.addEventListener("click", closeModal);
    document.addEventListener("keydown", onKeydown);
    modal.classList.add("is-open");
    modal.removeAttribute("hidden");
    setTimeout(() => dismiss?.focus(), 50);
  }

  showUpdateBanner() {
    // Defer if user is mid-clarify flow; re-check when state settles
    if (this.clarifyState?.taskId) {
      this.taskManager.addEventListener(
        "statechange",
        () => { if (!this.clarifyState?.taskId) this.showUpdateBanner(); },
        { once: true },
      );
      return;
    }
    if (document.getElementById("update-banner")) return;
    const banner = document.createElement("div");
    banner.id = "update-banner";
    banner.className = "update-banner";
    banner.innerHTML = `<span class="update-banner-text">A new version is available.</span><button class="update-banner-reload btn-sm" type="button">Reload</button><button class="update-banner-dismiss" type="button" aria-label="Dismiss">✕</button>`;
    banner.querySelector(".update-banner-reload").addEventListener("click", () => location.reload());
    banner.querySelector(".update-banner-dismiss").addEventListener("click", () => banner.remove());
    document.body.prepend(banner);
  }

  showToast(level, message, { action, actions } = {}) {
    const region = this.elements.alerts;
    if (!message) return;
    const list = actions ?? (action ? [action] : []);
    const toast = document.createElement("div");
    toast.className = `toast ${level}`;
    toast.textContent = message;
    const buttons = [];
    list.forEach((entry) => {
      if (!entry || !entry.onClick) return;
      const btn = document.createElement("button");
      btn.className = "toast-action";
      btn.type = "button";
      btn.textContent = entry.label;
      btn.addEventListener("click", () => {
        dismiss();
        entry.onClick();
      });
      toast.appendChild(btn);
      buttons.push({ entry, btn });
    });
    region.innerHTML = "";
    region.append(toast);
    if (this._activeToastCleanup) this._activeToastCleanup();
    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      if (region.contains(toast)) region.removeChild(toast);
      document.removeEventListener("keydown", onKeydown, true);
      clearTimeout(timer);
      this._activeToastCleanup = null;
    };
    const findKey = (key) => {
      const lower = key.toLowerCase();
      return buttons.find(({ entry }) => {
        const label = (entry.label || "").trim().toLowerCase();
        if (lower === "z" && label.startsWith("undo")) return true;
        if ((lower === "n" || key === "Enter") && (label.startsWith("next") || label.includes("→"))) return true;
        return false;
      });
    };
    const onKeydown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable) return;
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      }
      if (event.key !== "Z" && event.key !== "z" && event.key !== "N" && event.key !== "n" && event.key !== "Enter") return;
      const match = findKey(event.key);
      if (!match) return;
      event.preventDefault();
      match.btn.click();
    };
    if (buttons.length) {
      document.addEventListener("keydown", onKeydown, true);
      this._activeToastCleanup = dismiss;
    }
    const timer = setTimeout(dismiss, buttons.length ? 6000 : 3200);
  }

  startConnectionChecks() {
    const updateIndicator = (status) => this.updateConnectionIndicator(status);
    const check = async () => {
      try {
        await this.taskManager.checkConnectivity();
        updateIndicator(this.taskManager.connectionStatus);
      } catch (error) {
        updateIndicator("offline");
      }
      this.connectionCheckTimer = setTimeout(check, 60000);
    };
    updateIndicator(this.connectionStatus);
    check();
  }

  updateConnectionIndicator(status) {
    const dot = this.elements.connectionStatusDot;
    if (!dot) return;
    dot.classList.toggle("is-online", status === "online");
    dot.classList.toggle("is-offline", status === "offline");
    dot.setAttribute("aria-label", status === "online" ? "Online" : "Offline");
  }

  async triggerManualSync() {
    if (this.manualSyncInFlight) return;
    this.manualSyncInFlight = true;
    this.updateManualSyncButton(true);
    try {
      await this.taskManager.manualSync();
      this.showToast("info", "Synced with server.");
      this.updateSyncButtonTitle();
    } catch (error) {
      console.error("Manual sync failed", error);
      this.showToast("error", "Sync failed. Check connection and try again.");
    } finally {
      this.manualSyncInFlight = false;
      this.updateManualSyncButton(false);
    }
  }

  updateSyncButtonTitle() {
    const button = this.elements.manualSyncButton;
    if (!button) return;
    const info = this.taskManager.lastSyncInfo;
    if (!info) return;
    const time = new Date(info.syncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    button.title = `Last synced: ${info.deviceLabel} at ${time}`;
  }

  updateManualSyncButton(isSyncing) {
    const button = this.elements.manualSyncButton;
    if (!button) return;
    button.disabled = isSyncing;
    button.classList.toggle("is-syncing", isSyncing);
    const label = button.querySelector(".meta-label");
    if (label) {
      label.textContent = isSyncing ? "Syncing…" : "Sync";
    }
  }

  syncTheme(theme) {
    const appRoot = this.elements.appRoot;
    const root = document.documentElement;
    if (theme === "custom") {
      applyCustomThemeVariables(root, this.taskManager.getCustomTheme());
    } else {
      clearCustomThemeVariables(root);
    }
    if (appRoot) {
      appRoot.dataset.theme = theme;
    }
    root.dataset.theme = theme;
    document.body.dataset.theme = theme;

    // Keep the PWA status bar colour in sync with the active theme background.
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      const activeThemeOption = THEME_OPTIONS.find((o) => o.id === theme);
      const bgColor = theme === "custom"
        ? (this.taskManager.getCustomTheme()?.canvas || "#f5efe2")
        : (activeThemeOption?.swatches?.[0] || "#f5efe2");
      metaThemeColor.setAttribute("content", bgColor);
    }

    const toggle = this.elements.themeToggle;
    if (!toggle) return;
    const activeTheme = THEME_OPTIONS.find((option) => option.id === theme) || THEME_OPTIONS[0];
    toggle.setAttribute("aria-pressed", activeTheme?.id !== "light" ? "true" : "false");
    toggle.setAttribute("aria-label", `Cycle dashboard theme. Current: ${activeTheme?.label || "Theme"}`);
    toggle.title = activeTheme?.label || "Theme";
    const icon = toggle.querySelector(".theme-icon");
    if (icon) {
      icon.textContent = activeTheme?.icon || "☀︎";
    }
  }

  updateFooterYear() {
    const year = new Date().getFullYear();
    this.elements.footerYear.textContent = year;
  }

  updateFooterVersion() {
    const v = this.taskManager.serverVersion;
    if (this.elements.appVersion) {
      this.elements.appVersion.textContent = v ? `build: ${v}` : '';
    }
  }

  openClosureNotes(taskId, archive = "reference") {
    const task = this.taskManager.getTaskById(taskId);
    if (!task) return;
    this.pendingClosure = { taskId, archive, existing: task.closureNotes || "" };
    const modal = this.elements.closureModal;
    if (!modal) {
      this.taskManager.completeTask(taskId, { archive, closureNotes: this.pendingClosure.existing });
      this.closeTaskFlyout();
      this.pendingClosure = null;
      return;
    }
    this.elements.closureNotesInput.value = this.pendingClosure.existing;
    modal.classList.add("is-open");
    modal.removeAttribute("hidden");
    this.elements.closureNotesInput.focus();
  }
}

UIController.prototype.renderTaskList = renderTaskList;
UIController.prototype.populateAreaSelect = populateAreaSelect;

Object.assign(UIController.prototype,
  InboxPanel,
  MyDayPanel,
  NextPanel,
  KanbanPanel,
  ProjectsPanel,
  WaitingPanel,
  SomedayPanel,
  CalendarPanel,
  ReportsPanel,
  StatisticsPanel,
  AllActivePanel,
  SettingsPanel,
  BacklogPanel,
);

function clearCustomThemeVariables(root) {
  if (!root?.style) return;
  CUSTOM_THEME_CSS_VARIABLES.forEach((token) => {
    root.style.removeProperty(token);
  });
}

function applyCustomThemeVariables(root, customTheme) {
  if (!root?.style) return;
  const variables = buildCustomThemeVariables(customTheme);
  Object.entries(variables).forEach(([token, value]) => {
    root.style.setProperty(token, value);
  });
}

function buildCustomThemeVariables(customTheme) {
  const canvas = parseHexColor(customTheme?.canvas, [245, 239, 226]);
  const accent = parseHexColor(customTheme?.accent, [15, 118, 110]);
  const signal = parseHexColor(customTheme?.signal, [180, 83, 9]);
  const canvasLuminance = relativeLuminance(canvas);
  const isDarkCanvas = canvasLuminance < 0.45;
  const surface = mixRgb(canvas, [255, 255, 255], isDarkCanvas ? 0.1 : 0.18);
  const surfaceTwo = mixRgb(canvas, accent, isDarkCanvas ? 0.15 : 0.08);
  const surfaceThree = mixRgb(canvas, signal, isDarkCanvas ? 0.2 : 0.14);
  const line = mixRgb(canvas, accent, isDarkCanvas ? 0.42 : 0.27);
  const lineStrong = mixRgb(canvas, accent, isDarkCanvas ? 0.58 : 0.43);
  const text = isDarkCanvas ? mixRgb([248, 252, 255], accent, 0.09) : mixRgb([24, 30, 36], accent, 0.18);
  const textMuted = mixRgb(text, canvas, isDarkCanvas ? 0.46 : 0.5);
  const accentStrong = isDarkCanvas ? mixRgb(accent, [255, 255, 255], 0.2) : mixRgb(accent, [0, 0, 0], 0.22);
  const accentContrast = relativeLuminance(accent) > 0.5 ? "#0f1c24" : "#f5fffe";
  const danger = mixRgb(signal, [220, 38, 38], 0.52);
  const ok = mixRgb(accent, [22, 163, 74], 0.5);
  const shadowBase = isDarkCanvas ? [0, 0, 0] : mixRgb(canvas, [49, 31, 11], 0.78);
  return {
    "--bg": rgbToHex(canvas),
    "--bg-alt": rgbToHex(mixRgb(canvas, accent, isDarkCanvas ? 0.2 : 0.14)),
    "--surface": rgbToHex(surface),
    "--surface-2": rgbToHex(surfaceTwo),
    "--surface-3": rgbToHex(surfaceThree),
    "--line": rgbToHex(line),
    "--line-strong": rgbToHex(lineStrong),
    "--text": rgbToHex(text),
    "--text-muted": rgbToHex(textMuted),
    "--accent": rgbToHex(accent),
    "--accent-strong": rgbToHex(accentStrong),
    "--accent-soft": rgba(accent, isDarkCanvas ? 0.24 : 0.17),
    "--accent-contrast": accentContrast,
    "--warning": rgbToHex(signal),
    "--danger": rgbToHex(danger),
    "--ok": rgbToHex(ok),
    "--shadow-sm": `0 10px 22px ${rgba(shadowBase, isDarkCanvas ? 0.3 : 0.12)}`,
    "--shadow-md": `0 18px 42px ${rgba(shadowBase, isDarkCanvas ? 0.38 : 0.17)}`,
    "--shadow-lg": `0 28px 70px ${rgba(shadowBase, isDarkCanvas ? 0.46 : 0.23)}`,
    "--ring": `0 0 0 3px ${rgba(accent, isDarkCanvas ? 0.34 : 0.26)}`,
  };
}

function parseHexColor(value, fallback) {
  if (typeof value !== "string") {
    return fallback.slice();
  }
  let hex = value.trim();
  if (hex.startsWith("#")) {
    hex = hex.slice(1);
  }
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => `${char}${char}`)
      .join("");
  }
  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return fallback.slice();
  }
  return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
}

function normalizeThemeHexInput(value) {
  if (typeof value !== "string") return null;
  let normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (!normalized.startsWith("#")) {
    normalized = `#${normalized}`;
  }
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(normalized)) {
    return null;
  }
  if (normalized.length === 4) {
    return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }
  return normalized;
}

function mixRgb(from, to, weight = 0.5) {
  const blend = Math.max(0, Math.min(1, Number(weight) || 0));
  return from.map((channel, index) => {
    const base = clampColorChannel(channel);
    const target = clampColorChannel(to[index]);
    return clampColorChannel(base + (target - base) * blend);
  });
}

function rgbToHex(rgb) {
  const hex = rgb.map((channel) => clampColorChannel(channel).toString(16).padStart(2, "0")).join("");
  return `#${hex}`;
}

function rgba(rgb, alpha) {
  const normalizedAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
  const prettyAlpha = String(Number(normalizedAlpha.toFixed(3)));
  return `rgba(${clampColorChannel(rgb[0])}, ${clampColorChannel(rgb[1])}, ${clampColorChannel(rgb[2])}, ${prettyAlpha})`;
}

function clampColorChannel(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(255, Math.round(parsed)));
}

function relativeLuminance(rgb) {
  const linear = rgb.map((channel) => {
    const normalized = clampColorChannel(channel) / 255;
    if (normalized <= 0.03928) {
      return normalized / 12.92;
    }
    return ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function mapElements() {
  const byId = (id) => document.getElementById(id);
  return {
    appRoot: document.querySelector(".app"),
    associationFlyout: byId("associationFlyout"),
    associationFlyoutToggle: byId("associationFlyoutToggle"),
    associationFlyoutToggleGlyph: byId("associationFlyoutToggleGlyph"),
    associationFlyoutPanel: byId("associationFlyoutPanel"),
    associationFlyoutSummary: byId("associationFlyoutSummary"),
    associationFlyoutClear: byId("associationFlyoutClear"),
    associationContextOptions: byId("associationContextOptions"),
    associationPeopleOptions: byId("associationPeopleOptions"),
    associationProjectOptions: byId("associationProjectOptions"),
    associationWaitingOptions: byId("associationWaitingOptions"),
    associationEffortOptions: byId("associationEffortOptions"),
    associationTimeOptions: byId("associationTimeOptions"),
    alerts: document.querySelector(".alerts"),
    workspace: document.querySelector(".workspace"),
    workspaceToolbar: document.querySelector(".workspace-toolbar"),
    toolbarSearchSection: byId("toolbarSearchSection"),
    toolbarTaskPickerSection: byId("toolbarTaskPickerSection"),
    toolbarActionsSection: byId("toolbarActionsSection"),
    toolbarActionsTitle: byId("toolbarActionsTitle"),
    toolbarActionsNote: byId("toolbarActionsNote"),
    nextProjectFanoutControl: byId("nextProjectFanoutControl"),
    nextHideScheduledControl: byId("nextHideScheduledControl"),
    quickAddInput: byId("quickAddInput"),
    quickAddDescription: byId("quickAddDescription"),
    searchTasks: byId("searchTasks"),
    clearFilters: byId("clearFilters"),
    taskSortSelect: byId("taskSortSelect"),
    sortInfoHint: byId("sortInfoHint"),
    sortInfoPopup: byId("sortInfoPopup"),
    expandProjects: byId("expandProjects"),
    calendarDate: byId("calendarDate"),
    calendarShowCompleted: byId("calendarShowCompleted"),
    calendarGrid: byId("calendarGrid"),
    calendarMonthLabel: byId("calendarMonthLabel"),
    calendarPrevMonth: byId("calendarPrevMonth"),
    calendarNextMonth: byId("calendarNextMonth"),
    reportGrouping: byId("reportGrouping"),
    reportYear: byId("reportYear"),
    reportContextPicker: byId("reportContextPicker"),
    reportContextToggle: byId("reportContextToggle"),
    reportContextOptions: byId("reportContextOptions"),
    reportProjectPicker: byId("reportProjectPicker"),
    reportProjectToggle: byId("reportProjectToggle"),
    reportProjectOptions: byId("reportProjectOptions"),
    reportAreaPicker: byId("reportAreaPicker"),
    reportAreaToggle: byId("reportAreaToggle"),
    reportAreaOptions: byId("reportAreaOptions"),
    reportList: byId("reportList"),
    reportEmpty: byId("reportEmpty"),
    reportDetails: byId("reportDetails"),
    reportDetailsList: byId("reportDetailsList"),
    reportDetailsTitle: byId("reportDetailsTitle"),
    reportDetailsMeta: byId("reportDetailsMeta"),
    reportDetailsPlaceholder: byId("reportDetailsPlaceholder"),
    statsLookback: byId("statsLookback"),
    statActiveTasks: byId("statActiveTasks"),
    statCompletedTasks: byId("statCompletedTasks"),
    statCompletionRate: byId("statCompletionRate"),
    statOpenProjects: byId("statOpenProjects"),
    statStaleTasks: byId("statStaleTasks"),
    statOverdueTasks: byId("statOverdueTasks"),
    statsStatusBreakdown: byId("statsStatusBreakdown"),
    statsTrendMeta: byId("statsTrendMeta"),
    statsTrendBars: byId("statsTrendBars"),
    statsContextList: byId("statsContextList"),
    statsProjectHealthMeta: byId("statsProjectHealthMeta"),
    statsProjectHealthList: byId("statsProjectHealthList"),
    statsDueBuckets: byId("statsDueBuckets"),
    statsUpcomingDueList: byId("statsUpcomingDueList"),
    statsMetadataCoverage: byId("statsMetadataCoverage"),
    statsAgeBuckets: byId("statsAgeBuckets"),
    statsArchiveMix: byId("statsArchiveMix"),
    statsPeopleList: byId("statsPeopleList"),
    promptModal: byId("promptModal"),
    promptModalTitle: byId("promptModalTitle"),
    promptModalInput: byId("promptModalInput"),
    promptModalTextarea: byId("promptModalTextarea"),
    promptModalHint: byId("promptModalHint"),
    promptModalOk: byId("promptModalOk"),
    promptModalCancel: byId("promptModalCancel"),
    conflictModal: byId("conflictModal"),
    conflictModalTitle: byId("conflictModalTitle"),
    conflictModalBody: byId("conflictModalBody"),
    conflictModalBackdrop: byId("conflictModalBackdrop"),
    conflictModalDismiss: byId("conflictModalDismiss"),
    areaDeleteModal: byId("areaDeleteModal"),
    areaDeleteModalHeading: byId("areaDeleteModalHeading"),
    areaDeleteModalMessage: byId("areaDeleteModalMessage"),
    areaDeleteModalSelect: byId("areaDeleteModalSelect"),
    areaDeleteModalNote: byId("areaDeleteModalNote"),
    areaDeleteModalOk: byId("areaDeleteModalOk"),
    areaDeleteModalCancel: byId("areaDeleteModalCancel"),
    recurringDeleteModal: byId("recurringDeleteModal"),
    recurringDeleteModalHeading: byId("recurringDeleteModalHeading"),
    recurringDeleteModalMessage: byId("recurringDeleteModalMessage"),
    recurringDeleteModalInstance: byId("recurringDeleteModalInstance"),
    recurringDeleteModalSeries: byId("recurringDeleteModalSeries"),
    recurringDeleteModalCancel: byId("recurringDeleteModalCancel"),
    confirmModal: byId("confirmModal"),
    confirmModalHeading: byId("confirmModalHeading"),
    confirmModalMessage: byId("confirmModalMessage"),
    confirmModalOk: byId("confirmModalOk"),
    confirmModalCancel: byId("confirmModalCancel"),
    manualSyncButton: byId("manualSyncButton"),
    connectionStatusDot: byId("connectionStatusDot"),
    multiEditBar: byId("multiEditBar"),
    multiEditCount: byId("multiEditCount"),
    multiEditStatus: byId("multiEditStatus"),
    multiEditProject: byId("multiEditProject"),
    multiEditArea: byId("multiEditArea"),
    multiEditClear: byId("multiEditClear"),
    taskContextMenu: byId("taskContextMenu"),
    taskNoteContextMenu: byId("taskNoteContextMenu"),
    taskListItemContextMenu: byId("taskListItemContextMenu"),
    calendarDayContextMenu: byId("calendarDayContextMenu"),
    contextColumnContextMenu: byId("contextColumnContextMenu"),
    taskFlyout: document.getElementById("taskFlyout"),
    taskFlyoutContent: byId("taskFlyoutContent"),
    taskFlyoutTitle: byId("taskFlyoutTitle"),
    taskFlyoutStatus: byId("taskFlyoutStatus"),
    closeTaskFlyout: byId("closeTaskFlyout"),
    taskFlyoutInfoToggle: byId("taskFlyoutInfoToggle"),
    taskFlyoutPrev: byId("taskFlyoutPrev"),
    taskFlyoutNext: byId("taskFlyoutNext"),
    taskFlyoutBackdrop: document.querySelector(".task-flyout-backdrop"),
    projectFlyout: byId("projectFlyout"),
    projectFlyoutContent: byId("projectFlyoutContent"),
    projectFlyoutTitle: byId("projectFlyoutTitle"),
    projectFlyoutChips: byId("projectFlyoutChips"),
    closeProjectFlyout: byId("closeProjectFlyout"),
    projectFlyoutBackdrop: byId("projectFlyoutBackdrop"),
    activePanelHeading: byId("activePanelHeading"),
    activePanelCount: byId("activePanelCount"),
    inboxList: document.querySelector('.panel-body[data-dropzone="inbox"]'),
    processInboxBtn: byId("processInboxBtn"),
    processInboxCount: byId("processInboxCount"),
    clarifyProgress: byId("clarifyProgress"),
    myDayList: byId("myDayList"),
    contextBoard: document.querySelector("[data-context-board]"),
    kanbanBoard: document.querySelector("[data-kanban-board]"),
    projectList: document.querySelector("[data-projects]"),
    projectAreaFilter: document.getElementById("projectAreaFilter"),
    projectAreaSelect: document.getElementById("projectArea"),
    projectAreaNewBtn: document.getElementById("projectAreaNewBtn"),
    toggleMissingNextAction: document.getElementById("toggleMissingNextAction"),
    toggleProjectCompletedTasks: document.getElementById("toggleProjectCompletedTasks"),
    projectCompletedTasksControl: byId("projectCompletedTasksControl"),
    completedProjectsList: document.querySelector("[data-completed-projects]"),
    waitingList: document.querySelector('.panel-body[data-dropzone="waiting"]'),
    somedayList: document.querySelector('.panel-body[data-dropzone="someday"]'),
    exportMarkdown: byId("exportMarkdown"),
    exportJSON: byId("exportJSON"),
    importJSON: byId("importJSON"),
    jsonFileInput: byId("jsonFileInput"),
    inboxCount: byId("inboxCount"),
    dueTodayCount: byId("dueTodayCount"),
    overdueCount: byId("overdueCount"),
    summaryInbox: byId("summaryInbox"),
    summaryNext: byId("summaryNext"),
    summaryDoing: byId("summaryDoing"),
    summaryMyDay: byId("summaryMyDay"),
    summaryKanban: byId("summaryKanban"),
    summaryWaiting: byId("summaryWaiting"),
    summarySomeday: byId("summarySomeday"),
    summaryProjects: byId("summaryProjects"),
    summaryCalendar: byId("summaryCalendar"),
    summaryCompleted: byId("summaryCompleted"),
    summaryStatistics: byId("summaryStatistics"),
    summaryAllActive: byId("summaryAllActive"),
    allActiveList: byId("allActiveList"),
    settingsThemesList: byId("settingsThemesList"),
    settingsFeatureFlagsList: byId("settingsFeatureFlagsList"),
    settingsContextsList: byId("settingsContextsList"),
    settingsPeopleList: byId("settingsPeopleList"),
    settingsAreasList: byId("settingsAreasList"),
    settingsCleanupBtn: byId("settingsCleanupBtn"),
    settingsBacklogLink: byId("settingsBacklogLink"),
    settingsDeviceNameInput: byId("settingsDeviceNameInput"),
    settingsDeviceIdSuffix:  byId("settingsDeviceIdSuffix"),
    syncDiagContainer: byId("syncDiagContainer"),
    syncDiagRefreshBtn: byId("syncDiagRefreshBtn"),
    syncDiagCopyBtn: byId("syncDiagCopyBtn"),
    syncDiagClearBtn: byId("syncDiagClearBtn"),
    footerYear: byId("footerYear"),
    appVersion: byId("appVersion"),
    themeToggle: document.getElementById("themeToggle"),
    topbarInboxBtn: byId("topbarInboxBtn"),
    topbarDueTodayBtn: byId("topbarDueTodayBtn"),
    topbarOverdueBtn: byId("topbarOverdueBtn"),
    topbarSettings: byId("topbarSettings"),
    sidebar: document.querySelector(".sidebar"),
    sidebarToggle: document.querySelector(".sidebar-toggle"),
    contextSuggestions: document.getElementById("contextSuggestions"),
    effortSuggestions: document.getElementById("effortSuggestions"),
    timeSuggestions: document.getElementById("timeSuggestions"),
    projectAreaSuggestions: document.getElementById("projectAreaSuggestions"),
    projectThemeSuggestions: document.getElementById("projectThemeSuggestions"),
    projectStatusSuggestions: document.getElementById("projectStatusSuggestions"),
    areaScopeRow: byId("areaScopeRow"),
    randomContext: byId("randomContext"),
    pickRandomTask: byId("pickRandomTask"),
    toggleNextProjectFanout: document.getElementById("toggleNextProjectFanout"),
    toggleHideScheduledNext: document.getElementById("toggleHideScheduledNext"),
    clarifyModal: document.getElementById("clarifyModal"),
    clarifyBackdrop: document.querySelector("#clarifyModal .modal-backdrop"),
    closeClarifyModal: byId("closeClarifyModal"),
    clarifyStepActionable: byId("clarifyStepActionable"),
    clarifyStepActionPlan: byId("clarifyStepActionPlan"),
    clarifyTwoMinuteStep: byId("clarifyStepTwoMinute"),
    clarifyWhoStep: byId("clarifyStepWho"),
    clarifyStepDates: byId("clarifyStepDates"),
    clarifyStepMetadata: byId("clarifyStepMetadata"),
    clarifyStepFinal: byId("clarifyStepFinal"),
    clarifyPreviewText: byId("clarifyPreviewText"),
    clarifyActionableYes: byId("clarifyActionableYes"),
    clarifyActionSingle: byId("clarifyActionSingle"),
    clarifyActionAddExisting: byId("clarifyActionAddExisting"),
    clarifyConvertProject: byId("clarifyConvertProject"),
    clarifyTwoMinuteYes: byId("clarifyTwoMinuteYes"),
    clarifyTwoMinuteNo: byId("clarifyTwoMinuteNo"),
    clarifyTwoMinuteFollowup: byId("clarifyTwoMinuteFollowup"),
    clarifyTwoMinuteExpectNo: byId("clarifyTwoMinuteExpectNo"),
    nextGroupBySelect: byId("nextGroupBySelect"),
    nextGroupByLabel: byId("nextGroupByLabel"),
    nextGroupLimitInput: byId("nextGroupLimitInput"),
    nextGroupLimitLabel: byId("nextGroupLimitLabel"),
    kanbanGroupBySelect: byId("kanbanGroupBySelect"),
    kanbanGroupByLabel: byId("kanbanGroupByLabel"),
    kanbanSubheading: byId("kanbanSubheading"),
    nextPanelSubheading: byId("nextPanelSubheading"),
    clarifyTwoMinuteClosureNotes: byId("clarifyTwoMinuteClosureNotes"),
    clarifyWhoSelf: byId("clarifyWhoSelf"),
    clarifyWhoDelegate: byId("clarifyWhoDelegate"),
    clarifyDelegateNameInput: byId("clarifyDelegateNameInput"),
    clarifyProjectSelect: byId("clarifyProjectSelect"),
    clarifyProjectPicker: byId("clarifyProjectPicker"),
    clarifyProjectPickContinue: byId("clarifyProjectPickContinue"),
    clarifyDateOptionSpecific: byId("clarifyDateOptionSpecific"),
    clarifyDateOptionDue: byId("clarifyDateOptionDue"),
    clarifyDateOptionNone: byId("clarifyDateOptionNone"),
    clarifyDateOptionFollowUp: byId("clarifyDateOptionFollowUp"),
    clarifyFollowUpRow: byId("clarifyFollowUpRow"),
    clarifyFollowUpFields: byId("clarifyFollowUpFields"),
    clarifyFollowUpDateInput: byId("clarifyFollowUpDateInput"),
    clarifyNewProjectInline: byId("clarifyNewProjectInline"),
    clarifyNewProjectNameInput: byId("clarifyNewProjectNameInput"),
    clarifyProjectSection: byId("clarifyProjectSection"),
    clarifyDetailsSection: byId("clarifyDetailsSection"),
    clarifyRecurrenceHint: byId("clarifyRecurrenceHint"),
    claritySummaryRail: byId("claritySummaryRail"),
    clarifyFooter: byId("clarifyFooter"),
    clarifySpecificDateInput: byId("clarifySpecificDateInput"),
    clarifySpecificTimeInput: byId("clarifySpecificTimeInput"),
    clarifyDueDateInput: byId("clarifyDueDateInput"),
    clarifyDateContinue: byId("clarifyDateContinue"),
    clarifyAreaInput: byId("clarifyAreaInput"),
    clarifyAreaNewBtn: byId("clarifyAreaNewBtn"),
    clarifyTitleSummary: byId("clarifyTitleSummary"),
    clarifyDescSummary: byId("clarifyDescSummary"),
    clarifyContextList: byId("clarifyContextList"),
    clarifyAddContext: byId("clarifyAddContext"),
    clarifyPeopleList: byId("clarifyPeopleList"),
    clarifyAddPerson: byId("clarifyAddPerson"),
    clarifyEffortSelect: byId("clarifyEffortSelect"),
    clarifyTimeSelect: byId("clarifyTimeSelect"),
    clarifyRecurrenceType: byId("clarifyRecurrenceType"),
    clarifyRecurrenceInterval: byId("clarifyRecurrenceInterval"),

    clarifyMetadataSave: byId("clarifyMetadataSave"),
    clarifyMetadataSkip: byId("clarifyMetadataSkip"),
    clarifyFinalMessage: byId("clarifyFinalMessage"),
    clarifyFinalReturn: byId("clarifyFinalReturn"),
    clarifyDoneButton: byId("clarifyDoneButton"),
    closureModal: document.getElementById("closureModal"),
    closureBackdrop: document.querySelector("#closureModal .modal-backdrop"),
    closeClosureModal: byId("closeClosureModal"),
    closureNotesInput: byId("closureNotesInput"),
    cancelClosureNotes: byId("cancelClosureNotes"),
    saveClosureNotes: byId("saveClosureNotes"),
    projectCompleteModal: document.getElementById("projectCompleteModal"),
    projectCompleteBackdrop: document.querySelector("#projectCompleteModal .modal-backdrop"),
    closeProjectCompleteModal: byId("closeProjectCompleteModal"),
    projectCompleteForm: byId("projectCompleteForm"),
    projectCompleteName: byId("projectCompleteName"),
    projectCompleteAchieved: byId("projectCompleteAchieved"),
    projectCompleteLessons: byId("projectCompleteLessons"),
    projectCompleteFollowUp: byId("projectCompleteFollowUp"),
    projectCompleteCancel: byId("projectCompleteCancel"),
    doingBar: byId("doingBar"),
    projectMergeModal: byId("projectMergeModal"),
    projectMergeBackdrop: byId("projectMergeBackdrop"),
    closeProjectMergeModal: byId("closeProjectMergeModal"),
    projectMergeSourceName: byId("projectMergeSourceName"),
    projectMergeSourceCount: byId("projectMergeSourceCount"),
    projectMergeTargetSelect: byId("projectMergeTargetSelect"),
    projectMergeSummary: byId("projectMergeSummary"),
    projectMergeConfirmBtn: byId("projectMergeConfirmBtn"),
    projectMergeCancelBtn: byId("projectMergeCancelBtn"),
    useTemplateModal: byId("useTemplateModal"),
    useTemplateModalBackdrop: byId("useTemplateModalBackdrop"),
    closeUseTemplateModal: byId("closeUseTemplateModal"),
    useTemplateName: byId("useTemplateName"),
    useTemplateForm: byId("useTemplateForm"),
    useTemplateProjectName: byId("useTemplateProjectName"),
    useTemplateCancelBtn: byId("useTemplateCancelBtn"),
    templateEditorModal: byId("templateEditorModal"),
    templateEditorModalBackdrop: byId("templateEditorModalBackdrop"),
    closeTemplateEditorModal: byId("closeTemplateEditorModal"),
    templateEditorModalTitle: byId("templateEditorModalTitle"),
    templateEditorForm: byId("templateEditorForm"),
    templateEditorName: byId("templateEditorName"),
    templateEditorArea: byId("templateEditorArea"),
    templateEditorTheme: byId("templateEditorTheme"),
    templateEditorStatus: byId("templateEditorStatus"),
    templateEditorTasks: byId("templateEditorTasks"),
    templateEditorAddTask: byId("templateEditorAddTask"),
    templateEditorSaveBtn: byId("templateEditorSaveBtn"),
    templateEditorCancelBtn: byId("templateEditorCancelBtn"),
  };
}

function createURLLink(href, label) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = label ?? href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.className = "inline-url-link";
  return a;
}

function stripTagPrefix(value) {
  if (typeof value !== "string") return value ?? "";
  return value.startsWith("@") || value.startsWith("+") ? value.slice(1) : value;
}

function populateAreaSelect(select, areas, currentValue) {
  if (!select) return;
  const sorted = [...new Set(areas)].filter(Boolean).sort((a, b) => a.localeCompare(b));
  select.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "— None —";
  select.append(blank);
  sorted.forEach((area) => {
    const opt = document.createElement("option");
    opt.value = area;
    opt.textContent = area;
    select.append(opt);
  });
  select.value = currentValue || "";
}

function addNewAreaOption(select, taskManager) {
  const name = window.prompt("New area of focus:");
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  // Persist to state so all other dropdowns pick it up immediately.
  if (taskManager) {
    taskManager.addAreaOption(trimmed, { notify: false });
  }
  if (!Array.from(select.options).some((opt) => opt.value === trimmed)) {
    const opt = document.createElement("option");
    opt.value = trimmed;
    opt.textContent = trimmed;
    select.append(opt);
  }
  select.value = trimmed;
  select.dispatchEvent(new Event("change"));
}

function renderTaskList(container, tasks, factory) {
  container.innerHTML = "";
  if (!tasks.length) {
    const empty = document.createElement("div");
    empty.className = "muted small-text";
    empty.textContent = "Nothing here yet. Drag tasks in or add new items.";
    container.append(empty);
    return;
  }
  tasks.forEach((task) => container.append(factory(task)));
}

function fillSelect(select, options, current) {
  const value = current ?? "all";
  while (select.options.length > 1) {
    select.remove(1);
  }
  options.forEach((option) => {
    const opt = document.createElement("option");
    opt.value = option;
    opt.textContent = option;
    select.append(opt);
  });
  if (select.querySelector(`option[value="${value}"]`)) {
    select.value = value;
  } else {
    select.value = "all";
  }
}

function loadStoredPanel() {
  try {
    return localStorage.getItem(TAB_STORAGE_KEY) || null;
  } catch (error) {
    return null;
  }
}

function storeActivePanel(panel) {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, panel);
  } catch (error) {
    /* noop */
  }
}

function loadNextFanoutPreference() {
  try {
    const stored = localStorage.getItem(NEXT_FANOUT_KEY);
    if (stored === null) return false;
    return stored === "true";
  } catch (error) {
    return false;
  }
}

function storeNextFanoutPreference(value) {
  try {
    localStorage.setItem(NEXT_FANOUT_KEY, String(Boolean(value)));
  } catch (error) {
    /* noop */
  }
}

function loadNextHideScheduledPreference() {
  try {
    const stored = localStorage.getItem(NEXT_HIDE_SCHEDULED_KEY);
    if (stored === null) return true;
    return stored === "true";
  } catch (error) {
    return true;
  }
}

function storeNextHideScheduledPreference(value) {
  try {
    localStorage.setItem(NEXT_HIDE_SCHEDULED_KEY, String(Boolean(value)));
  } catch (error) {
    /* noop */
  }
}

function loadNextGroupByPreference() {
  try {
    const stored = localStorage.getItem(NEXT_GROUP_BY_KEY);
    return ["context", "project", "area", "effort", "none"].includes(stored) ? stored : "context";
  } catch (error) {
    return "context";
  }
}

function storeNextGroupByPreference(value) {
  try {
    localStorage.setItem(NEXT_GROUP_BY_KEY, value);
  } catch (error) {
    /* noop */
  }
}

function loadKanbanGroupByPreference() {
  try {
    const stored = localStorage.getItem(KANBAN_GROUP_BY_KEY);
    return ["area", "context", "project", "effort", "none"].includes(stored) ? stored : "area";
  } catch (error) {
    return "area";
  }
}

function storeKanbanGroupByPreference(value) {
  try {
    localStorage.setItem(KANBAN_GROUP_BY_KEY, value);
  } catch (error) {
    /* noop */
  }
}

function loadNextGroupLimitPreference() {
  try {
    const stored = localStorage.getItem(NEXT_GROUP_LIMIT_KEY);
    const val = parseInt(stored, 10);
    return val > 0 ? val : 0;
  } catch (error) {
    return 0;
  }
}

function storeNextGroupLimitPreference(value) {
  try {
    localStorage.setItem(NEXT_GROUP_LIMIT_KEY, String(value));
  } catch (error) {
    /* noop */
  }
}

function loadActiveAreaPreference() {
  try {
    return localStorage.getItem(ACTIVE_AREA_KEY) || null;
  } catch {
    return null;
  }
}

function storeActiveAreaPreference(area) {
  try {
    if (area) {
      localStorage.setItem(ACTIVE_AREA_KEY, area);
    } else {
      localStorage.removeItem(ACTIVE_AREA_KEY);
    }
  } catch {
    /* noop */
  }
}

function fillDatalist(element, values) {
  if (!element) return;
  element.innerHTML = "";
  Array.from(new Set(values))
    .filter((value) => typeof value === "string" && value.trim())
    .sort((a, b) => a.localeCompare(b))
    .forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      element.append(option);
    });
}

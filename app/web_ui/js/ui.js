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

const TAB_STORAGE_KEY = "nextflow-active-panel";
const NEXT_FANOUT_KEY = "nextflow-next-fanout";
const NEXT_HIDE_SCHEDULED_KEY = "nextflow-next-hide-scheduled";
const NEXT_GROUP_BY_KEY = "nextflow-next-group-by";
const NEXT_GROUP_LIMIT_KEY = "nextflow-next-group-limit";
const KANBAN_GROUP_BY_KEY = "nextflow-kanban-group-by";

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

const TRANSITIONS = {
  [STATUS.INBOX]: [
    { label: "Clarify → Next", target: STATUS.NEXT },
    { label: "Hold for later", target: STATUS.SOMEDAY },
    { label: "Delegated", target: STATUS.WAITING },
  ],
  [STATUS.NEXT]: [
    { label: "Start doing", target: STATUS.DOING },
    { label: "Move to Waiting", target: STATUS.WAITING },
    { label: "Archive to Someday", target: STATUS.SOMEDAY },
  ],
  [STATUS.DOING]: [
    { label: "Back to Next", target: STATUS.NEXT },
    { label: "Move to Waiting", target: STATUS.WAITING },
    { label: "Archive to Someday", target: STATUS.SOMEDAY },
  ],
  [STATUS.WAITING]: [
    { label: "Back to Next", target: STATUS.NEXT },
    { label: "Start doing", target: STATUS.DOING },
    { label: "Return to Inbox", target: STATUS.INBOX },
  ],
  [STATUS.SOMEDAY]: [
    { label: "Activate → Next", target: STATUS.NEXT },
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
});

export class UIController {
  constructor(taskManager) {
    this.taskManager = taskManager;
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
    this.kanbanGroupBy = loadKanbanGroupByPreference();
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
    this.calendarCursor = new Date();
    this.projectCache = null;
    this.projectLookup = new Map();
    this.clarifyState = { taskId: null, actionable: null, currentStep: "describe", actionPlanInitialized: false };
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
  }

  init() {
    this.elements = mapElements();
    this.bindListeners();
    this.setupEntityMentionAutocomplete();
    this.setupSummaryTabs();
    this.setupAssociationFlyout();
    this.setupTaskContextMenu();
    this.setupTaskNoteContextMenu();
    this.setupTaskListItemContextMenu();
    this.setupCalendarDayContextMenu();
    this.setupContextColumnContextMenu();
    this.setupFlyout();
    this.bindClarifyModal();
    this.bindProjectCompletionModal();
    this.setupLightbox();
    this.setupFeedbackWidget();
    this.renderAll();
    this.syncTheme(this.taskManager.getTheme());
    this.updateFooterYear();
    this.startConnectionChecks();
  }

  bindListeners() {
    const {
      searchTasks,
      clearFilters,
      expandProjects,
      calendarDate,
      integrationsCard,
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

    expandProjects.addEventListener("click", () => {
      const projects = this.getProjectCache();
      const nextExpandedState = projects.some((project) => !project.isExpanded);
      projects.forEach((project) => this.taskManager.toggleProjectExpansion(project.id, nextExpandedState));
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

    integrationsCard.querySelectorAll("[data-placeholder]").forEach((button) => {
      button.addEventListener("click", () => {
        this.taskManager.notify("info", "Integration is coming soon. Stay tuned!");
      });
    });

    manualSyncButton?.addEventListener("click", () => {
      this.triggerManualSync();
    });
    this.elements.topbarSettings?.addEventListener("click", () => {
      this.setActivePanel("settings");
    });
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
          this.handleSettingsAction({ action, type, value });
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

    this.elements.settingsLoadFeedbackBtn?.addEventListener("click", () => {
      this.loadFeedbackList();
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

    this.elements.settingsClearFeedbackBtn?.addEventListener("click", async () => {
      const btn = this.elements.settingsClearFeedbackBtn;
      btn.disabled = true;
      btn.textContent = "Clearing…";
      try {
        const response = await fetch("/feedback", { method: "DELETE" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Clear failed");
        const msg = data.removed === 0
          ? "No resolved feedback to clear."
          : `Cleared ${data.removed} resolved item${data.removed === 1 ? ""  : "s"}.`;
        this.showToast("info", msg);
        this.loadFeedbackList();
      } catch (error) {
        this.showToast("error", error.message || "Could not clear feedback.");
      } finally {
        btn.disabled = false;
        btn.textContent = "Clear resolved";
      }
    });

    this.taskManager.addEventListener("statechange", () => {
      this.renderAll();
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
      this.showToast(event.detail.level, event.detail.message);
    });

    this.taskManager.addEventListener("connection", (event) => {
      this.updateConnectionIndicator(event.detail.status);
      if (event.detail.status === "online") {
        this.updateSyncButtonTitle();
        this._flushFeedbackQueue();
      }
    });

    this.taskManager.addEventListener("syncconflict", (event) => {
      const { remoteDevice } = event.detail;
      this.showToast("warn", `Merged changes from ${remoteDevice}. Review your tasks — last-write-wins was applied.`);
    });

    this.taskManager.addEventListener("versionchange", () => {
      this.showUpdateBanner();
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
    if (!this.panels?.some((panel) => panel.dataset.panel === panelName)) {
      panelName = "inbox";
    }
    this.activePanel = panelName;
    storeActivePanel(panelName);
    this.applyPanelVisibility();
    this._renderPanelIfDirty(panelName);
    if (panelName === "settings") {
      this.loadFeedbackList();
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
      expandProjects,
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
    if (expandProjects) {
      expandProjects.hidden = !supportsExpandProjects;
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
        toolbarActionsTitle.textContent = "Next Actions Controls";
        toolbarActionsNote.textContent = "Tune how next actions are grouped and filtered.";
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
      const pastScheduled = this.getPastScheduledIncompleteTasks({ applyFilters: false }).length;
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
    this.renderSummary();
    this.renderAssociationFlyout();
    this.applySearchVisibility();
    this.updateCounts();
    this.syncTheme(this.taskManager.getTheme());
    this.applyPanelVisibility();
    // Mark all panels dirty; only render the visible one now.
    // Hidden panels render on-demand when the user switches to them.
    Object.keys(PANEL_RENDER_FNS).forEach((id) => this._dirtyPanels.add(id));
    this._renderPanelIfDirty(this.activePanel);
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

  applyAssociationFlyoutState() {
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
      .getContexts()
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: value }));
    const people = this.taskManager
      .getPeopleTags()
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: value }));
    const projects = [
      { value: "none", label: "No project" },
      ...(this.projectCache || [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((project) => ({
          value: project.id,
          label: project.name + (project.someday ? " (Someday)" : ""),
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
    };
  }

  sortTasks(tasks) {
    const sorted = [...tasks];
    switch (this.taskSort) {
      case "updated-asc":
        return sorted.sort((a, b) => (a.updatedAt || "").localeCompare(b.updatedAt || ""));
      case "updated-desc":
        return sorted.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      case "title-asc":
        return sorted.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      case "title-desc":
        return sorted.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
      case "due-asc":
        return sorted.sort((a, b) => {
          const da = a.dueDate || a.calendarDate || "9999";
          const db = b.dueDate || b.calendarDate || "9999";
          return da.localeCompare(db);
        });
      case "stale-first":
        return sorted.sort((a, b) => (a.updatedAt || "").localeCompare(b.updatedAt || ""));
      default:
        return sorted;
    }
  }

  renderInbox() {
    const tasks = this.sortTasks(this.taskManager.getTasks({
      ...this.buildTaskFilters({ context: "all", projectId: "all", person: "all" }),
      status: STATUS.INBOX,
    }));
    const container = this.elements.inboxList;
    container.innerHTML = "";
    if (!tasks.length) {
      const banner = document.createElement("div");
      banner.className = "inbox-zero";
      banner.innerHTML = `<strong>Inbox zero!</strong><span class="muted small-text">Capture something new to keep the system flowing.</span>`;
      container.append(banner);
      this.attachDropzone(container, STATUS.INBOX);
      return;
    }
    renderTaskList(container, tasks, (task) => this.createTaskCard(task));
    this.attachDropzone(container, STATUS.INBOX);
  }

  renderMyDay() {
    const container = this.elements.myDayList;
    if (!container) return;
    const tasks = this.getMyDayTasks({ applyFilters: false });
    const pastScheduledTasks = this.getPastScheduledIncompleteTasks({ applyFilters: false });
    container.innerHTML = "";
    if (!tasks.length && !pastScheduledTasks.length) {
      const empty = document.createElement("div");
      empty.className = "muted small-text";
      empty.textContent = "No tasks in My Day yet. Use Add to My Day on any task.";
      container.append(empty);
      return;
    }
    if (tasks.length) {
      tasks.forEach((task) => {
        container.append(this.createTaskCard(task));
      });
    } else {
      const emptyToday = document.createElement("p");
      emptyToday.className = "muted small-text";
      emptyToday.textContent = "No tasks selected for today.";
      container.append(emptyToday);
    }

    if (pastScheduledTasks.length) {
      const section = document.createElement("section");
      section.className = "my-day-past-section";

      const title = document.createElement("h3");
      title.className = "my-day-past-title";
      title.textContent = "Past scheduled tasks";

      const note = document.createElement("p");
      note.className = "my-day-past-note muted small-text";
      note.textContent = "Incomplete tasks scheduled before today. Choose what to do next.";

      section.append(title, note);
      pastScheduledTasks.forEach((task) => {
        section.append(this.createMyDayPastScheduledItem(task));
      });
      container.append(section);
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

  createMyDayPastScheduledItem(task) {
    const item = document.createElement("article");
    item.className = "my-day-past-item";
    item.append(this.createTaskCard(task));

    const actions = document.createElement("div");
    actions.className = "my-day-past-actions";

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "btn btn-light btn-small";
    addButton.textContent = "Add to My Day";
    addButton.addEventListener("click", () => {
      this.addPastScheduledTaskToMyDay(task);
    });

    const rescheduleButton = document.createElement("button");
    rescheduleButton.type = "button";
    rescheduleButton.className = "btn btn-light btn-small";
    rescheduleButton.textContent = "Re-schedule";
    rescheduleButton.addEventListener("click", () => {
      this.promptRescheduleTask(task);
    });

    const unscheduleButton = document.createElement("button");
    unscheduleButton.type = "button";
    unscheduleButton.className = "btn btn-danger btn-small";
    unscheduleButton.textContent = "Unschedule";
    unscheduleButton.addEventListener("click", () => {
      this.unscheduleTask(task);
    });

    actions.append(addButton, rescheduleButton, unscheduleButton);
    item.append(actions);
    return item;
  }

  addPastScheduledTaskToMyDay(task) {
    if (!task?.id) return;
    const todayKey = this.getTodayDateKey();
    const updated = this.taskManager.updateTask(task.id, {
      myDayDate: todayKey,
      calendarDate: todayKey,
    });
    if (!updated) return;
    this.taskManager.notify("info", `Added "${task.title}" to My Day and scheduled it for today.`);
  }

  async promptRescheduleTask(task) {
    if (!task?.id) return;
    const fallbackDate = task.calendarDate || this.getTodayDateKey();
    const candidate = await this.showPrompt(`Re-schedule "${task.title}" to (YYYY-MM-DD):`, fallbackDate);
    if (candidate === null) return;
    const nextDate = candidate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
      this.taskManager.notify("warn", "Enter a date in YYYY-MM-DD format.");
      return;
    }
    const updated = this.taskManager.updateTask(task.id, { calendarDate: nextDate });
    if (!updated) return;
    this.taskManager.notify("info", `Re-scheduled "${task.title}" for ${formatFriendlyDate(nextDate)}.`);
  }

  unscheduleTask(task) {
    if (!task?.id) return;
    const updated = this.taskManager.updateTask(task.id, {
      myDayDate: null,
      calendarDate: null,
      calendarTime: null,
    });
    if (!updated) return;
    this.taskManager.notify("info", `Removed schedule from "${task.title}".`);
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

  renderNextActions() {
    const allNextTasks = this.taskManager.getTasks({
      ...this.buildTaskFilters(),
      status: STATUS.NEXT,
      includeFutureScheduled: !this.hideScheduledNextActions,
    });
    const unblockedNextTasks = allNextTasks.filter(
      (task) => !task.waitingFor || !this.taskManager.getReferencedTask(task.waitingFor)
    );
    const tasks = this.allowMultipleNextPerProject ? unblockedNextTasks : this.filterNextTasksByProject(unblockedNextTasks);
    const board = this.elements.contextBoard;
    board.innerHTML = "";

    const groupBy = this.nextGroupBy || "context";
    const subheadingEl = this.elements.nextPanelSubheading;
    if (subheadingEl) {
      const labels = { context: "context", project: "project", area: "area of focus", effort: "effort level", none: "ungrouped" };
      subheadingEl.textContent = groupBy === "none" ? "All next actions" : `Grouped by ${labels[groupBy] || groupBy}`;
    }

    const groups = this.buildNextActionsGroups(tasks, groupBy);
    groups.forEach((group) => {
      const column = document.createElement("div");
      column.className = "context-column";
      column.dataset.dropzone = STATUS.NEXT;
      if (groupBy === "context") column.dataset.context = group.key;

      const header = document.createElement("header");
      const title = document.createElement("span");
      title.textContent = group.label;
      const count = document.createElement("span");
      count.className = "context-count";
      const items = this.sortTasks(group.tasks);
      count.textContent = items.length;

      if (groupBy === "context" && group.key) {
        header.classList.add("is-filterable");
        const isActive = this.filters.context.length === 1 && this.filters.context[0] === group.key;
        if (isActive) header.classList.add("is-active");
        header.addEventListener("click", () => {
          const alreadyActive = this.filters.context.length === 1 && this.filters.context[0] === group.key;
          this.filters.context = alreadyActive ? ["all"] : [group.key];
          this.renderAll();
        });
      }

      header.append(title, count);
      column.append(header);
      const limit = this.nextGroupLimit > 0 ? this.nextGroupLimit : items.length;
      items.slice(0, limit).forEach((task) => column.append(this.createTaskCard(task)));
      if (items.length > limit) {
        const more = document.createElement("p");
        more.className = "context-column-overflow muted small-text";
        more.textContent = `…and ${items.length - limit} more`;
        column.append(more);
      }
      column.addEventListener("contextmenu", (event) => {
        if (event.target.closest(".task-row")) return; // let task context menu handle task rows
        event.preventDefault();
        event.stopPropagation();
        this.openContextColumnContextMenu(group.key, groupBy, group.label, event.clientX, event.clientY);
      });
      board.append(column);
      this.attachDropzone(column, STATUS.NEXT, groupBy === "context" ? group.key : undefined);
    });
  }

  buildNextActionsGroups(tasks, groupBy) {
    if (groupBy === "context") {
      const contexts = this.taskManager.getContexts();
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
    return tasks.length ? [{ key: "all", label: "All next actions", tasks }] : [];
  }

  renderKanban() {
    const board = this.elements.kanbanBoard;
    if (!board) return;
    board.innerHTML = "";
    const statuses = [STATUS.NEXT, STATUS.DOING, STATUS.WAITING];
    const activeTasks = this.taskManager
      .getTasks(this.buildTaskFilters())
      .filter((task) => statuses.includes(task.status));

    if (!activeTasks.length) {
      const empty = document.createElement("p");
      empty.className = "muted small-text";
      empty.textContent = "No active tasks for this board.";
      board.append(empty);
      return;
    }

    const groupBy = this.kanbanGroupBy || "area";
    // Context grouping: assign each task to its first context only — no multi-lane duplication.
    const groupTasks = groupBy === "context"
      ? activeTasks.map((t) => ({ ...t, contexts: t.contexts?.length ? [t.contexts[0]] : [] }))
      : activeTasks;
    const lanes = this.buildNextActionsGroups(groupTasks, groupBy);

    const groupByLabels = { area: "area of focus", context: "context", project: "project", effort: "effort level", none: "" };
    const subheading = this.elements.kanbanSubheading;
    if (subheading) {
      subheading.textContent = groupBy === "none" ? "All active tasks" : `Swimlanes by ${groupByLabels[groupBy] || groupBy}`;
    }

    lanes.forEach((lane) => {
      const laneSection = document.createElement("section");
      laneSection.className = "kanban-lane";

      if (groupBy !== "none") {
        const laneTitle = document.createElement("h3");
        laneTitle.className = "kanban-lane-title";
        laneTitle.textContent = lane.label;
        laneSection.append(laneTitle);
      }

      const laneGrid = document.createElement("div");
      laneGrid.className = "kanban-lane-grid";
      const laneTasks = lane.tasks;
      // Drop targets reassign area only when swimlanes represent areas of focus.
      const laneArea = groupBy === "area" ? lane.key : null;

      statuses.forEach((status) => {
        const column = document.createElement("section");
        column.className = "kanban-column";
        column.dataset.dropzone = status;
        column.dataset.area = lane.key;

        const items = laneTasks.filter((task) => task.status === status);

        const header = document.createElement("header");
        header.className = "kanban-column-header";
        const title = document.createElement("span");
        title.textContent = STATUS_LABELS[status] || status;
        const count = document.createElement("span");
        count.className = "context-count";
        count.textContent = String(items.length);
        header.append(title, count);
        column.append(header);

        const list = document.createElement("div");
        list.className = "kanban-column-list";
        if (!items.length) {
          const empty = document.createElement("p");
          empty.className = "muted small-text";
          empty.textContent = "No tasks";
          list.append(empty);
        } else {
          items.forEach((task) => {
            list.append(this.createTaskCard(task));
          });
        }
        column.append(list);
        this.attachKanbanDropzone(column, status, laneArea);
        laneGrid.append(column);
      });

      laneSection.append(laneGrid);
      board.append(laneSection);
    });
  }

  renderProjects() {
    const container = this.elements.projectList;
    container.innerHTML = "";
    const filterArea = this.elements.projectAreaFilter?.value || "all";
    const allTasks = this.taskManager.getTasks({ includeCompleted: false });
    const hasNextAction = new Map();
    const taskCountByProject = new Map();
    allTasks.forEach((task) => {
      if (!task.projectId) return;
      if (task.status === STATUS.NEXT) hasNextAction.set(task.projectId, true);
      taskCountByProject.set(task.projectId, (taskCountByProject.get(task.projectId) || 0) + 1);
    });
    const projects = (this.projectCache || []).filter((project) => {
      if (!filterArea || filterArea === "all") return true;
      return (project.areaOfFocus || "").toLowerCase() === filterArea.toLowerCase();
    });
    const visibleProjects = this.showMissingNextOnly
      ? projects.filter((project) => !project.someday && !hasNextAction.get(project.id))
      : projects;

    const areas = Array.from(new Set(this.taskManager.getAreasOfFocus()));
    if (this.elements.projectAreaFilter) {
      const select = this.elements.projectAreaFilter;
      const existing = new Set(Array.from(select.options).map((opt) => opt.value));
      areas.forEach((area) => {
        if (existing.has(area)) return;
        const option = document.createElement("option");
        option.value = area;
        option.textContent = area;
        select.append(option);
      });
    }
    populateAreaSelect(this.elements.projectAreaSelect, areas, this.elements.projectAreaSelect?.value || "");

    const filteredTasks = this.taskManager.getTasks(this.buildTaskFilters());

    visibleProjects.forEach((project) => {
      const details = document.createElement("details");
      details.className = "project";
      details.dataset.projectId = project.id;
      details.open = project.isExpanded;

      const missingNext = !project.someday && !hasNextAction.get(project.id);
      const missingArea = !project.areaOfFocus;
      const taskCount = taskCountByProject.get(project.id) || 0;
      const summary = document.createElement("summary");
      summary.innerHTML = `
        <strong>${project.name}</strong>
        <span class="muted small-text">${project.tags.join(", ") || "No tags"}</span>
        ${missingNext ? '<span class="badge badge-warning">No next action</span>' : ""}
        ${missingArea ? '<span class="badge badge-warning">No area</span>' : ""}
        <span class="badge project-task-count" title="${taskCount} active task${taskCount !== 1 ? "s" : ""}">${taskCount}</span>
      `;

      summary.addEventListener("click", () => {
        const willOpen = !details.open;
        requestAnimationFrame(() => {
          this.taskManager.toggleProjectExpansion(project.id, willOpen);
        });
      });

      const body = document.createElement("div");
      body.className = "project-body";
      const tagsRow = document.createElement("div");
      tagsRow.className = "project-tags";
      [
        ["Area", project.areaOfFocus],
        ["Theme", project.themeTag],
        ["Status", project.statusTag],
        ["Deadline", project.deadline ? formatFriendlyDate(project.deadline) : null],
      ].forEach(([label, value]) => {
        if (!value) return;
        const tag = document.createElement("span");
        tag.className = "project-tag";
        tag.textContent = `${label}: ${value}`;
        tagsRow.append(tag);
      });
      const outcome = document.createElement("div");
      outcome.className = "project-outcome";
      const outcomeLabel = document.createElement("span");
      outcomeLabel.className = "muted small-text project-outcome-label";
      outcomeLabel.textContent = "Desired outcome";
      const outcomeText = document.createElement("p");
      outcomeText.className = "project-outcome-text";
      outcomeText.textContent = project.vision || "Define what “done” looks like for this project.";
      outcome.append(outcomeLabel, outcomeText);

      const actions = document.createElement("div");
      actions.className = "project-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "btn btn-light";
      editButton.textContent = "Edit project";
      editButton.addEventListener("click", () => this.openProjectEditor(details, project));
      actions.append(editButton);

      if (project.someday) {
        const activate = document.createElement("button");
        activate.type = "button";
        activate.className = "btn btn-primary";
        activate.textContent = "Activate project";
        activate.addEventListener("click", () => this.taskManager.activateProject(project.id));
        actions.append(activate);
      }

      const completeButton = document.createElement("button");
      completeButton.type = "button";
      completeButton.className = "btn btn-primary";
      completeButton.textContent = "Mark complete";
      completeButton.addEventListener("click", () => this.openProjectCompleteModal(project));
      actions.append(completeButton);

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "btn btn-danger";
      deleteButton.textContent = "Delete project";
      deleteButton.addEventListener("click", async () => {
        const confirmed = await this.showConfirm(`Delete project "${project.name}"? Tasks will remain but lose their project link.`, { title: "Delete project", okLabel: "Delete", danger: true });
        if (confirmed) {
          this.taskManager.deleteProject(project.id);
        }
      });
      actions.append(deleteButton);

      let projectTasks = filteredTasks
        .filter((task) => task.projectId === project.id)
        .filter((task) => (project.someday ? task.status !== STATUS.SOMEDAY : true));

      const addNextForm = document.createElement("form");
      addNextForm.className = "project-next-action-form";
      const addNextInput = document.createElement("input");
      addNextInput.type = "text";
      addNextInput.placeholder = "Add next action";
      addNextInput.autocomplete = "off";
      addNextInput.setAttribute("aria-label", `Add next action for ${project.name}`);
      const addNextButton = document.createElement("button");
      addNextButton.type = "submit";
      addNextButton.className = "btn btn-primary";
      addNextButton.textContent = "Add";
      addNextForm.append(addNextInput, addNextButton);
      addNextForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const title = addNextInput.value.trim();
        if (!title) {
          this.taskManager.notify("warn", "Enter a next action title.");
          addNextInput.focus();
          return;
        }
        const projectNext = projectTasks.find((task) => task.status === STATUS.NEXT);
        const created = this.taskManager.addTask({
          title,
          status: STATUS.NEXT,
          projectId: project.id,
          contexts: projectNext?.contexts?.length ? projectNext.contexts : [],
        });
        if (created) {
          addNextInput.value = "";
          addNextInput.focus();
        }
      });

      if (!projectTasks.length) {
        const empty = document.createElement("p");
        empty.className = "muted small-text";
        empty.textContent = "No tasks linked to this project yet.";
        if (tagsRow.children.length) {
          body.append(tagsRow);
        }
        body.append(outcome, addNextForm, actions, empty);
        details.append(summary, body);
        container.append(details);
        return;
      }

      const grouped = {
        [STATUS.NEXT]: [],
        [STATUS.DOING]: [],
        [STATUS.WAITING]: [],
        [STATUS.SOMEDAY]: [],
      };
      projectTasks.forEach((task) => {
        if (grouped[task.status]) {
          grouped[task.status].push(task);
        }
      });

      const groups = [
        { status: STATUS.NEXT, label: "Next Actions", empty: "No next actions defined." },
        { status: STATUS.DOING, label: "Doing", empty: "Nothing currently in progress." },
        { status: STATUS.WAITING, label: "Waiting", empty: "Nothing delegated at the moment." },
        { status: STATUS.SOMEDAY, label: "Someday / Maybe", empty: "No ideas parked here yet." },
      ];

      const sectionsWrapper = document.createElement("div");
      sectionsWrapper.className = "project-task-groups";

      groups.forEach((group) => {
        const section = document.createElement("section");
        section.className = "project-task-group";
        section.dataset.projectId = project.id;
        const heading = document.createElement("h4");
        heading.textContent = group.label;
        section.append(heading);

        const items = grouped[group.status] || [];
        if (!items.length) {
          const empty = document.createElement("p");
          empty.className = "muted small-text";
          empty.textContent = group.empty;
          section.append(empty);
        } else {
          items.forEach((task, index) => {
            const card = this.createTaskCard(task);
            if (group.status === STATUS.NEXT) {
              if (index === 0) {
                card.classList.add("task-card-primary");
              }
              card.addEventListener("dragover", (event) => {
                const sourceId = this.draggingTaskId
                  || event.dataTransfer?.getData("text/task-id")
                  || event.dataTransfer?.getData("text/plain");
                if (!sourceId || sourceId === task.id) {
                  return;
                }
                const sourceTask = this.taskManager.getTaskById(sourceId);
                if (
                  !sourceTask ||
                  sourceTask.status !== STATUS.NEXT ||
                  sourceTask.projectId !== project.id ||
                  task.projectId !== project.id
                ) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                const bounds = card.getBoundingClientRect();
                const dropBefore = this.resolveProjectNextDropBefore({
                  sourceId,
                  targetId: task.id,
                  projectId: project.id,
                  clientY: event.clientY,
                  bounds,
                });
                card.classList.toggle("is-drop-before", dropBefore);
                card.classList.toggle("is-drop-after", !dropBefore);
              });
              card.addEventListener("dragleave", () => {
                card.classList.remove("is-drop-before", "is-drop-after");
              });
              card.addEventListener("drop", (event) => {
                const sourceId = this.draggingTaskId
                  || event.dataTransfer?.getData("text/task-id")
                  || event.dataTransfer?.getData("text/plain");
                if (!sourceId || sourceId === task.id) {
                  return;
                }
                const sourceTask = this.taskManager.getTaskById(sourceId);
                if (
                  !sourceTask ||
                  sourceTask.status !== STATUS.NEXT ||
                  sourceTask.projectId !== project.id ||
                  task.projectId !== project.id
                ) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                const bounds = card.getBoundingClientRect();
                const dropBefore = this.resolveProjectNextDropBefore({
                  sourceId,
                  targetId: task.id,
                  projectId: project.id,
                  clientY: event.clientY,
                  bounds,
                });
                this.handleProjectNextReorderDrop({
                  sourceId,
                  targetId: task.id,
                  projectId: project.id,
                  before: dropBefore,
                });
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

      if (tagsRow.children.length) {
        body.append(tagsRow);
      }

      const allProjectTasks = this.taskManager.getTasks({ projectId: project.id });
      const allNotes = allProjectTasks.flatMap((t) =>
        (Array.isArray(t.notes) ? t.notes : []).map((note) => ({ ...note, taskTitle: t.title }))
      ).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
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
          noteMeta.textContent = [note.taskTitle, noteDate].filter(Boolean).join(" • ");
          const noteText = document.createElement("p");
          noteText.className = "project-note-text";
          noteText.textContent = note.text;
          li.append(noteMeta, noteText);
          notesList.append(li);
        });
        notesDetails.append(notesList);
        body.append(outcome, addNextForm, actions, sectionsWrapper, notesDetails);
      } else {
        body.append(outcome, addNextForm, actions, sectionsWrapper);
      }
      details.append(summary, body);
      container.append(details);
    });
  }

  renderCompletedProjects() {
    const container = this.elements.completedProjectsList;
    if (!container) return;
    container.innerHTML = "";
    const completedProjects = this.taskManager.getCompletedProjects();
    const completedTasks = this.taskManager.getCompletedTasks();
    if (!completedProjects.length && !completedTasks.length) {
      const empty = document.createElement("p");
      empty.className = "muted small-text";
      empty.textContent = "No completions yet. Finish tasks or projects to build this report.";
      container.append(empty);
      return;
    }
    const projectNameById = new Map((this.projectCache || []).map((project) => [project.id, project.name]));
    completedProjects.forEach((entry) => {
      if (entry?.id && entry?.name) {
        projectNameById.set(entry.id, entry.name);
      }
    });

    const groups = new Map();
    completedTasks.forEach((task) => {
      const key = task.projectId || "none";
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(task);
    });

    completedProjects.forEach((entry) => {
      if (!groups.has(entry.id)) {
        groups.set(entry.id, []);
      }
    });

    const rankedGroups = Array.from(groups.entries())
      .map(([key, tasks]) => {
        const groupTasks = [...tasks].sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
        const headDate = groupTasks[0]?.completedAt || "";
        const projectEntry = key === "none" ? null : completedProjects.find((entry) => entry.id === key) || null;
        const sortDate = projectEntry?.completedAt || headDate || "";
        const title =
          key === "none"
            ? "No Project Tasks"
            : projectEntry?.name || projectNameById.get(key) || "Project";
        return {
          key,
          title,
          tasks: groupTasks,
          projectEntry,
          sortDate,
        };
      })
      .sort((a, b) => (b.sortDate || "").localeCompare(a.sortDate || ""));

    rankedGroups.forEach((group) => {
      const section = document.createElement("section");
      section.className = "report-details";

      const header = document.createElement("div");
      header.className = "report-details-header";

      const title = document.createElement("h4");
      title.className = "report-details-title";
      title.textContent = group.title;

      const meta = document.createElement("span");
      meta.className = "report-details-meta small-text";
      const countLabel = `${group.tasks.length} completed task${group.tasks.length === 1 ? "" : "s"}`;
      if (group.projectEntry?.completedAt) {
        meta.textContent = `${countLabel} • Project completed ${formatFriendlyDate(group.projectEntry.completedAt)}`;
      } else {
        meta.textContent = countLabel;
      }
      header.append(title, meta);
      section.append(header);

      const list = document.createElement("ul");
      list.className = "report-details-list";
      if (!group.tasks.length) {
        const row = document.createElement("li");
        row.className = "report-detail-item";
        const text = document.createElement("span");
        text.className = "muted small-text";
        text.textContent = "No completed tasks recorded for this project yet.";
        row.append(text);
        list.append(row);
      } else {
        group.tasks.forEach((task) => {
          const row = document.createElement("li");
          row.className = "report-detail-item";
          const label = document.createElement("strong");
          label.textContent = task.title || "Completed task";
          const details = document.createElement("span");
          details.className = "report-detail-meta";
          const parts = [formatFriendlyDate(task.completedAt)];
          if (task.contexts?.length) parts.push(task.contexts.join(", "));
          if (task.slug) parts.push(`#${task.slug}`);
          details.textContent = parts.join(" • ");
          row.append(label, details);
          list.append(row);
        });
      }
      section.append(list);
      container.append(section);
    });
  }

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

  renderWaitingFor() {
    const tasks = this.sortTasks(this.taskManager.getTasks({
      ...this.buildTaskFilters(),
      status: STATUS.WAITING,
    }));
    const container = this.elements.waitingList;
    renderTaskList(container, tasks, (task) => this.createTaskCard(task));
    this.attachDropzone(container, STATUS.WAITING);
  }

  renderSomeday() {
    const tasks = this.sortTasks(this.taskManager.getTasks({
      ...this.buildTaskFilters(),
      status: STATUS.SOMEDAY,
    }));
    const container = this.elements.somedayList;
    renderTaskList(container, tasks, (task) => this.createTaskCard(task));
    this.attachDropzone(container, STATUS.SOMEDAY);
  }

  renderCalendar() {
    if (this.elements.calendarShowCompleted) {
      this.elements.calendarShowCompleted.checked = this.calendarShowCompleted;
    }
    const entries = this.taskManager.getCalendarEntries({
      exactDate: this.filters.date || undefined,
      filters: this.buildTaskFilters(),
      includeCompleted: this.calendarShowCompleted,
    });
    this.renderCalendarGrid(entries);
    if (this.activePanel === "calendar") {
      this.updateActivePanelMeta();
    }
  }

  shiftCalendarMonth(delta) {
    const cursor = new Date(this.calendarCursor);
    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() + delta);
    this.calendarCursor = cursor;
    const iso = cursor.toISOString().slice(0, 10);
    if (this.elements.calendarDate) {
      this.elements.calendarDate.value = iso;
    }
  }

  renderCalendarGrid(entries = []) {
    const grid = this.elements.calendarGrid;
    const label = this.elements.calendarMonthLabel;
    if (!grid || !label) return;
    const cursor = new Date(this.calendarCursor);
    if (Number.isNaN(cursor.getTime())) {
      this.calendarCursor = new Date();
    }
    const year = this.calendarCursor.getFullYear();
    const month = this.calendarCursor.getMonth();
    label.textContent = this.calendarCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    const startWeekday = startOfMonth.getDay(); // 0-6
    const daysInMonth = endOfMonth.getDate();

    const entryMap = new Map();
    entries.forEach((entry) => {
      if (!entry?.date) return;
      const dateKey = String(entry.date).slice(0, 10);
      if (!entryMap.has(dateKey)) entryMap.set(dateKey, []);
      entryMap.get(dateKey).push(entry);
    });

    grid.innerHTML = "";
    const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    weekdayNames.forEach((day) => {
      const cell = document.createElement("div");
      cell.className = "calendar-grid-cell calendar-grid-head";
      cell.textContent = day;
      grid.append(cell);
    });

    const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
    for (let cellIndex = 0; cellIndex < totalCells; cellIndex += 1) {
      const dayContainer = document.createElement("div");
      dayContainer.className = "calendar-grid-cell";
      const dayNumber = cellIndex - startWeekday + 1;
      const isCurrentMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
      if (!isCurrentMonth) {
        dayContainer.classList.add("calendar-grid-cell--muted");
        grid.append(dayContainer);
        continue;
      }
      const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
      dayContainer.dataset.date = dateKey;
      dayContainer.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this.openCalendarDayContextMenu(dateKey, event.clientX, event.clientY);
      });
      const header = document.createElement("div");
      header.className = "calendar-grid-day";
      header.textContent = dayNumber;
      dayContainer.append(header);
      const dayEntries = entryMap.get(dateKey) || [];
      if (dayEntries.length) {
        const list = document.createElement("ul");
        list.className = "calendar-grid-list";
        dayEntries.forEach((entry) => {
          const item = document.createElement("li");
          item.className = "calendar-grid-item";
          if (entry.isCompleted) {
            item.classList.add("is-completed");
          } else if (entry.isDue) {
            item.classList.add("is-due");
          }
          const timeLabel = this.getCalendarEntryTime(entry);
          item.textContent = `${timeLabel ? `${timeLabel} • ` : ""}${entry.title}`;
          item.dataset.taskId = entry.taskId;
          if (!entry.isCompleted) {
            item.draggable = true;
            enableDrag(item, entry.taskId);
          }
          item.addEventListener("click", () => this.handleCalendarItemClick(entry));
          list.append(item);
        });
        dayContainer.append(list);
      }
      this.attachCalendarDropzone(dayContainer, dateKey);
      grid.append(dayContainer);
    }
  }

  attachCalendarDropzone(element, dateKey) {
    if (!element) return;
    const helper = window.DragDropHelper;
    if (helper) {
      helper.setupDropzone(element, {
        onDrop: (taskId) => this.handleCalendarDrop(taskId, dateKey),
      });
      return;
    }
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
      if (taskId) {
        this.handleCalendarDrop(taskId, dateKey);
      }
    });
  }

  handleCalendarDrop(taskId, dateKey) {
    const task = this.taskManager.getTaskById(taskId);
    if (!task) {
      this.taskManager.notify("error", "Cannot move missing task.");
      return;
    }
    const timePart =
      typeof task.calendarDate === "string" && task.calendarDate.includes("T")
        ? task.calendarDate.split("T")[1]
        : "";
    const nextCalendarValue = timePart ? `${dateKey}T${timePart}` : dateKey;
    this.taskManager.updateTask(taskId, { calendarDate: nextCalendarValue });
    this.taskManager.notify("info", `Scheduled "${task.title}" for ${formatFriendlyDate(dateKey)}.`);
  }

  renderReports() {
    const { reportList, reportEmpty, reportGrouping, reportYear } = this.elements;
    if (!reportList) return;
    const grouping = this.reportFilters.grouping;
    if (reportGrouping) {
      reportGrouping.value = grouping;
    }
    const contexts = this.taskManager.getContexts();
    this.renderReportContextPicker(contexts);
    const projects = this.projectCache || [];
    this.renderReportProjectPicker(projects);
    const areas = this.taskManager.getAreasOfFocus();
    this.renderReportAreaPicker(areas);
    const completedTasks = this.taskManager.getCompletedTasks();
    const completedProjects = this.taskManager
      .getCompletedProjects()
      .filter((project) => this.matchesReportProjectSelection(project.id))
      .filter((project) => this.matchesReportAreaSelection(project.snapshot?.areaOfFocus));
    const years = this.getReportYears([...completedTasks, ...completedProjects]);
    if (!years.includes(this.reportFilters.year)) {
      this.reportFilters.year = years[0];
    }
    if (reportYear) {
      reportYear.innerHTML = "";
      years.forEach((year) => {
        const option = document.createElement("option");
        option.value = String(year);
        option.textContent = year;
        reportYear.append(option);
      });
      reportYear.value = String(this.reportFilters.year);
      reportYear.disabled = grouping === "year";
      if (!reportYear.disabled) {
        const parsed = parseInt(reportYear.value, 10);
        this.reportFilters.year = Number.isNaN(parsed) ? years[0] : parsed;
      }
    }
    const taskSummary = this.taskManager.getCompletionSummary({
      grouping,
      year: grouping === "year" ? undefined : this.reportFilters.year,
      contexts: this.reportFilters.contexts,
      projectIds: this.reportFilters.projects,
      areas: this.reportFilters.areas,
    });
    const summaryByKey = new Map();
    taskSummary.forEach((entry) => {
      summaryByKey.set(entry.key, {
        ...entry,
        tasks: Array.isArray(entry.tasks) ? entry.tasks : [],
        projects: [],
      });
    });
    completedProjects.forEach((project) => {
      const completedDate = new Date(project.completedAt);
      if (!Number.isFinite(completedDate.getTime())) return;
      if (grouping !== "year" && completedDate.getFullYear() !== this.reportFilters.year) {
        return;
      }
      const bucket = this.buildReportBucket(completedDate, grouping);
      if (!bucket) return;
      const existing = summaryByKey.get(bucket.key) || {
        key: bucket.key,
        label: bucket.label,
        range: bucket.range,
        count: 0,
        sortValue: bucket.sortValue,
        tasks: [],
        projects: [],
      };
      existing.count += 1;
      existing.projects.push(project);
      summaryByKey.set(bucket.key, existing);
    });
    const summary = Array.from(summaryByKey.values()).sort((a, b) => a.sortValue - b.sortValue);
    reportList.innerHTML = "";
    const hasData = summary.length > 0;
    if (reportEmpty) {
      reportEmpty.hidden = hasData;
    }
    if (!hasData) {
      this.activeReportKey = null;
      this.clearReportDetails({ hidePlaceholder: true });
      return;
    }
    summary.forEach((entry) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "report-row";
      button.dataset.reportKey = entry.key;
      const isActive = this.activeReportKey === entry.key;
      if (isActive) {
        button.classList.add("is-active");
      }
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      const label = document.createElement("strong");
      label.textContent = entry.label;
      const count = document.createElement("span");
      count.textContent = `${entry.count} done`;
      button.append(label);
      if (entry.range) {
        const range = document.createElement("span");
        range.className = "report-range";
        range.textContent = entry.range;
        button.append(range);
      }
      button.append(count);
      button.addEventListener("click", () => {
        this.activeReportKey = this.activeReportKey === entry.key ? null : entry.key;
        this.renderReports();
      });
      item.append(button);
      reportList.append(item);
    });
    const selectedEntry = summary.find((entry) => entry.key === this.activeReportKey);
    if (selectedEntry) {
      this.renderReportDetails(selectedEntry);
    } else {
      this.clearReportDetails();
    }
  }

  renderStatistics() {
    const {
      statsLookback,
      statActiveTasks,
      statCompletedTasks,
      statCompletionRate,
      statOpenProjects,
      statStaleTasks,
      statOverdueTasks,
      statsStatusBreakdown,
      statsTrendMeta,
      statsTrendBars,
      statsContextList,
      statsProjectHealthMeta,
      statsProjectHealthList,
      statsDueBuckets,
      statsUpcomingDueList,
      statsMetadataCoverage,
      statsAgeBuckets,
      statsArchiveMix,
      statsPeopleList,
    } = this.elements;
    if (!statActiveTasks || !statsStatusBreakdown) return;

    if (statsLookback) {
      const parsed = parseInt(statsLookback.value || String(this.statsLookbackDays), 10);
      const normalized = Number.isNaN(parsed) ? this.statsLookbackDays : Math.max(7, parsed);
      this.statsLookbackDays = normalized;
      if (statsLookback.value !== String(normalized)) {
        statsLookback.value = String(normalized);
      }
    }

    const now = new Date();
    const today = this.startOfDay(now);
    const todayIso = today.toISOString().slice(0, 10);
    const lookbackStart = new Date(today.getTime() - (this.statsLookbackDays - 1) * 86400000);

    const activeTasks = this.taskManager.getTasks({ includeCompleted: false });
    const completedTasks = this.taskManager.getCompletedTasks();
    const activeProjects = this.taskManager.getProjects({ includeSomeday: true });
    const completedProjects = this.taskManager.getCompletedProjects();
    const summary = this.taskManager.getSummary();

    const completedInWindow = completedTasks.filter((entry) => {
      const completedAt = new Date(entry.completedAt || "");
      return Number.isFinite(completedAt.getTime()) && completedAt >= lookbackStart;
    });
    const completedProjectsInWindow = completedProjects.filter((project) => {
      const completedAt = new Date(project?.completedAt || "");
      return Number.isFinite(completedAt.getTime()) && completedAt >= lookbackStart;
    });

    const staleTasks = activeTasks.filter((task) => {
      const age = this.getAgeInDays(task.updatedAt || task.createdAt, now);
      return Number.isFinite(age) && age >= 14;
    }).length;

    const completionDenominator = activeTasks.length + completedInWindow.length;
    const completionRate = completionDenominator
      ? Math.round((completedInWindow.length / completionDenominator) * 100)
      : 0;

    statActiveTasks.textContent = this.formatCount(activeTasks.length);
    statCompletedTasks.textContent = this.formatCount(completedInWindow.length);
    statCompletionRate.textContent = `${completionRate}%`;
    statOpenProjects.textContent = this.formatCount(activeProjects.length);
    statStaleTasks.textContent = this.formatCount(staleTasks);
    statOverdueTasks.textContent = this.formatCount(summary.overdue);

    const statusRows = [
      { label: "Inbox", value: summary.inbox, meta: `${this.toPercent(summary.inbox, activeTasks.length)}%` },
      { label: "Next Actions", value: summary.next, meta: `${this.toPercent(summary.next, activeTasks.length)}%` },
      { label: "Doing", value: summary.doing, meta: `${this.toPercent(summary.doing, activeTasks.length)}%` },
      { label: "Waiting", value: summary.waiting, meta: `${this.toPercent(summary.waiting, activeTasks.length)}%` },
      { label: "Someday", value: summary.someday, meta: `${this.toPercent(summary.someday, activeTasks.length)}%` },
    ];
    this.renderStatisticsRows(statsStatusBreakdown, statusRows, {
      emptyMessage: "No active tasks available.",
      includeBars: true,
    });

    this.renderCompletionTrend(statsTrendBars, completedTasks, lookbackStart, this.statsLookbackDays);
    if (statsTrendMeta) {
      const avgPerDay = completedInWindow.length / Math.max(1, this.statsLookbackDays);
      statsTrendMeta.textContent =
        `${completedInWindow.length} tasks completed in ${this.statsLookbackDays} days ` +
        `(${avgPerDay.toFixed(1)}/day) • ${completedProjectsInWindow.length} projects closed.`;
    }

    const contextMap = new Map();
    const ensureContext = (value) => {
      const key = value && String(value).trim() ? String(value).trim() : "No context";
      if (!contextMap.has(key)) {
        contextMap.set(key, { active: 0, completed: 0 });
      }
      return key;
    };
    activeTasks.forEach((task) => {
      const ctxs = task.contexts?.length ? task.contexts : [null];
      ctxs.forEach((ctx) => { contextMap.get(ensureContext(ctx)).active += 1; });
    });
    completedInWindow.forEach((entry) => {
      const ctxs = entry.contexts?.length ? entry.contexts : [null];
      ctxs.forEach((ctx) => { contextMap.get(ensureContext(ctx)).completed += 1; });
    });
    const contextRows = Array.from(contextMap.entries())
      .map(([label, counts]) => {
        const total = counts.active + counts.completed;
        return {
          label,
          value: total,
          meta: `${counts.active} active • ${counts.completed} done`,
        };
      })
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
      .slice(0, 10);
    this.renderStatisticsRows(statsContextList, contextRows, {
      emptyMessage: "No context usage yet.",
      includeBars: true,
    });

    const projectRows = activeProjects
      .map((project) => {
        const tasks = activeTasks.filter((task) => task.projectId === project.id);
        const nextCount = tasks.filter((task) => task.status === STATUS.NEXT).length;
        const waitingCount = tasks.filter((task) => task.status === STATUS.WAITING).length;
        const dueSoonCount = tasks.filter((task) => {
          if (!task.dueDate) return false;
          return task.dueDate >= todayIso && task.dueDate <= this.shiftIsoDate(todayIso, 7);
        }).length;
        const deadlinePassed = Boolean(project.deadline && project.deadline < todayIso);
        const missingNext = !project.someday && nextCount === 0;
        let health = "ok";
        let healthLabel = "Healthy";
        if (project.someday) {
          health = "neutral";
          healthLabel = "Someday";
        } else if (deadlinePassed) {
          health = "risk";
          healthLabel = "Deadline passed";
        } else if (missingNext) {
          health = "risk";
          healthLabel = "Missing next action";
        }
        return {
          label: project.name,
          value: tasks.length,
          meta: `${tasks.length} tasks • ${nextCount} next • ${waitingCount} waiting • ${dueSoonCount} due soon • ${healthLabel}`,
          health,
          sortScore: health === "risk" ? 2 : health === "neutral" ? 1 : 0,
          projectId: project.id,
        };
      })
      .sort((a, b) => b.sortScore - a.sortScore || b.value - a.value || a.label.localeCompare(b.label))
      .slice(0, 12);
    const riskyProjects = projectRows.filter((row) => row.health === "risk").length;
    if (statsProjectHealthMeta) {
      statsProjectHealthMeta.textContent = `${activeProjects.length} active • ${riskyProjects} at risk`;
    }
    this.renderStatisticsRows(statsProjectHealthList, projectRows, {
      emptyMessage: "No active projects yet.",
      includeBars: true,
      onItemClick: (row) => {
        if (!row.projectId) return;
        const project = this.getProjectCache().find((p) => p.id === row.projectId);
        this.setActivePanel("projects");
        if (project && !project.isExpanded) {
          this.taskManager.toggleProjectExpansion(row.projectId, true);
        }
        this.focusProjectCard(row.projectId);
      },
    });

    const dueBuckets = {
      overdue: 0,
      today: 0,
      next7: 0,
      next30: 0,
      later: 0,
      noDue: 0,
    };
    activeTasks.forEach((task) => {
      const due = task.dueDate;
      if (!due) {
        dueBuckets.noDue += 1;
        return;
      }
      if (due < todayIso) {
        dueBuckets.overdue += 1;
        return;
      }
      if (due === todayIso) {
        dueBuckets.today += 1;
        return;
      }
      if (due <= this.shiftIsoDate(todayIso, 7)) {
        dueBuckets.next7 += 1;
        return;
      }
      if (due <= this.shiftIsoDate(todayIso, 30)) {
        dueBuckets.next30 += 1;
        return;
      }
      dueBuckets.later += 1;
    });
    const dueRows = [
      { label: "Overdue", value: dueBuckets.overdue, meta: `${this.toPercent(dueBuckets.overdue, activeTasks.length)}%` },
      { label: "Due today", value: dueBuckets.today, meta: `${this.toPercent(dueBuckets.today, activeTasks.length)}%` },
      { label: "Due in 7 days", value: dueBuckets.next7, meta: `${this.toPercent(dueBuckets.next7, activeTasks.length)}%` },
      { label: "Due in 30 days", value: dueBuckets.next30, meta: `${this.toPercent(dueBuckets.next30, activeTasks.length)}%` },
      { label: "Due later", value: dueBuckets.later, meta: `${this.toPercent(dueBuckets.later, activeTasks.length)}%` },
      { label: "No due date", value: dueBuckets.noDue, meta: `${this.toPercent(dueBuckets.noDue, activeTasks.length)}%` },
    ];
    this.renderStatisticsRows(statsDueBuckets, dueRows, {
      emptyMessage: "No due date data yet.",
      includeBars: true,
    });

    const upcomingDue = activeTasks
      .filter((task) => task.dueDate && task.dueDate >= todayIso)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 8)
      .map((task) => ({
        label: task.title,
        value: 1,
        meta: `${formatFriendlyDate(task.dueDate)} • ${STATUS_LABELS[task.status] || task.status}`,
      }));
    this.renderStatisticsRows(statsUpcomingDueList, upcomingDue, {
      emptyMessage: "No upcoming due dates.",
      includeBars: false,
    });

    const metadataRows = [
      { label: "Has context", value: activeTasks.filter((task) => task.contexts?.length).length },
      { label: "Assigned to project", value: activeTasks.filter((task) => task.projectId).length },
      { label: "Effort estimated", value: activeTasks.filter((task) => task.effortLevel).length },
      { label: "Time estimated", value: activeTasks.filter((task) => task.timeRequired).length },
      { label: "Has due date", value: activeTasks.filter((task) => task.dueDate).length },
      { label: "Scheduled on calendar", value: activeTasks.filter((task) => task.calendarDate).length },
      { label: "People tag set", value: activeTasks.filter((task) => task.peopleTag).length },
      { label: "Waiting owner set", value: activeTasks.filter((task) => task.waitingFor).length },
    ].map((row) => ({
      ...row,
      meta: `${row.value}/${activeTasks.length || 0} • ${this.toPercent(row.value, activeTasks.length)}%`,
    }));
    this.renderStatisticsRows(statsMetadataCoverage, metadataRows, {
      emptyMessage: "No metadata to evaluate.",
      includeBars: true,
    });

    const ageBuckets = {
      "0-1 days": 0,
      "2-7 days": 0,
      "8-30 days": 0,
      "31-90 days": 0,
      "90+ days": 0,
    };
    activeTasks.forEach((task) => {
      const age = this.getAgeInDays(task.createdAt || task.updatedAt, now);
      if (!Number.isFinite(age)) return;
      if (age <= 1) ageBuckets["0-1 days"] += 1;
      else if (age <= 7) ageBuckets["2-7 days"] += 1;
      else if (age <= 30) ageBuckets["8-30 days"] += 1;
      else if (age <= 90) ageBuckets["31-90 days"] += 1;
      else ageBuckets["90+ days"] += 1;
    });
    const ageRows = Object.entries(ageBuckets).map(([label, value]) => ({
      label,
      value,
      meta: `${this.toPercent(value, activeTasks.length)}%`,
    }));
    const cycleTimes = completedTasks
      .map((entry) => this.getDurationDays(entry.createdAt, entry.completedAt))
      .filter((value) => Number.isFinite(value) && value >= 0);
    const medianCycle = this.median(cycleTimes);
    const averageCycle = cycleTimes.length
      ? cycleTimes.reduce((total, value) => total + value, 0) / cycleTimes.length
      : 0;
    ageRows.push({
      label: "Median completion cycle",
      value: medianCycle,
      meta: `${medianCycle.toFixed(1)} days • avg ${averageCycle.toFixed(1)} days`,
    });
    this.renderStatisticsRows(statsAgeBuckets, ageRows, {
      emptyMessage: "No age data yet.",
      includeBars: true,
    });

    const referenceCount = Array.isArray(this.taskManager.state?.reference) ? this.taskManager.state.reference.length : 0;
    const deletedCount = Array.isArray(this.taskManager.state?.completionLog) ? this.taskManager.state.completionLog.length : 0;
    const recurringActive = activeTasks.filter((task) => task.recurrenceRule?.type).length;
    const archiveRows = [
      { label: "Reference archive entries", value: referenceCount, meta: "Completed and kept" },
      { label: "Deleted completion log entries", value: deletedCount, meta: "Completed and removed" },
      { label: "Completed projects", value: completedProjects.length, meta: "Project closure records" },
      { label: "Recurring active tasks", value: recurringActive, meta: "Tasks with recurrence rules" },
      { label: "Waiting tasks", value: summary.waiting, meta: "Tasks blocked on external response" },
    ];
    this.renderStatisticsRows(statsArchiveMix, archiveRows, {
      emptyMessage: "No archive data yet.",
      includeBars: true,
    });

    const waitingMap = new Map();
    activeTasks.forEach((task) => {
      if (!task.waitingFor) return;
      const key = task.waitingFor.trim();
      if (!key) return;
      waitingMap.set(key, (waitingMap.get(key) || 0) + 1);
    });
    const peopleRows = Array.from(waitingMap.entries())
      .map(([label, value]) => ({ label, value, meta: `${value} task${value === 1 ? "" : "s"}` }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
      .slice(0, 8);
    this.renderStatisticsRows(statsPeopleList, peopleRows, {
      emptyMessage: "No Waiting For assignees yet.",
      includeBars: true,
    });
  }

  renderCompletionTrend(container, completedTasks, lookbackStart, lookbackDays) {
    if (!container) return;
    container.innerHTML = "";
    const dailyBuckets = lookbackDays <= 30;
    const bucketSizeDays = dailyBuckets ? 1 : 7;
    const bucketCount = Math.max(1, Math.ceil(lookbackDays / bucketSizeDays));
    const buckets = [];
    for (let index = 0; index < bucketCount; index += 1) {
      const start = new Date(lookbackStart.getTime() + index * bucketSizeDays * 86400000);
      const end = new Date(start.getTime() + bucketSizeDays * 86400000);
      const count = completedTasks.filter((entry) => {
        const completedAt = new Date(entry.completedAt || "");
        return Number.isFinite(completedAt.getTime()) && completedAt >= start && completedAt < end;
      }).length;
      const label = dailyBuckets
        ? start.toLocaleDateString(undefined, { month: "numeric", day: "numeric" })
        : `Wk ${Math.ceil((index + 1) / 1)}`;
      buckets.push({ label, count, index });
    }
    const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1);
    const labelInterval = Math.max(1, Math.floor(bucketCount / 6));
    buckets.forEach((bucket, index) => {
      const bar = document.createElement("span");
      bar.className = "statistics-trend-bar";
      if (bucket.count === 0) {
        bar.classList.add("is-empty");
      }
      const height = bucket.count > 0 ? Math.max(8, Math.round((bucket.count / maxCount) * 100)) : 6;
      bar.style.setProperty("--bar-height", `${height}%`);
      const showLabel = index % labelInterval === 0 || index === bucketCount - 1;
      bar.dataset.label = showLabel ? bucket.label : "";
      bar.title = `${bucket.label}: ${bucket.count}`;
      container.append(bar);
    });
  }

  renderStatisticsRows(container, rows, { emptyMessage = "No data yet.", includeBars = true, onItemClick = null } = {}) {
    if (!container) return;
    container.innerHTML = "";
    if (!rows || !rows.length) {
      const empty = document.createElement("li");
      empty.className = "muted small-text";
      empty.textContent = emptyMessage;
      container.append(empty);
      return;
    }
    const maxValue = Math.max(
      ...rows.map((row) => {
        const value = Number(row.value);
        return Number.isFinite(value) ? value : 0;
      }),
      1
    );
    rows.forEach((row) => {
      const value = Number(row.value);
      const normalizedValue = Number.isFinite(value) ? Math.max(value, 0) : 0;
      const item = document.createElement("li");
      item.className = "statistics-row";
      if (row.health === "risk" || row.health === "ok") {
        item.dataset.health = row.health;
      }
      if (onItemClick) {
        item.classList.add("is-clickable");
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", "0");
        item.addEventListener("click", () => onItemClick(row));
        item.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onItemClick(row); } });
      }
      const main = document.createElement("div");
      main.className = "statistics-row-main";
      const label = document.createElement("span");
      label.className = "statistics-row-label";
      label.textContent = row.label || "Metric";
      const meta = document.createElement("span");
      meta.className = "statistics-row-meta";
      meta.textContent = row.meta || this.formatCount(normalizedValue);
      main.append(label, meta);
      item.append(main);
      if (includeBars) {
        const bar = document.createElement("div");
        bar.className = "statistics-bar";
        const fill = document.createElement("span");
        fill.className = "statistics-bar-fill";
        const width = `${Math.min(100, Math.max(0, (normalizedValue / maxValue) * 100)).toFixed(1)}%`;
        fill.style.setProperty("--bar-value", width);
        bar.append(fill);
        item.append(bar);
      }
      container.append(item);
    });
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

  getDurationDays(startValue, endValue) {
    if (!startValue || !endValue) return null;
    const start = new Date(startValue);
    const end = new Date(endValue);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
    return Math.max(0, (end.getTime() - start.getTime()) / 86400000);
  }

  median(values = []) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    return sorted[middle];
  }

  matchesReportProjectSelection(projectId) {
    const selections = Array.isArray(this.reportFilters.projects) ? this.reportFilters.projects : ["all"];
    if (!selections.length || selections.includes("all")) return true;
    if (selections.includes("none")) return false;
    return selections.includes(projectId);
  }

  matchesReportAreaSelection(area) {
    const selections = Array.isArray(this.reportFilters.areas) ? this.reportFilters.areas : ["all"];
    if (!selections.length || selections.includes("all")) return true;
    if (selections.includes("none")) return !area;
    return selections.includes(area);
  }

  buildReportBucket(date, grouping) {
    if (!date || !Number.isFinite(date.getTime())) return null;
    if (grouping === "week") {
      const week = this.getIsoWeekNumber(date);
      return {
        key: `${date.getFullYear()}-W${String(week).padStart(2, "0")}`,
        label: `Week ${week}, ${date.getFullYear()}`,
        range: this.getWeekRangeLabel(date),
        sortValue: date.getFullYear() * 100 + week,
      };
    }
    if (grouping === "month") {
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        label: `${date.toLocaleString(undefined, { month: "short" })} ${date.getFullYear()}`,
        range: null,
        sortValue: date.getFullYear() * 100 + date.getMonth(),
      };
    }
    if (grouping === "year") {
      return {
        key: `${date.getFullYear()}`,
        label: `${date.getFullYear()}`,
        range: null,
        sortValue: date.getFullYear(),
      };
    }
    return null;
  }

  getIsoWeekNumber(date) {
    const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  }

  getWeekRangeLabel(date) {
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

  renderAllActive() {
    const container = this.elements.allActiveList;
    if (!container) return;
    const tasks = this.taskManager.getTasks(this.buildTaskFilters());
    container.innerHTML = "";
    if (!tasks.length) {
      const empty = document.createElement("p");
      empty.className = "muted small-text";
      empty.textContent = "No active work right now.";
      container.append(empty);
      return;
    }
    tasks.forEach((task) => {
      container.append(this.createTaskCard(task));
    });
  }

  async loadFeedbackList() {
    const container = this.elements.settingsFeedbackList;
    if (!container) return;
    container.innerHTML = "";
    const loading = document.createElement("li");
    loading.className = "muted small-text";
    loading.textContent = "Loading…";
    container.append(loading);
    let items;
    try {
      const response = await fetch("/feedback");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      items = await response.json();
    } catch {
      loading.textContent = "Could not load feedback.";
      return;
    }
    container.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("li");
      empty.className = "muted small-text";
      empty.textContent = "No feedback yet.";
      container.append(empty);
      return;
    }
    const bugs = items.filter((i) => i.type === "bug");
    const features = items.filter((i) => i.type === "feature");
    [...bugs, ...features].forEach((item) => {
      const li = document.createElement("li");
      li.className = "settings-item" + (item.resolved ? " is-muted" : "");
      const main = document.createElement("div");
      main.className = "settings-item-main";
      const labelWrap = document.createElement("div");
      labelWrap.className = "settings-item-label";
      const typePill = document.createElement("span");
      typePill.className = `task-meta-pill ${item.type === "bug" ? "task-meta-waiting" : "task-meta-my-day"}`;
      typePill.textContent = item.type;
      const desc = document.createElement("span");
      desc.textContent = " " + item.description;
      const meta = document.createElement("span");
      meta.className = "settings-item-meta muted small-text";
      meta.textContent = [item.panel, item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ""].filter(Boolean).join(" · ");
      labelWrap.append(typePill, desc, document.createElement("br"), meta);
      const actions = document.createElement("div");
      actions.className = "settings-item-actions";
      if (!item.resolved) {
        const resolveBtn = document.createElement("button");
        resolveBtn.type = "button";
        resolveBtn.className = "btn btn-light btn-small";
        resolveBtn.textContent = "Resolve";
        resolveBtn.addEventListener("click", async () => {
          resolveBtn.disabled = true;
          try {
            const res = await fetch("/feedback", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: [item.id] }),
            });
            if (!res.ok) throw new Error();
            this.loadFeedbackList();
          } catch {
            resolveBtn.disabled = false;
            this.showToast("error", "Could not resolve item.");
          }
        });
        actions.append(resolveBtn);
      } else {
        const badge = document.createElement("span");
        badge.className = "muted small-text";
        badge.textContent = "Resolved";
        actions.append(badge);
      }
      main.append(labelWrap, actions);
      li.append(main);
      container.append(li);
    });
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
      const time = entry.ts ? new Date(entry.ts).toLocaleString() : "—";
      const device = entry.deviceLabel || entry.deviceId || "—";
      const title = entry.taskTitle ? entry.taskTitle.slice(0, 30) : entry.taskId || "—";
      const field = entry.field || "—";
      const prev = entry.prev !== undefined ? String(entry.prev) || "(empty)" : "—";
      const next = entry.next !== undefined ? String(entry.next) || "(empty)" : "—";
      tr.innerHTML = `<td>${time}</td><td>${device}</td><td title="${entry.taskTitle || ""}">${title}</td><td>${field}</td><td>${prev}</td><td>${next}</td>`;
      body.append(tr);
    });
    table.append(body);
    container.append(table);
  }

  renderSettings() {
    const themesList = this.elements.settingsThemesList;
    const featureFlagsList = this.elements.settingsFeatureFlagsList;
    const contextsList = this.elements.settingsContextsList;
    const peopleList = this.elements.settingsPeopleList;
    const areasList = this.elements.settingsAreasList;
    if (!themesList || !featureFlagsList || !contextsList || !peopleList || !areasList) return;
    const contexts = this.taskManager.getContexts();
    const peopleTags = this.taskManager.getPeopleTagOptions();
    const areas = this.taskManager.getAreasOfFocus();
    const usage = this.buildSettingsUsageCounts();

    if (this.selectedSettingsContext && !contexts.includes(this.selectedSettingsContext)) {
      this.selectedSettingsContext = null;
    }
    this.renderThemeSettings(themesList);
    this.renderFeatureFlagSettings(featureFlagsList);
    this.renderSettingsList(contextsList, contexts, "context", usage.contexts);
    this.renderSettingsList(peopleList, peopleTags, "people", usage.people);
    this.renderSettingsList(areasList, areas, "area", usage.areas);
  }

  renderThemeSettings(container) {
    container.innerHTML = "";
    const activeTheme = this.taskManager.getTheme();
    const customTheme = this.taskManager.getCustomTheme();
    const customPalettes = this.taskManager.getCustomThemePalettes();
    THEME_OPTIONS.forEach((theme) => {
      const item = document.createElement("li");
      item.className = "settings-item settings-theme-option";
      if (theme.id === activeTheme) {
        item.classList.add("is-selected");
      }

      const label = document.createElement("label");
      label.className = "settings-theme-label";
      label.setAttribute("for", `theme-option-${theme.id}`);

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "dashboardTheme";
      input.id = `theme-option-${theme.id}`;
      input.value = theme.id;
      input.checked = theme.id === activeTheme;
      input.addEventListener("change", () => {
        if (!input.checked) return;
        this.taskManager.updateTheme(theme.id);
      });

      const textWrap = document.createElement("span");
      textWrap.className = "settings-theme-copy";
      const title = document.createElement("strong");
      title.textContent = `${theme.icon} ${theme.label}`;
      const detail = document.createElement("span");
      detail.className = "settings-item-meta muted small-text";
      detail.textContent = theme.description;
      textWrap.append(title, detail);

      const swatches = document.createElement("span");
      swatches.className = "settings-theme-swatches";
      const colors = theme.id === "custom"
        ? [customTheme.canvas, customTheme.accent, customTheme.signal]
        : Array.isArray(theme.swatches)
          ? theme.swatches.slice(0, 3)
          : [];
      colors.forEach((color) => {
        const swatch = document.createElement("span");
        swatch.className = "settings-theme-swatch";
        swatch.style.setProperty("--swatch-color", color);
        swatches.append(swatch);
      });

      label.append(input, textWrap, swatches);
      item.append(label);
      if (theme.id === "custom") {
        const controls = document.createElement("div");
        controls.className = "settings-theme-custom-controls";
        const customFields = [
          { key: "canvas", label: "Canvas" },
          { key: "accent", label: "Accent" },
          { key: "signal", label: "Highlight" },
        ];
        customFields.forEach((field) => {
          const colorField = document.createElement("label");
          colorField.className = "settings-theme-color-field";
          colorField.setAttribute("for", `theme-custom-${field.key}`);
          const fieldText = document.createElement("span");
          fieldText.className = "small-text muted";
          fieldText.textContent = field.label;
          const colorInput = document.createElement("input");
          colorInput.type = "color";
          colorInput.id = `theme-custom-${field.key}`;
          const initialHex = normalizeThemeHexInput(customTheme[field.key]) || "#000000";
          colorInput.value = initialHex;
          const hexInput = document.createElement("input");
          hexInput.type = "text";
          hexInput.inputMode = "text";
          hexInput.autocomplete = "off";
          hexInput.spellcheck = false;
          hexInput.id = `theme-custom-${field.key}-hex`;
          hexInput.className = "settings-theme-hex-input";
          hexInput.placeholder = "#000000";
          hexInput.pattern = "^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$";
          hexInput.value = initialHex;

          const applyThemeHexValue = (raw) => {
            const normalized = normalizeThemeHexInput(raw);
            const savedHex = normalizeThemeHexInput(this.taskManager.getCustomTheme()[field.key]) || "#000000";
            if (!normalized) {
              hexInput.value = savedHex;
              colorInput.value = savedHex;
              return;
            }
            hexInput.value = normalized;
            colorInput.value = normalized;
            if (normalized !== savedHex) {
              this.taskManager.updateCustomTheme({ [field.key]: normalized });
            }
          };

          colorInput.addEventListener("change", () => {
            applyThemeHexValue(colorInput.value);
          });
          hexInput.addEventListener("change", () => {
            applyThemeHexValue(hexInput.value);
          });
          hexInput.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            applyThemeHexValue(hexInput.value);
            hexInput.blur();
          });
          colorField.append(fieldText, colorInput, hexInput);
          controls.append(colorField);
        });
        const paletteManager = document.createElement("section");
        paletteManager.className = "settings-theme-palette-manager";
        const paletteSaveRow = document.createElement("div");
        paletteSaveRow.className = "settings-theme-palette-save-row";
        const paletteNameInput = document.createElement("input");
        paletteNameInput.type = "text";
        paletteNameInput.className = "settings-theme-palette-name";
        paletteNameInput.placeholder = "Palette name";
        paletteNameInput.maxLength = 40;
        paletteNameInput.value = this.customPaletteDraftName;
        paletteNameInput.addEventListener("input", () => {
          this.customPaletteDraftName = paletteNameInput.value;
        });

        const savePaletteButton = document.createElement("button");
        savePaletteButton.type = "button";
        savePaletteButton.className = "btn btn-light btn-small";
        savePaletteButton.textContent = "Save Palette";
        const handlePaletteSave = () => {
          const draftName = this.customPaletteDraftName;
          this.customPaletteDraftName = "";
          const saved = this.taskManager.saveCustomThemePalette(draftName);
          if (!saved) {
            this.customPaletteDraftName = draftName;
          }
          if (paletteNameInput.isConnected) {
            paletteNameInput.value = this.customPaletteDraftName;
          }
        };
        savePaletteButton.addEventListener("click", handlePaletteSave);
        paletteNameInput.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          handlePaletteSave();
        });
        paletteSaveRow.append(paletteNameInput, savePaletteButton);

        const paletteMeta = document.createElement("p");
        paletteMeta.className = "settings-theme-palette-meta muted small-text";
        const paletteCount = customPalettes.length;
        paletteMeta.textContent = `${paletteCount} saved palette${paletteCount === 1 ? "" : "s"}`;

        const paletteList = document.createElement("ul");
        paletteList.className = "settings-list settings-theme-palette-list";
        paletteList.setAttribute("role", "list");
        if (!customPalettes.length) {
          const empty = document.createElement("li");
          empty.className = "muted small-text";
          empty.textContent = "No saved palettes yet.";
          paletteList.append(empty);
        } else {
          customPalettes.forEach((palette) => {
            const paletteItem = document.createElement("li");
            paletteItem.className = "settings-item settings-theme-palette-item";

            const main = document.createElement("div");
            main.className = "settings-item-main";
            const labelWrap = document.createElement("div");
            labelWrap.className = "settings-item-label";
            const label = document.createElement("span");
            label.textContent = palette.name;
            const detail = document.createElement("span");
            detail.className = "settings-item-meta muted small-text";
            detail.textContent = palette.updatedAt
              ? `Updated ${formatFriendlyDate(palette.updatedAt)}`
              : "Saved palette";
            labelWrap.append(label, detail);

            const actions = document.createElement("div");
            actions.className = "settings-item-actions";
            const applyButton = document.createElement("button");
            applyButton.type = "button";
            applyButton.className = "btn btn-light btn-small";
            applyButton.textContent = "Apply";
            applyButton.addEventListener("click", () => {
              this.taskManager.applyCustomThemePalette(palette.id);
            });

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "btn btn-danger btn-small";
            deleteButton.textContent = "Delete";
            deleteButton.addEventListener("click", async () => {
              const confirmed = await this.showConfirm(`Delete palette "${palette.name}"?`, { title: "Delete palette", okLabel: "Delete", danger: true });
              if (!confirmed) return;
              this.taskManager.deleteCustomThemePalette(palette.id);
            });

            actions.append(applyButton, deleteButton);
            main.append(labelWrap, actions);

            const swatchesRow = document.createElement("div");
            swatchesRow.className = "settings-theme-swatches";
            [palette.customTheme.canvas, palette.customTheme.accent, palette.customTheme.signal].forEach((color) => {
              const swatch = document.createElement("span");
              swatch.className = "settings-theme-swatch";
              swatch.style.setProperty("--swatch-color", color);
              swatchesRow.append(swatch);
            });
            paletteItem.append(main, swatchesRow);
            paletteList.append(paletteItem);
          });
        }

        paletteManager.append(paletteSaveRow, paletteMeta, paletteList);
        item.append(controls);
        item.append(paletteManager);
      }
      container.append(item);
    });
  }

  renderFeatureFlagSettings(container) {
    container.innerHTML = "";
    const flags = this.taskManager.getFeatureFlags();
    const entries = [
      {
        key: "showDaysSinceTouched",
        label: "Show Days Since Touched",
        description: "Display how many days ago each task was last updated on task cards.",
      },
      {
        key: "highlightStaleTasks",
        label: "Highlight stale tasks",
        description: "Color task rows by last-updated age (days/weeks/months).",
        renderConfig: (configPanel) => this.renderStaleTaskThresholdConfig(configPanel),
      },
      {
        key: "googleCalendarEnabled",
        label: "Google Calendar Sync",
        description: "Mirror tasks with dates to a Google Calendar.",
        renderConfig: (configPanel) => this.renderGoogleCalendarConfig(configPanel),
      },
    ];
    entries.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "settings-item settings-item--block";
      const main = document.createElement("div");
      main.className = "settings-item-main";
      const labelWrap = document.createElement("div");
      labelWrap.className = "settings-item-label";
      const label = document.createElement("span");
      label.textContent = entry.label;
      const meta = document.createElement("span");
      meta.className = "settings-item-meta muted small-text";
      meta.textContent = entry.description;
      labelWrap.append(label, meta);
      const actions = document.createElement("div");
      actions.className = "settings-item-actions";
      const toggle = document.createElement("label");
      toggle.className = "settings-flag-toggle";
      toggle.setAttribute("for", `feature-flag-${entry.key}`);
      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = `feature-flag-${entry.key}`;
      input.checked = Boolean(flags[entry.key]);
      input.dataset.featureFlag = entry.key;
      const text = document.createElement("span");
      text.className = "small-text";
      text.textContent = input.checked ? "Enabled" : "Disabled";
      input.addEventListener("change", () => {
        text.textContent = input.checked ? "Enabled" : "Disabled";
        if (configPanel) configPanel.hidden = !input.checked;
      });
      toggle.append(input, text);
      actions.append(toggle);
      main.append(labelWrap, actions);
      item.append(main);
      let configPanel = null;
      if (entry.renderConfig) {
        configPanel = document.createElement("div");
        configPanel.className = "feature-flag-config-panel";
        configPanel.hidden = !input.checked;
        entry.renderConfig(configPanel);
        item.append(configPanel);
      }
      container.append(item);
    });
  }

  renderStaleTaskThresholdConfig(panel) {
    if (!panel) return;
    panel.innerHTML = "";

    const thresholds = this.taskManager.getStaleTaskThresholds();
    const fields = [
      { key: "warn", label: "Warn (days)", hint: "First stale trigger." },
      { key: "stale", label: "Stale (days)", hint: "Moderate stale highlight." },
      { key: "old", label: "Old (days)", hint: "Stronger stale highlight." },
      { key: "ancient", label: "Ancient (days)", hint: "Critical stale highlight." },
    ];

    fields.forEach((field) => {
      const fieldWrap = document.createElement("label");
      fieldWrap.className = "feature-flag-config-field";

      const lbl = document.createElement("span");
      lbl.className = "feature-flag-config-label";
      lbl.textContent = field.label;

      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.max = "365";
      input.step = "1";
      input.value = String(thresholds[field.key]);
      input.dataset.staleThresholdKey = field.key;

      const hint = document.createElement("span");
      hint.className = "settings-item-meta muted small-text";
      hint.textContent = field.hint;

      input.addEventListener("change", () => {
        this.updateStaleTaskThresholdsFromPanel(panel);
      });

      fieldWrap.append(lbl, input, hint);
      panel.append(fieldWrap);
    });

    const note = document.createElement("p");
    note.className = "muted small-text";
    note.textContent = "Thresholds must be strictly increasing (warn < stale < old < ancient).";
    panel.append(note);
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

  renderGoogleCalendarConfig(panel) {
    const cfg = this.taskManager.getGoogleCalendarConfig();

    const makeField = (labelText, input) => {
      const wrap = document.createElement("label");
      wrap.className = "feature-flag-config-field";
      const lbl = document.createElement("span");
      lbl.className = "feature-flag-config-label";
      lbl.textContent = labelText;
      wrap.append(lbl, input);
      return wrap;
    };

    // --- Credentials section ---
    const credsStatus = document.createElement("p");
    credsStatus.className = "feature-flag-config-hint gcal-creds-status";
    credsStatus.textContent = "Checking credentials…";

    const credsTextarea = document.createElement("textarea");
    credsTextarea.className = "gcal-creds-input";
    credsTextarea.placeholder = "Paste service account JSON here…";
    credsTextarea.rows = 5;
    credsTextarea.spellcheck = false;

    const credsBtnRow = document.createElement("div");
    credsBtnRow.className = "gcal-creds-actions";

    const credsSaveBtn = document.createElement("button");
    credsSaveBtn.type = "button";
    credsSaveBtn.className = "btn btn-light";
    credsSaveBtn.textContent = "Save Credentials";

    const credsRemoveBtn = document.createElement("button");
    credsRemoveBtn.type = "button";
    credsRemoveBtn.className = "btn btn-light";
    credsRemoveBtn.textContent = "Remove";
    credsRemoveBtn.hidden = true;

    const updateCredsStatus = (configured, clientEmail) => {
      if (configured) {
        credsStatus.textContent = `Credentials configured — ${clientEmail || "service account"}`;
        credsStatus.dataset.state = "ok";
        credsRemoveBtn.hidden = false;
        credsTextarea.value = "";
        credsTextarea.placeholder = "Paste new service account JSON to replace…";
      } else {
        credsStatus.textContent = "No credentials configured.";
        credsStatus.dataset.state = "warn";
        credsRemoveBtn.hidden = true;
        credsTextarea.placeholder = "Paste service account JSON here…";
      }
    };

    fetch("/credentials/google", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => updateCredsStatus(d.configured, d.clientEmail))
      .catch(() => updateCredsStatus(false, null));

    credsSaveBtn.addEventListener("click", async () => {
      const raw = credsTextarea.value.trim();
      if (!raw) {
        this.showToast("warn", "Paste service account JSON before saving.");
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        this.showToast("error", "Invalid JSON — check the pasted credentials.");
        return;
      }
      try {
        const resp = await fetch("/credentials/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        });
        const data = await resp.json();
        if (!resp.ok) {
          this.showToast("error", data.error || "Failed to save credentials.");
          return;
        }
        updateCredsStatus(true, data.clientEmail);
        this.showToast("ok", "Google credentials saved.");
      } catch {
        this.showToast("error", "Could not reach server.");
      }
    });

    credsRemoveBtn.addEventListener("click", async () => {
      try {
        const resp = await fetch("/credentials/google", { method: "DELETE" });
        if (!resp.ok) {
          this.showToast("error", "Failed to remove credentials.");
          return;
        }
        updateCredsStatus(false, null);
        this.showToast("ok", "Google credentials removed.");
      } catch {
        this.showToast("error", "Could not reach server.");
      }
    });

    credsBtnRow.append(credsSaveBtn, credsRemoveBtn);

    // --- Calendar config section ---
    const calendarIdInput = document.createElement("input");
    calendarIdInput.type = "text";
    calendarIdInput.placeholder = "e.g. you@gmail.com";
    calendarIdInput.value = cfg.calendarId;

    const timezoneInput = document.createElement("select");
    Intl.supportedValuesOf("timeZone").forEach((tz) => {
      const opt = document.createElement("option");
      opt.value = tz;
      opt.textContent = tz;
      if (tz === (cfg.timezone || "UTC")) opt.selected = true;
      timezoneInput.append(opt);
    });

    const durationInput = document.createElement("input");
    durationInput.type = "number";
    durationInput.min = "5";
    durationInput.step = "5";
    durationInput.placeholder = "60";
    durationInput.value = cfg.defaultDurationMinutes;

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn-light";
    saveBtn.textContent = "Save Settings";
    saveBtn.addEventListener("click", () => {
      const duration = parseInt(durationInput.value, 10);
      this.taskManager.updateGoogleCalendarConfig({
        calendarId: calendarIdInput.value.trim(),
        timezone: timezoneInput.value.trim() || "UTC",
        defaultDurationMinutes: Number.isFinite(duration) && duration >= 5 ? duration : 60,
      });
      this.showToast("ok", "Google Calendar settings saved.");
    });

    panel.append(
      credsStatus,
      makeField("Service Account JSON", credsTextarea),
      credsBtnRow,
      makeField("Calendar ID", calendarIdInput),
      makeField("Timezone (IANA)", timezoneInput),
      makeField("Default event duration (minutes)", durationInput),
      saveBtn,
    );
  }

  buildSettingsUsageCounts() {
    const activeTasks = this.taskManager.getTasks({ includeCompleted: false });
    const inactiveTasks = this.taskManager.getCompletedTasks();
    const completedProjects = this.taskManager.getCompletedProjects();
    const areaByProjectId = new Map();
    (this.projectCache || []).forEach((project) => {
      if (project?.id && project?.areaOfFocus) {
        areaByProjectId.set(project.id, project.areaOfFocus);
      }
    });
    completedProjects.forEach((entry) => {
      if (entry?.id && entry?.snapshot?.areaOfFocus) {
        areaByProjectId.set(entry.id, entry.snapshot.areaOfFocus);
      }
    });
    const contexts = new Map();
    const people = new Map();
    const areas = new Map();

    const bump = (map, key, bucket) => {
      if (!key) return;
      const current = map.get(key) || { active: 0, inactive: 0 };
      current[bucket] += 1;
      map.set(key, current);
    };

    activeTasks.forEach((task) => {
      (task.contexts?.length ? task.contexts : [null]).forEach((ctx) => bump(contexts, ctx, "active"));
      bump(people, task.peopleTag, "active");
      bump(areas, this.getTaskAreaOfFocus(task), "active");
    });
    inactiveTasks.forEach((task) => {
      (task.contexts?.length ? task.contexts : [null]).forEach((ctx) => bump(contexts, ctx, "inactive"));
      bump(people, task.peopleTag, "inactive");
      const area =
        task.projectId
          ? areaByProjectId.get(task.projectId) || "No Area"
          : (typeof task.areaOfFocus === "string" && task.areaOfFocus.trim() ? task.areaOfFocus.trim() : "No Area");
      bump(areas, area, "inactive");
    });

    return { contexts, people, areas };
  }

  renderSettingsList(container, values, type, usageMap = new Map()) {
    container.innerHTML = "";
    if (!values.length) {
      const empty = document.createElement("li");
      empty.className = "muted small-text";
      empty.textContent = "No values yet.";
      container.append(empty);
      return;
    }
    values.forEach((value) => {
      const item = document.createElement("li");
      item.className = "settings-item";
      item.dataset.settingsType = type;
      item.dataset.settingsValue = value;
      if (type === "context" && value === this.selectedSettingsContext) {
        item.classList.add("is-selected");
      }
      const main = document.createElement("div");
      main.className = "settings-item-main";

      const labelWrap = document.createElement("div");
      labelWrap.className = "settings-item-label";
      const label = document.createElement("span");
      label.textContent = (type === "context" || type === "people") ? stripTagPrefix(value) : value;
      const meta = document.createElement("span");
      meta.className = "settings-item-meta muted small-text";
      const usage = usageMap.get(value) || { active: 0, inactive: 0 };
      meta.textContent =
        `${usage.active} active task${usage.active === 1 ? "" : "s"} • ` +
        `${usage.inactive} inactive task${usage.inactive === 1 ? "" : "s"}`;
      labelWrap.append(label, meta);
      const actions = document.createElement("div");
      actions.className = "settings-item-actions";

      const renameButton = document.createElement("button");
      renameButton.type = "button";
      renameButton.className = "btn btn-light btn-small";
      renameButton.textContent = "Rename";
      renameButton.dataset.settingsAction = "rename";
      renameButton.dataset.settingsType = type;
      renameButton.dataset.settingsValue = value;

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "btn btn-danger btn-small";
      deleteButton.textContent = "Delete";
      deleteButton.dataset.settingsAction = "delete";
      deleteButton.dataset.settingsType = type;
      deleteButton.dataset.settingsValue = value;

      actions.append(renameButton, deleteButton);
      main.append(labelWrap, actions);
      item.append(main);
      if (type === "context" && value === this.selectedSettingsContext) {
        item.append(this.renderSettingsContextTasksInline(value));
      }
      container.append(item);
    });
  }

  renderSettingsContextTasksInline(context) {
    const wrapper = document.createElement("section");
    wrapper.className = "settings-context-inline";

    const header = document.createElement("header");
    header.className = "settings-context-header";
    const title = document.createElement("h4");
    title.textContent = `Tasks in ${stripTagPrefix(context)}`;
    const meta = document.createElement("p");
    meta.className = "muted small-text";

    const activeTasks = this.taskManager
      .getTasks({ includeCompleted: false })
      .filter((task) => task.contexts?.includes(context))
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    const inactiveTasks = this.taskManager
      .getCompletedTasks({ context })
      .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
    meta.textContent =
      `${activeTasks.length} active task${activeTasks.length === 1 ? "" : "s"} • ` +
      `${inactiveTasks.length} inactive task${inactiveTasks.length === 1 ? "" : "s"}`;
    header.append(title, meta);
    wrapper.append(header);

    if (!activeTasks.length && !inactiveTasks.length) {
      const empty = document.createElement("p");
      empty.className = "muted small-text";
      empty.textContent = "No tasks currently use this context.";
      wrapper.append(empty);
      return wrapper;
    }

    const contexts = this.taskManager.getContexts();
    if (activeTasks.length) {
      const activeTitle = document.createElement("p");
      activeTitle.className = "settings-context-group-label muted small-text";
      activeTitle.textContent = "Active tasks";
      wrapper.append(activeTitle);

      const activeList = document.createElement("ul");
      activeList.className = "settings-list";
      activeList.setAttribute("role", "list");
      activeTasks.forEach((task) => {
        const item = document.createElement("li");
        item.className = "settings-item settings-task-row";

        const top = document.createElement("div");
        top.className = "settings-task-row-top";
        const taskTitle = document.createElement("strong");
        taskTitle.textContent = task.title;
        const status = document.createElement("span");
        status.className = "muted small-text";
        status.textContent = STATUS_LABELS[task.status] || task.status;
        top.append(taskTitle, status);

        const actions = document.createElement("div");
        actions.className = "settings-task-actions";
        const select = document.createElement("select");
        select.dataset.settingsTaskId = task.id;
        select.dataset.settingsContextFrom = context;
        contexts.forEach((value) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          if (value === context) {
            option.selected = true;
          }
          select.append(option);
        });

        const openButton = document.createElement("button");
        openButton.type = "button";
        openButton.className = "btn btn-light btn-small";
        openButton.textContent = "Open";
        openButton.addEventListener("click", (event) => {
          event.stopPropagation();
          this.openTaskFlyout(task.id);
        });

        actions.append(select, openButton);
        item.append(top, actions);
        activeList.append(item);
      });
      wrapper.append(activeList);
    }

    if (inactiveTasks.length) {
      const inactiveTitle = document.createElement("p");
      inactiveTitle.className = "settings-context-group-label muted small-text";
      inactiveTitle.textContent = "Inactive tasks";
      wrapper.append(inactiveTitle);

      const inactiveList = document.createElement("ul");
      inactiveList.className = "settings-list";
      inactiveList.setAttribute("role", "list");
      inactiveTasks.forEach((entry) => {
        const item = document.createElement("li");
        item.className = "settings-item settings-task-row";

        const top = document.createElement("div");
        top.className = "settings-task-row-top";
        const taskTitle = document.createElement("strong");
        taskTitle.textContent = entry.title || "Completed task";
        const completed = document.createElement("span");
        completed.className = "muted small-text";
        completed.textContent = entry.completedAt
          ? `Completed ${formatFriendlyDate(entry.completedAt)}`
          : "Completed";
        top.append(taskTitle, completed);

        const actions = document.createElement("div");
        actions.className = "settings-task-actions";

        const select = document.createElement("select");
        select.dataset.settingsCompletedTaskId = entry.id;
        select.dataset.settingsContextFrom = context;
        contexts.forEach((value) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          if (value === context) {
            option.selected = true;
          }
          select.append(option);
        });

        const openButton = document.createElement("button");
        openButton.type = "button";
        openButton.className = "btn btn-light btn-small";
        openButton.textContent = "Open";
        openButton.addEventListener("click", (event) => {
          event.stopPropagation();
          this.openTaskFlyout(entry, { readOnly: true, entry });
        });

        actions.append(select, openButton);
        item.append(top, actions);
        inactiveList.append(item);
      });
      wrapper.append(inactiveList);
    }

    return wrapper;
  }

  async handleSettingsAction({ action, type, value }) {
    if (!action || !type || !value) return;
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
      const confirmed = await this.showConfirm(`Delete "${value}"?`, { title: "Delete option", okLabel: "Delete", danger: true });
      if (!confirmed) return;
      if (type === "context") {
        const changed = this.taskManager.deleteContext(value);
        if (changed && this.selectedSettingsContext === value) {
          this.selectedSettingsContext = null;
        }
      }
      if (type === "people") this.taskManager.deletePeopleTag(value);
      if (type === "area") this.taskManager.deleteAreaOfFocus(value);
    }
  }

  renderReportContextPicker(contexts) {
    const menu = this.elements.reportContextOptions;
    if (!menu) return;
    const filtered = contexts.filter((context) => context && context.toLowerCase() !== "all");
    const options = [
      { label: "All contexts", value: "all" },
      ...filtered.map((context) => ({ label: context, value: context })),
    ];
    menu.innerHTML = "";
    options.forEach((option) => {
      const id = `report-context-${option.value === "all" ? "all" : option.value.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
      const label = document.createElement("label");
      label.setAttribute("for", id);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = id;
      checkbox.value = option.value;
      checkbox.checked = this.isReportValueSelected("contexts", option.value);
      checkbox.addEventListener("change", () => {
        this.updateReportFilterSelection("contexts", option.value, checkbox.checked);
        this.renderReports();
      });
      const text = document.createElement("span");
      text.textContent = option.label;
      label.append(checkbox, text);
      menu.append(label);
    });
    this.updateReportPickerSummary("contexts");
  }

  renderReportProjectPicker(projects) {
    const menu = this.elements.reportProjectOptions;
    if (!menu) return;
    const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name));
    const options = [
      { label: "All projects", value: "all" },
      { label: "No project", value: "none" },
      ...sortedProjects.map((project) => ({ label: project.name, value: project.id })),
    ];
    menu.innerHTML = "";
    options.forEach((option) => {
      const id = `report-project-${option.value.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
      const label = document.createElement("label");
      label.setAttribute("for", id);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = id;
      checkbox.value = option.value;
      checkbox.checked = this.isReportValueSelected("projects", option.value);
      checkbox.addEventListener("change", () => {
        this.updateReportFilterSelection("projects", option.value, checkbox.checked);
        this.renderReports();
      });
      const text = document.createElement("span");
      text.textContent = option.label;
      label.append(checkbox, text);
      menu.append(label);
    });
    this.updateReportPickerSummary("projects");
  }

  renderReportAreaPicker(areas) {
    const menu = this.elements.reportAreaOptions;
    if (!menu) return;
    const sorted = [...areas].filter(Boolean).sort((a, b) => a.localeCompare(b));
    const options = [
      { label: "All areas", value: "all" },
      { label: "No area", value: "none" },
      ...sorted.map((area) => ({ label: area, value: area })),
    ];
    menu.innerHTML = "";
    options.forEach((option) => {
      const id = `report-area-${option.value.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
      const label = document.createElement("label");
      label.setAttribute("for", id);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = id;
      checkbox.value = option.value;
      checkbox.checked = this.isReportValueSelected("areas", option.value);
      checkbox.addEventListener("change", () => {
        this.updateReportFilterSelection("areas", option.value, checkbox.checked);
        this.renderReports();
      });
      const text = document.createElement("span");
      text.textContent = option.label;
      label.append(checkbox, text);
      menu.append(label);
    });
    this.updateReportPickerSummary("areas");
  }

  updateReportFilterSelection(key, value, checked) {
    const current = Array.isArray(this.reportFilters[key]) ? [...this.reportFilters[key]] : ["all"];
    const selections = new Set(current);
    if (value === "all") {
      if (checked) {
        this.reportFilters[key] = ["all"];
      } else if (!selections.size || selections.has("all")) {
        this.reportFilters[key] = ["all"];
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
    this.reportFilters[key] = Array.from(selections);
  }

  isReportValueSelected(key, value) {
    const selections = Array.isArray(this.reportFilters[key]) ? this.reportFilters[key] : ["all"];
    if (value === "all") {
      return selections.includes("all") || !selections.length;
    }
    if (selections.includes("all")) {
      return false;
    }
    return selections.includes(value);
  }

  updateReportPickerSummary(type) {
    const toggleMap = {
      contexts: this.elements.reportContextToggle,
      projects: this.elements.reportProjectToggle,
      areas: this.elements.reportAreaToggle,
    };
    const defaultLabels = { contexts: "All contexts", projects: "All projects", areas: "All areas" };
    const toggle = toggleMap[type];
    if (!toggle) return;
    const selections = Array.isArray(this.reportFilters[type]) ? this.reportFilters[type] : ["all"];
    const defaultLabel = defaultLabels[type] || "All";
    if (!selections.length || selections.includes("all")) {
      toggle.textContent = defaultLabel;
      return;
    }
    if (selections.length === 1) {
      const value = selections[0];
      if (type === "projects") {
        if (value === "none") {
          toggle.textContent = "No project";
        } else {
          const project = this.projectLookup?.get(value);
          toggle.textContent = project?.name || "1 project";
        }
      } else if (value === "none") {
        toggle.textContent = type === "areas" ? "No area" : "None";
      } else {
        toggle.textContent = value;
      }
      return;
    }
    toggle.textContent = `${selections.length} selected`;
  }

  renderReportDetails(entry) {
    const { reportDetails, reportDetailsList, reportDetailsTitle, reportDetailsMeta, reportDetailsPlaceholder } = this.elements;
    if (!reportDetails || !reportDetailsList) return;
    reportDetails.hidden = false;
    if (reportDetailsPlaceholder) {
      reportDetailsPlaceholder.hidden = true;
    }
    if (reportDetailsTitle) {
      reportDetailsTitle.textContent = entry.label;
    }
    const tasks = Array.isArray(entry.tasks) ? entry.tasks.slice() : [];
    const projects = Array.isArray(entry.projects) ? entry.projects.slice() : [];
    if (reportDetailsMeta) {
      const parts = [];
      if (tasks.length) {
        parts.push(`${tasks.length} task${tasks.length === 1 ? "" : "s"}`);
      }
      if (projects.length) {
        parts.push(`${projects.length} project${projects.length === 1 ? "" : "s"}`);
      }
      reportDetailsMeta.textContent = parts.length ? `Completed: ${parts.join(" • ")}` : `${entry.count} done`;
    }
    reportDetailsList.innerHTML = "";
    if (!tasks.length && !projects.length) {
      const empty = document.createElement("li");
      empty.className = "muted small-text";
      empty.textContent = "No completion details recorded.";
      reportDetailsList.append(empty);
      return;
    }
    projects
      .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""))
      .forEach((project) => {
        const item = document.createElement("li");
        item.className = "report-detail-item";
        const title = document.createElement("strong");
        title.textContent = `Project completed: ${project.name}`;
        const meta = document.createElement("span");
        meta.className = "report-detail-meta";
        const area = project.snapshot?.areaOfFocus;
        meta.textContent = [
          `Completed ${formatFriendlyDate(project.completedAt)}`,
          area ? `Area: ${area}` : null,
        ].filter(Boolean).join(" • ");
        item.append(title, meta);
        reportDetailsList.append(item);
      });
    tasks
      .sort((a, b) => {
        const aTime = new Date(a.completedAt || 0).getTime();
        const bTime = new Date(b.completedAt || 0).getTime();
        return bTime - aTime;
      })
      .filter((task) => !this._hiddenReportTaskIds.has(task.id || task.sourceId))
      .forEach((task) => {
        const item = document.createElement("li");
        item.className = "report-detail-item";
        const title = document.createElement("strong");
        title.textContent = task.title;
        const meta = document.createElement("span");
        meta.className = "report-detail-meta";
        meta.textContent = this.formatReportTaskMeta(task);
        const actions = document.createElement("div");
        actions.className = "report-detail-actions";
        const viewBtn = document.createElement("button");
        viewBtn.type = "button";
        viewBtn.className = "btn btn-light btn-small";
        viewBtn.textContent = "View details";
        viewBtn.addEventListener("click", () => {
          this.openTaskFlyout(task, { readOnly: true, entry: task });
        });
        const restoreBtn = document.createElement("button");
        restoreBtn.type = "button";
        restoreBtn.className = "btn btn-light btn-small report-restore-btn";
        restoreBtn.textContent = "Restore task";
        restoreBtn.addEventListener("click", () => {
          const restored = this.taskManager.restoreCompletedTask(task.id || task.sourceId);
          if (restored) {
            this.renderReports();
            this.setActivePanel("next");
            this.openTaskFlyout(restored.id);
          }
        });
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn-light btn-small";
        removeBtn.textContent = "Remove from report";
        removeBtn.addEventListener("click", () => {
          this._hiddenReportTaskIds.add(task.id || task.sourceId);
          this.renderReportDetails(entry);
        });
        actions.append(viewBtn, restoreBtn, removeBtn);
        item.append(title, meta);
        if (task.closureNotes) {
          const notes = document.createElement("p");
          notes.className = "report-detail-notes";
          notes.textContent = `Notes: ${task.closureNotes}`;
          item.append(notes);
        }
        item.append(actions);
        reportDetailsList.append(item);
      });
  }

  formatReportTaskMeta(task) {
    const parts = [];
    if (task.completedAt) {
      const completedDate = new Date(task.completedAt);
      if (!Number.isNaN(completedDate.getTime())) {
        parts.push(
          `Completed ${completedDate.toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          })}`
        );
      }
    }
    if (task.contexts?.length) {
      parts.push(task.contexts.map(stripTagPrefix).join(", "));
    }
    const projectName = this.getProjectName(task.projectId);
    if (projectName) {
      parts.push(`#${projectName}`);
    }
    return parts.join(" • ") || "No additional metadata";
  }

  clearReportDetails({ hidePlaceholder = false } = {}) {
    const { reportDetails, reportDetailsList, reportDetailsTitle, reportDetailsMeta, reportDetailsPlaceholder } = this.elements;
    if (reportDetailsList) {
      reportDetailsList.innerHTML = "";
    }
    if (reportDetailsTitle) {
      reportDetailsTitle.textContent = "";
    }
    if (reportDetailsMeta) {
      reportDetailsMeta.textContent = "";
    }
    if (reportDetails) {
      reportDetails.hidden = true;
    }
    if (reportDetailsPlaceholder) {
      reportDetailsPlaceholder.hidden = hidePlaceholder ? true : false;
    }
  }

  filterNextTasksByProject(tasks) {
    const seen = new Set();
    const prioritized = [];
    const overflow = [];

    tasks.forEach((task) => {
      if (!task.projectId) {
        prioritized.push(task);
        return;
      }
      if (seen.has(task.projectId)) {
        overflow.push(task);
        return;
      }
      seen.add(task.projectId);
      prioritized.push(task);
    });

    return prioritized;
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
      this.taskManager.notify("warn", contextValue === "all" ? "No next actions available." : `No next actions found for ${contextValue}.`);
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

    const main = document.createElement("div");
    main.className = "task-row-main";

    const title = document.createElement("span");
    title.className = "task-row-title";
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
    metaItems.push(this.createMetaSpan(STATUS_LABELS[task.status] || task.status));
    if (task.contexts?.length) task.contexts.forEach((ctx) => metaItems.push(this.createMetaSpan(stripTagPrefix(ctx))));
    const projectName = this.getProjectName(task.projectId);
    if (projectName) metaItems.push(this.createMetaSpan(projectName));
    if (task.waitingFor) {
      const referencedTask = this.taskManager.getReferencedTask(task.waitingFor);
      if (referencedTask) {
        metaItems.push(this.createMetaSpan(`Blocking: ${referencedTask.slug || referencedTask.id}`));
      } else {
        metaItems.push(this.createMetaSpan(`Waiting For: ${task.waitingFor}`));
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

    if (!metaItems.length) {
      meta.append(this.createMetaSpan("No extra details"));
    }

    main.append(title, meta);

    const caret = document.createElement("span");
    caret.className = "task-row-caret";
    caret.setAttribute("aria-hidden", "true");
    caret.textContent = "›";

    row.append(main, caret);

    const openDetails = () => {
      if (row.classList.contains("is-dragging")) return;
      this.closeTaskContextMenu();
      this.closeCalendarDayContextMenu();
      if (task.status === STATUS.INBOX) {
        this.openClarifyModal(task.id);
      } else {
        this.openTaskFlyout(task.id);
      }
    };
    row.addEventListener("click", () => openDetails());
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDetails();
        return;
      }
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        this.openTaskContextMenuForTask(task.id, row);
      }
    });
    row.addEventListener("contextmenu", (event) => {
      if (row.classList.contains("is-dragging")) return;
      event.preventDefault();
      this.openTaskContextMenu(task.id, event.clientX, event.clientY);
    });

    enableDrag(row, task.id);
    row.addEventListener("dragstart", () => {
      this.draggingTaskId = task.id;
    });
    row.addEventListener("dragend", () => {
      this.draggingTaskId = null;
      row.classList.remove("is-drop-before", "is-drop-after");
    });
    return row;
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
      if (action === "delete") {
        const confirmed = await this.showConfirm(`Delete "${task.title}"?`, { title: "Delete task", okLabel: "Delete", danger: true });
        if (!confirmed) return;
        this.taskManager.deleteTask(task.id);
      }
    });
  }

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
        const nextText = await this.showPrompt("Edit note", context.note.text || "");
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
    toggleBtn.addEventListener("click", () => {
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
    if (!project.isExpanded) {
      this.taskManager.toggleProjectExpansion(projectId, true);
    }
    this.focusProjectCard(projectId);
  }

  focusProjectCard(projectId) {
    if (!projectId) return;
    requestAnimationFrame(() => {
      const card = document.querySelector(`.project[data-project-id="${projectId}"]`);
      if (!card) return;
      card.scrollIntoView({ block: "center", behavior: "smooth" });
      const summary = card.querySelector("summary");
      if (summary && typeof summary.focus === "function") {
        summary.focus({ preventScroll: true });
      }
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

    // Close on outside click
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
      clarifyFollowupTiming,
      clarifyFollowupCustomDate,
      clarifyTwoMinuteExpectYes,
      clarifyTwoMinuteExpectNo,
      clarifyTwoMinuteResponseInput,
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
      clarifyPreviewText,
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

    // Someday friction: save / cancel buttons
    this.elements.clarifysomedaySave?.addEventListener("click", () => this.handleClarifySomedaySave());
    this.elements.clarifysomedayCancel?.addEventListener("click", () => {
      if (this.elements.clarifysomedayDetails) this.elements.clarifysomedayDetails.hidden = true;
    });

    // Actionable Yes — collapse the question, show the form
    clarifyActionableYes?.addEventListener("click", () => {
      this.handleClarifyActionableChoice(true);
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
    });

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
    });
    clarifyTwoMinuteYes?.addEventListener("click", () => {
      selectChoice(twoMinChoices, clarifyTwoMinuteYes);
      this.handleClarifyTwoMinuteYes();
      const normalFields = document.getElementById("clarifyNormalActionFields");
      if (normalFields) normalFields.hidden = true;
    });
    clarifyTwoMinuteExpectYes?.addEventListener("click", () => this.handleTwoMinuteFollowup(true));
    clarifyTwoMinuteExpectNo?.addEventListener("click", () => this.handleTwoMinuteFollowup(false));
    clarifyFollowupTiming?.addEventListener("change", () => this.toggleCustomFollowupDate());

    // Who section
    clarifyWhoSelf?.addEventListener("click", () => {
      selectChoice(whoChoices, clarifyWhoSelf);
      const row = document.getElementById("clarifyDelegateRow");
      if (row) row.hidden = true;
    });
    clarifyWhoDelegate?.addEventListener("click", () => {
      selectChoice(whoChoices, clarifyWhoDelegate);
      const row = document.getElementById("clarifyDelegateRow");
      if (row) {
        row.hidden = false;
        clarifyDelegateNameInput?.focus();
      }
    });

    // Date radios — show/hide date inputs inline
    const updateDateInputs = () => {
      const specificFields = document.getElementById("clarifySpecificDateFields");
      const dueDateFields = document.getElementById("clarifyDueDateFields");
      if (specificFields) specificFields.hidden = !clarifyDateOptionSpecific?.checked;
      if (dueDateFields) dueDateFields.hidden = !clarifyDateOptionDue?.checked;
    };
    [clarifyDateOptionSpecific, clarifyDateOptionDue, clarifyDateOptionNone].forEach((radio) => {
      radio?.addEventListener("change", updateDateInputs);
    });

    // Metadata live updates
    [clarifyEffortSelect, clarifyTimeSelect].forEach((select) => {
      select?.addEventListener("change", () => {
        this.clarifyState.effort = clarifyEffortSelect?.value || "";
        this.clarifyState.time = clarifyTimeSelect?.value || "";
      });
    });

    // Add context
    clarifyAddContext?.addEventListener("click", () => this.handleClarifyAddContext());

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
      this.resetClarifyState();
    }
  }

  resetClarifyState() {
    this.clarifyState = {
      taskId: null,
      currentStep: "identify",
      projectId: null,
      projectName: "",
      dueType: "none",
      calendarDate: "",
      dueDate: "",
      followUpDate: "",
      calendarTime: "",
      context: "",
      effort: "",
      time: "",
      delegateTo: "",
      statusTarget: null,
      waitingFor: "",
      previewField: "title",
      previewText: "",
      actionPlanInitialized: false,
      expectResponse: false,
    };
    const actionableFields = document.getElementById("clarifyActionableFields");
    if (actionableFields) actionableFields.hidden = true;
    const somedayDetails = document.getElementById("clarifysomedayDetails");
    if (somedayDetails) somedayDetails.hidden = true;
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

  openClarifyModal(taskId) {
    const modal = this.elements.clarifyModal;
    if (!modal) {
      this.openTaskFlyout(taskId);
      return;
    }
    const task = this.taskManager.getTaskById(taskId);
    if (!task) return;
    this.resetClarifyState();
    this.clarifyState.taskId = task.id;
    this.clarifyState.contexts = task.contexts ? [...task.contexts] : [];
    this.clarifyState.areaOfFocus = task.areaOfFocus || "";
    this.clarifyState.effort = task.effortLevel || "";
    this.clarifyState.time = task.timeRequired || "";
    this.clarifyState.previewField = "title";
    this.clarifyState.previewText = task.title || "";
    this.populateClarifyPreview(task);
    this.populateClarifyContexts();
    populateAreaSelect(
      this.elements.clarifyAreaInput,
      this.taskManager.getAreasOfFocus(),
      task.areaOfFocus || ""
    );
    this.populateProjectSelect();
    this.setClarifyModalOpen(true);
  }

  closeClarifyModal() {
    this.setClarifyModalOpen(false);
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
    if (this.elements.clarifyTwoMinuteResponseInput) {
      this.elements.clarifyTwoMinuteResponseInput.value = "";
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
    if (this.elements.clarifyEffortSelect) {
      this.elements.clarifyEffortSelect.value = this.clarifyState.effort || "";
    }
    if (this.elements.clarifyTimeSelect) {
      this.elements.clarifyTimeSelect.value = this.clarifyState.time || "";
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
      option.textContent = project.name + (project.someday ? " (Someday)" : "");
      select.append(option);
    });
    select.value = this.clarifyState.projectId || "none";
  }

  handleClarifyActionableChoice(isActionable) {
    if (!this.clarifyState.taskId || !isActionable) return;
  }

  async handleClarifyNonAction(destination) {
    if (!this.clarifyState.taskId || !destination) return;
    if (destination === "trash") {
      const task = this.taskManager.getTaskById(this.clarifyState.taskId);
      const label = task?.title || "this capture";
      const confirmed = await this.showConfirm(`Delete "${label}"?`, { title: "Delete task", okLabel: "Delete", danger: true });
      if (!confirmed) {
        return;
      }
      this.taskManager.deleteTask(this.clarifyState.taskId);
      this.taskManager.notify("info", "Captured idea deleted.");
    } else if (destination === "someday") {
      this._showClarifySomedayDetails();
      return;
    }
    this.closeClarifyModal();
    this.setActivePanel("inbox");
  }

  _showClarifySomedayDetails() {
    const details = this.elements.clarifysomedayDetails;
    if (!details) return;
    details.hidden = false;
    const container = this.elements.clarifysomedayContextList;
    if (container) {
      container.innerHTML = "";
      const contexts = this.taskManager.getContexts();
      contexts.forEach((context) => {
        const label = document.createElement("label");
        label.className = "clarify-context-checkbox";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = context;
        checkbox.addEventListener("change", () => this._updateClarifySomedaySaveBtn());
        label.append(checkbox, document.createTextNode(context.replace(/^[@+]/, "")));
        container.append(label);
      });
    }
    if (this.elements.clarifysomedayEffort) {
      this.elements.clarifysomedayEffort.value = "";
      this.elements.clarifysomedayEffort.addEventListener("change", () => this._updateClarifySomedaySaveBtn());
    }
    this._updateClarifySomedaySaveBtn();
  }

  _updateClarifySomedaySaveBtn() {
    const btn = this.elements.clarifysomedaySave;
    if (!btn) return;
    const hasContext = !!this.elements.clarifysomedayContextList?.querySelector("input:checked");
    const hasEffort = !!this.elements.clarifysomedayEffort?.value;
    btn.disabled = !hasContext && !hasEffort;
  }

  handleClarifySomedaySave() {
    if (!this.clarifyState.taskId) return;
    const contexts = Array.from(
      this.elements.clarifysomedayContextList?.querySelectorAll("input:checked") || []
    ).map((cb) => cb.value);
    const effort = this.elements.clarifysomedayEffort?.value || null;
    const updates = {};
    if (contexts.length) updates.contexts = contexts;
    if (effort) updates.effortLevel = effort;
    this.taskManager.updateTask(this.clarifyState.taskId, updates);
    this.taskManager.moveTask(this.clarifyState.taskId, STATUS.SOMEDAY);
    this.taskManager.notify("info", "Moved to Someday / Maybe.");
    this.closeClarifyModal();
    this.setActivePanel("inbox");
  }

  handleClarifySingleAction() {
    if (!this.clarifyState.taskId) return;
    this.clarifyState.projectId = null;
    this.clarifyState.projectName = "";
    if (this.elements.clarifyProjectPicker) {
      this.elements.clarifyProjectPicker.hidden = true;
    }
  }

  async handleClarifyConvertToProject() {
    if (!this.clarifyState.taskId) return;
    const projectName = await this.showPrompt("New project name:");
    if (!projectName || !projectName.trim()) {
      return;
    }
    const trimmedName = projectName.trim();
    const project = this.taskManager.addProject(trimmedName);
    if (project) {
      this.clarifyState.projectId = project.id;
      this.clarifyState.projectName = project.name;
      if (this.elements.clarifyProjectPicker) {
        this.elements.clarifyProjectPicker.hidden = true;
      }
      this.populateProjectSelect();
      if (this.elements.clarifyProjectSelect) {
        this.elements.clarifyProjectSelect.value = project.id;
      }
      this.taskManager.notify("info", `Created project "${project.name}".`);
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
    this.resetFollowupTiming();
    if (followup) {
      followup.hidden = false;
    }
    const responseInput = this.elements.clarifyTwoMinuteResponseInput;
    if (responseInput) {
      responseInput.focus();
    }
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

  toggleCustomFollowupDate() {
    const timingSelect = this.elements.clarifyFollowupTiming;
    const customInput = this.elements.clarifyFollowupCustomDate;
    const isCustom = timingSelect?.value === "custom";
    if (!customInput) return;
    customInput.hidden = !isCustom;
    if (!isCustom) {
      customInput.value = "";
    } else {
      customInput.focus();
    }
  }

  resetFollowupTiming() {
    const timingSelect = this.elements.clarifyFollowupTiming;
    const customInput = this.elements.clarifyFollowupCustomDate;
    if (timingSelect) {
      timingSelect.value = "24h";
    }
    if (customInput) {
      customInput.value = "";
      customInput.hidden = true;
    }
  }

  handleTwoMinuteFollowup(expectResponse) {
    if (!this.clarifyState.taskId) return;
    const task = this.taskManager.getTaskById(this.clarifyState.taskId);
    if (!task) {
      this.closeClarifyModal();
      return;
    }
    if (expectResponse) {
      const choice = this.elements.clarifyFollowupTiming?.value || "24h";
      const customValue = this.elements.clarifyFollowupCustomDate?.value || "";
      const followUpDueDate = this.resolveFollowupDate(choice, customValue);
      if (!followUpDueDate) {
        this.taskManager.notify("warn", "Choose a follow-up timeframe.");
        return;
      }
      this.clarifyState.expectResponse = true;
      this.clarifyState.statusTarget = STATUS.WAITING;
      this.clarifyState.waitingFor =
        this.elements.clarifyTwoMinuteResponseInput?.value?.trim() || "Pending response";
      this.clarifyState.dueType = "followUp";
      this.clarifyState.followUpDate = followUpDueDate;
      this.clarifyState.dueDate = "";
      this.clarifyState.calendarDate = "";
      this.finalizeClarifyRouting();
      return;
    }
    const closureNotes = this.elements.clarifyTwoMinuteClosureNotes?.value?.trim() || task.closureNotes;
    this.taskManager.completeTask(task.id, { archive: "reference", closureNotes });
    this.taskManager.notify("info", "Completed in under two minutes.");
    this.closeClarifyModal();
    this.setActivePanel("inbox");
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
    const updates = {
      title: nextActionTitle,
      description: task.description,
      contexts: this.clarifyState.contexts?.length ? this.clarifyState.contexts : (task.contexts || []),
      areaOfFocus: this.clarifyState.areaOfFocus || null,
      effortLevel: this.clarifyState.effort || null,
      timeRequired: this.clarifyState.time || null,
      projectId: this.clarifyState.projectId || null,
      calendarDate: null,
      dueDate: null,
      followUpDate: null,
      waitingFor: statusTarget === STATUS.WAITING ? this.clarifyState.waitingFor || task.waitingFor || null : null,
      status: statusTarget,
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
    this.taskManager.updateTask(task.id, updates);
    const destinations = [];
    if (updates.status === STATUS.WAITING) destinations.push("Waiting");
    else if (updates.calendarDate) destinations.push("Calendar");
    else if (updates.dueDate) destinations.push("Next Actions (due)");
    else destinations.push("Next Actions");
    if (updates.projectId) {
      const name = this.getProjectName(updates.projectId);
      if (name) destinations.push(`Project: ${name}`);
    }
    const routeMessage = destinations.length > 1
      ? `Routed to ${destinations.join(" + ")}.`
      : `Routed to ${destinations[0] || "Next Actions"}.`;
    this.taskManager.notify("info", routeMessage);
    this.closeClarifyModal();
    this.setActivePanel("inbox");
  }

  setClarifyFinalMessage(updates) {
    const messageEl = this.elements.clarifyFinalMessage;
    if (!messageEl) return;
    const destinations = [];
    if (updates.status === STATUS.WAITING) destinations.push("Waiting");
    else if (updates.calendarDate) destinations.push("Calendar");
    else if (updates.dueDate) destinations.push("Next Actions (due)");
    else destinations.push("Next Actions");
    if (updates.projectId) {
      const name = this.getProjectName(updates.projectId);
      if (name) destinations.push(`Project: ${name}`);
    }
    messageEl.textContent =
      destinations.length > 1
        ? `Routed to ${destinations.join(" + ")}.`
        : `Routed to ${destinations[0] || "Next Actions"}.`;
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
    flyout.setAttribute("aria-hidden", "false");
    document.body.classList.add("flyout-open");
    this.isFlyoutOpen = true;
    if (!wasOpen && this.handleFlyoutKeydown) {
      document.addEventListener("keydown", this.handleFlyoutKeydown);
    }
    if (!wasOpen) {
      this.elements.closeTaskFlyout?.focus();
    }
  }

  closeTaskFlyout() {
    const flyout = this.elements.taskFlyout;
    if (!flyout) return;
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
      this.setEntityLinkedTextWithImages(description, descriptionText);
      description.className = "muted";
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
      content.append(...[description, inboxPanel, listSection, notesSection, meta].filter(Boolean));
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

    if (!isCompleted) {
      const myDayButton = document.createElement("button");
      myDayButton.type = "button";
      myDayButton.className = "btn btn-light";
      myDayButton.textContent = this.isTaskInMyDay(task) ? "Remove from My Day" : "Add to My Day";
      myDayButton.addEventListener("click", () => this.toggleTaskMyDay(task));
      actionToolbar.append(myDayButton);
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
      const convertButton = document.createElement("button");
      convertButton.type = "button";
      convertButton.className = "btn btn-light";
      convertButton.textContent = "Convert to project";
      convertButton.addEventListener("click", () => this.convertTaskToProject(task));
      const completeButton = document.createElement("button");
      completeButton.type = "button";
      completeButton.className = "btn btn-primary";
      completeButton.textContent = "Complete";
      completeButton.addEventListener("click", () => {
        this.openClosureNotes(task.id, "reference");
      });
      const completeDeleteButton = document.createElement("button");
      completeDeleteButton.type = "button";
      completeDeleteButton.className = "btn btn-danger";
      completeDeleteButton.textContent = "Complete & Delete";
      completeDeleteButton.addEventListener("click", () => {
        this.openClosureNotes(task.id, "log");
      });
      actionToolbar.append(convertButton, completeButton, completeDeleteButton);
    }

    if (!isCompleted) {
      content.append(...[description, actionToolbar, listSection, notesSection, this.createFollowupSection(task), meta].filter(Boolean));
    } else {
      content.append(...[description, actionToolbar, listSection, notesSection, meta].filter(Boolean));
    }
    content.append(this.createTaskForm(task));
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
      if (selectedType !== "task") {
        suggestionList.style.display = "none";
        suggestionList.innerHTML = "";
      }
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
      if (selectedType !== "task") return;
      const value = waitingInput.value.trim();
      if (value.length < 2) {
        suggestionList.style.display = "none";
        suggestionList.innerHTML = "";
        return;
      }
      const suggestions = this.taskManager.searchTasksForReference(value, { excludeTaskId: task.id });
      if (suggestions.length === 0) {
        suggestionList.style.display = "none";
        suggestionList.innerHTML = "";
        return;
      }
      suggestionList.innerHTML = "";
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
        item.addEventListener("mouseover", () => {
          item.style.background = "var(--surface-2)";
        });
        item.addEventListener("mouseout", () => {
          item.style.background = "transparent";
        });
        suggestionList.append(item);
      });
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
    toggleBtn.addEventListener("click", () => {
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
    this.getProjectCache().forEach((project) => {
      const option = document.createElement("option");
      option.value = project.id;
      option.textContent = project.name + (project.someday ? " (Someday)" : "");
      projectSelect.append(option);
    });
    projectSelect.value = task.projectId || "";
    const createProjectButton = document.createElement("button");
    createProjectButton.type = "button";
    createProjectButton.className = "btn btn-link task-project-create";
    createProjectButton.textContent = "New project";
    createProjectButton.addEventListener("click", () => this.createProjectForTask(task, { archiveEntryId }));
    projectControls.append(projectSelect, createProjectButton);
    projectGroup.append(projectControls);

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
        .getContexts()
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
        .getPeopleTags()
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
        fragment.append(document.createTextNode(part));
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
      if (!project.isExpanded) {
        this.taskManager.toggleProjectExpansion(project.id, true);
      }
      this.focusProjectCard(project.id);
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

  openProjectEditor(details, project) {
    const body = details.querySelector(".project-body");
    if (!body) return;
    body.innerHTML = "";

    details.open = true;

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
      this.renderProjects();
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
      this.updateCounts();
    });

    body.append(form);
    nameInput.focus();
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

  attachKanbanDropzone(element, status, area) {
    if (!element) return;
    if (this.dropzones.includes(element)) return;
    this.dropzones.push(element);
    const helper = window.DragDropHelper;
    if (helper) {
      helper.setupDropzone(element, {
        onDrop: (taskId) => this.handleKanbanDrop(taskId, status, area),
      });
      return;
    }
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
      if (taskId) this.handleKanbanDrop(taskId, status, area);
    });
  }

  handleDrop(taskId, status, context, projectId) {
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

  handleKanbanDrop(taskId, status, area) {
    const task = this.taskManager.getTaskById(taskId);
    if (!task) {
      this.taskManager.notify("error", "Cannot drop missing task.");
      return;
    }
    const updates = { status };
    if (area !== null) {
      if (task.projectId) {
        if (area === "No Area") {
          this.taskManager.notify("warn", "Project tasks must stay in a valid area of focus.");
        } else {
          this.taskManager.updateProject(task.projectId, { areaOfFocus: area });
        }
      } else {
        updates.areaOfFocus = area === "No Area" ? null : area;
      }
    }
    this.taskManager.updateTask(taskId, updates);
  }

  showPrompt(title, defaultValue = "") {
    return new Promise((resolve) => {
      const modal = this.elements.promptModal;
      if (!modal) { resolve(window.prompt(title, defaultValue)); return; }
      const input = this.elements.promptModalInput;
      const titleEl = this.elements.promptModalTitle;
      const okBtn = this.elements.promptModalOk;
      const cancelBtn = this.elements.promptModalCancel;
      if (titleEl) titleEl.textContent = title;
      if (input) { input.value = defaultValue; }
      const cleanup = () => {
        modal.classList.remove("is-open");
        modal.setAttribute("hidden", "");
        okBtn?.removeEventListener("click", onOk);
        cancelBtn?.removeEventListener("click", onCancel);
        document.removeEventListener("keydown", onKeydown);
      };
      const onOk = () => {
        const val = input?.value?.trim() || "";
        cleanup();
        resolve(val || null);
      };
      const onCancel = () => { cleanup(); resolve(null); };
      const onKeydown = (e) => {
        if (e.key === "Enter") { e.preventDefault(); onOk(); }
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      };
      okBtn?.addEventListener("click", onOk);
      cancelBtn?.addEventListener("click", onCancel);
      document.addEventListener("keydown", onKeydown);
      modal.classList.add("is-open");
      modal.removeAttribute("hidden");
      setTimeout(() => { input?.focus(); input?.select(); }, 50);
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

  showToast(level, message) {
    const region = this.elements.alerts;
    if (!message) return;
    const toast = document.createElement("div");
    toast.className = `toast ${level}`;
    toast.textContent = message;
    region.innerHTML = "";
    region.append(toast);
    setTimeout(() => {
      if (region.contains(toast)) region.removeChild(toast);
    }, 3200);
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

  getCalendarEntryTime(entry) {
    if (!entry) return "";
    if (entry.calendarTime) {
      return this.formatTimeDisplay(entry.calendarTime);
    }
    if (typeof entry.date === "string" && entry.date.includes("T")) {
      const date = new Date(entry.date);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      }
    }
    return "";
  }

  handleCalendarItemClick(entry) {
    if (!entry) return;
    const liveTask = this.taskManager.getTaskById(entry.taskId);
    if (liveTask) {
      this.openTaskFlyout(liveTask.id);
      return;
    }
    if (entry.isCompleted && entry.raw) {
      this.openTaskFlyout(entry.raw, { readOnly: true, entry: entry.raw });
      return;
    }
    this.taskManager.notify("warn", "Task not found.");
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
    promptModalOk: byId("promptModalOk"),
    promptModalCancel: byId("promptModalCancel"),
    confirmModal: byId("confirmModal"),
    confirmModalHeading: byId("confirmModalHeading"),
    confirmModalMessage: byId("confirmModalMessage"),
    confirmModalOk: byId("confirmModalOk"),
    confirmModalCancel: byId("confirmModalCancel"),
    manualSyncButton: byId("manualSyncButton"),
    connectionStatusDot: byId("connectionStatusDot"),
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
    activePanelHeading: byId("activePanelHeading"),
    activePanelCount: byId("activePanelCount"),
    inboxList: document.querySelector('.panel-body[data-dropzone="inbox"]'),
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
    settingsClearFeedbackBtn: byId("settingsClearFeedbackBtn"),
    settingsLoadFeedbackBtn: byId("settingsLoadFeedbackBtn"),
    settingsFeedbackList: byId("settingsFeedbackList"),
    syncDiagContainer: byId("syncDiagContainer"),
    syncDiagRefreshBtn: byId("syncDiagRefreshBtn"),
    syncDiagCopyBtn: byId("syncDiagCopyBtn"),
    syncDiagClearBtn: byId("syncDiagClearBtn"),
    footerYear: byId("footerYear"),
    themeToggle: document.getElementById("themeToggle"),
    topbarSettings: byId("topbarSettings"),
    integrationsCard: document.querySelector(".integrations-card"),
    contextSuggestions: document.getElementById("contextSuggestions"),
    effortSuggestions: document.getElementById("effortSuggestions"),
    timeSuggestions: document.getElementById("timeSuggestions"),
    projectAreaSuggestions: document.getElementById("projectAreaSuggestions"),
    projectThemeSuggestions: document.getElementById("projectThemeSuggestions"),
    projectStatusSuggestions: document.getElementById("projectStatusSuggestions"),
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
    clarifyFollowupTiming: byId("clarifyFollowupTiming"),
    clarifyFollowupCustomDate: byId("clarifyFollowupCustomDate"),
    clarifyTwoMinuteExpectYes: byId("clarifyTwoMinuteExpectYes"),
    clarifyTwoMinuteExpectNo: byId("clarifyTwoMinuteExpectNo"),
    nextGroupBySelect: byId("nextGroupBySelect"),
    nextGroupByLabel: byId("nextGroupByLabel"),
    nextGroupLimitInput: byId("nextGroupLimitInput"),
    nextGroupLimitLabel: byId("nextGroupLimitLabel"),
    kanbanGroupBySelect: byId("kanbanGroupBySelect"),
    kanbanGroupByLabel: byId("kanbanGroupByLabel"),
    kanbanSubheading: byId("kanbanSubheading"),
    nextPanelSubheading: byId("nextPanelSubheading"),
    clarifyTwoMinuteResponseInput: byId("clarifyTwoMinuteResponseInput"),
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
    clarifyEffortSelect: byId("clarifyEffortSelect"),
    clarifyTimeSelect: byId("clarifyTimeSelect"),
    clarifysomedayDetails: byId("clarifysomedayDetails"),
    clarifysomedayContextList: byId("clarifysomedayContextList"),
    clarifysomedayEffort: byId("clarifysomedayEffort"),
    clarifysomedaySave: byId("clarifysomedaySave"),
    clarifysomedayCancel: byId("clarifysomedayCancel"),
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
  };
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

function enableDrag(element, taskId) {
  element.addEventListener("dragstart", (event) => {
    event.dataTransfer?.setData("text/task-id", taskId);
    event.dataTransfer?.setData("text/plain", taskId);
    element.classList.add("is-dragging");
  });
  element.addEventListener("dragend", () => {
    element.classList.remove("is-dragging");
  });
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

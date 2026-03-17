import {
  STATUS,
  STATUS_LABELS,
  formatFriendlyDate,
  PHYSICAL_CONTEXTS,
  ENERGY_LEVELS,
  TIME_REQUIREMENTS,
  PROJECT_THEMES,
  PROJECT_STATUSES,
  THEME_OPTIONS,
} from "./data.js";

const TAB_STORAGE_KEY = "gtd-dashboard-active-panel";
const NEXT_FANOUT_KEY = "gtd-dashboard-next-fanout";
const NEXT_HIDE_SCHEDULED_KEY = "gtd-dashboard-next-hide-scheduled";
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

export class UIController {
  constructor(taskManager) {
    this.taskManager = taskManager;
    this.filters = {
      context: ["all"],
      project: ["all"],
      person: ["all"],
      waiting: ["all"],
      energy: ["all"],
      time: ["all"],
      search: "",
      date: "",
    };
    this.elements = mapElements();
    this.dropzones = [];
    this.panelButtons = [];
    this.panels = [];
    this.activePanel = loadStoredPanel() || "inbox";
    this.allowMultipleNextPerProject = loadNextFanoutPreference();
    this.hideScheduledNextActions = loadNextHideScheduledPreference();
    this.summaryCache = null;
    this.reportFilters = {
      grouping: "week",
      year: new Date().getFullYear(),
      contexts: ["all"],
      projects: ["all"],
    };
    this.activeReportKey = null;
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
    this.calendarDayContextMenuDate = null;
    this.calendarDayContextMenuHandlersBound = false;
    this.handleCalendarDayMenuDismiss = null;
    this.handleCalendarDayMenuEscape = null;
    this.showMissingNextOnly = false;
    this.showProjectCompletedTasks = false;
    this.selectedSettingsContext = null;
    this.customPaletteDraftName = "";
    this.statsLookbackDays = 30;
    this.entityMentionAutocompleteState = null;
    this.boundEntityMentionInputs = new WeakSet();
    this.entityMentionDismissHandler = null;
    this.entityMentionRepositionHandler = null;
  }

  init() {
    this.elements = mapElements();
    this.bindListeners();
    this.setupEntityMentionAutocomplete();
    this.setupSummaryTabs();
    this.setupAssociationFlyout();
    this.setupTaskContextMenu();
    this.setupTaskNoteContextMenu();
    this.setupCalendarDayContextMenu();
    this.setupFlyout();
    this.bindClarifyModal();
    this.bindProjectCompletionModal();
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
      waitingFilterToggle,
      waitingFilterOptions,
      summaryAllActive,
      toggleNextProjectFanout,
      toggleHideScheduledNext,
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

    clearFilters.addEventListener("click", () => {
      this.filters = {
        context: ["all"],
        project: ["all"],
        person: ["all"],
        waiting: ["all"],
        energy: ["all"],
        time: ["all"],
        search: "",
        date: "",
      };
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

    projectAreaFilter?.addEventListener("change", () => {
      this.filters.projectArea = projectAreaFilter.value;
      this.renderProjects();
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
        this.calendarCursor = new Date(calendarDate.value);
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
      const select = event.target.closest("select[data-settings-task-id]");
      if (!select) return;
      const taskId = select.dataset.settingsTaskId;
      const nextContext = select.value || null;
      const updated = this.taskManager.updateTask(taskId, { context: nextContext });
      if (!updated) return;
      this.renderSettings();
    });
    this.elements.settingsFeatureFlagsList?.addEventListener("change", (event) => {
      const input = event.target.closest("input[data-feature-flag]");
      if (!input) return;
      this.taskManager.updateFeatureFlag(input.dataset.featureFlag, input.checked);
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
      }
    });

    this.taskManager.addEventListener("syncconflict", (event) => {
      const { remoteDevice } = event.detail;
      this.showToast("warn", `Merged changes from ${remoteDevice}. Review your tasks — last-write-wins was applied.`);
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

  setActivePanel(panelName, { focus = false } = {}) {
    if (!panelName) return;
    if (!this.panelButtons?.some((btn) => btn.dataset.panelTarget === panelName)) {
      panelName = "inbox";
    }
    this.activePanel = panelName;
    storeActivePanel(panelName);
    this.applyPanelVisibility();
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
      clearFilters,
      expandProjects,
      projectCompletedTasksControl,
    } = this.elements;
    const panel = this.activePanel;
    const taskPanels = new Set(["inbox", "my-day", "next", "kanban", "waiting", "someday", "projects", "calendar", "all-active"]);
    const supportsSearch = taskPanels.has(panel);
    const supportsTaskPicker = panel === "next";
    const supportsNextFanout = panel === "next";
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
    this.updateSuggestionLists();
    this.renderSummary();
    this.renderFilters();
    this.renderAssociationFlyout();
    this.renderInbox();
    this.renderMyDay();
    this.renderNextActions();
    this.renderKanban();
    this.renderProjects();
    this.renderWaitingFor();
    this.renderSomeday();
    this.renderCalendar();
    this.renderReports();
    this.renderStatistics();
    this.renderAllActive();
    this.renderSettings();
    this.applyFeatureFlags();
    this.applySearchVisibility();
    this.updateCounts();
    this.syncTheme(this.taskManager.getTheme());
    this.applyPanelVisibility();
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
      energySuggestions,
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
    const energies = new Set([...ENERGY_LEVELS]);
    const times = new Set([...TIME_REQUIREMENTS]);
    allTasks.forEach((task) => {
      if (task.context) contexts.add(task.context);
      if (task.energyLevel) energies.add(task.energyLevel);
      if (task.timeRequired) times.add(task.timeRequired);
    });
    archiveEntries.forEach((entry) => {
      if (entry.context) contexts.add(entry.context);
      if (entry.energyLevel) energies.add(entry.energyLevel);
      if (entry.timeRequired) times.add(entry.timeRequired);
    });
    fillDatalist(contextSuggestions, Array.from(contexts));
    fillDatalist(energySuggestions, Array.from(energies));
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
    const calendarTotal = this.taskManager.getCalendarEntries({ filters: this.buildTaskFilters() }).length;
    const currentYear = new Date().getFullYear();
    const completedThisYear = this.taskManager.getCompletedTasks({ year: currentYear }).length;
    const {
      summaryInbox,
      summaryNext,
      summaryMyDay,
      summaryKanban,
      summaryWaiting,
      summarySomeday,
      summaryProjects,
      summaryCalendar,
      summaryCompleted,
      summaryStatistics,
      summarySettings,
      summaryAllActive,
    } = this.elements;
    summaryInbox.textContent = summary.inbox;
    summaryNext.textContent = summary.next;
    if (summaryMyDay) {
      summaryMyDay.textContent = this.getMyDayTasks({ applyFilters: false }).length;
    }
    if (summaryKanban) {
      const kanbanCount = this.taskManager
        .getTasks(this.buildTaskFilters())
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
    if (summarySettings) {
      const settingsTotal =
        THEME_OPTIONS.length +
        this.taskManager.getCustomThemePalettes().length +
        this.taskManager.getContexts().length +
        this.taskManager.getPeopleTags().length +
        this.taskManager.getAreasOfFocus().length +
        Object.keys(this.taskManager.getFeatureFlags()).length;
      summarySettings.textContent = settingsTotal;
    }
    if (summaryAllActive) {
      const activeCount = this.taskManager.getTasks(this.buildTaskFilters()).length;
      summaryAllActive.textContent = activeCount;
    }
  }

  renderFilters() {
    const contexts = this.taskManager.getContexts();
    this.renderFilterPicker("context", {
      options: contexts.map((context) => ({ label: context, value: context })),
      toggle: this.elements.contextFilterToggle,
      container: this.elements.contextFilterOptions,
      defaultLabel: "All contexts",
    });
    if (this.elements.randomContext) {
      fillSelect(this.elements.randomContext, contexts, this.randomContext || "all");
    }

    const projects = (this.projectCache || [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    this.renderFilterPicker("project", {
      options: projects.map((project) => ({
        label: project.name + (project.someday ? " (Someday)" : ""),
        value: project.id,
      })),
      toggle: this.elements.projectFilterToggle,
      container: this.elements.projectFilterOptions,
      defaultLabel: "All projects",
      singleValueLabel: (value) => {
        const project = this.projectLookup?.get(value);
        if (!project) return "1 project";
        return project.name + (project.someday ? " (Someday)" : "");
      },
    });

    const allTasks = this.taskManager.getTasks({ includeCompleted: true });
    const waitingOn = new Set();
    const energyLevels = new Set([...ENERGY_LEVELS]);
    const timeEstimates = new Set([...TIME_REQUIREMENTS]);
    allTasks.forEach((task) => {
      if (task.waitingFor) waitingOn.add(task.waitingFor);
      if (task.energyLevel) energyLevels.add(task.energyLevel);
      if (task.timeRequired) timeEstimates.add(task.timeRequired);
    });

    this.renderFilterPicker("waiting", {
      options: Array.from(waitingOn)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ label: value, value })),
      toggle: this.elements.waitingFilterToggle,
      container: this.elements.waitingFilterOptions,
      defaultLabel: "All waiting",
    });

    this.renderFilterPicker("energy", {
      options: Array.from(energyLevels)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ label: value, value })),
      toggle: this.elements.energyFilterToggle,
      container: this.elements.energyFilterOptions,
      defaultLabel: "All energy levels",
    });

    this.renderFilterPicker("time", {
      options: Array.from(timeEstimates)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ label: value, value })),
      toggle: this.elements.timeFilterToggle,
      container: this.elements.timeFilterOptions,
      defaultLabel: "All durations",
    });
  }

  renderFilterPicker(key, { options, toggle, container, defaultLabel, singleValueLabel }) {
    if (!container) return;
    const entries = [{ label: defaultLabel, value: "all" }, ...options];
    container.innerHTML = "";
    entries.forEach((option) => {
      const safeValue = option.value?.toString().replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "all";
      const id = `${key}-filter-${safeValue}`;
      const label = document.createElement("label");
      label.setAttribute("for", id);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = id;
      checkbox.value = option.value;
      checkbox.checked = this.isFilterValueSelected(key, option.value);
      checkbox.addEventListener("change", () => {
        this.updateFilterSelection(key, option.value, checkbox.checked);
        this.renderAll();
      });
      const text = document.createElement("span");
      text.textContent = option.label;
      label.append(checkbox, text);
      container.append(label);
    });
    this.updateFilterPickerSummary(key, toggle, defaultLabel, singleValueLabel);
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

  updateFilterPickerSummary(key, toggle, defaultLabel, singleValueLabel) {
    if (!toggle) return;
    const selections = Array.isArray(this.filters[key]) ? this.filters[key] : [this.filters[key]];
    if (!selections.length || selections.includes("all")) {
      toggle.textContent = defaultLabel;
      return;
    }
    if (selections.length === 1) {
      const value = selections[0];
      if (typeof singleValueLabel === "function") {
        toggle.textContent = singleValueLabel(value);
      } else {
        toggle.textContent = value;
      }
      return;
    }
    toggle.textContent = `${selections.length} selected`;
  }

  setupAssociationFlyout() {
    const toggle = this.elements.associationFlyoutToggle;
    const panel = this.elements.associationFlyoutPanel;
    if (!toggle || !panel) return;

    toggle.addEventListener("click", () => {
      this.associationFlyoutOpen = !this.associationFlyoutOpen;
      this.applyAssociationFlyoutState();
    });

    panel.addEventListener("change", (event) => {
      const checkbox = event.target.closest("input[data-association-filter-key][data-association-filter-value]");
      if (!checkbox) return;
      const key = checkbox.dataset.associationFilterKey;
      const value = checkbox.dataset.associationFilterValue;
      if (!key || value === undefined) return;
      this.updateFilterSelection(key, value, checkbox.checked);
      if (this.hasAssociationSelections() && this.activePanel !== "all-active") {
        this.setActivePanel("all-active", { focus: false });
      }
      this.renderAll();
    });

    this.elements.associationFlyoutClear?.addEventListener("click", () => {
      this.filters.context = ["all"];
      this.filters.project = ["all"];
      this.filters.person = ["all"];
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
    if (people.length) {
      clauses.push(`(${people.join(" OR ")})`);
    }
    const contexts = this.getFilterSelections("context");
    if (contexts.length) {
      clauses.push(`(${contexts.join(" OR ")})`);
    }
    const projects = this.getFilterSelections("project").map((projectId) => {
      return this.projectLookup.get(projectId)?.name || "Unknown project";
    });
    if (projects.length) {
      clauses.push(`(${projects.join(" OR ")})`);
    }
    if (!clauses.length) {
      return "All tasks";
    }
    return clauses.join(" AND ");
  }

  renderAssociationFlyout() {
    const contextContainer = this.elements.associationContextOptions;
    const peopleContainer = this.elements.associationPeopleOptions;
    const projectContainer = this.elements.associationProjectOptions;
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
    const projects = (this.projectCache || [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((project) => ({
        value: project.id,
        label: project.name + (project.someday ? " (Someday)" : ""),
      }));

    this.renderAssociationFlyoutGroup("person", peopleContainer, people, "No people tags yet.");
    this.renderAssociationFlyoutGroup("context", contextContainer, contexts, "No contexts yet.");
    this.renderAssociationFlyoutGroup("project", projectContainer, projects, "No projects yet.");

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

  ensureMentionedEntitiesExist(rawText) {
    const tokens = this.extractEntityMentionTokens(rawText);
    if (!tokens.length) return;

    const contextSet = new Set(this.taskManager.getContexts().map((value) => value.toLowerCase()));
    const peopleSet = new Set(
      this.taskManager.getPeopleTags({ includeNoteMentions: false }).map((value) => value.toLowerCase())
    );
    let addedContexts = 0;
    let addedPeople = 0;

    tokens.forEach((token) => {
      if (token.startsWith("+")) {
        const key = token.toLowerCase();
        if (peopleSet.has(key)) return;
        const confirmed = window.confirm(`Create people tag "${token}" from this note mention?`);
        if (!confirmed) return;
        const added = this.taskManager.addPeopleTagOption(token, { notify: false });
        if (!added) return;
        peopleSet.add(added.toLowerCase());
        addedPeople += 1;
        return;
      }

      if (token.startsWith("@")) {
        const key = token.toLowerCase();
        if (contextSet.has(key)) return;
        const confirmed = window.confirm(`Create context "${token}" from this note mention?`);
        if (!confirmed) return;
        const added = this.taskManager.addContextOption(token, { notify: false });
        if (!added) return;
        contextSet.add(added.toLowerCase());
        addedContexts += 1;
        return;
      }

      if (token.startsWith("#")) {
        const key = this.normalizeProjectTagKey(token.slice(1));
        if (!key) return;
        if (this.findProjectByTagKey(key)) return;
        const suggestedName = this.formatProjectNameFromMentionToken(token);
        if (!suggestedName) return;
        const confirmed = window.confirm(`Create project "${suggestedName}" from note mention "${token}"?`);
        if (!confirmed) return;
        this.taskManager.addProject(suggestedName);
      }
    });

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
      energy: overrides.energy ?? this.filters.energy,
      time: overrides.time ?? this.filters.time,
      searchTerm: overrides.searchTerm ?? this.filters.search,
    };
  }

  renderInbox() {
    const tasks = this.taskManager.getTasks({
      ...this.buildTaskFilters(),
      status: STATUS.INBOX,
    });
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
        const dateA = a.calendarDate || "";
        const dateB = b.calendarDate || "";
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB);
        }
        return (a.title || "").localeCompare(b.title || "");
      });
  }

  isTaskScheduledInPast(task, todayKey = this.getTodayDateKey()) {
    if (!task?.calendarDate) return false;
    return task.calendarDate < todayKey;
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

  promptRescheduleTask(task) {
    if (!task?.id) return;
    const fallbackDate = task.calendarDate || this.getTodayDateKey();
    const candidate = window.prompt(`Re-schedule "${task.title}" to (YYYY-MM-DD):`, fallbackDate);
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

    const contexts = this.taskManager.getContexts();
    const unassigned = tasks.filter((task) => !task.context);
    if (unassigned.length && !contexts.includes("No context")) {
      contexts.push("No context");
    }

    contexts.forEach((context) => {
      const column = document.createElement("div");
      column.className = "context-column";
      column.dataset.dropzone = STATUS.NEXT;
      column.dataset.context = context;

      const header = document.createElement("header");
      const title = document.createElement("span");
      title.textContent = context;
      const count = document.createElement("span");
      count.className = "context-count";
      const items =
        context === "No context"
          ? tasks.filter((task) => !task.context)
          : tasks.filter((task) => task.context === context);
      if (!items.length) {
        return;
      }
      count.textContent = items.length;

      header.append(title, count);
      column.append(header);

      items.forEach((task) => column.append(this.createTaskCard(task)));

      board.append(column);
      this.attachDropzone(column, STATUS.NEXT, context);
    });
  }

  renderKanban() {
    const board = this.elements.kanbanBoard;
    if (!board) return;
    board.innerHTML = "";
    const baseStatuses = [STATUS.NEXT, STATUS.DOING, STATUS.WAITING];
    const statuses = [STATUS.INBOX, ...baseStatuses];
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

    const lanes = new Set();
    activeTasks.forEach((task) => {
      lanes.add(this.getTaskAreaOfFocus(task));
    });
    if (activeTasks.some((task) => !task.projectId)) {
      lanes.add("No Area");
    }
    const laneOrder = Array.from(lanes).sort((a, b) => a.localeCompare(b));

    laneOrder.forEach((lane) => {
      const laneSection = document.createElement("section");
      laneSection.className = "kanban-lane";

      const laneTitle = document.createElement("h3");
      laneTitle.className = "kanban-lane-title";
      laneTitle.textContent = lane;
      laneSection.append(laneTitle);

      const laneGrid = document.createElement("div");
      laneGrid.className = "kanban-lane-grid";
      const laneStatuses = lane === "No Area" ? statuses : baseStatuses;
      laneGrid.style.gridTemplateColumns = `repeat(${laneStatuses.length}, minmax(200px, 1fr))`;

      laneStatuses.forEach((status) => {
        const column = document.createElement("section");
        column.className = "kanban-column";
        column.dataset.dropzone = status;
        column.dataset.area = lane;

        const items = activeTasks.filter(
          (task) => task.status === status && this.getTaskAreaOfFocus(task) === lane
        );

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
        this.attachKanbanDropzone(column, status, lane);
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
    allTasks.forEach((task) => {
      if (!task.projectId || task.status !== STATUS.NEXT) return;
      hasNextAction.set(task.projectId, true);
    });
    const projects = (this.projectCache || []).filter((project) => {
      if (!filterArea || filterArea === "all") return true;
      return (project.areaOfFocus || "").toLowerCase() === filterArea.toLowerCase();
    });
    const visibleProjects = this.showMissingNextOnly
      ? projects.filter((project) => !project.someday && !hasNextAction.get(project.id))
      : projects;

    if (this.elements.projectAreaFilter) {
      const select = this.elements.projectAreaFilter;
      const areas = new Set(this.taskManager.getAreasOfFocus());
      const existing = new Set(Array.from(select.options).map((opt) => opt.value));
      Array.from(areas).forEach((area) => {
        if (existing.has(area)) return;
        const option = document.createElement("option");
        option.value = area;
        option.textContent = area;
        select.append(option);
      });
    }

    const filteredTasks = this.taskManager.getTasks(this.buildTaskFilters());

    visibleProjects.forEach((project) => {
      const details = document.createElement("details");
      details.className = "project";
      details.dataset.projectId = project.id;
      details.open = project.isExpanded;

      const missingNext = !project.someday && !hasNextAction.get(project.id);
      const summary = document.createElement("summary");
      summary.innerHTML = `
        <strong>${project.name}</strong>
        <span class="muted small-text">${project.tags.join(", ") || "No tags"}</span>
        ${missingNext ? '<span class="badge badge-warning">No next action</span>' : ""}
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
      deleteButton.addEventListener("click", () => {
        const confirmed = window.confirm(`Delete project "${project.name}"? Tasks will remain but lose this project link.`);
        if (confirmed) {
          this.taskManager.deleteProject(project.id);
        }
      });
      actions.append(deleteButton);

      const allProjectTasks = this.taskManager.getTasks(this.buildTaskFilters());
      let projectTasks = allProjectTasks
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
        const fallbackContext = this.taskManager.getContexts()?.[0] || PHYSICAL_CONTEXTS[0];
        const created = this.taskManager.addTask({
          title,
          status: STATUS.NEXT,
          projectId: project.id,
          context: projectNext?.context || fallbackContext,
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
      body.append(outcome, addNextForm, actions, sectionsWrapper);
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
          if (task.context) parts.push(task.context);
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
    const tasks = this.taskManager.getTasks({
      ...this.buildTaskFilters(),
      status: STATUS.WAITING,
    });
    const container = this.elements.waitingList;
    renderTaskList(container, tasks, (task) => this.createTaskCard(task));
    this.attachDropzone(container, STATUS.WAITING);
  }

  renderSomeday() {
    const tasks = this.taskManager.getTasks({
      ...this.buildTaskFilters(),
      status: STATUS.SOMEDAY,
    });
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
    const completedTasks = this.taskManager.getCompletedTasks();
    const completedProjects = this.taskManager
      .getCompletedProjects()
      .filter((project) => this.matchesReportProjectSelection(project.id));
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
      const key = ensureContext(task.context);
      contextMap.get(key).active += 1;
    });
    completedInWindow.forEach((entry) => {
      const key = ensureContext(entry.context);
      contextMap.get(key).completed += 1;
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
      { label: "Has context", value: activeTasks.filter((task) => task.context).length },
      { label: "Assigned to project", value: activeTasks.filter((task) => task.projectId).length },
      { label: "Energy estimated", value: activeTasks.filter((task) => task.energyLevel).length },
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

  renderStatisticsRows(container, rows, { emptyMessage = "No data yet.", includeBars = true } = {}) {
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

  renderSettings() {
    const themesList = this.elements.settingsThemesList;
    const featureFlagsList = this.elements.settingsFeatureFlagsList;
    const contextsList = this.elements.settingsContextsList;
    const peopleList = this.elements.settingsPeopleList;
    const areasList = this.elements.settingsAreasList;
    if (!themesList || !featureFlagsList || !contextsList || !peopleList || !areasList) return;
    const contexts = this.taskManager.getContexts();
    const peopleTags = this.taskManager.getPeopleTags();
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
            deleteButton.addEventListener("click", () => {
              const confirmed = window.confirm(`Delete palette "${palette.name}"?`);
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
        key: "showFiltersCard",
        label: "Show Filters Sidebar Card",
        description: "Display the Filters card in the left sidebar.",
      },
    ];
    entries.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "settings-item";
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
      });
      toggle.append(input, text);
      actions.append(toggle);
      main.append(labelWrap, actions);
      item.append(main);
      container.append(item);
    });
  }

  applyFeatureFlags() {
    const flags = this.taskManager.getFeatureFlags();
    if (this.elements.sidebarFiltersCard) {
      this.elements.sidebarFiltersCard.hidden = !flags.showFiltersCard;
    }
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
      bump(contexts, task.context, "active");
      bump(people, task.peopleTag, "active");
      bump(areas, this.getTaskAreaOfFocus(task), "active");
    });
    inactiveTasks.forEach((task) => {
      bump(contexts, task.context, "inactive");
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
      label.textContent = value;
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
    title.textContent = `Tasks in ${context}`;
    const meta = document.createElement("p");
    meta.className = "muted small-text";

    const activeTasks = this.taskManager
      .getTasks({ includeCompleted: false })
      .filter((task) => task.context === context)
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

    if (activeTasks.length) {
      const activeTitle = document.createElement("p");
      activeTitle.className = "settings-context-group-label muted small-text";
      activeTitle.textContent = "Active tasks";
      wrapper.append(activeTitle);

      const activeList = document.createElement("ul");
      activeList.className = "settings-list";
      activeList.setAttribute("role", "list");
      const contexts = this.taskManager.getContexts();
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
        contexts.forEach((value) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          if (value === task.context) {
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
        const note = document.createElement("span");
        note.className = "muted small-text";
        note.textContent = "Read-only";

        const openButton = document.createElement("button");
        openButton.type = "button";
        openButton.className = "btn btn-light btn-small";
        openButton.textContent = "Open";
        openButton.addEventListener("click", (event) => {
          event.stopPropagation();
          this.openTaskFlyout(entry, { readOnly: true, entry });
        });

        actions.append(note, openButton);
        item.append(top, actions);
        inactiveList.append(item);
      });
      wrapper.append(inactiveList);
    }

    return wrapper;
  }

  handleSettingsAction({ action, type, value }) {
    if (!action || !type || !value) return;
    if (action === "rename") {
      const candidate = window.prompt(`Rename "${value}" to:`, value);
      if (!candidate || !candidate.trim()) return;
      const nextValue = candidate.trim();
      if (nextValue === value) return;
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
      const confirmed = window.confirm(`Delete "${value}"?`);
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
    const key = type === "contexts" ? "contexts" : "projects";
    const toggle = type === "contexts" ? this.elements.reportContextToggle : this.elements.reportProjectToggle;
    if (!toggle) return;
    const selections = Array.isArray(this.reportFilters[key]) ? this.reportFilters[key] : ["all"];
    const defaultLabel = type === "contexts" ? "All contexts" : "All projects";
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
        meta.textContent = `Completed ${formatFriendlyDate(project.completedAt)}`;
        item.append(title, meta);
        reportDetailsList.append(item);
      });
    tasks
      .sort((a, b) => {
        const aTime = new Date(a.completedAt || 0).getTime();
        const bTime = new Date(b.completedAt || 0).getTime();
        return bTime - aTime;
      })
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
        actions.append(viewBtn, restoreBtn);
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
    if (task.context) {
      parts.push(task.context);
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
    const random = tasks[Math.floor(Math.random() * tasks.length)];
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
    if (task.context) metaItems.push(this.createMetaSpan(task.context));
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
    if (task.energyLevel) metaItems.push(this.createMetaSpan(`Energy: ${task.energyLevel}`));
    if (task.timeRequired) metaItems.push(this.createMetaSpan(`Time: ${task.timeRequired}`));
    if (task.dueDate) {
      const dueClass = this.getDueUrgencyClass(task.dueDate);
      metaItems.push(this.createMetaSpan(`Due ${formatFriendlyDate(task.dueDate)}`, dueClass));
    } else if (task.calendarDate) {
      metaItems.push(this.createMetaSpan(`📅 ${formatFriendlyDate(task.calendarDate)}`));
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
      this.openTaskFlyout(task.id);
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
    menu.addEventListener("click", (event) => {
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
        const confirmed = window.confirm(`Delete "${task.title}"? This cannot be undone.`);
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
    menu.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-note-menu-action]");
      if (!actionButton) return;
      const action = actionButton.dataset.noteMenuAction;
      const context = this.resolveTaskNoteContext();
      this.closeTaskNoteContextMenu();
      if (!context) return;
      if (action === "edit") {
        const nextText = window.prompt("Edit note", context.note.text || "");
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
        const confirmed = window.confirm("Delete this note? This cannot be undone.");
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

  promptCalendarTaskCreate(dateKey) {
    const dateLabel = formatFriendlyDate(dateKey);
    const title = window.prompt(`Task title for ${dateLabel}:`);
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
    this.handleFlyoutKeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeTaskFlyout();
      }
    };
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
      clarifyDateContinue,
      clarifyDateOptionSpecific,
      clarifySpecificDateInput,
      clarifyDateOptionDue,
      clarifyDueDateInput,
      clarifyDateOptionNone,
      clarifySpecificTimeInput,
      clarifyProjectSelect,
      clarifyProjectPicker,
      clarifyProjectPickContinue,
      clarifyContextSelect,
      clarifyEnergySelect,
      clarifyTimeSelect,
      clarifyMetadataSave,
      clarifyMetadataSkip,
      clarifyAddContext,
      clarifyTwoMinuteStep,
      clarifyStepActionable,
      clarifyStepActionPlan,
      clarifyStepDates,
      clarifyStepMetadata,
      clarifyStepFinal,
      clarifyFinalMessage,
      clarifyFinalReturn,
      clarifyPreviewText,
    } = this.elements;
    if (!clarifyModal) return;
    this.handleClarifyKeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeClarifyModal();
      }
    };
    this.clarifyDestinationButtons = Array.from(clarifyModal.querySelectorAll("[data-clarify-nonaction]"));
    clarifyActionableYes?.addEventListener("click", () => this.handleClarifyActionableChoice(true));
    clarifyActionSingle?.addEventListener("click", () => this.handleClarifySingleAction());
    clarifyActionAddExisting?.addEventListener("click", () => this.showClarifyProjectPicker());
    this.clarifyDestinationButtons.forEach((button) => {
      button.addEventListener("click", () => this.handleClarifyNonAction(button.dataset.clarifyNonaction));
    });
    clarifyConvertProject?.addEventListener("click", () => this.handleClarifyConvertToProject());
    clarifyTwoMinuteYes?.addEventListener("click", () => this.handleClarifyTwoMinuteYes());
    clarifyTwoMinuteNo?.addEventListener("click", () => this.showClarifyStep("who"));
    clarifyTwoMinuteExpectYes?.addEventListener("click", () => this.handleTwoMinuteFollowup(true));
    clarifyTwoMinuteExpectNo?.addEventListener("click", () => this.handleTwoMinuteFollowup(false));
    clarifyFollowupTiming?.addEventListener("change", () => this.toggleCustomFollowupDate());
    clarifyWhoSelf?.addEventListener("click", () => this.showClarifyStep("dates"));
    clarifyWhoDelegate?.addEventListener("click", () => this.handleClarifyDelegation(clarifyDelegateNameInput?.value));
    clarifyDateContinue?.addEventListener("click", () => this.handleClarifyDateDecision());
    clarifyProjectPickContinue?.addEventListener("click", () => this.handleClarifyExistingProjectContinue());
    clarifyMetadataSave?.addEventListener("click", () => this.handleClarifyMetadata({ skip: false }));
    clarifyMetadataSkip?.addEventListener("click", () => this.handleClarifyMetadata({ skip: true }));
    clarifyFinalReturn?.addEventListener("click", () => this.closeClarifyFlowToInbox());
    clarifyAddContext?.addEventListener("click", () => this.handleClarifyAddContext());
    [clarifyEnergySelect, clarifyTimeSelect].forEach((select) => {
      if (select) {
        select.addEventListener("change", () => {
          this.clarifyState.energy = clarifyEnergySelect?.value || "";
          this.clarifyState.time = clarifyTimeSelect?.value || "";
        });
      }
    });
    const clearFollowup = () => {
      if (clarifyTwoMinuteFollowup) {
        clarifyTwoMinuteFollowup.hidden = true;
      }
      if (clarifyTwoMinuteResponseInput) {
        clarifyTwoMinuteResponseInput.value = "";
      }
      this.resetFollowupTiming();
    };
    clarifyTwoMinuteStep?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        clearFollowup();
      }
    });
    clarifyStepActionable?.addEventListener("click", () => clearFollowup());
    clarifyStepActionPlan?.addEventListener("click", () => clearFollowup());
    clarifyStepDates?.addEventListener("click", () => clearFollowup());
    clarifyStepMetadata?.addEventListener("click", () => clearFollowup());
    clarifyStepFinal?.addEventListener("click", () => clearFollowup());
    closeClarifyModal?.addEventListener("click", () => this.closeClarifyModal());
    clarifyBackdrop?.addEventListener("click", () => this.closeClarifyModal());
    if (clarifyPreviewText) {
      clarifyPreviewText.addEventListener("input", () => this.handleClarifyPreviewEdit(false));
      clarifyPreviewText.addEventListener("blur", () => this.handleClarifyPreviewEdit(true));
    }
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
      const handleSave = () => {
        if (!this.pendingClosure) {
          closeModal();
          return;
        }
        const notes = closureNotesInput.value.trim();
        if (notes && notes !== this.pendingClosure.existing) {
          this.taskManager.updateTask(this.pendingClosure.taskId, { closureNotes: notes });
        }
        this.taskManager.completeTask(this.pendingClosure.taskId, {
          archive: this.pendingClosure.archive,
          closureNotes: notes || this.pendingClosure.existing,
        });
        this.closeTaskFlyout();
        closeModal();
      };
      closeClosureModal?.addEventListener("click", closeModal);
      cancelClosureNotes?.addEventListener("click", closeModal);
      closureBackdrop?.addEventListener("click", closeModal);
      saveClosureNotes?.addEventListener("click", handleSave);
      closureNotesInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          handleSave();
        }
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
      calendarTime: "",
      context: "",
      energy: "",
      time: "",
      delegateTo: "",
      statusTarget: null,
      waitingFor: "",
      previewField: "title",
      previewText: "",
      actionPlanInitialized: false,
      expectResponse: false,
    };
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
    this.clarifyState.context = task.context || "";
    this.clarifyState.energy = task.energyLevel || "";
    this.clarifyState.time = task.timeRequired || "";
    this.clarifyState.previewField = task.description ? "description" : "title";
    this.clarifyState.previewText = task.description || task.title || "";
    this.populateClarifyPreview(task);
    this.populateClarifyContexts();
    this.populateProjectSelect();
    this.showClarifyStep("actionable");
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
      "metadata": this.elements.clarifyContextSelect,
      "final": this.elements.clarifyFinalReturn,
    };
    const focusTarget = focusTargets[step];
    if (focusTarget && typeof focusTarget.focus === "function") {
      focusTarget.focus();
    }
  }

  populateClarifyPreview(task) {
    if (this.elements.clarifyPreviewText) {
      const content = task.description || task.title || "(No details captured)";
      this.elements.clarifyPreviewText.textContent = content;
    }
    document.querySelectorAll(".clarify-preview").forEach((el) => {
      el.textContent = task.description || task.title || "(No details captured)";
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
    if (this.elements.clarifyTwoMinuteFollowup) {
      this.elements.clarifyTwoMinuteFollowup.hidden = true;
    }
    if (this.elements.clarifyProjectSelect) {
      this.populateProjectSelect();
    }
    if (this.elements.clarifyDateOptionNone) {
      this.elements.clarifyDateOptionNone.checked = true;
    }
    if (this.elements.clarifyContextSelect) {
      this.elements.clarifyContextSelect.value = this.clarifyState.context || "";
    }
    if (this.elements.clarifyEnergySelect) {
      this.elements.clarifyEnergySelect.value = this.clarifyState.energy || "";
    }
    if (this.elements.clarifyTimeSelect) {
      this.elements.clarifyTimeSelect.value = this.clarifyState.time || "";
    }
  }

  populateClarifyContexts() {
    const select = this.elements.clarifyContextSelect;
    if (!select) return;
    select.innerHTML = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Choose a context";
    select.append(defaultOption);
    const requiredDefaults = ["@Work", "@Home", "@Computer", "@Phone", "@Errands"];
    const contexts = Array.from(new Set([...requiredDefaults, ...this.taskManager.getContexts()]));
    contexts.forEach((context) => {
      const option = document.createElement("option");
      option.value = context;
      option.textContent = context;
      select.append(option);
    });
    if (this.clarifyState.context) {
      select.value = this.clarifyState.context;
    }
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
    if (!this.clarifyState.taskId) return;
    if (isActionable) {
      this.showClarifyStep("action-plan");
    }
  }

  handleClarifyNonAction(destination) {
    if (!this.clarifyState.taskId || !destination) return;
    if (destination === "trash") {
      const task = this.taskManager.getTaskById(this.clarifyState.taskId);
      const label = task?.title || "this capture";
      const confirmed = window.confirm(`Delete "${label}"? This cannot be undone.`);
      if (!confirmed) {
        return;
      }
      this.taskManager.deleteTask(this.clarifyState.taskId);
      this.taskManager.notify("info", "Captured idea deleted.");
    } else if (destination === "someday") {
      this.taskManager.moveTask(this.clarifyState.taskId, STATUS.SOMEDAY);
      this.taskManager.notify("info", "Moved to Someday / Maybe.");
    }
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
    this.showClarifyStep("two-minute");
  }

  handleClarifyConvertToProject() {
    if (!this.clarifyState.taskId) return;
    const projectName = window.prompt("Project name");
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
      this.showClarifyStep("two-minute");
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

  handleClarifyAddContext() {
    const nextContext = window.prompt("New context name (include @ if desired)");
    if (!nextContext || !nextContext.trim()) return;
    const select = this.elements.clarifyContextSelect;
    if (!select) return;
    const normalized = nextContext.trim();
    const option = document.createElement("option");
    option.value = normalized;
    option.textContent = normalized;
    select.append(option);
    select.value = normalized;
    this.clarifyState.context = normalized;
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
    let followUpDueDate = null;
    if (expectResponse) {
      const choice = this.elements.clarifyFollowupTiming?.value || "24h";
      const customValue = this.elements.clarifyFollowupCustomDate?.value || "";
      followUpDueDate = this.resolveFollowupDate(choice, customValue);
      if (!followUpDueDate) {
        this.taskManager.notify("warn", "Choose a follow-up timeframe.");
        return;
      }
    }
    this.clarifyState.expectResponse = expectResponse;
    const waitingFor = expectResponse
      ? this.elements.clarifyTwoMinuteResponseInput?.value?.trim() || "Pending response"
      : null;
    const task = this.taskManager.getTaskById(this.clarifyState.taskId);
    if (!task) {
      this.closeClarifyModal();
      return;
    }
    if (expectResponse) {
      this.clarifyState.statusTarget = STATUS.WAITING;
      this.clarifyState.waitingFor = waitingFor;
      this.clarifyState.dueType = "due";
      this.clarifyState.dueDate = followUpDueDate || "";
      if (this.elements.clarifyDateOptionDue) {
        this.elements.clarifyDateOptionDue.checked = true;
      }
      if (this.elements.clarifyDueDateInput) {
        this.elements.clarifyDueDateInput.value = followUpDueDate || "";
      }
      if (this.elements.clarifySpecificDateInput) {
        this.elements.clarifySpecificDateInput.value = "";
      }
      if (this.elements.clarifySpecificTimeInput) {
        this.elements.clarifySpecificTimeInput.value = "";
      }
      this.showClarifyStep("dates");
      return;
    }
    this.taskManager.completeTask(task.id, { archive: "reference", closureNotes: task.closureNotes });
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
      this.clarifyState.context = this.elements.clarifyContextSelect?.value || this.clarifyState.context || "";
      this.clarifyState.energy = this.elements.clarifyEnergySelect?.value || "";
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
      context: this.clarifyState.context || task.context || PHYSICAL_CONTEXTS[0],
      energyLevel: this.clarifyState.energy || null,
      timeRequired: this.clarifyState.time || null,
      projectId: this.clarifyState.projectId || null,
      calendarDate: null,
      dueDate: null,
      waitingFor: statusTarget === STATUS.WAITING ? this.clarifyState.waitingFor || task.waitingFor || null : null,
      status: statusTarget,
    };
    if (this.clarifyState.dueType === "calendar" && this.clarifyState.calendarDate) {
      updates.calendarDate = this.clarifyState.calendarTime
        ? `${this.clarifyState.calendarDate}T${this.clarifyState.calendarTime}`
        : this.clarifyState.calendarDate;
    } else if (this.clarifyState.dueType === "due" && this.clarifyState.dueDate) {
      updates.dueDate = this.clarifyState.dueDate;
    }
    this.taskManager.updateTask(task.id, updates);
    if (early) {
      this.taskManager.notify("info", "Routed and removed from Inbox.");
      this.closeClarifyModal();
      this.setActivePanel("inbox");
      return;
    }
    this.setClarifyFinalMessage(updates);
    this.showClarifyStep("final");
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
    flyout.classList.remove("is-open");
    flyout.setAttribute("aria-hidden", "true");
    this.isFlyoutOpen = false;
    this.currentFlyoutTaskId = null;
    this.flyoutContext = { readOnly: false, entry: null };
    if (this.handleFlyoutKeydown) {
      document.removeEventListener("keydown", this.handleFlyoutKeydown);
    }
  }

  renderTaskFlyout(task, options = {}) {
    const { readOnly = false, entry = null } = options;
    this.closeTaskNoteContextMenu();
    const content = this.elements.taskFlyoutContent;
    if (!content) return;
    const isCompleted = Boolean(task.completedAt);
    const titleEl = this.elements.taskFlyoutTitle;
    const statusEl = this.elements.taskFlyoutStatus;
    if (titleEl) this.setEntityLinkedText(titleEl, task.title || "Untitled task");
    if (statusEl) statusEl.textContent = STATUS_LABELS[task.status] || task.status;
    content.innerHTML = "";

    const description = document.createElement("p");
    this.setEntityLinkedText(description, task.description || task.title || "No description yet.");
    description.className = "muted";
    const archiveEntryId = readOnly ? entry?.id || entry?.sourceId || task.id : null;
    const notesSection = this.createTaskNotesSection(task, {
      readOnly: readOnly && !archiveEntryId,
      archiveEntryId,
    });

    const meta = document.createElement("div");
    meta.className = "task-flyout-meta";
    meta.append(this.buildMetaRow("Task ID", task.slug || task.id));
    meta.append(this.buildMetaRow("Context", task.context || "—"));
    meta.append(this.buildMetaRow("Project", this.getProjectName(task.projectId) || "—"));
    meta.append(this.buildMetaRow("Energy level", task.energyLevel || "—"));
    meta.append(this.buildMetaRow("Time required", task.timeRequired || "—"));
    meta.append(
      this.buildMetaRow(
        "My Day",
        this.isTaskInMyDay(task) ? "Today" : task.myDayDate ? formatFriendlyDate(task.myDayDate) : "—"
      )
    );
    meta.append(this.buildMetaRow("Due date", task.dueDate ? formatFriendlyDate(task.dueDate) : "—"));
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
      content.append(description, meta, notesSection, inboxPanel);
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
      content.append(description, meta, notesSection, readOnlyNote, actionToolbar);
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
      actionToolbar.append(completeButton, completeDeleteButton);
    }

    if (!isCompleted) {
      content.append(description, meta, notesSection, this.createFollowupSection(task), actionToolbar);
    } else {
      content.append(description, meta, notesSection, actionToolbar);
    }
    content.append(this.createTaskForm(task));
  }

  createFollowupSection(task) {
    const section = document.createElement("div");
    section.className = "task-edit";
    const heading = document.createElement("h3");
    heading.textContent = "Follow up";
    const helper = document.createElement("p");
    helper.className = "muted small-text";
    helper.textContent = "Move to Waiting and set a follow-up date.";
    const waitingField = document.createElement("label");
    waitingField.className = "task-edit-field";
    waitingField.textContent = "Waiting on";
    const waitingInput = document.createElement("input");
    waitingInput.type = "text";
    waitingInput.placeholder = "Person, response, or task ID (e.g., task:abc123)";
    waitingInput.value = task.waitingFor || "";
    waitingField.append(waitingInput);

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
          waitingInput.value = `task:${suggestionTask.slug || suggestionTask.id}`;
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
      { label: "Follow up in 24 hours", value: "24h" },
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
      const waitingFor = waitingInput.value.trim() || "Pending response";
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
      if (!task.context) {
        updates.context = PHYSICAL_CONTEXTS[0];
      }
      this.taskManager.updateTask(task.id, updates);
      this.taskManager.notify("info", `Follow-up set for ${formatFriendlyDate(dueDate)}.`);
    });
    actions.append(setButton);

    section.append(heading, helper, waitingField, timingField, customField, actions);
    return section;
  }

  createTaskNotesSection(task, { readOnly = false, archiveEntryId = null } = {}) {
    const section = document.createElement("section");
    section.className = "task-notes";

    const header = document.createElement("div");
    header.className = "task-notes-header";
    const title = document.createElement("h3");
    title.textContent = "Notes";
    const notes = Array.isArray(task.notes) ? [...task.notes] : [];
    const count = document.createElement("span");
    count.className = "muted small-text";
    count.textContent = `${notes.length} entr${notes.length === 1 ? "y" : "ies"}`;
    header.append(title, count);

    const list = document.createElement("ul");
    list.className = "task-notes-list";
    if (!notes.length) {
      const empty = document.createElement("li");
      empty.className = "muted small-text";
      empty.textContent = "No notes yet.";
      list.append(empty);
    } else {
      notes
        .sort((a, b) => {
          const aTime = new Date(a?.createdAt || 0).getTime();
          const bTime = new Date(b?.createdAt || 0).getTime();
          return bTime - aTime;
        })
        .forEach((note) => {
          const item = document.createElement("li");
          item.className = "task-note-item";
          if (!readOnly) {
            item.dataset.noteId = note.id;
            item.addEventListener("contextmenu", (event) => {
              event.preventDefault();
              event.stopPropagation();
              this.openTaskNoteContextMenu(
                {
                  taskId: task.id,
                  archiveEntryId: archiveEntryId || null,
                  noteId: note.id,
                },
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
          const text = document.createElement("p");
          text.className = "task-note-text";
          this.setEntityLinkedText(text, note.text || "");
          item.append(meta, text);
          list.append(item);
        });
    }

    section.append(header, list);
    if (readOnly) {
      const helper = document.createElement("p");
      helper.className = "muted small-text";
      helper.textContent = "Restore this task to add or edit notes.";
      section.append(helper);
      return section;
    }

    const form = document.createElement("form");
    form.className = "task-note-form";
    form.setAttribute("aria-label", "Add task note");
    const input = document.createElement("textarea");
    input.rows = 3;
    input.placeholder = "Capture findings, blockers, and progress updates...";
    this.attachEntityMentionAutocomplete(input);
    const actions = document.createElement("div");
    actions.className = "task-note-actions";
    const addButton = document.createElement("button");
    addButton.type = "submit";
    addButton.className = "btn btn-light";
    addButton.textContent = "Add note";
    actions.append(addButton);
    form.append(input, actions);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const noteText = input.value;
      const added = archiveEntryId
        ? this.taskManager.addCompletedTaskNote(archiveEntryId, noteText)
        : this.taskManager.addTaskNote(task.id, noteText);
      if (!added) return;
      this.ensureMentionedEntitiesExist(noteText);
      input.value = "";
      input.focus();
    });
    section.append(form);
    return section;
  }

  createTaskForm(task, { archiveEntryId = null } = {}) {
    const isArchivedEntry = Boolean(archiveEntryId);
    const form = document.createElement("form");
    form.className = "task-edit";
    form.setAttribute("aria-label", "Edit task");

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

    const contextGroup = document.createElement("label");
    contextGroup.className = "task-edit-field";
    contextGroup.textContent = "Physical context";
    const contextInput = document.createElement("input");
    contextInput.type = "text";
    contextInput.setAttribute("list", "contextSuggestions");
    contextInput.placeholder = "@Office";
    contextInput.value = task.context || "";
    contextGroup.append(contextInput);

    const energyGroup = document.createElement("label");
    energyGroup.className = "task-edit-field";
    energyGroup.textContent = "Energy level";
    const energyInput = document.createElement("select");
    const emptyEnergy = document.createElement("option");
    emptyEnergy.value = "";
    emptyEnergy.textContent = "Select energy";
    energyInput.append(emptyEnergy);
    ENERGY_LEVELS.forEach((level) => {
      const option = document.createElement("option");
      option.value = level;
      option.textContent = level.charAt(0).toUpperCase() + level.slice(1);
      energyInput.append(option);
    });
    energyInput.value = task.energyLevel || "";
    energyGroup.append(energyInput);

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

    const dueGroup = document.createElement("label");
    dueGroup.className = "task-edit-field";
    dueGroup.textContent = "Due date";
    const dueInput = document.createElement("input");
    dueInput.type = "date";
    dueInput.value = task.dueDate || "";
    dueGroup.append(dueInput);

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
    calendarControls.append(calendarInput, calendarTimeInput);
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
        context: contextInput.value.trim() || null,
        energyLevel: energyInput.value || null,
        timeRequired: timeInput.value || null,
        projectId: projectSelect.value || null,
        dueDate: dueInput.value || null,
        calendarDate: calendarInput.value || null,
        calendarTime: calendarTimeInput.value || null,
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
      contextInput,
      energyInput,
      timeInput,
      projectSelect,
      dueInput,
      calendarInput,
      calendarTimeInput,
      waitingInput,
      closureInput,
      recurrenceSelect,
      recurrenceInterval,
    ];
    autoSaveFields.forEach((field) => {
      field.addEventListener("change", scheduleAutoSave);
    });

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
      deleteButton.addEventListener("click", () => {
        const confirmed = window.confirm(`Delete "${task.title}"? This cannot be undone.`);
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
      energyGroup,
      timeGroup,
      statusGroup,
      projectGroup,
      dueGroup,
      calendarGroup,
      waitingGroup,
      closureGroup,
      recurrenceGroup,
      actions
    );

    form.addEventListener("submit", (event) => {
      event.preventDefault();
    });

    return form;
  }

  createProjectForTask(task, { archiveEntryId = null } = {}) {
    if (!task) return;
    const proposedName = window.prompt("New project name");
    if (!proposedName || !proposedName.trim()) return;
    const trimmedName = proposedName.trim();
    const confirmMessage = `Create project "${trimmedName}" and assign it to "${task.title || "this task"}"?`;
    if (!window.confirm(confirmMessage)) {
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
    const due = new Date(task.dueDate);
    if (Number.isNaN(due.getTime())) return false;
    return due < this.getTodayStart();
  }

  getDueUrgencyClass(dueDate) {
    if (!dueDate) return "";
    const due = new Date(dueDate);
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

    const areaField = document.createElement("label");
    areaField.className = "project-edit-field";
    areaField.textContent = "Area of focus";
    const areaInput = document.createElement("input");
    areaInput.type = "text";
    areaInput.setAttribute("list", "projectAreaSuggestions");
    areaInput.placeholder = "e.g., Work";
    areaInput.value = project.areaOfFocus || "";
    areaField.append(areaInput);

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
        areaOfFocus: areaInput.value.trim() || null,
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
        updates.context = context === "No context" ? null : context;
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
    if (task.projectId) {
      if (area === "No Area") {
        this.taskManager.notify("warn", "Project tasks must stay in a valid area of focus.");
      } else {
        this.taskManager.updateProject(task.projectId, { areaOfFocus: area });
      }
    } else {
      updates.areaOfFocus = area === "No Area" ? null : area;
    }
    this.taskManager.updateTask(taskId, updates);
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
    sidebarFiltersCard: document.querySelector(".filters-card"),
    alerts: document.querySelector(".alerts"),
    workspaceToolbar: document.querySelector(".workspace-toolbar"),
    toolbarSearchSection: byId("toolbarSearchSection"),
    toolbarTaskPickerSection: byId("toolbarTaskPickerSection"),
    toolbarActionsSection: byId("toolbarActionsSection"),
    toolbarActionsTitle: byId("toolbarActionsTitle"),
    toolbarActionsNote: byId("toolbarActionsNote"),
    nextProjectFanoutControl: byId("nextProjectFanoutControl"),
    nextHideScheduledControl: byId("nextHideScheduledControl"),
    contextFilterPicker: byId("contextFilterPicker"),
    contextFilterToggle: byId("contextFilterToggle"),
    contextFilterOptions: byId("contextFilterOptions"),
    projectFilterPicker: byId("projectFilterPicker"),
    projectFilterToggle: byId("projectFilterToggle"),
    projectFilterOptions: byId("projectFilterOptions"),
    personFilterPicker: byId("personFilterPicker"),
    personFilterToggle: byId("personFilterToggle"),
    personFilterOptions: byId("personFilterOptions"),
    waitingFilterPicker: byId("waitingFilterPicker"),
    waitingFilterToggle: byId("waitingFilterToggle"),
    waitingFilterOptions: byId("waitingFilterOptions"),
    energyFilterPicker: byId("energyFilterPicker"),
    energyFilterToggle: byId("energyFilterToggle"),
    energyFilterOptions: byId("energyFilterOptions"),
    timeFilterPicker: byId("timeFilterPicker"),
    timeFilterToggle: byId("timeFilterToggle"),
    timeFilterOptions: byId("timeFilterOptions"),
    quickAddInput: byId("quickAddInput"),
    quickAddDescription: byId("quickAddDescription"),
    searchTasks: byId("searchTasks"),
    clearFilters: byId("clearFilters"),
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
    manualSyncButton: byId("manualSyncButton"),
    connectionStatusDot: byId("connectionStatusDot"),
    taskContextMenu: byId("taskContextMenu"),
    taskNoteContextMenu: byId("taskNoteContextMenu"),
    calendarDayContextMenu: byId("calendarDayContextMenu"),
    taskFlyout: document.getElementById("taskFlyout"),
    taskFlyoutContent: byId("taskFlyoutContent"),
    taskFlyoutTitle: byId("taskFlyoutTitle"),
    taskFlyoutStatus: byId("taskFlyoutStatus"),
    closeTaskFlyout: byId("closeTaskFlyout"),
    taskFlyoutBackdrop: document.querySelector(".task-flyout-backdrop"),
    activePanelHeading: byId("activePanelHeading"),
    activePanelCount: byId("activePanelCount"),
    inboxList: document.querySelector('.panel-body[data-dropzone="inbox"]'),
    myDayList: byId("myDayList"),
    contextBoard: document.querySelector("[data-context-board]"),
    kanbanBoard: document.querySelector("[data-kanban-board]"),
    projectList: document.querySelector("[data-projects]"),
    projectAreaFilter: document.getElementById("projectAreaFilter"),
    toggleMissingNextAction: document.getElementById("toggleMissingNextAction"),
    toggleProjectCompletedTasks: document.getElementById("toggleProjectCompletedTasks"),
    projectCompletedTasksControl: byId("projectCompletedTasksControl"),
    completedProjectsList: document.querySelector("[data-completed-projects]"),
    waitingList: document.querySelector('.panel-body[data-dropzone="waiting"]'),
    somedayList: document.querySelector('.panel-body[data-dropzone="someday"]'),
    exportMarkdown: byId("exportMarkdown"),
    importMarkdown: byId("importMarkdown"),
    markdownFileInput: byId("markdownFileInput"),
    inboxCount: byId("inboxCount"),
    dueTodayCount: byId("dueTodayCount"),
    overdueCount: byId("overdueCount"),
    summaryInbox: byId("summaryInbox"),
    summaryNext: byId("summaryNext"),
    summaryMyDay: byId("summaryMyDay"),
    summaryKanban: byId("summaryKanban"),
    summaryWaiting: byId("summaryWaiting"),
    summarySomeday: byId("summarySomeday"),
    summaryProjects: byId("summaryProjects"),
    summaryCalendar: byId("summaryCalendar"),
    summaryCompleted: byId("summaryCompleted"),
    summaryStatistics: byId("summaryStatistics"),
    summaryAllActive: byId("summaryAllActive"),
    summarySettings: byId("summarySettings"),
    allActiveList: byId("allActiveList"),
    settingsThemesList: byId("settingsThemesList"),
    settingsFeatureFlagsList: byId("settingsFeatureFlagsList"),
    settingsContextsList: byId("settingsContextsList"),
    settingsPeopleList: byId("settingsPeopleList"),
    settingsAreasList: byId("settingsAreasList"),
    footerYear: byId("footerYear"),
    themeToggle: document.getElementById("themeToggle"),
    integrationsCard: document.querySelector(".integrations-card"),
    contextSuggestions: document.getElementById("contextSuggestions"),
    energySuggestions: document.getElementById("energySuggestions"),
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
    clarifyTwoMinuteResponseInput: byId("clarifyTwoMinuteResponseInput"),
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
    clarifyContextSelect: byId("clarifyContextSelect"),
    clarifyAddContext: byId("clarifyAddContext"),
    clarifyEnergySelect: byId("clarifyEnergySelect"),
    clarifyTimeSelect: byId("clarifyTimeSelect"),
    clarifyMetadataSave: byId("clarifyMetadataSave"),
    clarifyMetadataSkip: byId("clarifyMetadataSkip"),
    clarifyFinalMessage: byId("clarifyFinalMessage"),
    clarifyFinalReturn: byId("clarifyFinalReturn"),
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

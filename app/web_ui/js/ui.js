import {
  STATUS,
  STATUS_LABELS,
  formatFriendlyDate,
  PHYSICAL_CONTEXTS,
  ENERGY_LEVELS,
  TIME_REQUIREMENTS,
  PROJECT_AREAS,
  PROJECT_THEMES,
  PROJECT_STATUSES,
} from "./data.js";

const TAB_STORAGE_KEY = "gtd-dashboard-active-panel";

const TRANSITIONS = {
  [STATUS.INBOX]: [
    { label: "Clarify → Next", target: STATUS.NEXT },
    { label: "Hold for later", target: STATUS.SOMEDAY },
    { label: "Delegated", target: STATUS.WAITING },
  ],
  [STATUS.NEXT]: [
    { label: "Move to Waiting", target: STATUS.WAITING },
    { label: "Archive to Someday", target: STATUS.SOMEDAY },
  ],
  [STATUS.WAITING]: [
    { label: "Back to Next", target: STATUS.NEXT },
    { label: "Return to Inbox", target: STATUS.INBOX },
  ],
  [STATUS.SOMEDAY]: [
    { label: "Activate → Next", target: STATUS.NEXT },
    { label: "Back to Inbox", target: STATUS.INBOX },
  ],
};

export class UIController {
  constructor(taskManager) {
    this.taskManager = taskManager;
    this.filters = {
      context: ["all"],
      project: ["all"],
      person: ["all"],
      energy: ["all"],
      time: ["all"],
      search: "",
      date: "",
    };
    this.isSearchVisible = false;
    this.elements = mapElements();
    this.dropzones = [];
    this.panelButtons = [];
    this.panels = [];
    this.activePanel = loadStoredPanel() || "inbox";
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
  }

  init() {
    this.elements = mapElements();
    this.bindListeners();
    this.setupSummaryTabs();
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
      searchToggle,
      searchField,
      clearFilters,
      expandProjects,
      calendarDate,
      integrationsCard,
      reportGrouping,
      reportYear,
    randomContext,
    pickRandomTask,
    projectAreaFilter,
    calendarPrevMonth,
    calendarNextMonth,
  } = this.elements;

    searchToggle?.addEventListener("click", () => {
      const isCurrentlyVisible = searchField ? !searchField.hidden : this.isSearchVisible;
      if (isCurrentlyVisible) {
        this.hideSearchField({ focus: false });
      } else {
        this.showSearchField();
      }
    });

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
        energy: ["all"],
        time: ["all"],
        search: "",
        date: "",
      };
      searchTasks.value = "";
      calendarDate.value = "";
      this.hideSearchField({ focus: false });
      this.renderAll();
    });

    expandProjects.addEventListener("click", () => {
      const projects = this.getProjectCache();
      const nextExpandedState = projects.some((project) => !project.isExpanded);
      projects.forEach((project) => this.taskManager.toggleProjectExpansion(project.id, nextExpandedState));
    });

    projectAreaFilter?.addEventListener("change", () => {
      this.filters.projectArea = projectAreaFilter.value;
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

    reportGrouping?.addEventListener("change", () => {
      this.reportFilters.grouping = reportGrouping.value;
      this.renderReports();
    });
    reportYear?.addEventListener("change", () => {
      const nextYear = parseInt(reportYear.value, 10);
      this.reportFilters.year = Number.isNaN(nextYear) ? new Date().getFullYear() : nextYear;
      this.renderReports();
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

    this.taskManager.addEventListener("statechange", () => {
      this.renderAll();
      if (this.isFlyoutOpen && this.currentFlyoutTaskId) {
        const latest = this.taskManager.getTaskById(this.currentFlyoutTaskId);
        if (latest) {
          this.renderTaskFlyout(latest);
        } else {
          this.closeTaskFlyout();
        }
      }
    });

    this.taskManager.addEventListener("toast", (event) => {
      this.showToast(event.detail.level, event.detail.message);
    });

    this.taskManager.addEventListener("connection", (event) => {
      this.updateConnectionIndicator(event.detail.status);
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
    const expandButton = this.elements.expandProjects;
    if (expandButton) {
      expandButton.hidden = this.activePanel !== "projects";
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
    if (panel === "projects") return "Projects";
    if (panel === "calendar") return "Calendar";
     if (panel === "reports") return "Reports";
    return "Overview";
  }

  getPanelCountText(panel) {
    const summary = this.summaryCache || this.taskManager.getSummary();
    if (panel === "projects") {
      return `${summary.projects} projects`;
    }
    if (panel === "calendar") {
      const entries = this.taskManager.getCalendarEntries({ exactDate: this.filters.date || undefined });
      return `${entries.length} scheduled`;
    }
    if (panel === "reports") {
      const completed = this.taskManager.getCompletedTasks().length;
      return `${completed} completed`;
    }
    switch (panel) {
      case STATUS.INBOX:
        return `${summary.inbox} items`;
      case STATUS.NEXT:
        return `${summary.next} items`;
      case STATUS.WAITING:
        return `${summary.waiting} items`;
      case STATUS.SOMEDAY:
        return `${summary.someday} items`;
      default:
        return "";
    }
  }

  renderAll() {
    this.projectCache = this.taskManager.getProjects({ includeSomeday: true });
    this.projectLookup = new Map(this.projectCache.map((project) => [project.id, project]));
    this.updateSuggestionLists();
    this.renderSummary();
    this.renderFilters();
    this.renderInbox();
    this.renderNextActions();
    this.renderProjects();
    this.renderWaitingFor();
    this.renderSomeday();
    this.renderCalendar();
    this.renderReports();
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
    if (this.filters.search) {
      this.isSearchVisible = true;
    }
    this.setSearchFieldVisibility(this.isSearchVisible || Boolean(this.filters.search), { focus: false, updateState: false });
  }

  showSearchField({ focus = true } = {}) {
    this.isSearchVisible = true;
    this.setSearchFieldVisibility(true, { focus });
  }

  hideSearchField({ focus = true } = {}) {
    this.isSearchVisible = false;
    this.setSearchFieldVisibility(false, { focus });
  }

  setSearchFieldVisibility(visible, { focus = true, updateState = true } = {}) {
    const { searchField, searchToggle, searchTasks } = this.elements;
    if (!searchField || !searchToggle) return;
    if (visible) {
      searchField.hidden = false;
      searchToggle.setAttribute("aria-expanded", "true");
      searchToggle.classList.add("is-active");
      const hideLabel = searchToggle.dataset.labelHide || searchToggle.textContent;
      searchToggle.textContent = hideLabel;
      if (updateState) {
        this.isSearchVisible = true;
      }
      if (focus) {
        searchTasks?.focus();
      }
    } else {
      searchField.hidden = true;
      searchToggle.setAttribute("aria-expanded", "false");
      searchToggle.classList.remove("is-active");
      const showLabel = searchToggle.dataset.labelShow || searchToggle.textContent;
      searchToggle.textContent = showLabel;
      if (updateState) {
        this.isSearchVisible = false;
      }
      if (focus) {
        searchToggle.focus();
      }
    }
  }

  clearSearch() {
    const { searchTasks } = this.elements;
    if (searchTasks) {
      searchTasks.value = "";
    }
    this.filters.search = "";
    this.hideSearchField({ focus: true });
    this.renderAll();
  }

  updateSuggestionLists() {
    const {
      contextSuggestions,
      peopleSuggestions,
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
    const people = new Set();
    const energies = new Set([...ENERGY_LEVELS]);
    const times = new Set([...TIME_REQUIREMENTS]);
    allTasks.forEach((task) => {
      if (task.context) contexts.add(task.context);
      if (task.peopleTag) people.add(task.peopleTag);
      if (task.energyLevel) energies.add(task.energyLevel);
      if (task.timeRequired) times.add(task.timeRequired);
    });
    archiveEntries.forEach((entry) => {
      if (entry.context) contexts.add(entry.context);
      if (entry.peopleTag) people.add(entry.peopleTag);
      if (entry.energyLevel) energies.add(entry.energyLevel);
      if (entry.timeRequired) times.add(entry.timeRequired);
    });
    fillDatalist(contextSuggestions, Array.from(contexts));
    fillDatalist(peopleSuggestions, Array.from(people));
    fillDatalist(energySuggestions, Array.from(energies));
    fillDatalist(timeSuggestions, Array.from(times));

    const areas = new Set([...PROJECT_AREAS]);
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
    const calendarTotal = this.taskManager.getCalendarEntries().length;
    const currentYear = new Date().getFullYear();
    const completedThisYear = this.taskManager.getCompletedTasks({ year: currentYear }).length;
    const {
      summaryInbox,
      summaryNext,
      summaryWaiting,
      summarySomeday,
      summaryProjects,
      summaryCalendar,
      summaryCompleted,
    } = this.elements;
    summaryInbox.textContent = summary.inbox;
    summaryNext.textContent = summary.next;
    summaryWaiting.textContent = summary.waiting;
    summarySomeday.textContent = summary.someday;
    summaryProjects.textContent = summary.projects;
    summaryCalendar.textContent = calendarTotal;
    if (summaryCompleted) {
      summaryCompleted.textContent = completedThisYear;
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
    const people = new Set();
    const energyLevels = new Set([...ENERGY_LEVELS]);
    const timeEstimates = new Set([...TIME_REQUIREMENTS]);
    allTasks.forEach((task) => {
      if (task.peopleTag) people.add(task.peopleTag);
      if (task.energyLevel) energyLevels.add(task.energyLevel);
      if (task.timeRequired) timeEstimates.add(task.timeRequired);
    });

    this.renderFilterPicker("person", {
      options: Array.from(people)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .map((person) => ({ label: person, value: person })),
      toggle: this.elements.personFilterToggle,
      container: this.elements.personFilterOptions,
      defaultLabel: "All people",
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

  renderInbox() {
    const tasks = this.taskManager.getTasks({
      status: STATUS.INBOX,
      context: this.filters.context,
      projectId: this.filters.project,
      searchTerm: this.filters.search,
      person: this.filters.person,
      energy: this.filters.energy,
      time: this.filters.time,
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

  renderNextActions() {
    const allNextTasks = this.taskManager.getTasks({
      status: STATUS.NEXT,
      context: this.filters.context,
      projectId: this.filters.project,
      searchTerm: this.filters.search,
      person: this.filters.person,
      energy: this.filters.energy,
      time: this.filters.time,
    });
    const tasks = this.filterNextTasksByProject(allNextTasks);
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

  renderProjects() {
    const container = this.elements.projectList;
    container.innerHTML = "";
    const filterArea = this.elements.projectAreaFilter?.value || "all";
    const projects = (this.projectCache || []).filter((project) => {
      if (!filterArea || filterArea === "all") return true;
      return (project.areaOfFocus || "").toLowerCase() === filterArea.toLowerCase();
    });

    if (this.elements.projectAreaFilter) {
      const select = this.elements.projectAreaFilter;
      const areas = new Set([...PROJECT_AREAS]);
      (this.projectCache || []).forEach((project) => {
        if (project.areaOfFocus) areas.add(project.areaOfFocus);
      });
      const existing = new Set(Array.from(select.options).map((opt) => opt.value));
      Array.from(areas).forEach((area) => {
        if (existing.has(area)) return;
        const option = document.createElement("option");
        option.value = area;
        option.textContent = area;
        select.append(option);
      });
    }

    projects.forEach((project) => {
      const details = document.createElement("details");
      details.className = "project";
      details.dataset.projectId = project.id;
      details.open = project.isExpanded;

      const summary = document.createElement("summary");
      summary.innerHTML = `
        <strong>${project.name}</strong>
        <span class="muted small-text">${project.tags.join(", ") || "No tags"}</span>
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

      const projectTasks = this.taskManager
        .getTasks({
          projectId: project.id,
          searchTerm: this.filters.search,
          context: this.filters.context,
          person: this.filters.person,
          energy: this.filters.energy,
          time: this.filters.time,
        })
        .filter((task) => (project.someday ? task.status !== STATUS.SOMEDAY : true));

      const grouped = {
        [STATUS.NEXT]: [],
        [STATUS.WAITING]: [],
        [STATUS.SOMEDAY]: [],
        [STATUS.INBOX]: [],
      };
      projectTasks.forEach((task) => {
        if (grouped[task.status]) {
          grouped[task.status].push(task);
        }
      });

      const groups = [
        { status: STATUS.NEXT, label: "Next Actions", empty: "No next actions defined." },
        { status: STATUS.WAITING, label: "Waiting For", empty: "Nothing delegated at the moment." },
        { status: STATUS.SOMEDAY, label: "Someday / Maybe", empty: "No ideas parked here yet." },
        { status: STATUS.INBOX, label: "Captured (Inbox)", empty: "No uncategorized work for this project." },
      ];

      const sectionsWrapper = document.createElement("div");
      sectionsWrapper.className = "project-task-groups";

      groups.forEach((group) => {
        const section = document.createElement("section");
        section.className = "project-task-group";
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
            if (group.status === STATUS.NEXT && index === 0) {
              card.classList.add("task-card-primary");
            }
            section.append(card);
          });
        }

        sectionsWrapper.append(section);
      });

      if (tagsRow.children.length) {
        body.append(tagsRow);
      }
      body.append(outcome, actions, sectionsWrapper);
      details.append(summary, body);
      container.append(details);
    });

    this.renderCompletedProjects();
  }

  renderCompletedProjects() {
    const container = this.elements.completedProjectsList;
    if (!container) return;
    container.innerHTML = "";
    const completed = this.taskManager.getCompletedProjects();
    if (!completed.length) {
      const empty = document.createElement("p");
      empty.className = "muted small-text";
      empty.textContent = "No completed projects yet. Finish a project to see it here.";
      container.append(empty);
      return;
    }
    completed.forEach((entry) => {
      const card = document.createElement("article");
      card.className = "completed-project";

      const title = document.createElement("h4");
      title.className = "completed-project-title";
      title.textContent = entry.name;
      card.append(title);

      const actionsRow = document.createElement("div");
      actionsRow.className = "completed-project-actions";
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "btn btn-danger btn-small";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        const confirmed = window.confirm(`Remove "${entry.name}" from Completed Projects?`);
        if (confirmed) {
          this.taskManager.removeCompletedProject(entry.id);
        }
      });
      actionsRow.append(removeButton);
      card.append(actionsRow);

      const meta = document.createElement("div");
      meta.className = "completed-project-meta";
      const metaParts = [`Completed ${formatFriendlyDate(entry.completedAt)}`];
      if (entry.snapshot?.areaOfFocus) {
        metaParts.push(`Area: ${entry.snapshot.areaOfFocus}`);
      }
      if (entry.snapshot?.themeTag) {
        metaParts.push(`Theme: ${entry.snapshot.themeTag}`);
      }
      metaParts.forEach((text) => {
        const span = document.createElement("span");
        span.textContent = text;
        meta.append(span);
      });
      card.append(meta);

      if (entry.snapshot?.tags?.length) {
        const tagsRow = document.createElement("div");
        tagsRow.className = "project-tags";
        entry.snapshot.tags.forEach((tagText) => {
          const tag = document.createElement("span");
          tag.className = "project-tag";
          tag.textContent = tagText;
          tagsRow.append(tag);
        });
        card.append(tagsRow);
      }

      const notesDisplay = document.createElement("div");
      notesDisplay.className = "completed-project-notes";
      const noteText = (label, value) => {
        const row = document.createElement("p");
        row.className = "muted small-text";
        row.textContent = `${label}: ${value || "—"}`;
        return row;
      };
      notesDisplay.append(
        noteText("What was achieved", entry.closureNotes?.achieved),
        noteText("Lessons learned", entry.closureNotes?.lessons),
        noteText("Follow-up items", entry.closureNotes?.followUp)
      );
      card.append(notesDisplay);

      const notesForm = document.createElement("form");
      notesForm.className = "completed-project-notes";
      notesForm.hidden = true;
      const makeField = (labelText, value) => {
        const label = document.createElement("label");
        const caption = document.createElement("span");
        caption.textContent = labelText;
        const textarea = document.createElement("textarea");
        textarea.value = value || "";
        textarea.placeholder = labelText;
        label.append(caption, textarea);
        notesForm.append(label);
        return textarea;
      };
      const achievedInput = makeField("What was achieved", entry.closureNotes?.achieved || "");
      const lessonsInput = makeField("Lessons learned", entry.closureNotes?.lessons || "");
      const followUpInput = makeField("Follow-up items", entry.closureNotes?.followUp || "");
      const actionsRow = document.createElement("div");
      actionsRow.className = "completed-project-actions";
      const saveButton = document.createElement("button");
      saveButton.type = "submit";
      saveButton.className = "btn btn-primary";
      saveButton.textContent = "Save notes";
      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "btn btn-light";
      cancelButton.textContent = "Cancel";
      actionsRow.append(cancelButton, saveButton);
      notesForm.append(actionsRow);
      notesForm.addEventListener("submit", (event) => {
        event.preventDefault();
        this.taskManager.updateCompletedProject(entry.id, {
          closureNotes: {
            achieved: achievedInput.value,
            lessons: lessonsInput.value,
            followUp: followUpInput.value,
          },
        });
        notesForm.hidden = true;
        notesDisplay.hidden = false;
        // Update display
        notesDisplay.innerHTML = "";
        notesDisplay.append(
          noteText("What was achieved", achievedInput.value),
          noteText("Lessons learned", lessonsInput.value),
          noteText("Follow-up items", followUpInput.value)
        );
      });
      cancelButton.addEventListener("click", () => {
        notesForm.hidden = true;
        notesDisplay.hidden = false;
      });
      card.append(notesForm);

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "btn btn-light completed-project-edit";
      editButton.textContent = "Edit notes";
      editButton.addEventListener("click", () => {
        notesForm.hidden = false;
        notesDisplay.hidden = true;
      });
      card.append(editButton);
      container.append(card);
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
      status: STATUS.WAITING,
      context: this.filters.context,
      projectId: this.filters.project,
      searchTerm: this.filters.search,
      person: this.filters.person,
      energy: this.filters.energy,
      time: this.filters.time,
    });
    const container = this.elements.waitingList;
    renderTaskList(container, tasks, (task) => this.createTaskCard(task));
    this.attachDropzone(container, STATUS.WAITING);
  }

  renderSomeday() {
    const tasks = this.taskManager.getTasks({
      status: STATUS.SOMEDAY,
      context: this.filters.context,
      projectId: this.filters.project,
      searchTerm: this.filters.search,
      person: this.filters.person,
      energy: this.filters.energy,
      time: this.filters.time,
    });
    const container = this.elements.somedayList;
    renderTaskList(container, tasks, (task) => this.createTaskCard(task));
    this.attachDropzone(container, STATUS.SOMEDAY);
  }

  renderCalendar() {
    const entries = this.taskManager.getCalendarEntries({ exactDate: this.filters.date || undefined });
    const list = this.elements.calendarList;
    this.renderCalendarGrid(entries);
    if (!list) return;
    list.innerHTML = "";

    if (!entries.length) {
      const empty = document.createElement("li");
      empty.className = "calendar-item muted";
      empty.textContent = "No scheduled items.";
      list.append(empty);
      return;
    }

    entries.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "calendar-item";
      const friendly = formatFriendlyDate(entry.date);
      const isDue = entry.isDue === true;
      const isCompleted = entry.isCompleted === true;
      li.innerHTML = `
        <strong>${entry.title}</strong>
        <span class="calendar-meta">
          <span>${friendly}</span>
          <span>${entry.context || "No context"}</span>
          <span>Status: ${entry.status}</span>
        </span>
      `;
      if (isCompleted) {
        li.classList.add("is-completed");
      } else if (isDue) {
        li.classList.add("is-due");
      }
      li.dataset.taskId = entry.taskId;
      if (!isCompleted) {
        li.draggable = true;
        enableDrag(li, entry.taskId);
      }
      li.addEventListener("click", () => this.openTaskFlyout(entry.taskId));
      list.append(li);
    });
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
          const hasTime = typeof entry.date === "string" && entry.date.includes("T");
          const timeLabel = hasTime ? new Date(entry.date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
          item.textContent = `${timeLabel ? `${timeLabel} • ` : ""}${entry.title}`;
          item.dataset.taskId = entry.taskId;
          if (!entry.isCompleted) {
            item.draggable = true;
            enableDrag(item, entry.taskId);
          }
          item.addEventListener("click", () => this.openTaskFlyout(entry.taskId));
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
    const years = this.getReportYears(completedTasks);
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
    const summary = this.taskManager.getCompletionSummary({
      grouping,
      year: grouping === "year" ? undefined : this.reportFilters.year,
      contexts: this.reportFilters.contexts,
      projectIds: this.reportFilters.projects,
    });
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
    if (reportDetailsMeta) {
      reportDetailsMeta.textContent = `${entry.count} done`;
    }
    reportDetailsList.innerHTML = "";
    const tasks = Array.isArray(entry.tasks) ? entry.tasks.slice() : [];
    if (!tasks.length) {
      const empty = document.createElement("li");
      empty.className = "muted small-text";
      empty.textContent = "No completion details recorded.";
      reportDetailsList.append(empty);
      return;
    }
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
        actions.append(restoreBtn);
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
    const tasks = this.taskManager.getTasks({
      status: STATUS.NEXT,
      context: contextValue === "all" ? undefined : contextValue,
      includeCompleted: false,
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
    title.textContent = task.title || "Untitled task";

    const meta = document.createElement("div");
    meta.className = "task-row-meta";
    const metaItems = [];
    if (this.isTaskOverdue(task)) {
      metaItems.push(this.createMetaSpan("OVERDUE", "task-meta-pill task-meta-overdue"));
    }
    metaItems.push(this.createMetaSpan(STATUS_LABELS[task.status] || task.status));
    if (task.context) metaItems.push(this.createMetaSpan(task.context));
    const projectName = this.getProjectName(task.projectId);
    if (projectName) metaItems.push(this.createMetaSpan(projectName));
    if (task.peopleTag) metaItems.push(this.createMetaSpan(`With ${task.peopleTag}`));
    if (task.assignee) metaItems.push(this.createMetaSpan(`With ${task.assignee}`));
    if (task.waitingFor) metaItems.push(this.createMetaSpan(`Waiting: ${task.waitingFor}`));
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
      this.openTaskFlyout(task.id);
    };
    row.addEventListener("click", () => openDetails());
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDetails();
      }
    });

    enableDrag(row, task.id);
    return row;
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
      clarifyIdentifyContinue,
      clarifyActionableYes,
      clarifyActionInput,
      clarifyActionContinue,
      clarifyConvertProject,
      clarifyTwoMinuteYes,
      clarifyTwoMinuteNo,
      clarifyTwoMinuteFollowup,
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
      clarifyProjectContinue,
      clarifyProjectSelect,
      clarifyProjectOptionExisting,
      clarifyProjectOptionNew,
      clarifyProjectOptionNone,
      clarifyProjectNewInput,
      clarifyContextSelect,
      clarifyEnergySelect,
      clarifyTimeSelect,
      clarifyMetadataSave,
      clarifyMetadataSkip,
      clarifyAddContext,
      clarifyTwoMinuteStep,
      clarifyStepIdentify,
      clarifyStepActionable,
      clarifyStepActionPlan,
      clarifyStepDates,
      clarifyStepProject,
      clarifyStepMetadata,
      clarifyStepFinal,
      clarifyFinalMessage,
      clarifyFinalReturn,
    } = this.elements;
    if (!clarifyModal) return;
    this.handleClarifyKeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeClarifyModal();
      }
    };
    this.clarifyDestinationButtons = Array.from(clarifyModal.querySelectorAll("[data-clarify-nonaction]"));
    clarifyIdentifyContinue?.addEventListener("click", () => this.showClarifyStep("actionable"));
    clarifyActionableYes?.addEventListener("click", () => this.handleClarifyActionableChoice(true));
    this.clarifyDestinationButtons.forEach((button) => {
      button.addEventListener("click", () => this.handleClarifyNonAction(button.dataset.clarifyNonaction));
    });
    clarifyActionContinue?.addEventListener("click", () => this.handleClarifyActionContinue());
    clarifyConvertProject?.addEventListener("click", () => this.handleClarifyConvertToProject());
    clarifyTwoMinuteYes?.addEventListener("click", () => this.handleClarifyTwoMinuteYes());
    clarifyTwoMinuteNo?.addEventListener("click", () => this.showClarifyStep("who"));
    clarifyTwoMinuteExpectYes?.addEventListener("click", () => this.handleTwoMinuteFollowup(true));
    clarifyTwoMinuteExpectNo?.addEventListener("click", () => this.handleTwoMinuteFollowup(false));
    clarifyWhoSelf?.addEventListener("click", () => this.showClarifyStep("dates"));
    clarifyWhoDelegate?.addEventListener("click", () => this.handleClarifyDelegation(clarifyDelegateNameInput?.value));
    clarifyDateContinue?.addEventListener("click", () => this.handleClarifyDateDecision());
    clarifyProjectContinue?.addEventListener("click", () => this.handleClarifyProjectContinue());
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
    };
    clarifyTwoMinuteStep?.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        clearFollowup();
      }
    });
    clarifyStepIdentify?.addEventListener("click", () => clearFollowup());
    clarifyStepActionable?.addEventListener("click", () => clearFollowup());
    clarifyStepActionPlan?.addEventListener("click", () => clearFollowup());
    clarifyStepDates?.addEventListener("click", () => clearFollowup());
    clarifyStepProject?.addEventListener("click", () => clearFollowup());
    clarifyStepMetadata?.addEventListener("click", () => clearFollowup());
    clarifyStepFinal?.addEventListener("click", () => clearFollowup());
    closeClarifyModal?.addEventListener("click", () => this.closeClarifyModal());
    clarifyBackdrop?.addEventListener("click", () => this.closeClarifyModal());
    clarifyActionInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.handleClarifyActionContinue();
      }
    });
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
      nextActionTitle: "",
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
    this.populateClarifyPreview(task);
    this.populateClarifyContexts();
    this.populateProjectSelect();
    this.showClarifyStep("identify");
    this.setClarifyModalOpen(true);
  }

  closeClarifyModal() {
    this.setClarifyModalOpen(false);
  }

  showClarifyStep(step) {
    const sections = [
      ["identify", this.elements.clarifyStepIdentify],
      ["actionable", this.elements.clarifyStepActionable],
      ["action-plan", this.elements.clarifyStepActionPlan],
      ["two-minute", this.elements.clarifyTwoMinuteStep],
      ["who", this.elements.clarifyWhoStep],
      ["dates", this.elements.clarifyStepDates],
      ["project", this.elements.clarifyStepProject],
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
      "identify": this.elements.clarifyIdentifyContinue,
      "actionable": this.elements.clarifyActionableYes,
      "action-plan": this.elements.clarifyActionInput,
      "two-minute": this.elements.clarifyTwoMinuteYes,
      "who": this.elements.clarifyWhoSelf,
      "dates": this.elements.clarifyDateOptionNone,
      "project": this.elements.clarifyProjectSelect,
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
      this.elements.clarifyPreviewText.textContent = task.description || task.title || "(No details captured)";
    }
    document.querySelectorAll(".clarify-preview").forEach((el) => {
      el.textContent = task.description || task.title || "(No details captured)";
    });
    if (this.elements.clarifyActionInput) {
      this.elements.clarifyActionInput.value = task.title || "";
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
    if (this.elements.clarifyProjectOptionNone) {
      this.elements.clarifyProjectOptionNone.checked = true;
    }
    if (this.elements.clarifyProjectOptionExisting) {
      this.elements.clarifyProjectOptionExisting.checked = false;
    }
    if (this.elements.clarifyProjectOptionNew) {
      this.elements.clarifyProjectOptionNew.checked = false;
    }
    if (this.elements.clarifyProjectNewInput) {
      this.elements.clarifyProjectNewInput.value = "";
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
    placeholder.textContent = "No project";
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
    } else if (destination === "reference") {
      this.taskManager.completeTask(this.clarifyState.taskId, { archive: "reference" });
    } else if (destination === "someday") {
      this.taskManager.moveTask(this.clarifyState.taskId, STATUS.SOMEDAY);
      this.taskManager.notify("info", "Moved to Someday / Maybe.");
    }
    this.closeClarifyModal();
    this.setActivePanel("inbox");
  }

  handleClarifyActionContinue() {
    if (!this.clarifyState.taskId) return;
    const title = this.elements.clarifyActionInput?.value?.trim();
    if (!title) {
      this.taskManager.notify("warn", "Describe the next physical action before continuing.");
      this.elements.clarifyActionInput?.focus();
      return;
    }
    this.clarifyState.nextActionTitle = title;
    this.showClarifyStep("two-minute");
  }

  handleClarifyConvertToProject() {
    if (!this.clarifyState.taskId) return;
    const actionTitle = this.elements.clarifyActionInput?.value?.trim();
    if (!actionTitle) {
      this.taskManager.notify("warn", "Describe the next action before converting to a project.");
      this.elements.clarifyActionInput?.focus();
      return;
    }
    this.clarifyState.nextActionTitle = actionTitle;
    const projectName = window.prompt("Project name");
    if (!projectName || !projectName.trim()) {
      return;
    }
    const trimmedName = projectName.trim();
    const task = this.taskManager.getTaskById(this.clarifyState.taskId);
    const confirmed = window.confirm(`Convert "${task?.title || "this task"}" into project "${trimmedName}"?`);
    if (!confirmed) {
      return;
    }
    const project = this.taskManager.addProject(trimmedName);
    if (project) {
      this.clarifyState.projectId = project.id;
      this.clarifyState.projectName = project.name;
      this.populateProjectSelect();
      if (this.elements.clarifyProjectSelect) {
        this.elements.clarifyProjectSelect.value = project.id;
      }
      if (this.elements.clarifyProjectOptionExisting) {
        this.elements.clarifyProjectOptionExisting.checked = true;
      }
      this.taskManager.notify("info", `Created project "${project.name}".`);
      this.showClarifyStep("two-minute");
    }
  }

  handleClarifyProjectContinue() {
    if (!this.clarifyState.taskId) return;
    const existingSelected = this.elements.clarifyProjectOptionExisting?.checked;
    const newSelected = this.elements.clarifyProjectOptionNew?.checked;
    const noneSelected = this.elements.clarifyProjectOptionNone?.checked;
    if (existingSelected) {
      const selectedId = this.elements.clarifyProjectSelect?.value;
      if (selectedId && selectedId !== "none") {
        this.clarifyState.projectId = selectedId;
      } else {
        this.clarifyState.projectId = null;
      }
    } else if (newSelected) {
      const newName = this.elements.clarifyProjectNewInput?.value?.trim();
      if (!newName) {
        this.taskManager.notify("warn", "Provide a project name.");
        this.elements.clarifyProjectNewInput?.focus();
        return;
      }
      const project = this.taskManager.addProject(newName);
      if (project) {
        this.clarifyState.projectId = project.id;
        this.clarifyState.projectName = project.name;
        this.populateProjectSelect();
        this.elements.clarifyProjectSelect.value = project.id;
        if (this.elements.clarifyProjectOptionExisting) {
          this.elements.clarifyProjectOptionExisting.checked = true;
        }
        if (this.elements.clarifyProjectOptionNew) {
          this.elements.clarifyProjectOptionNew.checked = false;
        }
      }
    } else if (noneSelected) {
      this.clarifyState.projectId = null;
    }
    this.showClarifyStep("metadata");
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
    this.showClarifyStep("project");
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
    if (followup) {
      followup.hidden = false;
    }
    const responseInput = this.elements.clarifyTwoMinuteResponseInput;
    if (responseInput) {
      responseInput.focus();
    }
  }

  handleTwoMinuteFollowup(expectResponse) {
    if (!this.clarifyState.taskId) return;
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
      const updates = {
        title: this.clarifyState.nextActionTitle || task.title,
        status: STATUS.WAITING,
        waitingFor,
        context: this.clarifyState.context || task.context || PHYSICAL_CONTEXTS[0],
        projectId: this.clarifyState.projectId || task.projectId || null,
      };
      this.taskManager.updateTask(task.id, updates);
      this.taskManager.notify("info", "Captured as Waiting For.");
    } else {
      this.taskManager.completeTask(task.id, { archive: "reference", closureNotes: task.closureNotes });
      this.taskManager.notify("info", "Completed in under two minutes.");
    }
    this.closeClarifyModal();
    this.setActivePanel("inbox");
  }

  handleClarifyDelegation(name) {
    if (!this.clarifyState.taskId) return;
    const assignee = name?.trim() || this.elements.clarifyDelegateNameInput?.value?.trim();
    if (!assignee) {
      this.taskManager.notify("warn", "Provide an assignee to delegate.");
      this.elements.clarifyDelegateNameInput?.focus();
      return;
    }
    const task = this.taskManager.getTaskById(this.clarifyState.taskId);
    if (!task) {
      this.closeClarifyModal();
      return;
    }
    const updates = {
      title: this.clarifyState.nextActionTitle || task.title,
      status: STATUS.WAITING,
      waitingFor: assignee,
      context: this.clarifyState.context || task.context || PHYSICAL_CONTEXTS[0],
      projectId: this.clarifyState.projectId || task.projectId || null,
    };
    this.taskManager.updateTask(task.id, updates);
    this.taskManager.notify("info", "Delegated and moved to Waiting For.");
    this.closeClarifyModal();
    this.setActivePanel("inbox");
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

  finalizeClarifyRouting({ early = false } = {}) {
    const task = this.taskManager.getTaskById(this.clarifyState.taskId);
    if (!task) {
      this.closeClarifyModal();
      return;
    }
    const updates = {
      title: this.clarifyState.nextActionTitle || task.title,
      description: task.description,
      context: this.clarifyState.context || task.context || PHYSICAL_CONTEXTS[0],
      energyLevel: this.clarifyState.energy || null,
      timeRequired: this.clarifyState.time || null,
      projectId: this.clarifyState.projectId || null,
      calendarDate: null,
      dueDate: null,
      waitingFor: null,
      status: STATUS.NEXT,
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
    if (updates.status === STATUS.WAITING) destinations.push("Waiting For");
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

  openTaskFlyout(taskId) {
    const flyout = this.elements.taskFlyout;
    if (!flyout) return;
    const task = typeof taskId === "string" ? this.taskManager.getTaskById(taskId) : taskId;
    if (!task) return;
    const wasOpen = this.isFlyoutOpen;
    this.currentFlyoutTaskId = task.id;
    this.renderTaskFlyout(task);
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
    flyout.classList.remove("is-open");
    flyout.setAttribute("aria-hidden", "true");
    this.isFlyoutOpen = false;
    this.currentFlyoutTaskId = null;
    if (this.handleFlyoutKeydown) {
      document.removeEventListener("keydown", this.handleFlyoutKeydown);
    }
  }

  renderTaskFlyout(task) {
    const content = this.elements.taskFlyoutContent;
    if (!content) return;
    const titleEl = this.elements.taskFlyoutTitle;
    const statusEl = this.elements.taskFlyoutStatus;
    if (titleEl) titleEl.textContent = task.title || "Untitled task";
    if (statusEl) statusEl.textContent = STATUS_LABELS[task.status] || task.status;
    content.innerHTML = "";

    const description = document.createElement("p");
    description.textContent = task.description || task.title || "No description yet.";
    description.className = "muted";

    const meta = document.createElement("div");
    meta.className = "task-flyout-meta";
    meta.append(this.buildMetaRow("Context", task.context || "—"));
    meta.append(this.buildMetaRow("Project", this.getProjectName(task.projectId) || "—"));
    meta.append(this.buildMetaRow("People tag", task.peopleTag || "—"));
    meta.append(this.buildMetaRow("Energy level", task.energyLevel || "—"));
    meta.append(this.buildMetaRow("Time required", task.timeRequired || "—"));
    meta.append(this.buildMetaRow("Due date", task.dueDate ? formatFriendlyDate(task.dueDate) : "—"));
    meta.append(this.buildMetaRow("Calendar", task.calendarDate ? formatFriendlyDate(task.calendarDate) : "—"));
    meta.append(this.buildMetaRow("Waiting on", task.waitingFor || "—"));
    meta.append(this.buildMetaRow("Assignee", task.assignee || "—"));
    meta.append(this.buildMetaRow("Completed", task.completedAt ? formatFriendlyDate(task.completedAt) : "—"));

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
      const reminder = document.createElement("p");
      reminder.className = "muted small-text";
      reminder.textContent = "Processing will walk through Clarify → Organize.";
      inboxPanel.append(instructions, processButton, reminder);
      content.append(description, meta, inboxPanel);
      return;
    }

    const actionToolbar = document.createElement("div");
    actionToolbar.className = "task-flyout-actions";
    actionToolbar.setAttribute("role", "group");
    actionToolbar.setAttribute("aria-label", "Task actions");
    const isCompleted = Boolean(task.completedAt);
    const transitions = TRANSITIONS[task.status] || [];

    if (!isCompleted) {
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

    content.append(description, meta, actionToolbar);
    content.append(this.createTaskForm(task));
  }

  createTaskForm(task) {
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
    titleGroup.append(titleInput);

    const descriptionGroup = document.createElement("label");
    descriptionGroup.className = "task-edit-field";
    descriptionGroup.textContent = "Description";
    const descriptionInput = document.createElement("textarea");
    descriptionInput.rows = 3;
    descriptionInput.value = task.description || "";
    descriptionGroup.append(descriptionInput);

    const contextGroup = document.createElement("label");
    contextGroup.className = "task-edit-field";
    contextGroup.textContent = "Physical context";
    const contextInput = document.createElement("input");
    contextInput.type = "text";
    contextInput.setAttribute("list", "contextSuggestions");
    contextInput.placeholder = "@Office";
    contextInput.value = task.context || "";
    contextGroup.append(contextInput);

    const peopleGroup = document.createElement("label");
    peopleGroup.className = "task-edit-field";
    peopleGroup.textContent = "People context";
    const peopleInput = document.createElement("input");
    peopleInput.type = "text";
    peopleInput.setAttribute("list", "peopleSuggestions");
    peopleInput.placeholder = "@Boss";
    peopleInput.value = task.peopleTag || "";
    peopleGroup.append(peopleInput);

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
    statusValue.textContent = `${STATUS_LABELS[task.status] || task.status} (use workflow buttons to change)`;
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
    createProjectButton.addEventListener("click", () => this.createProjectForTask(task));
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
    const calendarInput = document.createElement("input");
    calendarInput.type = "date";
    calendarInput.value = task.calendarDate || "";
    calendarGroup.append(calendarInput);

    const waitingGroup = document.createElement("label");
    waitingGroup.className = "task-edit-field";
    waitingGroup.textContent = "Waiting on";
    const waitingInput = document.createElement("input");
    waitingInput.type = "text";
    waitingInput.placeholder = "Person or dependency";
    waitingInput.value = task.waitingFor || "";
    waitingGroup.append(waitingInput);

    const assigneeGroup = document.createElement("label");
    assigneeGroup.className = "task-edit-field";
    assigneeGroup.textContent = "Assignee";
    const assigneeInput = document.createElement("input");
    assigneeInput.type = "text";
    assigneeInput.placeholder = "Task owner";
    assigneeInput.value = task.assignee || "";
    assigneeGroup.append(assigneeInput);

    const closureGroup = document.createElement("label");
    closureGroup.className = "task-edit-field";
    closureGroup.textContent = "Closure notes";
    const closureInput = document.createElement("textarea");
    closureInput.rows = 3;
    closureInput.placeholder = "Optional wrap-up notes when completing this task.";
    closureInput.value = task.closureNotes || "";
    closureGroup.append(closureInput);

    const buildTaskUpdates = () => {
      const trimmedTitle = titleInput.value.trim();
      if (!trimmedTitle) {
        return null;
      }
      const updates = {
        title: trimmedTitle,
        description: descriptionInput.value.trim(),
        context: contextInput.value.trim() || null,
        peopleTag: peopleInput.value.trim() || null,
        energyLevel: energyInput.value || null,
        timeRequired: timeInput.value || null,
        projectId: projectSelect.value || null,
        dueDate: dueInput.value || null,
        calendarDate: calendarInput.value || null,
        waitingFor: waitingInput.value.trim() || null,
        assignee: assigneeInput.value.trim() || null,
        closureNotes: closureInput.value.trim() || null,
      };
      if (task.status === STATUS.WAITING && !updates.waitingFor) {
        updates.waitingFor = "Pending assignee";
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
      this.taskManager.updateTask(task.id, updates);
      return true;
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
      peopleInput,
      energyInput,
      timeInput,
      projectSelect,
      dueInput,
      calendarInput,
      waitingInput,
      assigneeInput,
      closureInput,
    ];
    autoSaveFields.forEach((field) => {
      field.addEventListener("change", scheduleAutoSave);
    });

    const actions = document.createElement("div");
    actions.className = "task-edit-actions";

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

    const actionButtons = document.createElement("div");
    actionButtons.className = "task-edit-actions-group";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "btn btn-light";
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => this.closeTaskFlyout());

    actionButtons.append(closeButton);
    actions.append(deleteButton, actionButtons);

    form.append(
      titleGroup,
      descriptionGroup,
      contextGroup,
      peopleGroup,
      energyGroup,
      timeGroup,
      statusGroup,
      projectGroup,
      dueGroup,
      calendarGroup,
      waitingGroup,
      assigneeGroup,
      closureGroup,
      actions
    );

    form.addEventListener("submit", (event) => {
      event.preventDefault();
    });

    return form;
  }

  createProjectForTask(task) {
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
      this.taskManager.updateTask(task.id, { projectId: project.id });
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

  attachDropzone(element, status, context) {
    if (!element) return;
    if (!element.dataset.dropzone) element.dataset.dropzone = status;
    if (context) element.dataset.context = context;
    if (this.dropzones.includes(element)) return;
    this.dropzones.push(element);

    const helper = window.DragDropHelper;
    if (helper) {
      helper.setupDropzone(element, {
        onDrop: (taskId) => this.handleDrop(taskId, status, context),
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
        if (taskId) this.handleDrop(taskId, status, context);
      });
    }
  }

  handleDrop(taskId, status, context) {
    const task = this.taskManager.getTaskById(taskId);
    if (!task) {
      this.taskManager.notify("error", "Cannot drop missing task.");
      return;
    }
    if (status === STATUS.NEXT) {
      const updates = { status };
      if (context !== undefined) {
        updates.context = context === "No context" ? null : context;
      }
      this.taskManager.updateTask(taskId, updates);
    } else {
      this.taskManager.moveTask(taskId, status);
    }
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

  syncTheme(theme) {
    const appRoot = this.elements.appRoot;
    appRoot.dataset.theme = theme;
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    const toggle = this.elements.themeToggle;
    toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    toggle.querySelector(".theme-icon").textContent = theme === "dark" ? "☾" : "☀︎";
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

function mapElements() {
  const byId = (id) => document.getElementById(id);
  return {
    appRoot: document.querySelector(".app"),
    alerts: document.querySelector(".alerts"),
    contextFilterPicker: byId("contextFilterPicker"),
    contextFilterToggle: byId("contextFilterToggle"),
    contextFilterOptions: byId("contextFilterOptions"),
    projectFilterPicker: byId("projectFilterPicker"),
    projectFilterToggle: byId("projectFilterToggle"),
    projectFilterOptions: byId("projectFilterOptions"),
    personFilterPicker: byId("personFilterPicker"),
    personFilterToggle: byId("personFilterToggle"),
    personFilterOptions: byId("personFilterOptions"),
    energyFilterPicker: byId("energyFilterPicker"),
    energyFilterToggle: byId("energyFilterToggle"),
    energyFilterOptions: byId("energyFilterOptions"),
    timeFilterPicker: byId("timeFilterPicker"),
    timeFilterToggle: byId("timeFilterToggle"),
    timeFilterOptions: byId("timeFilterOptions"),
    searchTasks: byId("searchTasks"),
    searchToggle: byId("toggleSearch"),
    searchField: byId("searchTasksContainer"),
    clearFilters: byId("clearFilters"),
    expandProjects: byId("expandProjects"),
    calendarDate: byId("calendarDate"),
    calendarGrid: byId("calendarGrid"),
    calendarMonthLabel: byId("calendarMonthLabel"),
    calendarPrevMonth: byId("calendarPrevMonth"),
    calendarNextMonth: byId("calendarNextMonth"),
    calendarList: byId("calendarList"),
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
    connectionStatusDot: byId("connectionStatusDot"),
    taskFlyout: document.getElementById("taskFlyout"),
    taskFlyoutContent: byId("taskFlyoutContent"),
    taskFlyoutTitle: byId("taskFlyoutTitle"),
    taskFlyoutStatus: byId("taskFlyoutStatus"),
    closeTaskFlyout: byId("closeTaskFlyout"),
    taskFlyoutBackdrop: document.querySelector(".task-flyout-backdrop"),
    activePanelHeading: byId("activePanelHeading"),
    activePanelCount: byId("activePanelCount"),
    inboxList: document.querySelector('.panel-body[data-dropzone="inbox"]'),
    contextBoard: document.querySelector("[data-context-board]"),
      projectList: document.querySelector("[data-projects]"),
    projectAreaFilter: document.getElementById("projectAreaFilter"),
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
    summaryWaiting: byId("summaryWaiting"),
    summarySomeday: byId("summarySomeday"),
    summaryProjects: byId("summaryProjects"),
    summaryCalendar: byId("summaryCalendar"),
    summaryCompleted: byId("summaryCompleted"),
    footerYear: byId("footerYear"),
    themeToggle: document.getElementById("themeToggle"),
    integrationsCard: document.querySelector(".integrations-card"),
    contextSuggestions: document.getElementById("contextSuggestions"),
    peopleSuggestions: document.getElementById("peopleSuggestions"),
    energySuggestions: document.getElementById("energySuggestions"),
    timeSuggestions: document.getElementById("timeSuggestions"),
    projectAreaSuggestions: document.getElementById("projectAreaSuggestions"),
    projectThemeSuggestions: document.getElementById("projectThemeSuggestions"),
    projectStatusSuggestions: document.getElementById("projectStatusSuggestions"),
    randomContext: byId("randomContext"),
    pickRandomTask: byId("pickRandomTask"),
    clarifyModal: document.getElementById("clarifyModal"),
    clarifyBackdrop: document.querySelector("#clarifyModal .modal-backdrop"),
    closeClarifyModal: byId("closeClarifyModal"),
    clarifyStepIdentify: byId("clarifyStepIdentify"),
    clarifyStepActionable: byId("clarifyStepActionable"),
    clarifyStepActionPlan: byId("clarifyStepActionPlan"),
    clarifyTwoMinuteStep: byId("clarifyStepTwoMinute"),
    clarifyWhoStep: byId("clarifyStepWho"),
    clarifyStepProject: byId("clarifyStepProject"),
    clarifyStepDates: byId("clarifyStepDates"),
    clarifyStepMetadata: byId("clarifyStepMetadata"),
    clarifyStepFinal: byId("clarifyStepFinal"),
    clarifyPreviewText: byId("clarifyPreviewText"),
    clarifyIdentifyContinue: byId("clarifyIdentifyContinue"),
    clarifyActionableYes: byId("clarifyActionableYes"),
    clarifyActionInput: byId("clarifyActionInput"),
    clarifyActionContinue: byId("clarifyActionContinue"),
    clarifyConvertProject: byId("clarifyConvertProject"),
    clarifyTwoMinuteYes: byId("clarifyTwoMinuteYes"),
    clarifyTwoMinuteNo: byId("clarifyTwoMinuteNo"),
    clarifyTwoMinuteFollowup: byId("clarifyTwoMinuteFollowup"),
    clarifyTwoMinuteExpectYes: byId("clarifyTwoMinuteExpectYes"),
    clarifyTwoMinuteExpectNo: byId("clarifyTwoMinuteExpectNo"),
    clarifyTwoMinuteResponseInput: byId("clarifyTwoMinuteResponseInput"),
    clarifyWhoSelf: byId("clarifyWhoSelf"),
    clarifyWhoDelegate: byId("clarifyWhoDelegate"),
    clarifyDelegateNameInput: byId("clarifyDelegateNameInput"),
    clarifyProjectSelect: byId("clarifyProjectSelect"),
    clarifyProjectOptionExisting: byId("clarifyProjectOptionExisting"),
    clarifyProjectOptionNew: byId("clarifyProjectOptionNew"),
    clarifyProjectOptionNone: byId("clarifyProjectOptionNone"),
    clarifyProjectNewInput: byId("clarifyProjectNewInput"),
    clarifyProjectContinue: byId("clarifyProjectContinue"),
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

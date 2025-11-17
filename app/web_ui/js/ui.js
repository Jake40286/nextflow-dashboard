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
      context: "all",
      project: "all",
      person: "all",
      energy: "all",
      time: "all",
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
      context: "all",
      project: "all",
    };
    this.activeReportKey = null;
    this.currentFlyoutTaskId = null;
    this.isFlyoutOpen = false;
    this.handleFlyoutKeydown = null;
    this.projectCache = null;
    this.projectLookup = new Map();
    this.clarifyState = { taskId: null, actionable: null, currentStep: "describe", actionPlanInitialized: false };
    this.handleClarifyKeydown = null;
    this.lastClarifyFocus = null;
    this.clarifyDestinationButtons = [];
  }

  init() {
    this.elements = mapElements();
    this.bindListeners();
    this.setupSummaryTabs();
    this.setupFlyout();
    this.bindClarifyModal();
    this.renderAll();
    this.syncTheme(this.taskManager.getTheme());
    this.updateFooterYear();
  }

  bindListeners() {
    const {
      contextFilter,
      projectFilter,
      personFilter,
      energyFilter,
      timeFilter,
      searchTasks,
      searchToggle,
      searchField,
      clearFilters,
      expandProjects,
      calendarDate,
      integrationsCard,
      reportGrouping,
      reportYear,
      reportContext,
      reportProject,
      randomContext,
      pickRandomTask,
    } = this.elements;

    contextFilter.addEventListener("change", () => {
      this.filters.context = contextFilter.value;
      this.renderAll();
    });

    projectFilter.addEventListener("change", () => {
      this.filters.project = projectFilter.value;
      this.renderAll();
    });

    personFilter?.addEventListener("change", () => {
      this.filters.person = personFilter.value;
      this.renderAll();
    });

    energyFilter?.addEventListener("change", () => {
      this.filters.energy = energyFilter.value;
      this.renderAll();
    });

    timeFilter?.addEventListener("change", () => {
      this.filters.time = timeFilter.value;
      this.renderAll();
    });

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
      this.filters = { context: "all", project: "all", person: "all", energy: "all", time: "all", search: "", date: "" };
      contextFilter.value = "all";
      projectFilter.value = "all";
      if (personFilter) personFilter.value = "all";
      if (energyFilter) energyFilter.value = "all";
      if (timeFilter) timeFilter.value = "all";
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

    calendarDate.addEventListener("change", () => {
      this.filters.date = calendarDate.value;
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
    reportContext?.addEventListener("change", () => {
      this.reportFilters.context = reportContext.value;
      this.renderReports();
    });
    reportProject?.addEventListener("change", () => {
      this.reportFilters.project = reportProject.value;
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
    const projects = this.projectCache || [];

    fillSelect(this.elements.contextFilter, contexts, this.filters.context);
    if (this.elements.randomContext) {
      fillSelect(this.elements.randomContext, contexts, this.randomContext || "all");
    }
    fillProjectSelect(this.elements.projectFilter, projects, this.filters.project);
    const allTasks = this.taskManager.getTasks({ includeCompleted: true });
    const people = new Set();
    const energyLevels = new Set([...ENERGY_LEVELS]);
    const timeEstimates = new Set([...TIME_REQUIREMENTS]);
    allTasks.forEach((task) => {
      if (task.peopleTag) people.add(task.peopleTag);
      if (task.energyLevel) energyLevels.add(task.energyLevel);
      if (task.timeRequired) timeEstimates.add(task.timeRequired);
    });
    if (this.elements.personFilter) {
      fillSelect(this.elements.personFilter, Array.from(people).sort((a, b) => a.localeCompare(b)), this.filters.person);
    }
    if (this.elements.energyFilter) {
      fillSelect(this.elements.energyFilter, Array.from(energyLevels).sort((a, b) => a.localeCompare(b)), this.filters.energy);
    }
    if (this.elements.timeFilter) {
      fillSelect(this.elements.timeFilter, Array.from(timeEstimates).sort((a, b) => a.localeCompare(b)), this.filters.time);
    }
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
    const projects = this.projectCache || [];

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
      li.innerHTML = `
        <strong>${entry.title}</strong>
        <span class="calendar-meta">
          <span>${friendly}</span>
          <span>${entry.context || "No context"}</span>
          <span>Status: ${entry.status}</span>
        </span>
      `;
      list.append(li);
    });
    if (this.activePanel === "calendar") {
      this.updateActivePanelMeta();
    }
  }

  renderReports() {
    const { reportList, reportEmpty, reportGrouping, reportYear, reportContext, reportProject } = this.elements;
    if (!reportList) return;
    const grouping = this.reportFilters.grouping;
    if (reportGrouping) {
      reportGrouping.value = grouping;
    }
    const contexts = this.taskManager.getContexts();
    if (reportContext) {
      fillSelect(reportContext, contexts, this.reportFilters.context);
      this.reportFilters.context = reportContext.value;
    }
    const projects = this.projectCache || [];
    if (reportProject) {
      fillProjectSelect(reportProject, projects, this.reportFilters.project);
      this.reportFilters.project = reportProject.value;
    }
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
      context: this.reportFilters.context,
      projectId: this.reportFilters.project,
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
      button.append(label, count);
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
        item.append(title, meta);
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
      metaItems.push(this.createMetaSpan(`Due ${formatFriendlyDate(task.dueDate)}`));
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
      clarifyActionableYes,
      clarifyActionInput,
      clarifyActionContinue,
      clarifyConvertProject,
      clarifyProjectBack,
      clarifyProjectContinue,
      clarifyDateBack,
      clarifyDateContinue,
      clarifyContextBack,
      clarifyFinish,
      clarifyAddContext,
      clarifyDelegateToggle,
      clarifyDelegateInput,
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
    this.clarifyDestinationButtons.forEach((button) => {
      button.addEventListener("click", () => this.handleClarifyNonAction(button.dataset.clarifyNonaction));
    });
    clarifyActionContinue?.addEventListener("click", () => this.handleClarifyActionContinue());
    clarifyConvertProject?.addEventListener("click", () => this.handleClarifyConvertToProject());
    clarifyProjectBack?.addEventListener("click", () => this.showClarifyStep("action-plan"));
    clarifyProjectContinue?.addEventListener("click", () => this.handleClarifyProjectContinue());
    clarifyDateBack?.addEventListener("click", () => this.showClarifyStep("project"));
    clarifyDateContinue?.addEventListener("click", () => this.handleClarifyDateContinue());
    clarifyContextBack?.addEventListener("click", () => this.showClarifyStep("dates"));
    clarifyFinish?.addEventListener("click", () => this.handleClarifyFinalize());
    clarifyAddContext?.addEventListener("click", () => this.handleClarifyAddContext());
    clarifyDelegateToggle?.addEventListener("change", () => {
      if (!clarifyDelegateInput) return;
      const enabled = Boolean(clarifyDelegateToggle?.checked);
      clarifyDelegateInput.disabled = !enabled;
      if (!enabled) {
        clarifyDelegateInput.value = "";
      } else {
        clarifyDelegateInput.focus();
      }
    });
    closeClarifyModal?.addEventListener("click", () => this.closeClarifyModal());
    clarifyBackdrop?.addEventListener("click", () => this.closeClarifyModal());
    clarifyActionInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.handleClarifyActionContinue();
      }
    });
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
      nextActionTitle: "",
      projectId: null,
      dueType: "none",
      calendarDate: "",
      dueDate: "",
      context: "",
      delegateTo: "",
      actionPlanInitialized: false,
      currentStep: "actionable",
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
    this.populateClarifyPreview(task);
    this.populateClarifyContexts();
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
      ["project", this.elements.clarifyStepProject],
      ["dates", this.elements.clarifyStepDates],
      ["context", this.elements.clarifyStepContext],
    ];
    sections.forEach(([name, element]) => {
      if (element) {
        element.hidden = name !== step;
      }
    });
    this.clarifyState.currentStep = step;
    const focusTargets = {
      "actionable": this.elements.clarifyActionableYes,
      "action-plan": this.elements.clarifyActionInput,
      "project": this.elements.clarifyProjectSelect,
      "dates": this.elements.clarifyDateOptionNone,
      "context": this.elements.clarifyContextSelect,
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
    if (this.elements.clarifyActionInput) {
      this.elements.clarifyActionInput.value = task.title || "";
    }
    if (this.elements.clarifySpecificDateInput) {
      this.elements.clarifySpecificDateInput.value = "";
    }
    if (this.elements.clarifyDueDateInput) {
      this.elements.clarifyDueDateInput.value = "";
    }
    if (this.elements.clarifyDelegateInput) {
      this.elements.clarifyDelegateInput.value = "";
      this.elements.clarifyDelegateInput.disabled = true;
    }
    if (this.elements.clarifyDelegateToggle) {
      this.elements.clarifyDelegateToggle.checked = false;
    }
    if (this.elements.clarifyProjectSelect) {
      this.populateProjectSelect();
    }
    if (this.elements.clarifyProjectOptionExisting) {
      this.elements.clarifyProjectOptionExisting.checked = true;
    }
    if (this.elements.clarifyProjectNewInput) {
      this.elements.clarifyProjectNewInput.value = "";
    }
    if (this.elements.clarifyDateOptionNone) {
      this.elements.clarifyDateOptionNone.checked = true;
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
    const contexts = this.taskManager.getContexts();
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
    placeholder.textContent = "Select a project";
    select.append(placeholder);
    const projects = this.taskManager.getProjects({ includeSomeday: true });
    projects.forEach((project) => {
      const option = document.createElement("option");
      option.value = project.id;
      option.textContent = project.name + (project.someday ? " (Someday)" : "");
      select.append(option);
    });
    if (this.clarifyState.projectId) {
      select.value = this.clarifyState.projectId;
    }
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
      this.taskManager.deleteTask(this.clarifyState.taskId);
      this.taskManager.notify("info", "Captured idea deleted.");
    } else if (destination === "reference") {
      this.taskManager.completeTask(this.clarifyState.taskId, { archive: "reference" });
    } else if (destination === "someday") {
      this.taskManager.moveTask(this.clarifyState.taskId, STATUS.SOMEDAY);
      this.taskManager.notify("info", "Moved to Someday / Maybe.");
    }
    this.closeClarifyModal();
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
    this.showClarifyStep("project");
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
    const project = this.taskManager.addProject(projectName.trim());
    if (project) {
      this.clarifyState.projectId = project.id;
      this.populateProjectSelect();
      if (this.elements.clarifyProjectSelect) {
        this.elements.clarifyProjectSelect.value = project.id;
      }
      if (this.elements.clarifyProjectOptionExisting) {
        this.elements.clarifyProjectOptionExisting.checked = true;
      }
      this.taskManager.notify("info", `Created project "${project.name}".`);
      this.showClarifyStep("project");
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
    this.showClarifyStep("dates");
  }

  handleClarifyDateContinue() {
    if (!this.clarifyState.taskId) return;
    const specific = this.elements.clarifyDateOptionSpecific?.checked;
    const due = this.elements.clarifyDateOptionDue?.checked;
    const none = this.elements.clarifyDateOptionNone?.checked;
    if (specific) {
      const date = this.elements.clarifySpecificDateInput?.value;
      if (!date) {
        this.taskManager.notify("warn", "Choose a calendar date.");
        return;
      }
      this.clarifyState.dueType = "calendar";
      this.clarifyState.calendarDate = date;
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
    this.showClarifyStep("context");
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

  handleClarifyFinalize() {
    if (!this.clarifyState.taskId) return;
    const contextValue = this.elements.clarifyContextSelect?.value;
    if (!contextValue) {
      this.taskManager.notify("warn", "Choose a context.");
      this.elements.clarifyContextSelect?.focus();
      return;
    }
    this.clarifyState.context = contextValue;
    const delegateEnabled = Boolean(this.elements.clarifyDelegateToggle?.checked);
    const delegateName = this.elements.clarifyDelegateInput?.value?.trim();
    if (delegateEnabled && !delegateName) {
      this.taskManager.notify("warn", "Provide who you are waiting on.");
      this.elements.clarifyDelegateInput?.focus();
      return;
    }
    const task = this.taskManager.getTaskById(this.clarifyState.taskId);
    if (!task) {
      this.closeClarifyModal();
      return;
    }
    const updates = {
      title: this.clarifyState.nextActionTitle || task.title,
      context: contextValue,
      projectId: this.clarifyState.projectId || null,
      calendarDate: null,
      dueDate: null,
      waitingFor: null,
      status: STATUS.NEXT,
    };
    if (this.clarifyState.dueType === "calendar") {
      updates.calendarDate = this.clarifyState.calendarDate;
    } else if (this.clarifyState.dueType === "due") {
      updates.dueDate = this.clarifyState.dueDate;
    }
    if (delegateEnabled && delegateName) {
      updates.status = STATUS.WAITING;
      updates.waitingFor = delegateName;
    }
    this.taskManager.updateTask(task.id, updates);
    this.taskManager.notify("info", "Task organized and removed from Inbox.");
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
        this.taskManager.completeTask(task.id, { archive: "reference" });
        this.closeTaskFlyout();
      });
      const completeDeleteButton = document.createElement("button");
      completeDeleteButton.type = "button";
      completeDeleteButton.className = "btn btn-danger";
      completeDeleteButton.textContent = "Complete & Delete";
      completeDeleteButton.addEventListener("click", () => {
        this.taskManager.completeTask(task.id, { archive: "log" });
        this.closeTaskFlyout();
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
    const energyInput = document.createElement("input");
    energyInput.type = "text";
    energyInput.setAttribute("list", "energySuggestions");
    energyInput.placeholder = "low / medium / custom";
    energyInput.value = task.energyLevel || "";
    energyGroup.append(energyInput);

    const timeGroup = document.createElement("label");
    timeGroup.className = "task-edit-field";
    timeGroup.textContent = "Time required";
    const timeInput = document.createElement("input");
    timeInput.type = "text";
    timeInput.setAttribute("list", "timeSuggestions");
    timeInput.placeholder = "<15min / custom";
    timeInput.value = task.timeRequired || "";
    timeGroup.append(timeInput);

    const statusGroup = document.createElement("label");
    statusGroup.className = "task-edit-field";
    statusGroup.textContent = "Status";
    const statusSelect = document.createElement("select");
    Object.values(STATUS).forEach((statusValue) => {
      const option = document.createElement("option");
      option.value = statusValue;
      option.textContent = STATUS_LABELS[statusValue] || statusValue;
      statusSelect.append(option);
    });
    statusSelect.value = task.status;
    statusGroup.append(statusSelect);

    const projectGroup = document.createElement("label");
    projectGroup.className = "task-edit-field";
    projectGroup.textContent = "Project";
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
    projectGroup.append(projectSelect);

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

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "btn btn-light";
    cancelButton.textContent = "Close";
    cancelButton.addEventListener("click", () => this.closeTaskFlyout());

    const saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.className = "btn btn-primary";
    saveButton.textContent = "Save changes";

    actionButtons.append(cancelButton, saveButton);
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
      actions
    );

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const trimmedTitle = titleInput.value.trim();
      if (!trimmedTitle) {
        this.taskManager.notify("warn", "Task title cannot be empty.");
        return;
      }
      const updates = {
        title: trimmedTitle,
        description: descriptionInput.value.trim(),
        context: contextInput.value.trim() || null,
        peopleTag: peopleInput.value.trim() || null,
        energyLevel: energyInput.value.trim() || null,
        timeRequired: timeInput.value.trim() || null,
        status: statusSelect.value,
        projectId: projectSelect.value || null,
        dueDate: dueInput.value || null,
        calendarDate: calendarInput.value || null,
        waitingFor: waitingInput.value.trim() || null,
        assignee: assigneeInput.value.trim() || null,
      };

      if (updates.status === STATUS.WAITING && !updates.waitingFor) {
        updates.waitingFor = "Pending assignee";
      }
      if (updates.status !== STATUS.WAITING && updates.waitingFor && updates.waitingFor.startsWith("Pending")) {
        updates.waitingFor = null;
      }

      this.taskManager.updateTask(task.id, updates);
    });

    return form;
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

  createMetaSpan(text) {
    const span = document.createElement("span");
    span.textContent = text;
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

  syncTheme(theme) {
    const appRoot = this.elements.appRoot;
    appRoot.dataset.theme = theme;
    const toggle = this.elements.themeToggle;
    toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    toggle.querySelector(".theme-icon").textContent = theme === "dark" ? "☾" : "☀︎";
  }

  updateFooterYear() {
    const year = new Date().getFullYear();
    this.elements.footerYear.textContent = year;
  }
}

function mapElements() {
  const byId = (id) => document.getElementById(id);
  return {
    appRoot: document.querySelector(".app"),
    alerts: document.querySelector(".alerts"),
    contextFilter: byId("contextFilter"),
    projectFilter: byId("projectFilter"),
    personFilter: byId("personFilter"),
    energyFilter: byId("energyFilter"),
    timeFilter: byId("timeFilter"),
    searchTasks: byId("searchTasks"),
    searchToggle: byId("toggleSearch"),
    searchField: byId("searchTasksContainer"),
    clearFilters: byId("clearFilters"),
    expandProjects: byId("expandProjects"),
    calendarDate: byId("calendarDate"),
    calendarList: byId("calendarList"),
    reportGrouping: byId("reportGrouping"),
    reportYear: byId("reportYear"),
    reportContext: byId("reportContext"),
    reportProject: byId("reportProject"),
    reportList: byId("reportList"),
    reportEmpty: byId("reportEmpty"),
    reportDetails: byId("reportDetails"),
    reportDetailsList: byId("reportDetailsList"),
    reportDetailsTitle: byId("reportDetailsTitle"),
    reportDetailsMeta: byId("reportDetailsMeta"),
    reportDetailsPlaceholder: byId("reportDetailsPlaceholder"),
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
    clarifyStepActionable: byId("clarifyStepActionable"),
    clarifyStepActionPlan: byId("clarifyStepActionPlan"),
    clarifyStepProject: byId("clarifyStepProject"),
    clarifyStepDates: byId("clarifyStepDates"),
    clarifyStepContext: byId("clarifyStepContext"),
    clarifyPreviewText: byId("clarifyPreviewText"),
    clarifyActionableYes: byId("clarifyActionableYes"),
    clarifyActionInput: byId("clarifyActionInput"),
    clarifyActionContinue: byId("clarifyActionContinue"),
    clarifyConvertProject: byId("clarifyConvertProject"),
    clarifyProjectSelect: byId("clarifyProjectSelect"),
    clarifyProjectOptionExisting: byId("clarifyProjectOptionExisting"),
    clarifyProjectOptionNew: byId("clarifyProjectOptionNew"),
    clarifyProjectOptionNone: byId("clarifyProjectOptionNone"),
    clarifyProjectNewInput: byId("clarifyProjectNewInput"),
    clarifyProjectBack: byId("clarifyProjectBack"),
    clarifyProjectContinue: byId("clarifyProjectContinue"),
    clarifyDateOptionSpecific: byId("clarifyDateOptionSpecific"),
    clarifyDateOptionDue: byId("clarifyDateOptionDue"),
    clarifyDateOptionNone: byId("clarifyDateOptionNone"),
    clarifySpecificDateInput: byId("clarifySpecificDateInput"),
    clarifyDueDateInput: byId("clarifyDueDateInput"),
    clarifyDateBack: byId("clarifyDateBack"),
    clarifyDateContinue: byId("clarifyDateContinue"),
    clarifyContextSelect: byId("clarifyContextSelect"),
    clarifyAddContext: byId("clarifyAddContext"),
    clarifyDelegateToggle: byId("clarifyDelegateToggle"),
    clarifyDelegateInput: byId("clarifyDelegateInput"),
    clarifyContextBack: byId("clarifyContextBack"),
    clarifyFinish: byId("clarifyFinish"),
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

function fillProjectSelect(select, projects, current) {
  while (select.options.length > 1) {
    select.remove(1);
  }
  projects.forEach((project) => {
    const opt = document.createElement("option");
    opt.value = project.id;
    opt.textContent = project.name + (project.someday ? " (Someday)" : "");
    select.append(opt);
  });
  if (select.querySelector(`option[value="${current}"]`)) {
    select.value = current;
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
    .forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      element.append(option);
    });
}

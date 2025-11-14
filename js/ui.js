import { STATUS, STATUS_LABELS, formatFriendlyDate } from "./data.js";

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
      search: "",
      date: "",
    };
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
    this.currentFlyoutTaskId = null;
    this.isFlyoutOpen = false;
    this.handleFlyoutKeydown = null;
    this.projectCache = null;
    this.projectLookup = new Map();
  }

  init() {
    this.bindListeners();
    this.setupSummaryTabs();
    this.setupFlyout();
    this.renderAll();
    this.syncTheme(this.taskManager.getTheme());
    this.updateFooterYear();
  }

  bindListeners() {
    const {
      contextFilter,
      projectFilter,
      searchTasks,
      clearFilters,
      expandProjects,
      calendarDate,
      integrationsCard,
      reportGrouping,
      reportYear,
      reportContext,
      reportProject,
    } = this.elements;

    contextFilter.addEventListener("change", () => {
      this.filters.context = contextFilter.value;
      this.renderAll();
    });

    projectFilter.addEventListener("change", () => {
      this.filters.project = projectFilter.value;
      this.renderAll();
    });

    searchTasks.addEventListener("input", (event) => {
      this.filters.search = event.target.value;
      this.renderAll();
    });

    clearFilters.addEventListener("click", () => {
      this.filters = { context: "all", project: "all", search: "", date: "" };
      contextFilter.value = "all";
      projectFilter.value = "all";
      searchTasks.value = "";
      calendarDate.value = "";
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
    this.renderSummary();
    this.renderFilters();
    this.renderInbox();
    this.renderNextActions();
    this.renderProjects();
    this.renderWaitingFor();
    this.renderSomeday();
    this.renderCalendar();
    this.renderReports();
    this.updateCounts();
    this.syncTheme(this.taskManager.getTheme());
    this.applyPanelVisibility();
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
    fillProjectSelect(this.elements.projectFilter, projects, this.filters.project);
  }

  renderInbox() {
    const tasks = this.taskManager.getTasks({
      status: STATUS.INBOX,
      context: this.filters.context,
      projectId: this.filters.project,
      searchTerm: this.filters.search,
    });
    const container = this.elements.inboxList;
    renderTaskList(container, tasks, (task) => this.createTaskCard(task));
    this.attachDropzone(container, STATUS.INBOX);
  }

  renderNextActions() {
    const allNextTasks = this.taskManager.getTasks({
      status: STATUS.NEXT,
      context: this.filters.context,
      projectId: this.filters.project,
      searchTerm: this.filters.search,
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
        .getTasks({ projectId: project.id, searchTerm: this.filters.search })
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
    if (!hasData) return;
    summary.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "report-row";
      item.setAttribute("role", "listitem");
      const label = document.createElement("strong");
      label.textContent = entry.label;
      const count = document.createElement("span");
      count.textContent = `${entry.count} done`;
      item.append(label, count);
      reportList.append(item);
    });
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
    if (task.assignee) metaItems.push(this.createMetaSpan(`With ${task.assignee}`));
    if (task.waitingFor) metaItems.push(this.createMetaSpan(`Waiting: ${task.waitingFor}`));
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
    description.textContent = task.description || "No description yet.";
    description.className = "muted";

    const meta = document.createElement("div");
    meta.className = "task-flyout-meta";
    meta.append(this.buildMetaRow("Context", task.context || "—"));
    meta.append(this.buildMetaRow("Project", this.getProjectName(task.projectId) || "—"));
    meta.append(this.buildMetaRow("Due date", task.dueDate ? formatFriendlyDate(task.dueDate) : "—"));
    meta.append(this.buildMetaRow("Calendar", task.calendarDate ? formatFriendlyDate(task.calendarDate) : "—"));
    meta.append(this.buildMetaRow("Waiting on", task.waitingFor || "—"));
    meta.append(this.buildMetaRow("Assignee", task.assignee || "—"));
    meta.append(this.buildMetaRow("Completed", task.completedAt ? formatFriendlyDate(task.completedAt) : "—"));

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
    contextGroup.textContent = "Context";
    const contextSelect = document.createElement("select");
    const blankOption = document.createElement("option");
    blankOption.value = "";
    blankOption.textContent = "No context";
    contextSelect.append(blankOption);
    this.taskManager.getContexts().forEach((context) => {
      const option = document.createElement("option");
      option.value = context;
      option.textContent = context;
      contextSelect.append(option);
    });
    contextSelect.value = task.context || "";
    contextGroup.append(contextSelect);

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
        context: contextSelect.value || null,
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
    form.append(nameField, visionField, actions);

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
    searchTasks: byId("searchTasks"),
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

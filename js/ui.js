import { STATUS, formatFriendlyDate } from "./data.js";

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
  }

  init() {
    this.bindListeners();
    this.renderAll();
    this.syncTheme(this.taskManager.getTheme());
    this.updateFooterYear();
  }

  bindListeners() {
    const { contextFilter, projectFilter, searchTasks, clearFilters, expandProjects, calendarDate, integrationsCard } =
      this.elements;

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
      const projects = this.taskManager.getProjects();
      const nextExpandedState = projects.some((project) => !project.isExpanded);
      projects.forEach((project) => this.taskManager.toggleProjectExpansion(project.id, nextExpandedState));
    });

    calendarDate.addEventListener("change", () => {
      this.filters.date = calendarDate.value;
      this.renderCalendar();
    });

    integrationsCard.querySelectorAll("[data-placeholder]").forEach((button) => {
      button.addEventListener("click", () => {
        this.taskManager.notify("info", "Integration is coming soon. Stay tuned!");
      });
    });

    this.taskManager.addEventListener("statechange", () => {
      this.renderAll();
    });

    this.taskManager.addEventListener("toast", (event) => {
      this.showToast(event.detail.level, event.detail.message);
    });
  }

  renderAll() {
    this.renderSummary();
    this.renderFilters();
    this.renderInbox();
    this.renderNextActions();
    this.renderProjects();
    this.renderWaitingFor();
    this.renderSomeday();
    this.renderCalendar();
    this.renderChecklist();
    this.populatePomodoroSelect();
    this.updateCounts();
    this.syncTheme(this.taskManager.getTheme());
  }

  renderSummary() {
    const summary = this.taskManager.getSummary();
    const { summaryInbox, summaryNext, summaryWaiting, summarySomeday, summaryProjects, summaryOverdue } = this.elements;
    summaryInbox.textContent = summary.inbox;
    summaryNext.textContent = summary.next;
    summaryWaiting.textContent = summary.waiting;
    summarySomeday.textContent = summary.someday;
    summaryProjects.textContent = summary.projects;
    summaryOverdue.textContent = summary.overdue;
  }

  renderFilters() {
    const contexts = this.taskManager.getContexts();
    const projects = this.taskManager.getProjects({ includeSomeday: true });

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
    const tasks = this.taskManager.getTasks({
      status: STATUS.NEXT,
      context: this.filters.context,
      projectId: this.filters.project,
      searchTerm: this.filters.search,
    });
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
    const projects = this.taskManager.getProjects({ includeSomeday: true });

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

      const vision = document.createElement("p");
      vision.className = "muted small-text";
      vision.textContent = project.vision;

      const projectTasks = this.taskManager
        .getTasks({ projectId: project.id, searchTerm: this.filters.search })
        .filter((task) => task.status !== STATUS.SOMEDAY || !project.someday);

      const list = document.createElement("div");
      list.className = "project-task-list";

      projectTasks.forEach((task) => list.append(this.createTaskCard(task)));

      const actions = document.createElement("div");
      actions.className = "task-actions";

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

      body.append(vision, list, actions);
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
  }

  renderChecklist() {
    const checklist = this.taskManager.getChecklist();
    const list = this.elements.reviewChecklist;
    list.innerHTML = "";

    checklist.forEach((item) => {
      const li = document.createElement("li");
      li.className = `checklist-item${item.done ? " is-complete" : ""}`;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `check-${item.id}`;
      checkbox.checked = item.done;
      checkbox.addEventListener("change", () => {
        this.taskManager.toggleChecklistItem(item.id);
      });

      const label = document.createElement("label");
      label.setAttribute("for", `check-${item.id}`);
      label.textContent = item.label;

      li.append(checkbox, label);
      list.append(li);
    });

    this.elements.resetChecklist.onclick = () => this.taskManager.resetChecklist();
  }

  populatePomodoroSelect() {
    const select = this.elements.pomodoroTask;
    const options = select.querySelectorAll("option");
    options.forEach((option, index) => {
      if (index !== 0) option.remove();
    });

    const tasks = this.taskManager.getTasks({ status: STATUS.NEXT });
    tasks.slice(0, 20).forEach((task) => {
      const option = document.createElement("option");
      option.value = task.id;
      option.textContent = `${task.title} (${task.context || "No context"})`;
      select.append(option);
    });
  }

  updateCounts() {
    const summary = this.taskManager.getSummary();
    this.elements.inboxCount.textContent = summary.inbox;
    this.elements.dueTodayCount.textContent = summary.dueToday;

    this.elements.inboxPanelCount.textContent = summary.inbox;
    this.elements.nextPanelCount.textContent = summary.next;
    this.elements.projectsPanelCount.textContent = summary.projects;
    this.elements.waitingPanelCount.textContent = summary.waiting;
    this.elements.somedayPanelCount.textContent = summary.someday;
  }

  createTaskCard(task) {
    const card = document.createElement("article");
    card.className = "task-card";
    card.tabIndex = 0;
    card.draggable = true;
    card.dataset.taskId = task.id;
    card.dataset.status = task.status;

    const content = document.createElement("div");
    content.className = "task-content";

    const title = document.createElement("h3");
    title.textContent = task.title;

    const description = document.createElement("p");
    description.className = "task-desc";
    description.textContent = task.description || "No description yet.";

    const meta = document.createElement("div");
    meta.className = "task-meta";
    if (task.context) meta.append(tagPill(task.context));
    if (task.assignee) meta.append(tagPill(`With ${task.assignee}`));
    if (task.waitingFor) meta.append(tagPill(`Waiting: ${task.waitingFor}`));
    if (task.dueDate) meta.append(tagPill(`Due ${formatFriendlyDate(task.dueDate)}`));
    if (task.projectId) {
      const project = this.taskManager.getProjects({ includeSomeday: true }).find((p) => p.id === task.projectId);
      if (project) meta.append(tagPill(`Project: ${project.name}`));
    }

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "btn btn-light";
    editButton.textContent = "Edit details";
    editButton.addEventListener("click", () => this.openTaskEditor(card, task));
    actions.append(editButton);

    const transitions = TRANSITIONS[task.status] || [];
    transitions.forEach((transition) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-light";
      button.textContent = transition.label;
      button.dataset.moveTarget = transition.target;
      button.addEventListener("click", () => this.taskManager.moveTask(task.id, transition.target));
      actions.append(button);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "btn btn-link";
    deleteButton.textContent = "Remove";
    deleteButton.addEventListener("click", () => this.taskManager.deleteTask(task.id));
    actions.append(deleteButton);

    content.append(title, description, meta, actions);
    card.append(content);
    enableDrag(card, task.id);
    return card;
  }

  openTaskEditor(card, task) {
    card.classList.add("is-editing");
    card.draggable = false;
    card.innerHTML = "";

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

    const actions = document.createElement("div");
    actions.className = "task-edit-actions";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "btn btn-light";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => {
      this.renderAll();
    });

    const saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.className = "btn btn-primary";
    saveButton.textContent = "Save";

    actions.append(cancelButton, saveButton);

    form.append(titleGroup, descriptionGroup, contextGroup, actions);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const trimmedTitle = titleInput.value.trim();
      if (!trimmedTitle) {
        this.taskManager.notify("warn", "Task title cannot be empty.");
        return;
      }
      this.taskManager.updateTask(task.id, {
        title: trimmedTitle,
        description: descriptionInput.value.trim(),
        context: contextSelect.value || null,
      });
    });

    card.append(form);
    titleInput.focus();
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
      const nextContext = context === "No context" ? null : context;
      this.taskManager.updateTask(taskId, { status, context: nextContext });
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
    inboxList: document.querySelector('[data-dropzone="inbox"]'),
    contextBoard: document.querySelector("[data-context-board]"),
    projectList: document.querySelector("[data-projects]"),
    waitingList: document.querySelector('[data-dropzone="waiting"]'),
    somedayList: document.querySelector('[data-dropzone="someday"]'),
    reviewChecklist: byId("reviewChecklist"),
    resetChecklist: byId("resetChecklist"),
    pomodoroTask: byId("pomodoroTask"),
    inboxCount: byId("inboxCount"),
    dueTodayCount: byId("dueTodayCount"),
    inboxPanelCount: byId("inboxPanelCount"),
    nextPanelCount: byId("nextPanelCount"),
    projectsPanelCount: byId("projectsPanelCount"),
    waitingPanelCount: byId("waitingPanelCount"),
    somedayPanelCount: byId("somedayPanelCount"),
    summaryInbox: byId("summaryInbox"),
    summaryNext: byId("summaryNext"),
    summaryWaiting: byId("summaryWaiting"),
    summarySomeday: byId("summarySomeday"),
    summaryProjects: byId("summaryProjects"),
    summaryOverdue: byId("summaryOverdue"),
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

function tagPill(text) {
  const pill = document.createElement("span");
  pill.textContent = text;
  return pill;
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

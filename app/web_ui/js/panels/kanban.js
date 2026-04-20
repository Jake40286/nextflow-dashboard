// app/web_ui/js/panels/kanban.js
// Kanban panel render methods — mixed into UIController.prototype by ui.js
import { STATUS, STATUS_LABELS } from "../data.js";
export default {
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
  },

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
  },

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
  },
};

// Next Actions panel render methods — mixed into UIController.prototype by ui.js
import { STATUS } from "../data.js";
export default {
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
      subheadingEl.textContent = groupBy === "none" ? "All pending tasks" : `Grouped by ${labels[groupBy] || groupBy}`;
    }

    if (!board._delegationSetup) {
      board._delegationSetup = true;

      board.addEventListener("click", (event) => {
        const more = event.target.closest(".context-column-overflow");
        if (more) {
          const col = more.closest(".context-column");
          const groupKey = col?.dataset.groupKey;
          if (groupKey !== undefined) {
            const currentExpansion = this.nextGroupExpansions.get(groupKey) || 0;
            this.nextGroupExpansions.set(groupKey, currentExpansion + 3);
            this.renderNextActions();
            return;
          }
        }
        const header = event.target.closest(".context-column header.is-filterable");
        if (header) {
          const col = header.closest(".context-column");
          const groupKey = col?.dataset.groupKey;
          if (groupKey !== undefined) {
            const alreadyActive = this.filters.context.length === 1 && this.filters.context[0] === groupKey;
            this.filters.context = alreadyActive ? ["all"] : [groupKey];
            this.renderAll();
          }
        }
      });

      board.addEventListener("contextmenu", (event) => {
        if (event.target.closest(".task-row")) return;
        const col = event.target.closest(".context-column");
        if (!col) return;
        const groupKey = col.dataset.groupKey;
        const colGroupBy = col.dataset.groupBy;
        if (groupKey === undefined || !colGroupBy) return;
        event.preventDefault();
        event.stopPropagation();
        const label = col.querySelector("header span:first-child")?.textContent || groupKey;
        this.openContextColumnContextMenu(groupKey, colGroupBy, label, event.clientX, event.clientY);
      });
    }

    const groups = this.buildNextActionsGroups(tasks, groupBy);
    groups.forEach((group) => {
      const column = document.createElement("div");
      column.className = "context-column";
      column.dataset.dropzone = STATUS.NEXT;
      column.dataset.groupKey = group.key;
      column.dataset.groupBy = groupBy;
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
      }

      header.append(title, count);
      column.append(header);
      const baseLimit = this.nextGroupLimit > 0 ? this.nextGroupLimit : items.length;
      const expansion = this.nextGroupExpansions.get(group.key) || 0;
      const limit = Math.min(baseLimit + expansion, items.length);
      items.slice(0, limit).forEach((task) => column.append(this.createTaskCard(task)));
      if (items.length > limit) {
        const more = document.createElement("p");
        more.className = "context-column-overflow muted small-text";
        more.textContent = `…and ${items.length - limit} more`;
        more.style.cursor = "pointer";
        more.title = "Click to show 3 more";
        column.append(more);
      }
      board.append(column);
      this.attachNextGroupDropzone(column, groupBy, group.key);
    });
  },

  filterNextTasksByProject(tasks) {
    const seen = new Set();
    const prioritized = [];

    tasks.forEach((task) => {
      if (!task.projectId) {
        prioritized.push(task);
        return;
      }
      if (seen.has(task.projectId)) return;
      seen.add(task.projectId);
      prioritized.push(task);
    });

    return prioritized;
  },
};

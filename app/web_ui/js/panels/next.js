// Next Actions panel render methods — mixed into UIController.prototype by ui.js
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
        more.addEventListener("click", () => {
          this.nextGroupExpansions.set(group.key, expansion + 3);
          this.renderNextActions();
        });
        column.append(more);
      }
      column.addEventListener("contextmenu", (event) => {
        if (event.target.closest(".task-row")) return; // let task context menu handle task rows
        event.preventDefault();
        event.stopPropagation();
        this.openContextColumnContextMenu(group.key, groupBy, group.label, event.clientX, event.clientY);
      });
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

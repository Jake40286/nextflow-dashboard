// My Day panel render methods — mixed into UIController.prototype by ui.js
import { formatFriendlyDate } from "../data.js";

export default {
  renderMyDay() {
    const container = this.elements.myDayList;
    if (!container) return;

    const allTasks = this.getMyDayTasks({ applyFilters: false });
    const visibleTasks = this.activeArea ? this.getMyDayTasks({ applyFilters: true }) : allTasks;
    const hiddenToday = allTasks.length - visibleTasks.length;

    const allPast = this.getPastScheduledIncompleteTasks({ applyFilters: false });
    const visiblePast = this.activeArea ? this.getPastScheduledIncompleteTasks({ applyFilters: true }) : allPast;
    const hiddenPast = allPast.length - visiblePast.length;

    container.innerHTML = "";

    if (!allTasks.length && !allPast.length) {
      const empty = document.createElement("div");
      empty.className = "muted small-text";
      empty.textContent = "No tasks in My Day yet. Use Add to My Day on any task.";
      container.append(empty);
      return;
    }

    if (visibleTasks.length) {
      visibleTasks.forEach((task) => {
        container.append(this.createTaskCard(task));
      });
    } else if (allTasks.length === 0) {
      const emptyToday = document.createElement("p");
      emptyToday.className = "muted small-text";
      emptyToday.textContent = "No tasks selected for today.";
      container.append(emptyToday);
    } else {
      const emptyToday = document.createElement("p");
      emptyToday.className = "muted small-text";
      emptyToday.textContent = "No tasks match the active area filter.";
      container.append(emptyToday);
    }
    if (hiddenToday > 0) {
      const notice = document.createElement("p");
      notice.className = "muted small-text my-day-hidden-notice";
      notice.textContent = `${hiddenToday} ${hiddenToday === 1 ? "task" : "tasks"} hidden by ${this.activeArea} filter`;
      container.append(notice);
    }

    if (allPast.length) {
      const section = document.createElement("section");
      section.className = "my-day-past-section";

      const title = document.createElement("h3");
      title.className = "my-day-past-title";
      title.textContent = "Past scheduled tasks";

      const note = document.createElement("p");
      note.className = "my-day-past-note muted small-text";
      note.textContent = "Incomplete tasks scheduled before today. Choose what to do next.";

      section.append(title, note);
      visiblePast.forEach((task) => {
        section.append(this.createMyDayPastScheduledItem(task));
      });
      if (hiddenPast > 0) {
        const notice = document.createElement("p");
        notice.className = "muted small-text my-day-hidden-notice";
        notice.textContent = `${hiddenPast} ${hiddenPast === 1 ? "task" : "tasks"} hidden by ${this.activeArea} filter`;
        section.append(notice);
      }
      container.append(section);
    }
  },

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
  },

  addPastScheduledTaskToMyDay(task) {
    if (!task?.id) return;
    const todayKey = this.getTodayDateKey();
    const updated = this.taskManager.updateTask(task.id, {
      myDayDate: todayKey,
      calendarDate: todayKey,
    });
    if (!updated) return;
    this.taskManager.notify("info", `Added "${task.title}" to My Day and scheduled it for today.`);
  },

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
  },

  unscheduleTask(task) {
    if (!task?.id) return;
    const updated = this.taskManager.updateTask(task.id, {
      myDayDate: null,
      calendarDate: null,
      calendarTime: null,
    });
    if (!updated) return;
    this.taskManager.notify("info", `Removed schedule from "${task.title}".`);
  },
};

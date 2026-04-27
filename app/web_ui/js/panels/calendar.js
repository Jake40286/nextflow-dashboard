// app/web_ui/js/panels/calendar.js
// Calendar panel render methods — mixed into UIController.prototype by ui.js
import { formatFriendlyDate } from "../data.js";
export default {
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
  },

  shiftCalendarMonth(delta) {
    const cursor = new Date(this.calendarCursor);
    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() + delta);
    this.calendarCursor = cursor;
    const iso = cursor.toISOString().slice(0, 10);
    if (this.elements.calendarDate) {
      this.elements.calendarDate.value = iso;
    }
  },

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

    if (!grid._delegationSetup) {
      grid._delegationSetup = true;
      grid.addEventListener("contextmenu", (event) => {
        const cell = event.target.closest("[data-date]");
        if (!cell) return;
        event.preventDefault();
        this.openCalendarDayContextMenu(cell.dataset.date, event.clientX, event.clientY);
      });
      grid.addEventListener("click", (event) => {
        const item = event.target.closest(".calendar-grid-item");
        if (!item?._calendarEntry) return;
        this.handleCalendarItemClick(item._calendarEntry);
      });
      grid.addEventListener("dragover", (event) => {
        const cell = event.target.closest("[data-date]");
        if (!cell) return;
        event.preventDefault();
        cell.classList.add("is-drag-over");
      });
      grid.addEventListener("dragleave", (event) => {
        const cell = event.target.closest("[data-date]");
        if (!cell) return;
        if (!cell.contains(event.relatedTarget)) {
          cell.classList.remove("is-drag-over");
        }
      });
      grid.addEventListener("drop", (event) => {
        const cell = event.target.closest("[data-date]");
        if (!cell) return;
        event.preventDefault();
        cell.classList.remove("is-drag-over");
        const taskId = event.dataTransfer?.getData("text/task-id");
        if (taskId) {
          this.handleCalendarDrop(taskId, cell.dataset.date);
        }
      });
    }
    grid.innerHTML = "";
    const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    weekdayNames.forEach((day) => {
      const cell = document.createElement("div");
      cell.className = "calendar-grid-cell calendar-grid-head";
      cell.textContent = day;
      grid.append(cell);
    });

    const todayKey = this.getTodayDateKey();
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
      const isToday = dateKey === todayKey;
      if (isToday) {
        dayContainer.classList.add("calendar-grid-cell--today");
      }
      dayContainer.dataset.date = dateKey;
      const header = document.createElement("div");
      header.className = isToday ? "calendar-grid-day calendar-grid-day--today" : "calendar-grid-day";
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
          } else if (entry.isFollowUp) {
            item.classList.add("is-follow-up");
          } else if (entry.isDue) {
            item.classList.add("is-due");
          } else if (entry.isScheduled) {
            item.classList.add("is-scheduled");
          }
          const timeLabel = this.getCalendarEntryTime(entry);
          const typePrefix = entry.isFollowUp ? "↩ " : "";
          item.textContent = `${typePrefix}${timeLabel ? `${timeLabel} • ` : ""}${entry.title}`;
          item.dataset.taskId = entry.taskId;
          item._calendarEntry = entry;
          if (!entry.isCompleted) {
            item.draggable = true;
            item.addEventListener("dragstart", (event) => {
              event.dataTransfer?.setData("text/task-id", entry.taskId);
              event.dataTransfer?.setData("text/plain", entry.taskId);
              item.classList.add("is-dragging");
            });
            item.addEventListener("dragend", () => {
              item.classList.remove("is-dragging");
            });
          }
          list.append(item);
        });
        dayContainer.append(list);
      }
      this.attachCalendarDropzone(dayContainer, dateKey);
      grid.append(dayContainer);
    }
  },

  attachCalendarDropzone(element, dateKey) {
    if (!element) return;
    const helper = window.DragDropHelper;
    if (helper) {
      helper.setupDropzone(element, {
        onDrop: (taskId) => this.handleCalendarDrop(taskId, dateKey),
      });
    }
  },

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
  },

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
  },

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
  },
};

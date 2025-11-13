import { TaskManager, STATUS } from "./data.js";
import { UIController } from "./ui.js";
import { AnalyticsController } from "./analytics.js";

const taskManager = new TaskManager();
const ui = new UIController(taskManager);
const analytics = new AnalyticsController(taskManager);

document.addEventListener("DOMContentLoaded", () => {
  ui.init();
  analytics.init();
  setupQuickAdd();
  setupThemeToggle();
  setupRefresh();
  setupPomodoro();
});

function setupQuickAdd() {
  const form = document.getElementById("quickAddForm");
  const details = document.getElementById("quickAddDetails");
  const toggle = document.getElementById("quickAddToggle");

  if (!form) return;

  if (toggle && details) {
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      if (expanded) {
        details.hidden = true;
      } else {
        details.hidden = false;
        details.querySelector("textarea")?.focus();
      }
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const title = data.get("title");
    if (!title || !title.trim()) {
      taskManager.notify("warn", "Nothing captured. Try adding a title.");
      return;
    }
    const created = taskManager.addTask({
      title,
      description: data.get("description"),
      status: STATUS.INBOX,
    });
    if (created) {
      ui.renderAll();
      analytics.updateFromState();
    }
    form.reset();
    form.querySelector("input")?.focus();
    if (toggle && details && !details.hidden) {
      details.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

function setupThemeToggle() {
  const toggle = document.getElementById("themeToggle");
  if (!toggle) return;

  toggle.addEventListener("click", () => {
    const nextTheme = taskManager.getTheme() === "dark" ? "light" : "dark";
    taskManager.updateTheme(nextTheme);
  });
}

function setupRefresh() {
  const refreshButton = document.getElementById("refreshData");
  if (!refreshButton) return;

  refreshButton.addEventListener("click", (event) => {
    if (event.altKey || event.metaKey) {
      taskManager.resetToDefaults();
    } else {
      taskManager.refreshFromStorage();
    }
  });
}

function setupPomodoro() {
  const display = document.getElementById("pomodoroTimer");
  const startButton = document.getElementById("pomodoroStart");
  const pauseButton = document.getElementById("pomodoroPause");
  const resetButton = document.getElementById("pomodoroReset");
  const focusSelect = document.getElementById("pomodoroTask");

  if (!display || !startButton || !pauseButton || !resetButton) return;

  const timer = new PomodoroTimer(display, (completed) => {
    if (completed) {
      const focusTaskId = focusSelect?.value;
      if (focusTaskId) {
        const focusTask = taskManager.getTaskById(focusTaskId);
        if (focusTask) {
          taskManager.notify("info", `Pomodoro complete for "${focusTask.title}". Consider moving it forward.`);
        }
      } else {
        taskManager.notify("info", "Pomodoro complete! Take a short break.");
      }
    }
  });

  startButton.addEventListener("click", () => timer.start());
  pauseButton.addEventListener("click", () => timer.pause());
  resetButton.addEventListener("click", () => timer.reset());
}

class PomodoroTimer {
  constructor(displayElement, onComplete) {
    this.displayElement = displayElement;
    this.onComplete = onComplete;
    this.defaultDuration = 25 * 60;
    this.remaining = this.defaultDuration;
    this.interval = null;
    this.updateDisplay();
  }

  start() {
    if (this.interval) return;
    const startTimestamp = Date.now();
    const startingRemaining = this.remaining;
    this.interval = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
      this.remaining = Math.max(startingRemaining - elapsed, 0);
      this.updateDisplay();
      if (this.remaining <= 0) {
        this.pause(true);
        this.reset();
      }
    }, 500);
  }

  pause(completed = false) {
    if (this.interval) {
      window.clearInterval(this.interval);
      this.interval = null;
    }
    if (completed && typeof this.onComplete === "function") {
      this.onComplete(true);
    }
  }

  reset() {
    this.pause();
    this.remaining = this.defaultDuration;
    this.updateDisplay();
  }

  updateDisplay() {
    const minutes = Math.floor(this.remaining / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (this.remaining % 60).toString().padStart(2, "0");
    this.displayElement.textContent = `${minutes}:${seconds}`;
  }
}

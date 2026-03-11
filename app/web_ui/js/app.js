import { TaskManager, STATUS, THEME_OPTIONS } from "./data.js";
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
  setupProjects();
  setupMarkdownSync();
  setupHelpModal();
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
  const themeOrder = THEME_OPTIONS.map((theme) => theme.id);
  if (!themeOrder.length) return;

  toggle.addEventListener("click", () => {
    const currentTheme = taskManager.getTheme();
    const currentIndex = themeOrder.indexOf(currentTheme);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % themeOrder.length : 0;
    const nextTheme = themeOrder[nextIndex];
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

function setupProjects() {
  const form = document.getElementById("newProjectForm");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const name = data.get("projectName");
    const vision = data.get("projectVision");
    if (!name || !name.toString().trim()) {
      taskManager.notify("warn", "Project name cannot be empty.");
      return;
    }
    const area = data.get("projectArea")?.toString().trim();
    const theme = data.get("projectTheme")?.toString().trim();
    const status = data.get("projectStatus")?.toString().trim();
    const deadline = data.get("projectDeadline")?.toString().trim();
    const metadata = {
      areaOfFocus: area || undefined,
      themeTag: theme || undefined,
      statusTag: status || undefined,
      deadline: deadline || undefined,
    };
    const project = taskManager.addProject(name.toString(), vision?.toString() ?? "", metadata);
    if (project) {
      ui.renderProjects();
      ui.updateCounts();
      form.reset();
    }
  });
}

function setupMarkdownSync() {
  const exportButton = document.getElementById("exportMarkdown");
  const importButton = document.getElementById("importMarkdown");
  const fileInput = document.getElementById("markdownFileInput");

  if (!exportButton || !importButton || !fileInput) return;

  exportButton.addEventListener("click", () => {
    const markdown = taskManager.exportToMarkdown();
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const dateStamp = new Date().toISOString().slice(0, 10);
    link.download = `gtd-dashboard-${dateStamp}.md`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    taskManager.notify("info", "Exported tasks to Markdown file.");
  });

  importButton.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const success = taskManager.importFromMarkdown(text);
      if (success) {
        analytics.updateFromState();
      }
    } catch (error) {
      console.error("Failed to import markdown", error);
      taskManager.notify("error", "Could not read the selected Markdown file.");
    } finally {
      fileInput.value = "";
    }
  });
}

function setupHelpModal() {
  const openButton = document.getElementById("openHelp");
  const modal = document.getElementById("helpModal");
  const closeButton = document.getElementById("closeHelp");
  if (!openButton || !modal || !closeButton) return;

  const backdrop = modal.querySelector(".modal-backdrop");
  let lastFocus = null;

  const setOpen = (open) => {
    if (open) {
      lastFocus = document.activeElement;
      modal.classList.add("is-open");
      modal.removeAttribute("hidden");
      closeButton.focus();
      document.addEventListener("keydown", onKeydown);
    } else {
      modal.classList.remove("is-open");
      modal.setAttribute("hidden", "");
      document.removeEventListener("keydown", onKeydown);
      if (lastFocus && typeof lastFocus.focus === "function") {
        lastFocus.focus();
      }
    }
  };

  const onKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  openButton.addEventListener("click", () => setOpen(true));
  closeButton.addEventListener("click", () => setOpen(false));
  backdrop?.addEventListener("click", () => setOpen(false));
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

import { TaskManager, STATUS, THEME_OPTIONS } from "./data.js";
import { UIController } from "./ui.js";
import { AnalyticsController } from "./analytics.js";
import { ReviewController } from "./review.js";

// Admin mode: visit /#admin to enable, /#user to disable.
// Persists in localStorage so you only need to do it once per browser.
const _ADMIN_KEY = "nextflow-admin";
if (window.location.hash === "#admin") {
  localStorage.setItem(_ADMIN_KEY, "1");
  history.replaceState(null, "", "/");
} else if (window.location.hash === "#user") {
  localStorage.removeItem(_ADMIN_KEY);
  history.replaceState(null, "", "/");
}
const isAdmin = localStorage.getItem(_ADMIN_KEY) === "1";

const taskManager = new TaskManager();
const ui = new UIController(taskManager, { isAdmin });
const analytics = new AnalyticsController(taskManager);
const review = new ReviewController(taskManager, ui);

// Dev helper: run `_testUpdateBanner()` in the browser console to preview the banner.
window._testUpdateBanner = () => ui.showUpdateBanner();

document.addEventListener("DOMContentLoaded", () => {
  ui.init();
  analytics.init();
  setupQuickAdd();
  setupThemeToggle();
  setupRefresh();
  setupPomodoro();
  setupProjects();
  setupExport();
  setupHelpModal();
  setupReview();
});

function setupReview() {
  const btn = document.getElementById("startReviewBtn");
  if (!btn) return;
  btn.addEventListener("click", () => review.start());

  // Update the topbar indicator whenever state changes (streak data may update)
  taskManager.addEventListener("statechange", () => review.updateTopbarIndicator());
  // Set initial indicator state once state loads
  review.updateTopbarIndicator();
}

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
    const taskData = {
      title,
      description: data.get("description"),
      status: STATUS.INBOX,
    };
    const refs = ui.parseInlineTitleRefs(title);
    if (refs.projectId) taskData.projectId = refs.projectId;
    if (refs.peopleTag) taskData.peopleTag = refs.peopleTag;
    const created = taskManager.addTask(taskData);
    refs.messages.forEach((msg) => taskManager.notify("info", msg));
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

function setupExport() {
  const exportJSONButton = document.getElementById("exportJSON");
  const importJSONButton = document.getElementById("importJSON");
  const jsonFileInput = document.getElementById("jsonFileInput");
  const exportMarkdownButton = document.getElementById("exportMarkdown");

  function triggerDownload(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  if (exportJSONButton) {
    exportJSONButton.addEventListener("click", async () => {
      try {
        const response = await fetch("/export/full");
        if (!response.ok) throw new Error(`Server returned ${response.status}`);
        const blob = await response.blob();
        const dateStamp = new Date().toISOString().slice(0, 10);
        const filename = `nextflow-export-${dateStamp}.json`;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        taskManager.notify("info", "Full export saved.");
      } catch (error) {
        console.error("JSON export failed", error);
        taskManager.notify("error", "Export failed. Check the server logs.");
      }
    });
  }

  if (importJSONButton && jsonFileInput) {
    importJSONButton.addEventListener("click", () => jsonFileInput.click());

    jsonFileInput.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const success = taskManager.importFromJSON(text);
        if (success) {
          analytics.updateFromState();
        }
      } catch (error) {
        console.error("JSON import failed", error);
        taskManager.notify("error", "Could not read the selected file.");
      } finally {
        jsonFileInput.value = "";
      }
    });
  }

  if (exportMarkdownButton) {
    exportMarkdownButton.addEventListener("click", () => {
      const markdown = taskManager.exportToMarkdown();
      const dateStamp = new Date().toISOString().slice(0, 10);
      triggerDownload(markdown, `nextflow-${dateStamp}.md`, "text/markdown");
      taskManager.notify("info", "Exported active tasks to Markdown.");
    });
  }
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

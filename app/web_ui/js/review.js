/**
 * ReviewController — Weekly Review
 *
 * Drives the full-screen, forced-decision review mode. Works through five
 * sections in order: Inbox (gated) → Next Actions → Waiting For →
 * Someday/Maybe → Projects. Every item requires an explicit decision before
 * the review advances.
 *
 * Session state (current position, processed IDs, running stats) is persisted
 * to localStorage under REVIEW_SESSION_KEY with a 12-hour TTL so a review
 * can be paused and resumed from the same device.
 *
 * Streak data (lastReviewDate, currentStreak, longestStreak, lastStreakWeek)
 * lives in settings.review, is synced across devices, and is updated via
 * taskManager.updateReviewData() at the moment the review completes.
 */

import { STATUS } from "./data.js";

const REVIEW_SESSION_KEY = "nextflow-review-session";
const REVIEW_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Sections in review order. Inbox is gated — the review cannot advance
// past it until the live inbox list (minus processed IDs) reaches zero.
const SECTIONS = [
  {
    id: "inbox",
    label: "Inbox",
    description: "Every item needs a decision. Clear to zero before moving on.",
    status: STATUS.INBOX,
    isGated: true,
  },
  {
    id: "next",
    label: "Next Actions",
    description: "Confirm each is still relevant and actionable.",
    statuses: [STATUS.NEXT, STATUS.DOING],
  },
  {
    id: "waiting",
    label: "Waiting For",
    description: "Check on each item. Has anything come in?",
    status: STATUS.WAITING,
  },
  {
    id: "someday",
    label: "Someday / Maybe",
    description: "Activate what you're ready to commit to. Release the rest.",
    status: STATUS.SOMEDAY,
  },
  {
    id: "projects",
    label: "Projects",
    description: "Each active project needs a clear next action.",
    isProjects: true,
  },
];

// Returns the ISO date string for the most recent Sunday on or before `date`.
function sundayWeekStart(date = new Date()) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // rewind to Sunday
  return d.toISOString().slice(0, 10);  // "YYYY-MM-DD"
}

// Returns the Sunday-week-start string for the week before `weekStart`.
function prevWeek(weekStart) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

// Computes how many full days have passed since an ISO date string.
function daysSince(isoDate) {
  if (!isoDate) return null;
  const then = new Date(isoDate);
  const now = new Date();
  const ms = now - then;
  return Math.max(0, Math.floor(ms / 86400000));
}

// Returns true if a task has been deliberately scheduled for a future date and
// should be skipped during the review. Two fields qualify:
//   - followUpDate: the user explicitly said "don't revisit until X"
//   - calendarDate: the task is committed to a specific future calendar slot
// Items with only a dueDate are NOT skipped — a deadline doesn't make a task
// immovable and "is this commitment still valid?" is a legitimate review question.
function isFutureScheduled(task) {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  if (task.followUpDate && task.followUpDate > today) return true;
  if (task.calendarDate && task.calendarDate > today) return true;
  return false;
}

export class ReviewController {
  constructor(taskManager, ui) {
    this.taskManager = taskManager;
    this.ui = ui;
    this.session = null;

    // Bound handler for Escape key to pause review
    this._keydownHandler = (e) => {
      if (e.key === "Escape") this.pause();
    };

    this._bindButtons();
  }

  _bindButtons() {
    document.getElementById("reviewPauseBtn")?.addEventListener("click", () => this.pause());
    document.getElementById("reviewDoneBtn")?.addEventListener("click", () => this._exitComplete());
    document.getElementById("reviewRestartBtn")?.addEventListener("click", () => {
      this._clearSession();
      this._beginFresh();
    });
    document.getElementById("reviewBackBtn")?.addEventListener("click", () => this._goBack());
    document.getElementById("reviewSkipBtn")?.addEventListener("click", () => this._skipSection());
  }

  // ─── Back navigation & section skip ───────────────────────────────────────

  _goBack() {
    if (!this.session) return;
    const order = this.session.reviewedOrder || [];
    if (order.length === 0) return;
    // Enter history mode at the last reviewed item, or step further back.
    if (this.session.reviewCursor === null) {
      this.session.reviewCursor = order.length - 1;
    } else if (this.session.reviewCursor > 0) {
      this.session.reviewCursor--;
    }
    this._saveSession();
    this._renderCurrentItem();
  }

  _skipSection() {
    if (!this.session) return;
    const section = SECTIONS[this.session.sectionIndex];
    if (section?.isGated) return; // inbox cannot be skipped
    this.session.sectionIndex += 1;
    this._saveSession();
    if (this.session.sectionIndex >= SECTIONS.length) {
      this._completeReview();
    } else {
      this._renderCurrentItem();
    }
  }

  // ─── Public entry point ────────────────────────────────────────────────────

  start() {
    const saved = this._loadSession();
    if (saved) {
      const section = SECTIONS[saved.sectionIndex];
      const label = section?.label ?? "unknown section";
      // Simple confirm — keeps the flow entirely in JS without a custom modal
      const resume = window.confirm(
        `You have a review in progress (${label}). Resume it?\n\nClick Cancel to start fresh.`
      );
      if (resume) {
        this.session = saved;
        this._open();
      } else {
        this._clearSession();
        this._beginFresh();
      }
    } else {
      this._beginFresh();
    }
  }

  // ─── Session management ────────────────────────────────────────────────────

  _beginFresh() {
    const now = new Date();
    this.session = {
      startedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + REVIEW_SESSION_TTL_MS).toISOString(),
      sectionIndex: 0,
      // Per-section sets of IDs that received a "keep/confirm" decision and must
      // be excluded from the live list (they stay in their status bucket).
      processedIds: { inbox: [], next: [], waiting: [], someday: [], projects: [] },
      // Flat chronological log of every item reviewed, in order. Used to power
      // read-only back-navigation (reviewCursor). Never mutated — append-only.
      reviewedOrder: [],
      // null = normal forward review; integer = browsing history read-only mode.
      reviewCursor: null,
      stats: {
        confirmed: 0,   // confirmed/kept in place
        promoted: 0,    // inbox → next / someday → next
        deferred: 0,    // inbox/next → someday
        deleted: 0,     // deleted
        completed: 0,   // completed (waiting → done)
        projectsClosed: 0,
        projectsHeld: 0,
      },
    };
    this._saveSession();
    this._open();
  }

  _saveSession() {
    if (!this.session) return;
    try {
      localStorage.setItem(REVIEW_SESSION_KEY, JSON.stringify(this.session));
    } catch {
      // localStorage may be full or unavailable
    }
  }

  _loadSession() {
    try {
      const raw = localStorage.getItem(REVIEW_SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session?.expiresAt) return null;
      if (new Date(session.expiresAt) < new Date()) {
        localStorage.removeItem(REVIEW_SESSION_KEY);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  _clearSession() {
    this.session = null;
    try { localStorage.removeItem(REVIEW_SESSION_KEY); } catch { /* ignore */ }
  }

  // ─── Overlay open / close ──────────────────────────────────────────────────

  _open() {
    const overlay = document.getElementById("reviewMode");
    if (!overlay) return;
    // Hide the completion screen, show the main shell
    document.getElementById("reviewComplete")?.setAttribute("hidden", "");
    document.getElementById("reviewShell")?.removeAttribute("hidden");
    overlay.removeAttribute("hidden");
    document.body.classList.add("review-mode-active");
    document.addEventListener("keydown", this._keydownHandler);
    this._renderCurrentItem();
  }

  pause() {
    this._saveSession();
    const overlay = document.getElementById("reviewMode");
    if (overlay) overlay.setAttribute("hidden", "");
    document.body.classList.remove("review-mode-active");
    document.removeEventListener("keydown", this._keydownHandler);
    this.ui.renderAll();      // refresh counts after any mutations
    this._updateTopbarIndicator();
  }

  // ─── Item retrieval ────────────────────────────────────────────────────────

  // Returns all items for a section, without any scheduling filter applied.
  // Used to compute the "N scheduled ahead" count shown in the progress line.
  _getSectionItemsUnfiltered(sectionIndex) {
    const section = SECTIONS[sectionIndex];
    if (!section) return [];
    if (section.isProjects) {
      return this.taskManager.getProjects()
        .filter((p) => p.statusTag === "Active" && !p.someday);
    }
    if (section.statuses) {
      const statusSet = new Set(section.statuses);
      return this.taskManager.getTasks().filter((t) => !t.completedAt && statusSet.has(t.status));
    }
    return this.taskManager.getTasks({ status: section.status });
  }

  // Returns items for a section with future-scheduled tasks removed for
  // non-inbox, non-project sections. Inbox must always be processed to zero;
  // project cards have no date fields to filter on.
  _getSectionItems(sectionIndex) {
    const section = SECTIONS[sectionIndex];
    const items = this._getSectionItemsUnfiltered(sectionIndex);
    if (!section || section.isGated || section.isProjects) return items;
    return items.filter((t) => !isFutureScheduled(t));
  }

  _getUnprocessedItems(sectionIndex) {
    const section = SECTIONS[sectionIndex];
    if (!section) return [];
    const items = this._getSectionItems(sectionIndex);
    const done = new Set(this.session.processedIds[section.id] || []);
    return items.filter((item) => !done.has(item.id));
  }

  _getCurrentItem() {
    if (!this.session) return null;
    return this._getUnprocessedItems(this.session.sectionIndex)[0] ?? null;
  }

  // ─── Progress / section advance ────────────────────────────────────────────

  _isSectionComplete(sectionIndex) {
    const remaining = this._getUnprocessedItems(sectionIndex);
    if (remaining.length > 0) return false;
    // Gated sections: also require the live list to be empty (handles items
    // added to inbox after the review started).
    const section = SECTIONS[sectionIndex];
    if (section.isGated) {
      return this._getSectionItems(sectionIndex).length === 0;
    }
    return true;
  }

  _advanceAfterDecision() {
    const si = this.session.sectionIndex;
    if (!this._isSectionComplete(si)) {
      this._saveSession();
      this._renderCurrentItem();
      return;
    }
    // Section complete — move to next
    this.session.sectionIndex += 1;
    this._saveSession();
    if (this.session.sectionIndex >= SECTIONS.length) {
      this._completeReview();
    } else {
      this._renderCurrentItem();
    }
  }

  // ─── Complete review ───────────────────────────────────────────────────────

  _completeReview() {
    this._clearSession();
    this._recordStreak();
    this._showCompletionScreen();
  }

  _recordStreak() {
    const existing = this.taskManager.getReviewData();
    const currentWeek = sundayWeekStart();
    let streak = existing.currentStreak || 0;
    let longest = existing.longestStreak || 0;

    if (existing.lastStreakWeek === currentWeek) {
      // Already completed a review this week — don't double-count
    } else if (existing.lastStreakWeek === prevWeek(currentWeek)) {
      // Consecutive week
      streak += 1;
    } else {
      // Gap or first ever
      streak = 1;
    }
    longest = Math.max(longest, streak);

    this.taskManager.updateReviewData({
      lastReviewDate: new Date().toISOString(),
      currentStreak: streak,
      longestStreak: longest,
      lastStreakWeek: currentWeek,
    });
  }

  _showCompletionScreen() {
    const { stats } = this.session || { stats: {} };
    const review = this.taskManager.getReviewData();

    document.getElementById("reviewShell")?.setAttribute("hidden", "");
    const complete = document.getElementById("reviewComplete");
    if (!complete) return;

    // Stats summary
    const statsEl = document.getElementById("reviewCompleteStats");
    if (statsEl) {
      const rows = [
        stats.promoted  && `${stats.promoted} promoted to Next Actions`,
        stats.deferred  && `${stats.deferred} deferred to Someday`,
        stats.completed && `${stats.completed} waiting items completed`,
        stats.deleted   && `${stats.deleted} deleted`,
        stats.confirmed && `${stats.confirmed} confirmed in place`,
        stats.projectsClosed && `${stats.projectsClosed} project${stats.projectsClosed !== 1 ? "s" : ""} closed`,
        stats.projectsHeld   && `${stats.projectsHeld} project${stats.projectsHeld !== 1 ? "s" : ""} put on hold`,
      ].filter(Boolean);
      statsEl.innerHTML = rows.length
        ? rows.map((r) => `<li>${r}</li>`).join("")
        : "<li>System reviewed — nothing changed.</li>";
    }

    // Streak display
    const streakEl = document.getElementById("reviewStreakDisplay");
    if (streakEl && review.currentStreak > 0) {
      const wk = review.currentStreak === 1 ? "week" : "weeks";
      streakEl.textContent = `${review.currentStreak} ${wk} in a row`;
      if (review.currentStreak >= review.longestStreak && review.longestStreak > 1) {
        streakEl.textContent += " — personal best!";
      }
      streakEl.removeAttribute("hidden");
    } else if (streakEl) {
      streakEl.setAttribute("hidden", "");
    }

    complete.removeAttribute("hidden");
    document.getElementById("reviewDoneBtn")?.focus();
  }

  _exitComplete() {
    const overlay = document.getElementById("reviewMode");
    if (overlay) overlay.setAttribute("hidden", "");
    document.body.classList.remove("review-mode-active");
    document.removeEventListener("keydown", this._keydownHandler);
    this.session = null;
    this.ui.renderAll();
    this._updateTopbarIndicator();
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  _renderCurrentItem() {
    // History-browse mode: delegate to read-only renderer.
    if (this.session.reviewCursor !== null) {
      this._renderHistoricalItem();
      return;
    }

    const si = this.session.sectionIndex;
    const section = SECTIONS[si];
    const item = this._getCurrentItem();
    const total = this._getSectionItems(si).length;
    const processed = this.session.processedIds[section.id]?.length ?? 0;
    // For gated sections count against live total; for others count against
    // the snapshot-style processed+remaining.
    const remaining = this._getUnprocessedItems(si).length;
    const done = total - remaining;

    // Header
    const sectionLabel = document.getElementById("reviewSectionLabel");
    if (sectionLabel) sectionLabel.textContent = section.label;

    const sectionDesc = document.getElementById("reviewSectionDesc");
    if (sectionDesc) sectionDesc.textContent = section.description;

    const skippedCount = section.isGated || section.isProjects
      ? 0
      : this._getSectionItemsUnfiltered(si).length - total;

    const progress = document.getElementById("reviewProgress");
    if (progress) {
      if (total === 0 && skippedCount === 0) {
        progress.textContent = `${section.label} — empty`;
      } else {
        const sectionNum = si + 1;
        const skippedNote = skippedCount > 0 ? `  ·  ${skippedCount} scheduled ahead` : "";
        progress.textContent = `${sectionNum} / ${SECTIONS.length} sections  ·  ${done} / ${total} items${skippedNote}`;
      }
    }

    // Back button: visible whenever there's at least one reviewed item to go back to.
    const backBtn = document.getElementById("reviewBackBtn");
    if (backBtn) {
      const hasHistory = (this.session.reviewedOrder?.length ?? 0) > 0;
      backBtn.hidden = !hasHistory;
    }
    // Skip button: visible for all non-gated sections.
    const skipBtn = document.getElementById("reviewSkipBtn");
    if (skipBtn) {
      skipBtn.hidden = !!section.isGated;
    }

    const card = document.getElementById("reviewCard");
    const actions = document.getElementById("reviewActions");
    if (!card || !actions) return;

    if (!item) {
      // Should not happen (section complete → _advanceAfterDecision called),
      // but guard against edge cases
      card.innerHTML = `<p class="review-empty">Section complete.</p>`;
      actions.innerHTML = `<button class="btn btn-primary review-action-btn" data-action="advance">Continue →</button>`;
      this._bindActionButtons(null, section);
      return;
    }

    if (section.isProjects) {
      this._renderProjectCard(item, card, actions, section);
    } else {
      this._renderTaskCard(item, card, actions, section);
    }
  }

  // Read-only history view — shown when reviewCursor is not null.
  _renderHistoricalItem() {
    const cursor = this.session.reviewCursor;
    const order = this.session.reviewedOrder || [];
    const entry = order[cursor];
    if (!entry) {
      // Cursor out of range — return to head
      this.session.reviewCursor = null;
      this._saveSession();
      this._renderCurrentItem();
      return;
    }

    const origSection = SECTIONS.find((s) => s.id === entry.sectionId);
    const isProject = origSection?.isProjects ?? false;
    const item = isProject
      ? this.taskManager.getProjects({ includeSomeday: true }).find((p) => p.id === entry.itemId)
      : this.taskManager.getTaskById(entry.itemId);

    // Header — show the original section context
    const sectionLabel = document.getElementById("reviewSectionLabel");
    if (sectionLabel) sectionLabel.textContent = origSection?.label ?? "—";

    const sectionDesc = document.getElementById("reviewSectionDesc");
    if (sectionDesc) sectionDesc.textContent = "Viewing history — no changes.";

    const progress = document.getElementById("reviewProgress");
    if (progress) {
      progress.textContent = `History  ·  ${cursor + 1} / ${order.length}`;
    }

    // Hide nav buttons — history mode uses inline Back/Forward
    document.getElementById("reviewBackBtn")?.setAttribute("hidden", "");
    document.getElementById("reviewSkipBtn")?.setAttribute("hidden", "");

    const card = document.getElementById("reviewCard");
    const actions = document.getElementById("reviewActions");
    if (!card || !actions) return;

    if (!item) {
      card.innerHTML = `<p class="review-empty">This item was removed during the review.</p>`;
    } else if (isProject) {
      const projectStatusLabel = item.statusTag !== "Active" ? ` · Now: ${_esc(item.statusTag)}` : "";
      card.innerHTML = `
        <div class="review-card-title">${_esc(item.name)}</div>
        ${item.vision ? `<div class="review-card-desc">${_esc(item.vision)}</div>` : ""}
        <div class="review-card-meta review-card-meta--history">
          Reviewed in: ${_esc(origSection?.label ?? "—")}${projectStatusLabel}
        </div>
      `;
    } else {
      const STATUS_LABELS = {
        inbox: "Inbox", next: "Next Actions", doing: "Doing",
        waiting: "Waiting For", someday: "Someday / Maybe",
      };
      const currentStatusLabel = STATUS_LABELS[item.status] ?? item.status;
      const origSectionLabel = origSection?.label ?? "—";
      const movedNote = item.status !== entry.sectionId ? ` · Now: ${currentStatusLabel}` : "";
      const age = item.createdAt ? daysSince(item.createdAt) : null;
      const metaParts = [
        (item.contexts || []).join(" "),
        item.dueDate && `Due ${item.dueDate}`,
        age !== null && `${age}d old`,
      ].filter(Boolean);
      card.innerHTML = `
        <div class="review-card-title">${_esc(item.title)}</div>
        ${item.description ? `<div class="review-card-desc">${_esc(item.description)}</div>` : ""}
        ${metaParts.length ? `<div class="review-card-meta">${metaParts.map(_esc).join(" · ")}</div>` : ""}
        <div class="review-card-meta review-card-meta--history">
          Reviewed in: ${_esc(origSectionLabel)}${movedNote}
        </div>
      `;
    }

    const atStart = cursor === 0;
    const atEnd = cursor === order.length - 1;
    actions.innerHTML = `
      <button class="btn btn-light review-action-btn" data-hist="back" ${atStart ? "disabled" : ""}>← Back</button>
      <button class="btn btn-primary review-action-btn" data-hist="forward">${atEnd ? "Return to Review →" : "Forward →"}</button>
    `;
    actions.querySelectorAll("[data-hist]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.hist === "back") {
          this.session.reviewCursor = Math.max(0, this.session.reviewCursor - 1);
        } else if (atEnd) {
          this.session.reviewCursor = null;
        } else {
          this.session.reviewCursor++;
        }
        this._saveSession();
        this._renderCurrentItem();
      });
    });
  }

  _renderTaskCard(task, card, actions, section) {
    const age = task.createdAt ? daysSince(task.createdAt) : null;
    const ageText = age !== null ? `${age}d old` : "";
    const contextText = (task.contexts || []).join(" ");
    const projectName = task.projectId
      ? this.taskManager.getProjects().find((p) => p.id === task.projectId)?.name
      : null;

    const metaParts = [
      contextText,
      projectName && `📁 ${projectName}`,
      task.waitingFor && `⏳ ${task.waitingFor}`,
      task.dueDate && `Due ${task.dueDate}`,
      ageText,
    ].filter(Boolean);

    card.innerHTML = `
      <div class="review-card-title">${_esc(task.title)}</div>
      ${task.description ? `<div class="review-card-desc">${_esc(task.description)}</div>` : ""}
      ${metaParts.length ? `<div class="review-card-meta">${metaParts.map(_esc).join(" · ")}</div>` : ""}
    `;

    // Build action buttons per section
    let btns = "";
    if (section.id === "inbox") {
      btns = `
        <button class="btn btn-primary review-action-btn" data-action="promote">→ Next Actions</button>
        <button class="btn btn-light review-action-btn" data-action="defer">→ Someday</button>
        <button class="btn btn-light review-action-btn" data-action="delete">Delete</button>
        <button class="btn btn-light review-action-btn" data-action="edit">Edit first</button>
      `;
    } else if (section.id === "next") {
      btns = `
        <button class="btn btn-light review-action-btn" data-action="defer">→ Someday</button>
        <button class="btn btn-light review-action-btn" data-action="delete">Delete</button>
        <button class="btn btn-light review-action-btn" data-action="edit">Edit</button>
        <button class="btn btn-primary review-action-btn" data-action="confirm">Mark Reviewed →</button>
      `;
    } else if (section.id === "waiting") {
      btns = `
        <button class="btn btn-primary review-action-btn" data-action="keep-waiting">Still waiting</button>
        <button class="btn btn-light review-action-btn" data-action="complete">Mark complete</button>
        <button class="btn btn-light review-action-btn" data-action="promote">→ Next Action</button>
        <button class="btn btn-light review-action-btn" data-action="delete">Delete</button>
      `;
    } else if (section.id === "someday") {
      btns = `
        <button class="btn btn-primary review-action-btn" data-action="promote">Activate → Next</button>
        <button class="btn btn-light review-action-btn" data-action="confirm">Keep</button>
        <button class="btn btn-light review-action-btn" data-action="delete">Delete</button>
        <button class="btn btn-light review-action-btn" data-action="edit">Edit</button>
      `;
    }
    actions.innerHTML = btns;
    this._bindActionButtons(task, section);
  }

  _renderProjectCard(project, card, actions, section) {
    const taskManager = this.taskManager;
    // Query by projectId directly so tasks added during this review session are
    // reflected immediately (project.tasks[] on the project object may lag until
    // the next full state write).
    const projectTasks = taskManager.getTasks()
      .filter((t) => t.projectId === project.id && !t.completedAt);
    const nextActions = projectTasks.filter(
      (t) => t.status === STATUS.NEXT || t.status === STATUS.DOING
    );
    const hasNextAction = nextActions.length > 0;

    const taskCount = projectTasks.length;
    const nextLabel = hasNextAction
      ? `Next: ${_esc(nextActions[0].title)}`
      : `<span class="review-missing-action">No next action — add one below</span>`;

    card.innerHTML = `
      <div class="review-card-title">${_esc(project.name)}</div>
      ${project.vision ? `<div class="review-card-desc">${_esc(project.vision)}</div>` : ""}
      <div class="review-card-meta">${project.areaOfFocus ?? ""}${project.themeTag ? ` · ${project.themeTag}` : ""} · ${taskCount} task${taskCount !== 1 ? "s" : ""}</div>
      <div class="review-next-action">${nextLabel}</div>
      ${!hasNextAction ? `
        <div class="review-add-next-area">
          <form class="review-add-next-form" id="reviewAddNextForm">
            <input type="text" class="review-add-next-input" placeholder="Describe the next action…" autocomplete="off" required />
            <button type="submit" class="btn btn-primary btn-small">Add</button>
          </form>
          <button type="button" class="btn btn-light btn-small review-someday-toggle" id="reviewSomedayToggle">From Someday ▾</button>
        </div>
        <ul class="review-someday-list" id="reviewSomedayList" hidden></ul>
      ` : ""}
    `;

    // Wire the inline next-action form
    const form = document.getElementById("reviewAddNextForm");
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = form.querySelector("input");
        const title = input?.value?.trim();
        if (!title) return;
        taskManager.addTask({ title, status: STATUS.NEXT, projectId: project.id });
        // Auto-confirm: adding a next action resolves the project's missing-action
        // state, so count it as reviewed and advance immediately.
        this.session.processedIds.projects.push(project.id);
        this.session.stats.confirmed++;
        this.session.reviewedOrder = this.session.reviewedOrder || [];
        this.session.reviewedOrder.push({ sectionId: "projects", itemId: project.id });
        this._advanceAfterDecision();
      });
    }

    // Wire the "From Someday" picker — shows unassigned someday tasks that can
    // be promoted into this project as its next action.
    const toggleBtn = document.getElementById("reviewSomedayToggle");
    const somedayList = document.getElementById("reviewSomedayList");
    if (toggleBtn && somedayList) {
      const somedayTasks = taskManager.getTasks({ status: STATUS.SOMEDAY })
        .filter((t) => !t.projectId);
      if (somedayTasks.length === 0) {
        toggleBtn.setAttribute("disabled", "");
        toggleBtn.textContent = "From Someday (none)";
      } else {
        toggleBtn.addEventListener("click", () => {
          const isHidden = somedayList.hidden;
          somedayList.hidden = !isHidden;
          toggleBtn.textContent = isHidden ? "From Someday ▴" : "From Someday ▾";
          if (isHidden && somedayList.childElementCount === 0) {
            somedayList.innerHTML = somedayTasks.map((t) => `
              <li class="review-someday-item" data-task-id="${_esc(t.id)}">${_esc(t.title)}</li>
            `).join("");
            somedayList.querySelectorAll(".review-someday-item").forEach((li) => {
              li.addEventListener("click", () => {
                const taskId = li.dataset.taskId;
                taskManager.updateTask(taskId, { projectId: project.id, status: STATUS.NEXT });
                // Suppress this task in the someday section (already handled above)
                this.session.processedIds.someday.push(taskId);
                // Auto-confirm the project
                this.session.processedIds.projects.push(project.id);
                this.session.stats.promoted++;
                this.session.reviewedOrder = this.session.reviewedOrder || [];
                this.session.reviewedOrder.push({ sectionId: "projects", itemId: project.id });
                this._advanceAfterDecision();
              });
            });
          }
        });
      }
    }

    const confirmBtn = `<button class="btn btn-primary review-action-btn" data-action="confirm" ${!hasNextAction ? "disabled" : ""}>Confirm active</button>`;
    actions.innerHTML = `
      ${confirmBtn}
      <button class="btn btn-light review-action-btn" data-action="hold">→ On Hold</button>
      <button class="btn btn-light review-action-btn" data-action="close-project">Close project</button>
    `;
    this._bindActionButtons(project, section);
  }

  // ─── Decision handlers ─────────────────────────────────────────────────────

  _bindActionButtons(item, section) {
    const actions = document.getElementById("reviewActions");
    if (!actions) return;
    actions.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        this._handleAction(action, item, section);
      });
    });
  }

  _handleAction(action, item, section) {
    const tm = this.taskManager;
    const si = this.session.sectionIndex;
    const sectionId = section.id;

    switch (action) {
      // ── Shared task actions ───────────────────────────────────────────────
      case "confirm":
        // Keep in place — mark as processed so we don't show it again
        this.session.processedIds[sectionId].push(item.id);
        this.session.stats.confirmed++;
        break;

      case "promote":
        // inbox / someday / waiting → Next Actions
        tm.updateTask(item.id, { status: STATUS.NEXT, waitingFor: null });
        // Suppress in next section so it isn't reviewed again after being promoted
        if (sectionId === "someday" || sectionId === "waiting") {
          this.session.processedIds.next.push(item.id);
        }
        this.session.stats.promoted++;
        break;

      case "defer":
        // inbox / next → Someday
        tm.updateTask(item.id, { status: STATUS.SOMEDAY });
        // Suppress in someday section so it isn't reviewed again after being deferred
        if (sectionId === "next" || sectionId === "inbox") {
          this.session.processedIds.someday.push(item.id);
        }
        this.session.stats.deferred++;
        break;

      case "delete":
        tm.deleteTask(item.id);
        this.session.stats.deleted++;
        break;

      case "complete":
        // Waiting item received — complete it
        tm.completeTask(item.id);
        this.session.stats.completed++;
        break;

      case "keep-waiting":
        // Still waiting — confirm as-is
        this.session.processedIds[sectionId].push(item.id);
        this.session.stats.confirmed++;
        break;

      case "edit":
        // Open task flyout for editing; the user makes their decision after
        this.ui.openTaskFlyout(item.id);
        // Re-render when the flyout closes so the card reflects any edits
        this._watchFlyoutClose();
        return; // don't advance yet

      // ── Project actions ───────────────────────────────────────────────────
      case "hold":
        tm.updateProject(item.id, { statusTag: "OnHold" });
        this.session.stats.projectsHeld++;
        break;

      case "close-project":
        tm.completeProject(item.id);
        this.session.stats.projectsClosed++;
        break;

      case "advance":
        // Edge-case "continue" button when item is null
        this._advanceAfterDecision();
        return;

      default:
        return;
    }

    // Record this item in the chronological history so the Back button can
    // return to it (read-only). Skip when item is null (edge-case advance).
    if (item) {
      this.session.reviewedOrder = this.session.reviewedOrder || [];
      this.session.reviewedOrder.push({ sectionId: section.id, itemId: item.id });
    }
    this._advanceAfterDecision();
  }

  // Re-render the review card once the task flyout closes.
  // If the flyout's "Process" button was clicked it closes the flyout and
  // immediately opens the clarify modal — in that case defer the re-render
  // until the clarify modal also closes so the review reflects the final
  // processed status rather than the mid-flight inbox state.
  _watchFlyoutClose() {
    const flyout = document.getElementById("taskFlyout");
    if (!flyout) return;
    const observer = new MutationObserver(() => {
      if (!flyout.classList.contains("is-open")) {
        observer.disconnect();
        const clarifyModal = document.getElementById("clarifyModal");
        if (clarifyModal?.classList.contains("is-open")) {
          this._watchClarifyClose();
        } else {
          this._renderCurrentItem();
        }
      }
    });
    observer.observe(flyout, { attributes: true, attributeFilter: ["class"] });
  }

  // Re-render the review card once the clarify modal closes.
  _watchClarifyClose() {
    const clarifyModal = document.getElementById("clarifyModal");
    if (!clarifyModal) {
      this._renderCurrentItem();
      return;
    }
    const observer = new MutationObserver(() => {
      if (!clarifyModal.classList.contains("is-open")) {
        observer.disconnect();
        this._renderCurrentItem();
      }
    });
    observer.observe(clarifyModal, { attributes: true, attributeFilter: ["class"] });
  }

  // ─── Topbar indicator ──────────────────────────────────────────────────────

  updateTopbarIndicator() {
    this._updateTopbarIndicator();
  }

  _updateTopbarIndicator() {
    const statusEl = document.getElementById("reviewTopbarStatus");
    const btnEl = document.getElementById("startReviewBtn");
    if (!statusEl) return;

    const review = this.taskManager.getReviewData();
    const days = daysSince(review.lastReviewDate);

    if (days === null) {
      statusEl.textContent = "Start";
      btnEl?.classList.remove("is-overdue");
      return;
    }

    const currentWeek = sundayWeekStart();
    const reviewedThisWeek = review.lastStreakWeek === currentWeek;

    if (reviewedThisWeek) {
      statusEl.textContent = "✓";
      btnEl?.classList.remove("is-overdue");
    } else if (days >= 7) {
      statusEl.textContent = `${days}d`;
      btnEl?.classList.add("is-overdue");
    } else {
      statusEl.textContent = `${days}d`;
      btnEl?.classList.remove("is-overdue");
    }
  }
}

// Simple HTML-escape to prevent XSS when injecting task titles into innerHTML
function _esc(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

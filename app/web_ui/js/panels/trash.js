// app/web_ui/js/panels/trash.js
// Trash panel render methods — mixed into UIController.prototype by ui.js

const TRASH_RETENTION_DAYS = 30;

function daysUntilPurge(entry) {
  const ts = Date.parse(entry.completedAt || entry.archivedAt || "");
  if (Number.isNaN(ts)) return null;
  const cutoff = ts + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const remainingMs = cutoff - Date.now();
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

function formatDeletedAt(entry) {
  const ts = entry.completedAt || entry.archivedAt;
  if (!ts) return "Unknown";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default {
  renderTrash() {
    const container = this.elements.trashList;
    if (!container) return;
    const entries = this.taskManager.getTrashEntries();
    container.innerHTML = "";

    const emptyBtn = this.elements.trashEmptyBtn;
    if (emptyBtn) emptyBtn.hidden = entries.length === 0;

    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.style.padding = "var(--space-3) 0";
      empty.textContent = "Trash is empty.";
      container.append(empty);
      return;
    }

    entries.forEach((entry) => {
      const row = document.createElement("div");
      row.className = "trash-row";
      row.dataset.entryId = entry.id || entry.sourceId || "";

      const main = document.createElement("div");
      main.className = "trash-row-main";

      const title = document.createElement("strong");
      title.className = "trash-row-title";
      title.textContent = entry.title || "(untitled)";
      main.append(title);

      const meta = document.createElement("div");
      meta.className = "trash-row-meta muted small-text";
      const days = daysUntilPurge(entry);
      const purgeLabel = days == null
        ? ""
        : days === 0
          ? " · Purges today"
          : ` · Purges in ${days} day${days === 1 ? "" : "s"}`;
      meta.textContent = `Deleted ${formatDeletedAt(entry)}${purgeLabel}`;
      main.append(meta);

      const actions = document.createElement("div");
      actions.className = "trash-row-actions";

      const restoreBtn = document.createElement("button");
      restoreBtn.type = "button";
      restoreBtn.className = "btn btn-light btn-small";
      restoreBtn.textContent = "Restore";
      restoreBtn.title = "Bring back as an active task in its prior status";
      restoreBtn.dataset.action = "restore";
      actions.append(restoreBtn);

      const referenceBtn = document.createElement("button");
      referenceBtn.type = "button";
      referenceBtn.className = "btn btn-light btn-small";
      referenceBtn.textContent = "Send to Reference";
      referenceBtn.title = "Treat as a completed task with reference history (counts in Stats and Reports)";
      referenceBtn.dataset.action = "reference";
      actions.append(referenceBtn);

      const completedBtn = document.createElement("button");
      completedBtn.type = "button";
      completedBtn.className = "btn btn-light btn-small";
      completedBtn.textContent = "Mark as completed";
      completedBtn.title = "Treat as a quiet completion (counts in Stats but not shown in Reports)";
      completedBtn.dataset.action = "completed";
      actions.append(completedBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-danger btn-small";
      deleteBtn.textContent = "Delete forever";
      deleteBtn.dataset.action = "purge";
      actions.append(deleteBtn);

      row.append(main, actions);
      container.append(row);
    });
  },

  initTrashListeners() {
    const container = this.elements.trashList;
    if (container && !container.dataset.trashBound) {
      container.dataset.trashBound = "1";
      container.addEventListener("click", async (event) => {
        const btn = event.target.closest("[data-action]");
        if (!btn) return;
        const row = btn.closest(".trash-row");
        const entryId = row?.dataset.entryId;
        if (!entryId) return;
        if (btn.dataset.action === "restore") {
          this.taskManager.restoreFromTrash(entryId);
          return;
        }
        if (btn.dataset.action === "reference") {
          this.taskManager.reclassifyTrashAsReference(entryId);
          return;
        }
        if (btn.dataset.action === "completed") {
          this.taskManager.reclassifyTrashAsCompleted(entryId);
          return;
        }
        if (btn.dataset.action === "purge") {
          const titleEl = row.querySelector(".trash-row-title");
          const title = titleEl?.textContent || "this item";
          const confirmed = await this.showConfirm(
            `Permanently delete "${title}"?`,
            { title: "Delete forever", okLabel: "Delete forever", danger: true },
          );
          if (confirmed) this.taskManager.purgeFromTrash(entryId);
        }
      });
    }
    const emptyBtn = this.elements.trashEmptyBtn;
    if (emptyBtn && !emptyBtn.dataset.trashBound) {
      emptyBtn.dataset.trashBound = "1";
      emptyBtn.addEventListener("click", async () => {
        const count = this.taskManager.getTrashEntries().length;
        if (count === 0) return;
        const confirmed = await this.showConfirm(
          `Permanently delete all ${count} item${count === 1 ? "" : "s"} in the trash?`,
          { title: "Empty trash", okLabel: "Empty trash", danger: true },
        );
        if (confirmed) this.taskManager.emptyTrash();
      });
    }
  },
};

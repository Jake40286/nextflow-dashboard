// app/web_ui/js/panels/backlog.js
// Backlog (admin feedback) panel render methods — mixed into UIController.prototype by ui.js
export default {
  async renderBacklog() {
    const board = document.getElementById("feedbackBoard");
    if (!board) return;
    board.innerHTML = '<p class="muted small-text" style="padding:var(--space-3)">Loading…</p>';

    let allItems;
    try {
      const res = await fetch("/feedback");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      allItems = await res.json();
    } catch {
      board.innerHTML = '<p class="muted small-text" style="padding:var(--space-3)">Could not load feedback.</p>';
      return;
    }

    board.innerHTML = "";

    const extractTags = (description) => {
      const tags = [];
      const text = (description || "")
        .replace(/(?<!\\)#([a-z0-9][a-z0-9-]*)/gi, (_, tag) => {
          tags.push(tag.toLowerCase());
          return "";
        })
        .replace(/\\#/g, "#")
        .replace(/\s+/g, " ").trim();
      return { tags, text };
    };

    // Collect unique tags from open items for the filter bar
    const activeTags = new Set();
    const tagCounts = new Map();
    for (const item of allItems.filter((i) => !i.resolved)) {
      for (const tag of extractTags(item.description).tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    // Build tag filter bar (hidden when no tags exist)
    const filterBar = document.createElement("div");
    filterBar.className = "feedback-tag-filter";
    filterBar.hidden = tagCounts.size === 0;
    if (tagCounts.size > 0) {
      const filterLabel = document.createElement("span");
      filterLabel.className = "feedback-tag-filter-label";
      filterLabel.textContent = "Filter:";
      filterBar.append(filterLabel);
      for (const [tag] of [...tagCounts.entries()].sort()) {
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "feedback-filter-pill";
        pill.dataset.tag = tag;
        pill.textContent = `#${tag}\u00a0${tagCounts.get(tag)}`;
        filterBar.append(pill);
      }
    }
    board.append(filterBar);

    const columnsEl = document.createElement("div");
    columnsEl.className = "feedback-columns";
    board.append(columnsEl);

    const COLS = [
      { type: "bug", label: "Bugs" },
      { type: "improvement", label: "Improvements" },
      { type: "feature", label: "Features" },
    ];

    // Per-column item arrays (unresolved sorted by sortOrder, resolved after)
    const colItems = {};
    for (const { type } of COLS) {
      const all = allItems.filter((i) => i.type === type);
      colItems[type] = {
        open: all.filter((i) => !i.resolved).sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999)),
        resolved: all.filter((i) => i.resolved).sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999)),
      };
    }

    // DnD state
    let dragId = null;
    let dragType = null;
    const renderColFns = {};

    // Lookup map: feedbackId → { item, colType, renderCol } — used by delegated handlers
    const itemMap = new Map();

    const persistOrder = async (type) => {
      const items = colItems[type].open;
      await Promise.all(
        items.map((item, i) =>
          fetch("/feedback/" + item.id, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder: i }),
          })
        )
      );
    };

    const buildCard = (item, colType, renderCol) => {
      itemMap.set(item.id, { item, colType, renderCol });

      const card = document.createElement("div");
      card.className = "feedback-card" + (item.resolved ? " is-resolved" : "");
      card.dataset.id = item.id;
      card.dataset.feedbackId = item.id;

      if (!item.resolved) {
        card.draggable = true;
      }

      const raw = item.description || "";
      const hasTitle = raw.startsWith("# ");
      const firstNewline = raw.indexOf("\n");
      const rawTitle = hasTitle ? raw.slice(2, firstNewline === -1 ? undefined : firstNewline) : null;
      const rawBody = hasTitle && firstNewline !== -1 ? raw.slice(firstNewline + 1) : hasTitle ? "" : raw;
      const { tags: itemTags, text: itemText } = extractTags(rawBody);

      const desc = document.createElement("div");
      desc.className = "feedback-card-desc";
      if (rawTitle !== null) {
        const titleEl = document.createElement("div");
        titleEl.className = "feedback-card-title";
        titleEl.textContent = rawTitle.trim();
        desc.append(titleEl);
        if (itemText) {
          const bodyEl = document.createElement("p");
          bodyEl.className = "feedback-card-body";
          bodyEl.textContent = itemText;
          desc.append(bodyEl);
        }
      } else {
        desc.textContent = itemText;
      }
      card.append(desc);

      // Implementation notes (shown on resolved items when triage has written notes)
      let implNotesEl = null;
      if (item.implementationNotes) {
        implNotesEl = document.createElement("div");
        implNotesEl.className = "feedback-impl-notes";
        const label = document.createElement("span");
        label.className = "feedback-impl-notes-label";
        label.textContent = "What was done:";
        const text = document.createElement("span");
        text.textContent = item.implementationNotes;
        implNotesEl.append(label, text);
        card.append(implNotesEl);
      }

      let tagsEl = null;
      const renderCardTags = (tags) => {
        if (tagsEl) tagsEl.remove();
        tagsEl = null;
        if (tags.length > 0) {
          tagsEl = document.createElement("div");
          tagsEl.className = "feedback-card-tags";
          for (const tag of tags) {
            const pill = document.createElement("span");
            pill.className = "feedback-tag-pill";
            pill.textContent = `#${tag}`;
            tagsEl.append(pill);
          }
          desc.after(tagsEl);
        }
      };
      renderCardTags(itemTags);

      // Store renderCardTags so the delegated save handler can call it
      card._renderCardTags = renderCardTags;

      const meta = document.createElement("div");
      meta.className = "feedback-card-meta";
      const shortId = document.createElement("span");
      shortId.className = "feedback-short-id";
      shortId.dataset.action = "copy-id";
      shortId.textContent = "#" + item.id.slice(0, 6);
      shortId.title = "Click to copy ID";
      shortId.style.cursor = "pointer";
      const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "";
      meta.append(shortId);
      if (dateStr) {
        const dateSp = document.createElement("span");
        dateSp.textContent = dateStr;
        meta.append(dateSp);
      }
      card.append(meta);

      const actions = document.createElement("div");
      actions.className = "feedback-card-actions";

      // Order controls (unresolved items only)
      if (!item.resolved) {
        const openItems = colItems[colType].open;
        const currentIdx = openItems.findIndex((i) => i.id === item.id);

        const makeOrderBtn = (symbol, title, action) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn btn-icon feedback-order-btn";
          btn.title = title;
          btn.textContent = symbol;
          btn.dataset.action = action;
          return btn;
        };

        const moveTopBtn = makeOrderBtn("⇑", "Move to top", "move-top");
        const moveBottomBtn = makeOrderBtn("⇓", "Bury to bottom", "move-bottom");
        moveTopBtn.disabled = currentIdx === 0;
        moveBottomBtn.disabled = currentIdx === openItems.length - 1;

        const orderGroup = document.createElement("span");
        orderGroup.className = "feedback-order-group";
        orderGroup.append(moveTopBtn, moveBottomBtn);
        actions.append(orderGroup);
      }

      // Resolve / Confirm Resolved / Re-open
      if (item.resolved) {
        const confirmBtn = document.createElement("button");
        confirmBtn.type = "button";
        confirmBtn.className = "btn btn-light btn-small" + (item.confirmedResolved ? " feedback-btn-confirmed" : "");
        confirmBtn.textContent = item.confirmedResolved ? "Confirmed" : "Confirm Resolved";
        confirmBtn.disabled = !!item.confirmedResolved;
        confirmBtn.dataset.action = "confirm-resolved";
        actions.append(confirmBtn);

        const reopenBtn = document.createElement("button");
        reopenBtn.type = "button";
        reopenBtn.className = "btn btn-light btn-small";
        reopenBtn.textContent = "Re-open";
        reopenBtn.dataset.action = "reopen";
        actions.append(reopenBtn);
      } else {
        const resolveBtn = document.createElement("button");
        resolveBtn.type = "button";
        resolveBtn.className = "btn btn-light btn-small";
        resolveBtn.textContent = "Resolve";
        resolveBtn.dataset.action = "resolve";
        actions.append(resolveBtn);
      }

      // Edit (inline)
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-light btn-small";
      editBtn.textContent = "Edit";
      editBtn.dataset.action = "edit";
      actions.append(editBtn);

      // Merge (only for open items)
      if (!item.resolved) {
        const mergeBtn = document.createElement("button");
        mergeBtn.type = "button";
        mergeBtn.className = "btn btn-light btn-small";
        mergeBtn.textContent = "Merge";
        mergeBtn.dataset.action = "merge";
        actions.append(mergeBtn);
      }

      // Delete
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-light btn-small";
      deleteBtn.textContent = "Delete";
      deleteBtn.dataset.action = "delete";
      actions.append(deleteBtn);

      card.append(actions);
      return card;
    };

    // Delegated event handlers — set up once per board render
    if (!board._delegationSetup) {
      board._delegationSetup = true;

      // Filter pill clicks
      board.addEventListener("click", (e) => {
        const pill = e.target.closest(".feedback-filter-pill[data-tag]");
        if (!pill) return;
        const tag = pill.dataset.tag;
        if (activeTags.has(tag)) {
          activeTags.delete(tag);
          pill.classList.remove("is-active");
        } else {
          activeTags.add(tag);
          pill.classList.add("is-active");
        }
        for (const fn of Object.values(renderColFns)) fn?.();
      });

      // Drag events on cards
      board.addEventListener("dragstart", (e) => {
        const card = e.target.closest(".feedback-card");
        if (!card) return;
        dragId = card.dataset.feedbackId;
        const entry = itemMap.get(dragId);
        dragType = entry?.colType ?? null;
        e.dataTransfer.effectAllowed = "move";
        requestAnimationFrame(() => card.classList.add("is-dragging"));
      });

      board.addEventListener("dragend", (e) => {
        const card = e.target.closest(".feedback-card");
        if (!card) return;
        card.classList.remove("is-dragging");
        board.querySelectorAll(".dnd-drop-indicator").forEach((el) => el.remove());
        board.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
      });

      board.addEventListener("dragover", (e) => {
        const card = e.target.closest(".feedback-card");
        if (!card) return;
        const cardId = card.dataset.feedbackId;
        if (!dragId || dragId === cardId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = card.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        board.querySelectorAll(".dnd-drop-indicator").forEach((el) => el.remove());
        const indicator = document.createElement("div");
        indicator.className = "dnd-drop-indicator";
        if (e.clientY < mid) {
          card.before(indicator);
        } else {
          card.after(indicator);
        }
      });

      board.addEventListener("drop", (e) => {
        const card = e.target.closest(".feedback-card");
        if (!card) return;
        const cardId = card.dataset.feedbackId;
        if (!dragId || dragId === cardId) return;
        e.preventDefault();
        board.querySelectorAll(".dnd-drop-indicator").forEach((el) => el.remove());
        const entry = itemMap.get(cardId);
        if (!entry) return;
        const { item, colType, renderCol } = entry;
        const rect = card.getBoundingClientRect();
        const insertBefore = e.clientY < rect.top + rect.height / 2;
        if (dragType === colType) {
          const items = colItems[colType].open;
          const fromIdx = items.findIndex((i) => i.id === dragId);
          const toIdx = items.findIndex((i) => i.id === item.id);
          if (fromIdx === -1 || toIdx === -1) return;
          const [moved] = items.splice(fromIdx, 1);
          const finalIdx = insertBefore ? toIdx : toIdx + (fromIdx < toIdx ? 0 : 1);
          items.splice(Math.max(0, finalIdx > fromIdx && !insertBefore ? finalIdx - 1 : finalIdx), 0, moved);
          renderCol();
          persistOrder(colType).catch(() => this.showToast("error", "Could not save order."));
        } else {
          const srcItems = colItems[dragType].open;
          const dstItems = colItems[colType].open;
          const fromIdx = srcItems.findIndex((i) => i.id === dragId);
          if (fromIdx === -1) return;
          const toIdx = dstItems.findIndex((i) => i.id === item.id);
          if (toIdx === -1) return;
          const [moved] = srcItems.splice(fromIdx, 1);
          moved.type = colType;
          const insertIdx = insertBefore ? toIdx : toIdx + 1;
          dstItems.splice(insertIdx, 0, moved);
          renderColFns[dragType]?.();
          renderCol();
          fetch("/feedback/" + moved.id, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: colType }),
          }).then(() => persistOrder(colType)).catch(() => this.showToast("error", "Could not move item."));
        }
      });

      // Action button clicks
      board.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;

        // copy-id is on a span inside meta, not inside actions
        if (action === "copy-id") {
          const card = btn.closest(".feedback-card");
          const feedbackId = card?.dataset.feedbackId;
          if (!feedbackId) return;
          navigator.clipboard.writeText(feedbackId).then(() => {
            const orig = btn.textContent;
            btn.textContent = "copied!";
            setTimeout(() => { btn.textContent = orig; }, 1200);
          });
          return;
        }

        const card = btn.closest(".feedback-card");
        const feedbackId = card?.dataset.feedbackId;
        if (!feedbackId) return;
        const entry = itemMap.get(feedbackId);
        if (!entry) return;
        const { item, colType, renderCol } = entry;

        if (action === "move-top") {
          const items = colItems[colType].open;
          const idx = items.findIndex((i) => i.id === item.id);
          if (idx > 0) { const [m] = items.splice(idx, 1); items.unshift(m); }
          renderCol();
          persistOrder(colType).catch(() => this.showToast("error", "Could not save order."));
          return;
        }

        if (action === "move-bottom") {
          const items = colItems[colType].open;
          const idx = items.findIndex((i) => i.id === item.id);
          if (idx < items.length - 1) { const [m] = items.splice(idx, 1); items.push(m); }
          renderCol();
          persistOrder(colType).catch(() => this.showToast("error", "Could not save order."));
          return;
        }

        if (action === "confirm-resolved") {
          btn.disabled = true;
          try {
            const res = await fetch("/feedback/" + item.id, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ confirmedResolved: true }),
            });
            if (!res.ok) throw new Error();
            item.confirmedResolved = true;
            btn.textContent = "Confirmed";
            btn.classList.add("feedback-btn-confirmed");
          } catch {
            btn.disabled = false;
            this.showToast("error", "Could not confirm item.");
          }
          return;
        }

        if (action === "reopen") {
          btn.disabled = true;
          try {
            const res = await fetch("/feedback/" + item.id, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ resolved: false }),
            });
            if (!res.ok) throw new Error();
            item.resolved = false;
            const { open, resolved } = colItems[colType];
            const idx = resolved.findIndex((i) => i.id === item.id);
            if (idx !== -1) { resolved.splice(idx, 1); open.push(item); }
            renderCol();
          } catch {
            btn.disabled = false;
            this.showToast("error", "Could not re-open item.");
          }
          return;
        }

        if (action === "resolve") {
          btn.disabled = true;
          try {
            const res = await fetch("/feedback/" + item.id, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ resolved: true }),
            });
            if (!res.ok) throw new Error();
            item.resolved = true;
            const { open, resolved } = colItems[colType];
            const idx = open.findIndex((i) => i.id === item.id);
            if (idx !== -1) { open.splice(idx, 1); resolved.push(item); }
            renderCol();
          } catch {
            btn.disabled = false;
            this.showToast("error", "Could not resolve item.");
          }
          return;
        }

        if (action === "edit") {
          card.draggable = false;
          const desc = card.querySelector(".feedback-card-desc");
          const tagsEl = card.querySelector(".feedback-card-tags");
          const meta = card.querySelector(".feedback-card-meta");
          const actions = card.querySelector(".feedback-card-actions");
          desc.hidden = true;
          if (tagsEl) tagsEl.hidden = true;
          meta.hidden = true;
          actions.hidden = true;

          const form = document.createElement("div");
          form.className = "feedback-card-edit-form";
          const ta = document.createElement("textarea");
          ta.value = item.description;
          ta.rows = 3;
          const formActions = document.createElement("div");
          formActions.className = "feedback-add-form-actions";
          const saveBtn = document.createElement("button");
          saveBtn.type = "button";
          saveBtn.className = "btn btn-light btn-small";
          saveBtn.textContent = "Save";
          saveBtn.dataset.action = "save-edit";
          const cancelBtn = document.createElement("button");
          cancelBtn.type = "button";
          cancelBtn.className = "btn btn-light btn-small";
          cancelBtn.textContent = "Cancel";
          cancelBtn.dataset.action = "cancel-edit";
          formActions.append(saveBtn, cancelBtn);
          form.append(ta, formActions);
          card.append(form);
          // Store textarea reference on form for the save handler
          form._ta = ta;
          ta.focus();
          return;
        }

        if (action === "cancel-edit") {
          const form = card.querySelector(".feedback-card-edit-form");
          if (!form) return;
          form.remove();
          const desc = card.querySelector(".feedback-card-desc");
          const tagsEl = card.querySelector(".feedback-card-tags");
          const meta = card.querySelector(".feedback-card-meta");
          const actions = card.querySelector(".feedback-card-actions");
          desc.hidden = false;
          if (tagsEl) tagsEl.hidden = false;
          meta.hidden = false;
          actions.hidden = false;
          if (!item.resolved) card.draggable = true;
          return;
        }

        if (action === "save-edit") {
          const form = card.querySelector(".feedback-card-edit-form");
          if (!form) return;
          const ta = form._ta || form.querySelector("textarea");
          const newDesc = ta.value.trim();
          if (!newDesc) return;
          btn.disabled = true;
          const cancelBtn = form.querySelector("[data-action='cancel-edit']");
          if (cancelBtn) cancelBtn.disabled = true;
          try {
            const res = await fetch("/feedback/" + item.id, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ description: newDesc }),
            });
            if (!res.ok) throw new Error();
            item.description = newDesc;
            const hasUpdatedTitle = newDesc.startsWith("# ");
            const updatedFirstNewline = newDesc.indexOf("\n");
            const updatedRawBody = hasUpdatedTitle && updatedFirstNewline !== -1 ? newDesc.slice(updatedFirstNewline + 1) : hasUpdatedTitle ? "" : newDesc;
            const { tags: updatedTags, text: updatedText } = extractTags(updatedRawBody);
            const desc = card.querySelector(".feedback-card-desc");
            desc.innerHTML = "";
            if (hasUpdatedTitle) {
              const updatedRawTitle = newDesc.slice(2, updatedFirstNewline === -1 ? undefined : updatedFirstNewline).trim();
              const titleEl = document.createElement("div");
              titleEl.className = "feedback-card-title";
              titleEl.textContent = updatedRawTitle;
              desc.append(titleEl);
              if (updatedText) {
                const bodyEl = document.createElement("p");
                bodyEl.className = "feedback-card-body";
                bodyEl.textContent = updatedText;
                desc.append(bodyEl);
              }
            } else {
              desc.textContent = updatedText;
            }
            if (card._renderCardTags) card._renderCardTags(updatedTags);
            form.remove();
            desc.hidden = false;
            const meta = card.querySelector(".feedback-card-meta");
            const actions = card.querySelector(".feedback-card-actions");
            meta.hidden = false;
            actions.hidden = false;
            if (!item.resolved) card.draggable = true;
          } catch {
            btn.disabled = false;
            if (cancelBtn) cancelBtn.disabled = false;
            this.showToast("error", "Could not update item.");
          }
          return;
        }

        if (action === "merge") {
          board.querySelectorAll(".feedback-card[data-merge-target]").forEach((el) => {
            el.removeAttribute("data-merge-target");
            el.querySelector(".merge-into-btn")?.remove();
          });
          const alreadyActive = card.hasAttribute("data-merge-source");
          board.querySelectorAll("[data-merge-source]").forEach((el) => el.removeAttribute("data-merge-source"));
          board.querySelectorAll(".merge-cancel-btn").forEach((el) => el.remove());
          if (alreadyActive) return;

          card.setAttribute("data-merge-source", "1");
          const cancelMerge = document.createElement("button");
          cancelMerge.type = "button";
          cancelMerge.className = "btn btn-light btn-small merge-cancel-btn";
          cancelMerge.textContent = "Cancel";
          cancelMerge.dataset.action = "cancel-merge";
          const actionsEl = card.querySelector(".feedback-card-actions");
          actionsEl?.append(cancelMerge);

          board.querySelectorAll(".feedback-card:not([data-merge-source])").forEach((otherCard) => {
            const otherId = otherCard.dataset.id;
            if (!otherId || otherCard.classList.contains("is-resolved")) return;
            otherCard.setAttribute("data-merge-target", "1");
            const intoBtn = document.createElement("button");
            intoBtn.type = "button";
            intoBtn.className = "btn btn-light btn-small merge-into-btn";
            intoBtn.textContent = "← Merge into this";
            intoBtn.dataset.action = "merge-into";
            intoBtn.dataset.targetId = otherId;
            otherCard.querySelector(".feedback-card-actions")?.append(intoBtn);
          });
          return;
        }

        if (action === "cancel-merge") {
          card.removeAttribute("data-merge-source");
          btn.remove();
          board.querySelectorAll("[data-merge-target]").forEach((el) => {
            el.removeAttribute("data-merge-target");
            el.querySelector(".merge-into-btn")?.remove();
          });
          return;
        }

        if (action === "merge-into") {
          const targetId = btn.dataset.targetId;
          if (!targetId) return;
          const sourceCard = board.querySelector("[data-merge-source]");
          const sourceId = sourceCard?.dataset.feedbackId;
          if (!sourceId) return;
          btn.disabled = true;
          try {
            const res = await fetch("/feedback/merge", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ primaryId: targetId, mergeIds: [sourceId] }),
            });
            if (!res.ok) throw new Error();
            this.renderBacklog();
          } catch {
            btn.disabled = false;
            this.showToast("error", "Could not merge items.");
          }
          return;
        }

        if (action === "delete") {
          if (!btn._awaitingConfirm) {
            btn._awaitingConfirm = true;
            btn.textContent = "Sure?";
            btn._confirmTimer = setTimeout(() => {
              btn._awaitingConfirm = false;
              btn.textContent = "Delete";
            }, 3000);
            return;
          }
          clearTimeout(btn._confirmTimer);
          btn.disabled = true;
          try {
            const res = await fetch("/feedback/" + item.id, { method: "DELETE" });
            if (!res.ok) throw new Error();
            const { open, resolved } = colItems[colType];
            const openIdx = open.findIndex((i) => i.id === item.id);
            if (openIdx !== -1) open.splice(openIdx, 1);
            const resolvedIdx = resolved.findIndex((i) => i.id === item.id);
            if (resolvedIdx !== -1) resolved.splice(resolvedIdx, 1);
            renderCol();
          } catch {
            btn.disabled = false;
            btn._awaitingConfirm = false;
            btn.textContent = "Delete";
            this.showToast("error", "Could not delete item.");
          }
          return;
        }
      });
    }

    for (const { type, label } of COLS) {
      const col = document.createElement("div");
      col.className = "feedback-column";
      col.dataset.colType = type;

      const header = document.createElement("div");
      header.className = "feedback-column-header";
      const labelEl = document.createElement("span");
      labelEl.textContent = label;
      const badge = document.createElement("span");
      badge.className = "feedback-count-badge";
      header.append(labelEl, badge);
      col.append(header);

      // Cards container
      const cardsEl = document.createElement("div");
      cardsEl.className = "feedback-cards";

      // Column-level dragover/drop (handles dropping onto empty space below cards)
      col.addEventListener("dragover", (e) => {
        if (!dragId || e.target.closest(".feedback-card")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        board.querySelectorAll(".dnd-drop-indicator").forEach((el) => el.remove());
        const indicator = document.createElement("div");
        indicator.className = "dnd-drop-indicator";
        cardsEl.append(indicator);
      });
      col.addEventListener("drop", (e) => {
        if (!dragId || e.target.closest(".feedback-card")) return;
        e.preventDefault();
        board.querySelectorAll(".dnd-drop-indicator").forEach((el) => el.remove());
        if (dragType === type) {
          // Same-column: append to end
          const items = colItems[type].open;
          const fromIdx = items.findIndex((i) => i.id === dragId);
          if (fromIdx === -1) return;
          const [moved] = items.splice(fromIdx, 1);
          items.push(moved);
          renderColFns[type]?.();
          persistOrder(type).catch(() => this.showToast("error", "Could not save order."));
        } else {
          // Cross-column: move to end of destination
          const srcItems = colItems[dragType].open;
          const dstItems = colItems[type].open;
          const fromIdx = srcItems.findIndex((i) => i.id === dragId);
          if (fromIdx === -1) return;
          const [moved] = srcItems.splice(fromIdx, 1);
          moved.type = type;
          dstItems.push(moved);
          renderColFns[dragType]?.();
          renderColFns[type]?.();
          fetch("/feedback/" + moved.id, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type }),
          }).then(() => persistOrder(type)).catch(() => this.showToast("error", "Could not move item."));
        }
      });

      col.append(cardsEl);

      // "Add card" button + inline form
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "feedback-add-btn";
      addBtn.textContent = "+ Add";
      col.append(addBtn);

      const addForm = document.createElement("div");
      addForm.className = "feedback-add-form";
      addForm.hidden = true;
      const addTa = document.createElement("textarea");
      addTa.placeholder = `Describe the ${type}…`;
      addTa.rows = 3;
      const addFormActions = document.createElement("div");
      addFormActions.className = "feedback-add-form-actions";
      const addSubmit = document.createElement("button");
      addSubmit.type = "button";
      addSubmit.className = "btn btn-light btn-small";
      addSubmit.textContent = "Add";
      const addCancel = document.createElement("button");
      addCancel.type = "button";
      addCancel.className = "btn btn-light btn-small";
      addCancel.textContent = "Cancel";
      addFormActions.append(addSubmit, addCancel);
      addForm.append(addTa, addFormActions);
      col.append(addForm);

      addBtn.addEventListener("click", () => {
        addBtn.hidden = true;
        addForm.hidden = false;
        addTa.focus();
      });
      addCancel.addEventListener("click", () => {
        addTa.value = "";
        addForm.hidden = true;
        addBtn.hidden = false;
      });
      addSubmit.addEventListener("click", async () => {
        const description = addTa.value.trim();
        if (!description) return;
        addSubmit.disabled = true;
        try {
          const res = await fetch("/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type, description, createdAt: new Date().toISOString() }),
          });
          if (!res.ok) throw new Error();
          const data = await res.json();
          const newItem = {
            id: data.id,
            type,
            description,
            createdAt: new Date().toISOString(),
            sortOrder: colItems[type].open.length,
          };
          colItems[type].open.push(newItem);
          addTa.value = "";
          addForm.hidden = true;
          addBtn.hidden = false;
          renderCol();
        } catch {
          this.showToast("error", "Could not add item.");
        } finally {
          addSubmit.disabled = false;
        }
      });

      columnsEl.append(col);

      // renderCol closure — rebuilds just this column's cards
      const renderCol = () => {
        const { open, resolved } = colItems[type];
        const filteredOpen = activeTags.size > 0
          ? open.filter((item) => extractTags(item.description).tags.some((t) => activeTags.has(t)))
          : open;
        badge.textContent = filteredOpen.length;
        cardsEl.innerHTML = "";
        filteredOpen.forEach((item) => cardsEl.append(buildCard(item, type, renderCol)));
        if (resolved.length) {
          const divider = document.createElement("div");
          divider.className = "feedback-resolved-divider";
          divider.textContent = `${resolved.length} resolved`;
          cardsEl.append(divider);
          resolved.forEach((item) => cardsEl.append(buildCard(item, type, renderCol)));
        }
      };
      renderColFns[type] = renderCol;

      renderCol();
    }
  },
};

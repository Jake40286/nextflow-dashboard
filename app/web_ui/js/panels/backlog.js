// app/web_ui/js/panels/backlog.js
// Backlog (admin feedback) panel render methods — mixed into UIController.prototype by ui.js
export default {
  async renderBacklog() {
    const board = document.getElementById("feedbackBoard");
    if (!board) return;
    // Abort any DnD listeners from a previous render so re-renders don't leak.
    this._backlogDndAbort?.abort();
    this._backlogDndAbort = new AbortController();
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
        pill.addEventListener("click", () => {
          if (activeTags.has(tag)) {
            activeTags.delete(tag);
            pill.classList.remove("is-active");
          } else {
            activeTags.add(tag);
            pill.classList.add("is-active");
          }
          for (const fn of Object.values(renderColFns)) fn?.();
        });
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

    // Board-level DnD delegation — one set of listeners regardless of card/column count.
    // Aborted at the start of every renderBacklog() call so re-renders don't leak.
    const dndSignal = this._backlogDndAbort.signal;
    const clearIndicators = () => {
      board.querySelectorAll(".dnd-drop-indicator").forEach((el) => el.remove());
    };
    board.addEventListener("dragstart", (e) => {
      const card = e.target.closest(".feedback-card");
      if (!card || card.classList.contains("is-resolved") || !card.draggable) return;
      dragId = card.dataset.id;
      dragType = card.dataset.colType;
      e.dataTransfer.effectAllowed = "move";
      requestAnimationFrame(() => card.classList.add("is-dragging"));
    }, { signal: dndSignal });
    board.addEventListener("dragend", (e) => {
      const card = e.target.closest(".feedback-card");
      card?.classList.remove("is-dragging");
      clearIndicators();
      board.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
      dragId = null;
      dragType = null;
    }, { signal: dndSignal });
    board.addEventListener("dragover", (e) => {
      if (!dragId) return;
      const overCard = e.target.closest(".feedback-card");
      const col = e.target.closest(".feedback-column");
      if (!col) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      clearIndicators();
      if (overCard && overCard.dataset.id !== dragId) {
        const rect = overCard.getBoundingClientRect();
        const indicator = document.createElement("div");
        indicator.className = "dnd-drop-indicator";
        if (e.clientY < rect.top + rect.height / 2) overCard.before(indicator);
        else overCard.after(indicator);
      } else if (!overCard) {
        // Empty space below cards in a column: indicate append
        const cardsEl = col.querySelector(".feedback-cards");
        if (cardsEl) {
          const indicator = document.createElement("div");
          indicator.className = "dnd-drop-indicator";
          cardsEl.append(indicator);
        }
      }
    }, { signal: dndSignal });
    board.addEventListener("drop", (e) => {
      if (!dragId) return;
      const col = e.target.closest(".feedback-column");
      if (!col) return;
      e.preventDefault();
      clearIndicators();
      const colType = col.dataset.colType;
      const overCard = e.target.closest(".feedback-card");
      if (overCard && overCard.dataset.id !== dragId) {
        const rect = overCard.getBoundingClientRect();
        const insertBefore = e.clientY < rect.top + rect.height / 2;
        if (dragType === colType) {
          const items = colItems[colType].open;
          const fromIdx = items.findIndex((i) => i.id === dragId);
          const toIdx = items.findIndex((i) => i.id === overCard.dataset.id);
          if (fromIdx === -1 || toIdx === -1) return;
          const [moved] = items.splice(fromIdx, 1);
          const finalIdx = insertBefore ? toIdx : toIdx + (fromIdx < toIdx ? 0 : 1);
          items.splice(Math.max(0, finalIdx > fromIdx && !insertBefore ? finalIdx - 1 : finalIdx), 0, moved);
          renderColFns[colType]?.();
          persistOrder(colType).catch(() => this.showToast("error", "Could not save order."));
        } else {
          const srcItems = colItems[dragType].open;
          const dstItems = colItems[colType].open;
          const fromIdx = srcItems.findIndex((i) => i.id === dragId);
          if (fromIdx === -1) return;
          const toIdx = dstItems.findIndex((i) => i.id === overCard.dataset.id);
          if (toIdx === -1) return;
          const [moved] = srcItems.splice(fromIdx, 1);
          moved.type = colType;
          dstItems.splice(insertBefore ? toIdx : toIdx + 1, 0, moved);
          renderColFns[dragType]?.();
          renderColFns[colType]?.();
          fetch("/feedback/" + moved.id, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: colType }),
          }).then(() => persistOrder(colType)).catch(() => this.showToast("error", "Could not move item."));
        }
      } else if (!overCard) {
        // Drop in empty space: append to end of column
        if (dragType === colType) {
          const items = colItems[colType].open;
          const fromIdx = items.findIndex((i) => i.id === dragId);
          if (fromIdx === -1) return;
          const [moved] = items.splice(fromIdx, 1);
          items.push(moved);
          renderColFns[colType]?.();
          persistOrder(colType).catch(() => this.showToast("error", "Could not save order."));
        } else {
          const srcItems = colItems[dragType].open;
          const dstItems = colItems[colType].open;
          const fromIdx = srcItems.findIndex((i) => i.id === dragId);
          if (fromIdx === -1) return;
          const [moved] = srcItems.splice(fromIdx, 1);
          moved.type = colType;
          dstItems.push(moved);
          renderColFns[dragType]?.();
          renderColFns[colType]?.();
          fetch("/feedback/" + moved.id, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: colType }),
          }).then(() => persistOrder(colType)).catch(() => this.showToast("error", "Could not move item."));
        }
      }
    }, { signal: dndSignal });

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
      const card = document.createElement("div");
      card.className = "feedback-card" + (item.resolved ? " is-resolved" : "");
      card.dataset.id = item.id;
      card.dataset.colType = colType;
      if (!item.resolved) card.draggable = true;

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

      const meta = document.createElement("div");
      meta.className = "feedback-card-meta";
      const shortId = document.createElement("span");
      shortId.textContent = "#" + item.id.slice(0, 6);
      shortId.title = "Click to copy ID";
      shortId.style.cursor = "pointer";
      shortId.addEventListener("click", () => {
        navigator.clipboard.writeText(item.id).then(() => {
          const orig = shortId.textContent;
          shortId.textContent = "copied!";
          setTimeout(() => { shortId.textContent = orig; }, 1200);
        });
      });
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
        const getIdx = () => colItems[colType].open.findIndex((i) => i.id === item.id);
        const openItems = colItems[colType].open;

        const makeOrderBtn = (symbol, title, handler) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn btn-icon feedback-order-btn";
          btn.title = title;
          btn.textContent = symbol;
          btn.addEventListener("click", () => {
            handler();
            renderCol();
            persistOrder(colType).catch(() => this.showToast("error", "Could not save order."));
          });
          return btn;
        };

        const moveTopBtn = makeOrderBtn("⇑", "Move to top", () => {
          const idx = getIdx();
          if (idx > 0) { const [m] = openItems.splice(idx, 1); openItems.unshift(m); }
        });
        const moveBottomBtn = makeOrderBtn("⇓", "Bury to bottom", () => {
          const idx = getIdx();
          if (idx < openItems.length - 1) { const [m] = openItems.splice(idx, 1); openItems.push(m); }
        });

        const currentIdx = getIdx();
        moveTopBtn.disabled = currentIdx === 0;
        moveBottomBtn.disabled = currentIdx === openItems.length - 1;

        const orderGroup = document.createElement("span");
        orderGroup.className = "feedback-order-group";
        orderGroup.append(moveTopBtn, moveBottomBtn);
        actions.append(orderGroup);
      }

      // Resolve / Confirm Resolved / Re-open
      if (item.resolved) {
        // Confirm Resolved button
        const confirmBtn = document.createElement("button");
        confirmBtn.type = "button";
        confirmBtn.className = "btn btn-light btn-small" + (item.confirmedResolved ? " feedback-btn-confirmed" : "");
        confirmBtn.textContent = item.confirmedResolved ? "Confirmed" : "Confirm Resolved";
        confirmBtn.disabled = !!item.confirmedResolved;
        confirmBtn.addEventListener("click", async () => {
          confirmBtn.disabled = true;
          try {
            const res = await fetch("/feedback/" + item.id, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ confirmedResolved: true }),
            });
            if (!res.ok) throw new Error();
            item.confirmedResolved = true;
            confirmBtn.textContent = "Confirmed";
            confirmBtn.classList.add("feedback-btn-confirmed");
          } catch {
            confirmBtn.disabled = false;
            this.showToast("error", "Could not confirm item.");
          }
        });
        // Re-open button
        const reopenBtn = document.createElement("button");
        reopenBtn.type = "button";
        reopenBtn.className = "btn btn-light btn-small";
        reopenBtn.textContent = "Re-open";
        reopenBtn.addEventListener("click", async () => {
          reopenBtn.disabled = true;
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
            reopenBtn.disabled = false;
            this.showToast("error", "Could not re-open item.");
          }
        });
        actions.append(confirmBtn, reopenBtn);
      } else {
        const resolveBtn = document.createElement("button");
        resolveBtn.type = "button";
        resolveBtn.className = "btn btn-light btn-small";
        resolveBtn.textContent = "Resolve";
        resolveBtn.addEventListener("click", async () => {
          resolveBtn.disabled = true;
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
            resolveBtn.disabled = false;
            this.showToast("error", "Could not resolve item.");
          }
        });
        actions.append(resolveBtn);
      }

      // Edit (inline)
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn btn-light btn-small";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => {
        card.draggable = false;
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
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "btn btn-light btn-small";
        cancelBtn.textContent = "Cancel";
        formActions.append(saveBtn, cancelBtn);
        form.append(ta, formActions);
        card.append(form);
        ta.focus();

        cancelBtn.addEventListener("click", () => {
          form.remove();
          desc.hidden = false;
          if (tagsEl) tagsEl.hidden = false;
          meta.hidden = false;
          actions.hidden = false;
          if (!item.resolved) card.draggable = true;
        });

        saveBtn.addEventListener("click", async () => {
          const newDesc = ta.value.trim();
          if (!newDesc) return;
          saveBtn.disabled = true;
          cancelBtn.disabled = true;
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
            renderCardTags(updatedTags);
            form.remove();
            desc.hidden = false;
            meta.hidden = false;
            actions.hidden = false;
            if (!item.resolved) card.draggable = true;
          } catch {
            saveBtn.disabled = false;
            cancelBtn.disabled = false;
            this.showToast("error", "Could not update item.");
          }
        });
      });
      actions.append(editBtn);

      // Merge (only for open items)
      if (!item.resolved) {
        const mergeBtn = document.createElement("button");
        mergeBtn.type = "button";
        mergeBtn.className = "btn btn-light btn-small";
        mergeBtn.textContent = "Merge";
        mergeBtn.addEventListener("click", () => {
          // Enter merge-source mode: highlight this card, show "Merge into" on others
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
          cancelMerge.addEventListener("click", () => {
            card.removeAttribute("data-merge-source");
            cancelMerge.remove();
            board.querySelectorAll("[data-merge-target]").forEach((el) => {
              el.removeAttribute("data-merge-target");
              el.querySelector(".merge-into-btn")?.remove();
            });
          });
          actions.append(cancelMerge);

          // Show "Merge into this" on all other open cards
          board.querySelectorAll(".feedback-card:not([data-merge-source])").forEach((otherCard) => {
            const otherId = otherCard.dataset.id;
            if (!otherId || otherCard.classList.contains("is-resolved")) return;
            otherCard.setAttribute("data-merge-target", "1");
            const intoBtn = document.createElement("button");
            intoBtn.type = "button";
            intoBtn.className = "btn btn-light btn-small merge-into-btn";
            intoBtn.textContent = "← Merge into this";
            intoBtn.addEventListener("click", async () => {
              intoBtn.disabled = true;
              try {
                const res = await fetch("/feedback/merge", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ primaryId: otherId, mergeIds: [item.id] }),
                });
                if (!res.ok) throw new Error();
                this.renderBacklog();
              } catch {
                intoBtn.disabled = false;
                this.showToast("error", "Could not merge items.");
              }
            });
            otherCard.querySelector(".feedback-card-actions")?.append(intoBtn);
          });
        });
        actions.append(mergeBtn);
      }

      // Delete
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-light btn-small";
      deleteBtn.textContent = "Delete";
      let awaitingConfirm = false;
      let confirmTimer = null;
      deleteBtn.addEventListener("click", async () => {
        if (!awaitingConfirm) {
          awaitingConfirm = true;
          deleteBtn.textContent = "Sure?";
          confirmTimer = setTimeout(() => { awaitingConfirm = false; deleteBtn.textContent = "Delete"; }, 3000);
          return;
        }
        clearTimeout(confirmTimer);
        deleteBtn.disabled = true;
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
          deleteBtn.disabled = false;
          awaitingConfirm = false;
          deleteBtn.textContent = "Delete";
          this.showToast("error", "Could not delete item.");
        }
      });
      actions.append(deleteBtn);

      card.append(actions);
      return card;
    };

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
      const resolveAllBtn = document.createElement("button");
      resolveAllBtn.type = "button";
      resolveAllBtn.className = "btn btn-light btn-small feedback-resolve-all-btn";
      resolveAllBtn.textContent = "Confirm Resolved";
      resolveAllBtn.hidden = true;
      resolveAllBtn.addEventListener("click", async () => {
        resolveAllBtn.disabled = true;
        const toConfirm = colItems[type].resolved.filter((i) => !i.confirmedResolved);
        if (!toConfirm.length) { resolveAllBtn.disabled = false; return; }
        try {
          await Promise.all(
            toConfirm.map((item) =>
              fetch("/feedback/" + item.id, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ confirmedResolved: true }),
              }).then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status} for ${item.id}`); })
            )
          );
          for (const item of toConfirm) {
            item.confirmedResolved = true;
          }
          renderColFns[type]?.();
          this.showToast("info", `Confirmed ${toConfirm.length} item${toConfirm.length === 1 ? "" : "s"}.`);
        } catch {
          resolveAllBtn.disabled = false;
          this.showToast("error", "Could not confirm resolved items.");
        }
      });
      header.append(labelEl, badge, resolveAllBtn);
      col.append(header);

      // Cards container
      const cardsEl = document.createElement("div");
      cardsEl.className = "feedback-cards";
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
        resolveAllBtn.hidden = !resolved.some((i) => !i.confirmedResolved);
        resolveAllBtn.disabled = false;
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

// app/web_ui/js/panels/projects.js
// Projects panel render methods — mixed into UIController.prototype by ui.js
export default {
  renderProjects() {
    const container = this.elements.projectList;
    container.innerHTML = "";
    const filterArea = this.elements.projectAreaFilter?.value || "all";
    const hasActiveFilter = filterArea !== "all" || Boolean(this.showMissingNextOnly);
    const filtersDiv = this.elements.projectAreaFilter?.closest(".project-filters");
    if (filtersDiv) {
      filtersDiv.classList.toggle("has-active-filter", hasActiveFilter);
    }
    const allTasks = this.taskManager.getTasks({ includeCompleted: false });
    const hasNextAction = new Map();
    const taskCountByProject = new Map();
    allTasks.forEach((task) => {
      if (!task.projectId) return;
      if (task.status === STATUS.NEXT) hasNextAction.set(task.projectId, true);
      taskCountByProject.set(task.projectId, (taskCountByProject.get(task.projectId) || 0) + 1);
    });
    const projects = (this.projectCache || []).filter((project) => {
      if (filterArea && filterArea !== "all") {
        if ((project.areaOfFocus || "").toLowerCase() !== filterArea.toLowerCase()) return false;
      }
      if (this.activeArea) {
        if ((project.areaOfFocus || "").toLowerCase() !== this.activeArea.toLowerCase()) return false;
      }
      return true;
    });
    const todayIsoProjects = new Date().toISOString().slice(0, 10);
    const projectRiskScore = (project) => {
      if (project.someday) return 0;
      const deadlinePassed = Boolean(project.deadline && project.deadline < todayIsoProjects);
      const missingNext = !hasNextAction.get(project.id);
      return (deadlinePassed || missingNext) ? 2 : 1;
    };
    const rawVisible = this.showMissingNextOnly
      ? projects.filter((project) => !project.someday && !hasNextAction.get(project.id))
      : projects;
    const activeProjects = [...rawVisible].filter((p) => !p.someday).sort((a, b) => {
      const scoreDiff = projectRiskScore(b) - projectRiskScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return a.name.localeCompare(b.name);
    });
    const parkedProjects = [...rawVisible].filter((p) => p.someday).sort((a, b) => a.name.localeCompare(b.name));
    const visibleProjects = [...activeProjects, ...parkedProjects];

    const areas = Array.from(new Set(this.taskManager.getAreasOfFocus()));
    if (this.elements.projectAreaFilter) {
      const select = this.elements.projectAreaFilter;
      const existing = new Set(Array.from(select.options).map((opt) => opt.value));
      areas.forEach((area) => {
        if (existing.has(area)) return;
        const option = document.createElement("option");
        option.value = area;
        option.textContent = area;
        select.append(option);
      });
    }
    const currentAreaVal = this.elements.projectAreaSelect?.value;
    const defaultAreaVal = currentAreaVal || (areas.length > 0 ? areas[0] : "");
    populateAreaSelect(this.elements.projectAreaSelect, areas, defaultAreaVal);

    let parkedDividerInserted = false;
    visibleProjects.forEach((project) => {
      if (project.someday && !parkedDividerInserted && activeProjects.length > 0) {
        const divider = document.createElement("div");
        divider.className = "project-section-divider";
        divider.textContent = "Parked";
        container.append(divider);
        parkedDividerInserted = true;
      }

      const missingNext = !project.someday && !hasNextAction.get(project.id);
      const missingArea = !project.areaOfFocus;
      const deadlinePassed = Boolean(project.deadline && project.deadline < todayIsoProjects);
      const isAtRisk = !project.someday && (missingNext || deadlinePassed);
      const taskCount = taskCountByProject.get(project.id) || 0;

      const row = document.createElement("div");
      row.className = isAtRisk ? "project-row project-row--at-risk" : "project-row";
      row.dataset.projectId = project.id;
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      row.setAttribute("aria-label", `Open project: ${project.name}`);

      const main = document.createElement("div");
      main.className = "project-row-main";

      const name = document.createElement("strong");
      name.className = "project-row-name";
      name.textContent = project.name;
      main.append(name);

      const chips = document.createElement("div");
      chips.className = "project-row-chips";
      [project.areaOfFocus, project.themeTag].forEach((label) => {
        if (!label) return;
        const chip = document.createElement("span");
        chip.className = "project-row-chip";
        chip.textContent = label;
        chips.append(chip);
      });
      if (project.someday) {
        const bbChip = document.createElement("span");
        bbChip.className = "project-row-chip project-row-chip--muted";
        bbChip.textContent = "Backburner";
        chips.append(bbChip);
      }
      if (chips.children.length) main.append(chips);
      row.append(main);

      const meta = document.createElement("div");
      meta.className = "project-row-meta";

      if (project.deadline) {
        const dl = document.createElement("span");
        dl.className = deadlinePassed
          ? "project-row-deadline project-row-deadline--overdue"
          : "project-row-deadline";
        dl.textContent = formatFriendlyDate(project.deadline);
        meta.append(dl);
      }

      if (missingNext) {
        const badge = document.createElement("span");
        badge.className = "badge badge-warning";
        badge.textContent = "No next action";
        meta.append(badge);
      }
      if (missingArea) {
        const badge = document.createElement("span");
        badge.className = "badge badge-warning";
        badge.textContent = "No area";
        meta.append(badge);
      }

      const countBadge = document.createElement("span");
      countBadge.className = "badge project-task-count";
      countBadge.title = `${taskCount} active task${taskCount !== 1 ? "s" : ""}`;
      countBadge.textContent = String(taskCount);
      meta.append(countBadge);

      row.append(meta);

      const chevron = document.createElement("span");
      chevron.className = "project-row-chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "›";
      row.append(chevron);

      const openFlyout = () => this.openProjectFlyout(project.id);
      row.addEventListener("click", openFlyout);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openFlyout();
        }
      });

      container.append(row);
    });

    this.renderTemplateSection(container);
  },

  renderCompletedProjects() {
    const container = this.elements.completedProjectsList;
    if (!container) return;
    container.innerHTML = "";
    const completedProjects = this.taskManager.getCompletedProjects();
    const completedTasks = this.taskManager.getCompletedTasks();
    if (!completedProjects.length && !completedTasks.length) {
      const empty = document.createElement("p");
      empty.className = "muted small-text";
      empty.textContent = "No completions yet. Finish tasks or projects to build this report.";
      container.append(empty);
      return;
    }
    const projectNameById = new Map((this.projectCache || []).map((project) => [project.id, project.name]));
    completedProjects.forEach((entry) => {
      if (entry?.id && entry?.name) {
        projectNameById.set(entry.id, entry.name);
      }
    });

    const groups = new Map();
    completedTasks.forEach((task) => {
      const key = task.projectId || "none";
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(task);
    });

    completedProjects.forEach((entry) => {
      if (!groups.has(entry.id)) {
        groups.set(entry.id, []);
      }
    });

    const rankedGroups = Array.from(groups.entries())
      .map(([key, tasks]) => {
        const groupTasks = [...tasks].sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
        const headDate = groupTasks[0]?.completedAt || "";
        const projectEntry = key === "none" ? null : completedProjects.find((entry) => entry.id === key) || null;
        const sortDate = projectEntry?.completedAt || headDate || "";
        const title =
          key === "none"
            ? "No Project Tasks"
            : projectEntry?.name || projectNameById.get(key) || "Project";
        return {
          key,
          title,
          tasks: groupTasks,
          projectEntry,
          sortDate,
        };
      })
      .sort((a, b) => (b.sortDate || "").localeCompare(a.sortDate || ""));

    rankedGroups.forEach((group) => {
      const section = document.createElement("section");
      section.className = "report-details";

      const header = document.createElement("div");
      header.className = "report-details-header";

      const title = document.createElement("h4");
      title.className = "report-details-title";
      title.textContent = group.title;

      const meta = document.createElement("span");
      meta.className = "report-details-meta small-text";
      const countLabel = `${group.tasks.length} completed task${group.tasks.length === 1 ? "" : "s"}`;
      if (group.projectEntry?.completedAt) {
        meta.textContent = `${countLabel} • Project completed ${formatFriendlyDate(group.projectEntry.completedAt)}`;
      } else {
        meta.textContent = countLabel;
      }
      header.append(title, meta);
      section.append(header);

      const list = document.createElement("ul");
      list.className = "report-details-list";
      if (!group.tasks.length) {
        const row = document.createElement("li");
        row.className = "report-detail-item";
        const text = document.createElement("span");
        text.className = "muted small-text";
        text.textContent = "No completed tasks recorded for this project yet.";
        row.append(text);
        list.append(row);
      } else {
        group.tasks.forEach((task) => {
          const row = document.createElement("li");
          row.className = "report-detail-item";
          const label = document.createElement("strong");
          label.textContent = task.title || "Completed task";
          const details = document.createElement("span");
          details.className = "report-detail-meta";
          const parts = [formatFriendlyDate(task.completedAt)];
          if (task.contexts?.length) parts.push(task.contexts.join(", "));
          if (task.slug) parts.push(`#${task.slug}`);
          details.textContent = parts.join(" • ");
          row.append(label, details);
          list.append(row);
        });
      }
      section.append(list);
      container.append(section);
    });
  },

  renderTemplateSection(container) {
    const templates = this.taskManager.getTemplates();
    const section = document.createElement("div");
    section.className = "template-section";

    const header = document.createElement("div");
    header.className = "template-section-header";
    const heading = document.createElement("strong");
    heading.textContent = "Templates";
    const newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.className = "btn btn-light btn-small";
    newBtn.textContent = "+ New template";
    newBtn.addEventListener("click", () => this.openTemplateEditor());
    header.append(heading, newBtn);
    section.append(header);

    if (!templates.length) {
      const empty = document.createElement("p");
      empty.className = "muted small-text template-empty";
      empty.textContent = "No templates yet. Create one to quickly spin up projects with pre-set tasks.";
      section.append(empty);
    } else {
      templates.forEach((tmpl) => {
        const row = document.createElement("div");
        row.className = "template-row";
        const info = document.createElement("div");
        info.className = "template-row-info";
        const name = document.createElement("strong");
        name.textContent = tmpl.name;
        const meta = document.createElement("span");
        meta.className = "muted small-text";
        const taskCount = (tmpl.tasks || []).length;
        const chips = [tmpl.areaOfFocus, tmpl.themeTag].filter(Boolean).join(" · ");
        meta.textContent = `${taskCount} task${taskCount !== 1 ? "s" : ""}${chips ? " · " + chips : ""}`;
        info.append(name, meta);
        const actions = document.createElement("div");
        actions.className = "template-row-actions";
        const useBtn = document.createElement("button");
        useBtn.type = "button";
        useBtn.className = "btn btn-primary btn-small";
        useBtn.textContent = "Use";
        useBtn.addEventListener("click", () => this.openUseTemplateModal(tmpl));
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn btn-light btn-small";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", () => this.openTemplateEditor(tmpl));
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "btn btn-light btn-small";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", () => {
          if (confirm(`Delete template "${tmpl.name}"?`)) {
            this.taskManager.deleteTemplate(tmpl.id);
            this.renderProjects();
          }
        });
        actions.append(useBtn, editBtn, deleteBtn);
        row.append(info, actions);
        section.append(row);
      });
    }
    container.append(section);
  },
};

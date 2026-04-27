// app/web_ui/js/panels/reports.js
// Reports panel render methods — mixed into UIController.prototype by ui.js
import { formatFriendlyDate } from "../data.js";
export default {
  renderReports() {
    const { reportList, reportEmpty, reportGrouping, reportYear } = this.elements;
    if (!reportList) return;
    const grouping = this.reportFilters.grouping;
    if (reportGrouping) {
      reportGrouping.value = grouping;
    }
    const contexts = this.taskManager.getContexts();
    this.renderReportContextPicker(contexts);
    const projects = this.projectCache || [];
    this.renderReportProjectPicker(projects);
    const areas = this.taskManager.getAreasOfFocus();
    this.renderReportAreaPicker(areas);
    const effectiveReportAreas = this.activeArea
      ? [this.activeArea]
      : this.reportFilters.areas;
    const completedTasks = this.taskManager.getCompletedTasks();
    const completedProjects = this.taskManager
      .getCompletedProjects()
      .filter((project) => this.matchesReportProjectSelection(project.id))
      .filter((project) => this.matchesReportAreaSelection(project.snapshot?.areaOfFocus))
      .filter((project) => !this.activeArea ||
        (project.snapshot?.areaOfFocus || "").toLowerCase() === this.activeArea.toLowerCase());
    const years = this.getReportYears([...completedTasks, ...completedProjects]);
    if (!years.includes(this.reportFilters.year)) {
      this.reportFilters.year = years[0];
    }
    if (reportYear) {
      reportYear.innerHTML = "";
      years.forEach((year) => {
        const option = document.createElement("option");
        option.value = String(year);
        option.textContent = year;
        reportYear.append(option);
      });
      reportYear.value = String(this.reportFilters.year);
      reportYear.disabled = grouping === "year";
      if (!reportYear.disabled) {
        const parsed = parseInt(reportYear.value, 10);
        this.reportFilters.year = Number.isNaN(parsed) ? years[0] : parsed;
      }
    }
    const taskSummary = this.taskManager.getCompletionSummary({
      grouping,
      year: grouping === "year" ? undefined : this.reportFilters.year,
      contexts: this.reportFilters.contexts,
      projectIds: this.reportFilters.projects,
      areas: effectiveReportAreas,
    });
    const summaryByKey = new Map();
    taskSummary.forEach((entry) => {
      summaryByKey.set(entry.key, {
        ...entry,
        tasks: Array.isArray(entry.tasks) ? entry.tasks : [],
        projects: [],
      });
    });
    completedProjects.forEach((project) => {
      const completedDate = new Date(project.completedAt);
      if (!Number.isFinite(completedDate.getTime())) return;
      if (grouping !== "year" && completedDate.getFullYear() !== this.reportFilters.year) {
        return;
      }
      const bucket = this.buildReportBucket(completedDate, grouping);
      if (!bucket) return;
      const existing = summaryByKey.get(bucket.key) || {
        key: bucket.key,
        label: bucket.label,
        range: bucket.range,
        count: 0,
        sortValue: bucket.sortValue,
        tasks: [],
        projects: [],
      };
      existing.count += 1;
      existing.projects.push(project);
      summaryByKey.set(bucket.key, existing);
    });
    const summary = Array.from(summaryByKey.values()).sort((a, b) => a.sortValue - b.sortValue);
    reportList.innerHTML = "";
    const hasData = summary.length > 0;
    if (reportEmpty) {
      reportEmpty.hidden = hasData;
    }
    if (!hasData) {
      this.activeReportKey = null;
      this.clearReportDetails({ hidePlaceholder: true });
      return;
    }
    summary.forEach((entry) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "report-row";
      button.dataset.reportKey = entry.key;
      const isActive = this.activeReportKey === entry.key;
      if (isActive) {
        button.classList.add("is-active");
      }
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      const label = document.createElement("strong");
      label.textContent = entry.label;
      const count = document.createElement("span");
      count.textContent = `${entry.count} done`;
      button.append(label);
      if (entry.range) {
        const range = document.createElement("span");
        range.className = "report-range";
        range.textContent = entry.range;
        button.append(range);
      }
      button.append(count);
      button.addEventListener("click", () => {
        this.activeReportKey = this.activeReportKey === entry.key ? null : entry.key;
        this.renderReports();
      });
      item.append(button);
      reportList.append(item);
    });
    const selectedEntry = summary.find((entry) => entry.key === this.activeReportKey);
    if (selectedEntry) {
      this.renderReportDetails(selectedEntry);
    } else {
      this.clearReportDetails();
    }
  },

  renderReportContextPicker(contexts) {
    const menu = this.elements.reportContextOptions;
    if (!menu) return;
    const filtered = contexts.filter((context) => context && context.toLowerCase() !== "all");
    const options = [
      { label: "All contexts", value: "all" },
      ...filtered.map((context) => ({ label: context, value: context })),
    ];
    menu.innerHTML = "";
    options.forEach((option) => {
      const id = `report-context-${option.value === "all" ? "all" : option.value.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
      const label = document.createElement("label");
      label.setAttribute("for", id);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = id;
      checkbox.value = option.value;
      checkbox.checked = this.isReportValueSelected("contexts", option.value);
      checkbox.addEventListener("change", () => {
        this.updateReportFilterSelection("contexts", option.value, checkbox.checked);
        this.renderReports();
      });
      const text = document.createElement("span");
      text.textContent = option.label;
      label.append(checkbox, text);
      menu.append(label);
    });
    this.updateReportPickerSummary("contexts");
  },

  renderReportProjectPicker(projects) {
    const menu = this.elements.reportProjectOptions;
    if (!menu) return;
    const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name));
    const options = [
      { label: "All projects", value: "all" },
      { label: "No project", value: "none" },
      ...sortedProjects.map((project) => ({ label: project.name, value: project.id })),
    ];
    menu.innerHTML = "";
    options.forEach((option) => {
      const id = `report-project-${option.value.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
      const label = document.createElement("label");
      label.setAttribute("for", id);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = id;
      checkbox.value = option.value;
      checkbox.checked = this.isReportValueSelected("projects", option.value);
      checkbox.addEventListener("change", () => {
        this.updateReportFilterSelection("projects", option.value, checkbox.checked);
        this.renderReports();
      });
      const text = document.createElement("span");
      text.textContent = option.label;
      label.append(checkbox, text);
      menu.append(label);
    });
    this.updateReportPickerSummary("projects");
  },

  renderReportAreaPicker(areas) {
    const menu = this.elements.reportAreaOptions;
    if (!menu) return;
    const sorted = [...areas].filter(Boolean).sort((a, b) => a.localeCompare(b));
    const options = [
      { label: "All areas", value: "all" },
      { label: "No area", value: "none" },
      ...sorted.map((area) => ({ label: area, value: area })),
    ];
    menu.innerHTML = "";
    options.forEach((option) => {
      const id = `report-area-${option.value.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
      const label = document.createElement("label");
      label.setAttribute("for", id);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = id;
      checkbox.value = option.value;
      checkbox.checked = this.isReportValueSelected("areas", option.value);
      checkbox.addEventListener("change", () => {
        this.updateReportFilterSelection("areas", option.value, checkbox.checked);
        this.renderReports();
      });
      const text = document.createElement("span");
      text.textContent = option.label;
      label.append(checkbox, text);
      menu.append(label);
    });
    this.updateReportPickerSummary("areas");
  },

  updateReportFilterSelection(key, value, checked) {
    const current = Array.isArray(this.reportFilters[key]) ? [...this.reportFilters[key]] : ["all"];
    const selections = new Set(current);
    if (value === "all") {
      if (checked) {
        this.reportFilters[key] = ["all"];
      } else if (!selections.size || selections.has("all")) {
        this.reportFilters[key] = ["all"];
      }
      return;
    }
    selections.delete("all");
    if (checked) {
      selections.add(value);
    } else {
      selections.delete(value);
    }
    if (!selections.size) {
      selections.add("all");
    }
    this.reportFilters[key] = Array.from(selections);
  },

  isReportValueSelected(key, value) {
    const selections = Array.isArray(this.reportFilters[key]) ? this.reportFilters[key] : ["all"];
    if (value === "all") {
      return selections.includes("all") || !selections.length;
    }
    if (selections.includes("all")) {
      return false;
    }
    return selections.includes(value);
  },

  updateReportPickerSummary(type) {
    const toggleMap = {
      contexts: this.elements.reportContextToggle,
      projects: this.elements.reportProjectToggle,
      areas: this.elements.reportAreaToggle,
    };
    const defaultLabels = { contexts: "All contexts", projects: "All projects", areas: "All areas" };
    const toggle = toggleMap[type];
    if (!toggle) return;
    const selections = Array.isArray(this.reportFilters[type]) ? this.reportFilters[type] : ["all"];
    const defaultLabel = defaultLabels[type] || "All";
    if (!selections.length || selections.includes("all")) {
      toggle.textContent = defaultLabel;
      return;
    }
    if (selections.length === 1) {
      const value = selections[0];
      if (type === "projects") {
        if (value === "none") {
          toggle.textContent = "No project";
        } else {
          const project = this.projectLookup?.get(value);
          toggle.textContent = project?.name || "1 project";
        }
      } else if (value === "none") {
        toggle.textContent = type === "areas" ? "No area" : "None";
      } else {
        toggle.textContent = value;
      }
      return;
    }
    toggle.textContent = `${selections.length} selected`;
  },

  renderReportDetails(entry) {
    const { reportDetails, reportDetailsList, reportDetailsTitle, reportDetailsMeta, reportDetailsPlaceholder } = this.elements;
    if (!reportDetails || !reportDetailsList) return;
    reportDetails.hidden = false;
    if (reportDetailsPlaceholder) {
      reportDetailsPlaceholder.hidden = true;
    }
    if (reportDetailsTitle) {
      reportDetailsTitle.textContent = entry.label;
    }
    const tasks = Array.isArray(entry.tasks) ? entry.tasks.slice() : [];
    const projects = Array.isArray(entry.projects) ? entry.projects.slice() : [];
    if (reportDetailsMeta) {
      const parts = [];
      if (tasks.length) {
        parts.push(`${tasks.length} task${tasks.length === 1 ? "" : "s"}`);
      }
      if (projects.length) {
        parts.push(`${projects.length} project${projects.length === 1 ? "" : "s"}`);
      }
      reportDetailsMeta.textContent = parts.length ? `Completed: ${parts.join(" • ")}` : `${entry.count} done`;
    }
    reportDetailsList.innerHTML = "";
    if (!tasks.length && !projects.length) {
      const empty = document.createElement("li");
      empty.className = "muted small-text";
      empty.textContent = "No completion details recorded.";
      reportDetailsList.append(empty);
      return;
    }
    projects
      .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""))
      .forEach((project) => {
        const item = document.createElement("li");
        item.className = "report-detail-item";
        const title = document.createElement("strong");
        title.textContent = `Project completed: ${project.name}`;
        const meta = document.createElement("span");
        meta.className = "report-detail-meta";
        const area = project.snapshot?.areaOfFocus;
        meta.textContent = [
          `Completed ${formatFriendlyDate(project.completedAt)}`,
          area ? `Area: ${area}` : null,
        ].filter(Boolean).join(" • ");
        item.append(title, meta);
        reportDetailsList.append(item);
      });
    tasks
      .sort((a, b) => {
        const aTime = new Date(a.completedAt || 0).getTime();
        const bTime = new Date(b.completedAt || 0).getTime();
        return bTime - aTime;
      })
      .filter((task) => !this._hiddenReportTaskIds.has(task.id || task.sourceId))
      .forEach((task) => {
        const item = document.createElement("li");
        item.className = "report-detail-item";
        const title = document.createElement("strong");
        title.textContent = task.title;
        const meta = document.createElement("span");
        meta.className = "report-detail-meta";
        meta.textContent = this.formatReportTaskMeta(task);
        const actions = document.createElement("div");
        actions.className = "report-detail-actions";
        const viewBtn = document.createElement("button");
        viewBtn.type = "button";
        viewBtn.className = "btn btn-light btn-small";
        viewBtn.textContent = "View details";
        viewBtn.addEventListener("click", () => {
          this.openTaskFlyout(task, { readOnly: true, entry: task });
        });
        const restoreBtn = document.createElement("button");
        restoreBtn.type = "button";
        restoreBtn.className = "btn btn-light btn-small report-restore-btn";
        restoreBtn.textContent = "Restore task";
        restoreBtn.addEventListener("click", () => {
          const restored = this.taskManager.restoreCompletedTask(task.id || task.sourceId);
          if (restored) {
            this.renderReports();
            this.setActivePanel("next");
            this.openTaskFlyout(restored.id);
          }
        });
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn-light btn-small";
        removeBtn.textContent = "Remove from report";
        removeBtn.addEventListener("click", () => {
          this._hiddenReportTaskIds.add(task.id || task.sourceId);
          this.renderReportDetails(entry);
        });
        actions.append(viewBtn, restoreBtn, removeBtn);
        item.append(title, meta);
        if (task.closureNotes) {
          const notes = document.createElement("p");
          notes.className = "report-detail-notes";
          notes.textContent = `Notes: ${task.closureNotes}`;
          item.append(notes);
        }
        item.append(actions);
        reportDetailsList.append(item);
      });
  },

  formatReportTaskMeta(task) {
    const parts = [];
    if (task.completedAt) {
      const completedDate = new Date(task.completedAt);
      if (!Number.isNaN(completedDate.getTime())) {
        parts.push(
          `Completed ${completedDate.toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          })}`
        );
      }
    }
    if (task.contexts?.length) {
      parts.push(task.contexts.map(stripTagPrefix).join(", "));
    }
    const projectName = this.getProjectName(task.projectId);
    if (projectName) {
      parts.push(`#${projectName}`);
    }
    return parts.join(" • ") || "No additional metadata";
  },

  clearReportDetails({ hidePlaceholder = false } = {}) {
    const { reportDetails, reportDetailsList, reportDetailsTitle, reportDetailsMeta, reportDetailsPlaceholder } = this.elements;
    if (reportDetailsList) {
      reportDetailsList.innerHTML = "";
    }
    if (reportDetailsTitle) {
      reportDetailsTitle.textContent = "";
    }
    if (reportDetailsMeta) {
      reportDetailsMeta.textContent = "";
    }
    if (reportDetails) {
      reportDetails.hidden = true;
    }
    if (reportDetailsPlaceholder) {
      reportDetailsPlaceholder.hidden = hidePlaceholder;
    }
  },

  matchesReportProjectSelection(projectId) {
    const selections = Array.isArray(this.reportFilters.projects) ? this.reportFilters.projects : ["all"];
    if (!selections.length || selections.includes("all")) return true;
    if (selections.includes("none")) return false;
    return selections.includes(projectId);
  },

  matchesReportAreaSelection(area) {
    const selections = Array.isArray(this.reportFilters.areas) ? this.reportFilters.areas : ["all"];
    if (!selections.length || selections.includes("all")) return true;
    if (selections.includes("none")) return !area;
    return selections.includes(area);
  },

  buildReportBucket(date, grouping) {
    if (!date || !Number.isFinite(date.getTime())) return null;
    if (grouping === "week") {
      const week = this.getIsoWeekNumber(date);
      return {
        key: `${date.getFullYear()}-W${String(week).padStart(2, "0")}`,
        label: `Week ${week}, ${date.getFullYear()}`,
        range: this.getWeekRangeLabel(date),
        sortValue: date.getFullYear() * 100 + week,
      };
    }
    if (grouping === "month") {
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        label: `${date.toLocaleString(undefined, { month: "short" })} ${date.getFullYear()}`,
        range: null,
        sortValue: date.getFullYear() * 100 + date.getMonth(),
      };
    }
    if (grouping === "year") {
      return {
        key: `${date.getFullYear()}`,
        label: `${date.getFullYear()}`,
        range: null,
        sortValue: date.getFullYear(),
      };
    }
    return null;
  },

  getIsoWeekNumber(date) {
    const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  },

  getWeekRangeLabel(date) {
    const d = new Date(date);
    const day = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - day);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmt = (dt) =>
      dt.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    return `${fmt(start)} – ${fmt(end)}`;
  },
};

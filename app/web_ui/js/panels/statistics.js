// Statistics panel render methods — mixed into UIController.prototype by ui.js
export default {
  renderStatistics() {
    const {
      statsLookback,
      statActiveTasks,
      statCompletedTasks,
      statCompletionRate,
      statOpenProjects,
      statStaleTasks,
      statOverdueTasks,
      statsStatusBreakdown,
      statsTrendMeta,
      statsTrendBars,
      statsContextList,
      statsProjectHealthMeta,
      statsProjectHealthList,
      statsDueBuckets,
      statsUpcomingDueList,
      statsMetadataCoverage,
      statsAgeBuckets,
      statsArchiveMix,
      statsPeopleList,
    } = this.elements;
    if (!statActiveTasks || !statsStatusBreakdown) return;

    if (statsLookback) {
      const parsed = parseInt(statsLookback.value || String(this.statsLookbackDays), 10);
      const normalized = Number.isNaN(parsed) ? this.statsLookbackDays : Math.max(7, parsed);
      this.statsLookbackDays = normalized;
      if (statsLookback.value !== String(normalized)) {
        statsLookback.value = String(normalized);
      }
    }

    const now = new Date();
    const today = this.startOfDay(now);
    const todayIso = today.toISOString().slice(0, 10);
    const lookbackStart = new Date(today.getTime() - (this.statsLookbackDays - 1) * 86400000);

    const activeTasks = this.taskManager.getTasks({ includeCompleted: false, areaLens: this.activeArea });
    const completedTasks = this.taskManager.getCompletedTasks(
      this.activeArea ? { areas: [this.activeArea] } : {}
    );
    const activeProjects = this.taskManager.getProjects({ includeSomeday: true })
      .filter((p) => !this.activeArea || (p.areaOfFocus || "").toLowerCase() === this.activeArea.toLowerCase());
    const completedProjects = this.taskManager.getCompletedProjects()
      .filter((p) => !this.activeArea || (p.snapshot?.areaOfFocus || "").toLowerCase() === this.activeArea.toLowerCase());
    const statsInbox = activeTasks.filter((t) => t.status === STATUS.INBOX).length;
    const statsNext = activeTasks.filter((t) => t.status === STATUS.NEXT).length;
    const statsDoing = activeTasks.filter((t) => t.status === STATUS.DOING).length;
    const statsWaiting = activeTasks.filter((t) => t.status === STATUS.WAITING).length;
    const statsSomeday = activeTasks.filter((t) => t.status === STATUS.SOMEDAY).length;
    const statsOverdue = activeTasks.filter((t) => t.dueDate && t.dueDate < todayIso).length;

    const completedInWindow = completedTasks.filter((entry) => {
      const completedAt = new Date(entry.completedAt || "");
      return Number.isFinite(completedAt.getTime()) && completedAt >= lookbackStart;
    });
    const completedProjectsInWindow = completedProjects.filter((project) => {
      const completedAt = new Date(project?.completedAt || "");
      return Number.isFinite(completedAt.getTime()) && completedAt >= lookbackStart;
    });

    const staleTasks = activeTasks.filter((task) => {
      const age = this.getAgeInDays(task.updatedAt || task.createdAt, now);
      return Number.isFinite(age) && age >= 14;
    }).length;

    const completionDenominator = activeTasks.length + completedInWindow.length;
    const completionRate = completionDenominator
      ? Math.round((completedInWindow.length / completionDenominator) * 100)
      : 0;

    statActiveTasks.textContent = this.formatCount(activeTasks.length);
    statCompletedTasks.textContent = this.formatCount(completedInWindow.length);
    statCompletionRate.textContent = `${completionRate}%`;
    statOpenProjects.textContent = this.formatCount(activeProjects.length);
    statStaleTasks.textContent = this.formatCount(staleTasks);
    statOverdueTasks.textContent = this.formatCount(statsOverdue);

    const statusRows = [
      { label: "Inbox", value: statsInbox, meta: `${this.toPercent(statsInbox, activeTasks.length)}%` },
      { label: "Pending Tasks", value: statsNext, meta: `${this.toPercent(statsNext, activeTasks.length)}%` },
      { label: "Doing", value: statsDoing, meta: `${this.toPercent(statsDoing, activeTasks.length)}%` },
      { label: "Delegated", value: statsWaiting, meta: `${this.toPercent(statsWaiting, activeTasks.length)}%` },
      { label: "Backburner", value: statsSomeday, meta: `${this.toPercent(statsSomeday, activeTasks.length)}%` },
    ];
    this.renderStatisticsRows(statsStatusBreakdown, statusRows, {
      emptyMessage: "No active tasks available.",
      includeBars: true,
    });

    this.renderCompletionTrend(statsTrendBars, completedTasks, lookbackStart, this.statsLookbackDays);
    if (statsTrendMeta) {
      const avgPerDay = completedInWindow.length / Math.max(1, this.statsLookbackDays);
      statsTrendMeta.textContent =
        `${completedInWindow.length} tasks completed in ${this.statsLookbackDays} days ` +
        `(${avgPerDay.toFixed(1)}/day) • ${completedProjectsInWindow.length} projects closed.`;
    }

    const contextMap = new Map();
    const ensureContext = (value) => {
      const key = value && String(value).trim() ? String(value).trim() : "No context";
      if (!contextMap.has(key)) {
        contextMap.set(key, { active: 0, completed: 0 });
      }
      return key;
    };
    activeTasks.forEach((task) => {
      const ctxs = task.contexts?.length ? task.contexts : [null];
      ctxs.forEach((ctx) => { contextMap.get(ensureContext(ctx)).active += 1; });
    });
    completedInWindow.forEach((entry) => {
      const ctxs = entry.contexts?.length ? entry.contexts : [null];
      ctxs.forEach((ctx) => { contextMap.get(ensureContext(ctx)).completed += 1; });
    });
    const contextRows = Array.from(contextMap.entries())
      .map(([label, counts]) => {
        const total = counts.active + counts.completed;
        return {
          label,
          value: total,
          meta: `${counts.active} active • ${counts.completed} done`,
        };
      })
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
      .slice(0, 10);
    this.renderStatisticsRows(statsContextList, contextRows, {
      emptyMessage: "No context usage yet.",
      includeBars: true,
    });

    const projectRows = activeProjects
      .map((project) => {
        const tasks = activeTasks.filter((task) => task.projectId === project.id);
        const nextCount = tasks.filter((task) => task.status === STATUS.NEXT).length;
        const waitingCount = tasks.filter((task) => task.status === STATUS.WAITING).length;
        const dueSoonCount = tasks.filter((task) => {
          if (!task.dueDate) return false;
          return task.dueDate >= todayIso && task.dueDate <= this.shiftIsoDate(todayIso, 7);
        }).length;
        const deadlinePassed = Boolean(project.deadline && project.deadline < todayIso);
        const missingNext = !project.someday && nextCount === 0;
        let health = "ok";
        let healthLabel = "Healthy";
        if (project.someday) {
          health = "neutral";
          healthLabel = "Backburner";
        } else if (deadlinePassed) {
          health = "risk";
          healthLabel = "Deadline passed";
        } else if (missingNext) {
          health = "risk";
          healthLabel = "Missing next action";
        }
        return {
          label: project.name,
          value: tasks.length,
          meta: `${tasks.length} tasks • ${nextCount} next • ${waitingCount} waiting • ${dueSoonCount} due soon • ${healthLabel}`,
          health,
          sortScore: health === "risk" ? 2 : health === "neutral" ? 1 : 0,
          projectId: project.id,
        };
      })
      .sort((a, b) => b.sortScore - a.sortScore || b.value - a.value || a.label.localeCompare(b.label))
      .slice(0, 12);
    const riskyProjects = projectRows.filter((row) => row.health === "risk").length;
    if (statsProjectHealthMeta) {
      statsProjectHealthMeta.textContent = `${activeProjects.length} active • ${riskyProjects} at risk`;
    }
    this.renderStatisticsRows(statsProjectHealthList, projectRows, {
      emptyMessage: "No active projects yet.",
      includeBars: true,
      onItemClick: (row) => {
        if (!row.projectId) return;
        this.setActivePanel("projects");
        this.openProjectFlyout(row.projectId);
      },
    });

    const dueBuckets = {
      overdue: 0,
      today: 0,
      next7: 0,
      next30: 0,
      later: 0,
      noDue: 0,
    };
    activeTasks.forEach((task) => {
      const due = task.dueDate;
      if (!due) {
        dueBuckets.noDue += 1;
        return;
      }
      if (due < todayIso) {
        dueBuckets.overdue += 1;
        return;
      }
      if (due === todayIso) {
        dueBuckets.today += 1;
        return;
      }
      if (due <= this.shiftIsoDate(todayIso, 7)) {
        dueBuckets.next7 += 1;
        return;
      }
      if (due <= this.shiftIsoDate(todayIso, 30)) {
        dueBuckets.next30 += 1;
        return;
      }
      dueBuckets.later += 1;
    });
    const dueRows = [
      { label: "Overdue", value: dueBuckets.overdue, meta: `${this.toPercent(dueBuckets.overdue, activeTasks.length)}%` },
      { label: "Due today", value: dueBuckets.today, meta: `${this.toPercent(dueBuckets.today, activeTasks.length)}%` },
      { label: "Due in 7 days", value: dueBuckets.next7, meta: `${this.toPercent(dueBuckets.next7, activeTasks.length)}%` },
      { label: "Due in 30 days", value: dueBuckets.next30, meta: `${this.toPercent(dueBuckets.next30, activeTasks.length)}%` },
      { label: "Due later", value: dueBuckets.later, meta: `${this.toPercent(dueBuckets.later, activeTasks.length)}%` },
      { label: "No due date", value: dueBuckets.noDue, meta: `${this.toPercent(dueBuckets.noDue, activeTasks.length)}%` },
    ];
    this.renderStatisticsRows(statsDueBuckets, dueRows, {
      emptyMessage: "No due date data yet.",
      includeBars: true,
    });

    const upcomingDue = activeTasks
      .filter((task) => task.dueDate && task.dueDate >= todayIso)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 8)
      .map((task) => ({
        label: task.title,
        value: 1,
        meta: `${formatFriendlyDate(task.dueDate)} • ${STATUS_LABELS[task.status] || task.status}`,
      }));
    this.renderStatisticsRows(statsUpcomingDueList, upcomingDue, {
      emptyMessage: "No upcoming due dates.",
      includeBars: false,
    });

    const metadataRows = [
      { label: "Has context", value: activeTasks.filter((task) => task.contexts?.length).length },
      { label: "Assigned to project", value: activeTasks.filter((task) => task.projectId).length },
      { label: "Effort estimated", value: activeTasks.filter((task) => task.effortLevel).length },
      { label: "Time estimated", value: activeTasks.filter((task) => task.timeRequired).length },
      { label: "Has due date", value: activeTasks.filter((task) => task.dueDate).length },
      { label: "Scheduled on calendar", value: activeTasks.filter((task) => task.calendarDate).length },
      { label: "People tag set", value: activeTasks.filter((task) => task.peopleTag).length },
      { label: "Waiting owner set", value: activeTasks.filter((task) => task.waitingFor).length },
    ].map((row) => ({
      ...row,
      meta: `${row.value}/${activeTasks.length || 0} • ${this.toPercent(row.value, activeTasks.length)}%`,
    }));
    this.renderStatisticsRows(statsMetadataCoverage, metadataRows, {
      emptyMessage: "No metadata to evaluate.",
      includeBars: true,
    });

    const ageBuckets = {
      "0-1 days": 0,
      "2-7 days": 0,
      "8-30 days": 0,
      "31-90 days": 0,
      "90+ days": 0,
    };
    activeTasks.forEach((task) => {
      const age = this.getAgeInDays(task.createdAt || task.updatedAt, now);
      if (!Number.isFinite(age)) return;
      if (age <= 1) ageBuckets["0-1 days"] += 1;
      else if (age <= 7) ageBuckets["2-7 days"] += 1;
      else if (age <= 30) ageBuckets["8-30 days"] += 1;
      else if (age <= 90) ageBuckets["31-90 days"] += 1;
      else ageBuckets["90+ days"] += 1;
    });
    const ageRows = Object.entries(ageBuckets).map(([label, value]) => ({
      label,
      value,
      meta: `${this.toPercent(value, activeTasks.length)}%`,
    }));
    const cycleTimes = completedTasks
      .map((entry) => this.getDurationDays(entry.createdAt, entry.completedAt))
      .filter((value) => Number.isFinite(value) && value >= 0);
    const medianCycle = this.median(cycleTimes);
    const averageCycle = cycleTimes.length
      ? cycleTimes.reduce((total, value) => total + value, 0) / cycleTimes.length
      : 0;
    ageRows.push({
      label: "Median completion cycle",
      value: medianCycle,
      meta: `${medianCycle.toFixed(1)} days • avg ${averageCycle.toFixed(1)} days`,
    });
    this.renderStatisticsRows(statsAgeBuckets, ageRows, {
      emptyMessage: "No age data yet.",
      includeBars: true,
    });

    const referenceCount = Array.isArray(this.taskManager.state?.reference) ? this.taskManager.state.reference.length : 0;
    const deletedCount = Array.isArray(this.taskManager.state?.completionLog) ? this.taskManager.state.completionLog.length : 0;
    const recurringActive = activeTasks.filter((task) => task.recurrenceRule?.type).length;
    const archiveRows = [
      { label: "Reference archive entries", value: referenceCount, meta: "Completed and kept" },
      { label: "Deleted completion log entries", value: deletedCount, meta: "Completed and removed" },
      { label: "Completed projects", value: completedProjects.length, meta: "Project closure records" },
      { label: "Recurring active tasks", value: recurringActive, meta: "Tasks with recurrence rules" },
      { label: "Waiting tasks", value: statsWaiting, meta: "Tasks blocked on external response" },
    ];
    this.renderStatisticsRows(statsArchiveMix, archiveRows, {
      emptyMessage: "No archive data yet.",
      includeBars: true,
    });

    const waitingMap = new Map();
    activeTasks.forEach((task) => {
      if (!task.waitingFor) return;
      const key = task.waitingFor.trim();
      if (!key) return;
      waitingMap.set(key, (waitingMap.get(key) || 0) + 1);
    });
    const peopleRows = Array.from(waitingMap.entries())
      .map(([label, value]) => ({ label, value, meta: `${value} task${value === 1 ? "" : "s"}` }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
      .slice(0, 8);
    this.renderStatisticsRows(statsPeopleList, peopleRows, {
      emptyMessage: "No delegated assignees yet.",
      includeBars: true,
    });
  },

  renderCompletionTrend(container, completedTasks, lookbackStart, lookbackDays) {
    if (!container) return;
    container.innerHTML = "";
    const dailyBuckets = lookbackDays <= 30;
    const bucketSizeDays = dailyBuckets ? 1 : 7;
    const bucketCount = Math.max(1, Math.ceil(lookbackDays / bucketSizeDays));
    const buckets = [];
    for (let index = 0; index < bucketCount; index += 1) {
      const start = new Date(lookbackStart.getTime() + index * bucketSizeDays * 86400000);
      const end = new Date(start.getTime() + bucketSizeDays * 86400000);
      const count = completedTasks.filter((entry) => {
        const completedAt = new Date(entry.completedAt || "");
        return Number.isFinite(completedAt.getTime()) && completedAt >= start && completedAt < end;
      }).length;
      const label = dailyBuckets
        ? start.toLocaleDateString(undefined, { month: "numeric", day: "numeric" })
        : `Wk ${Math.ceil((index + 1) / 1)}`;
      buckets.push({ label, count, index });
    }
    const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1);
    const labelInterval = Math.max(1, Math.floor(bucketCount / 6));
    buckets.forEach((bucket, index) => {
      const bar = document.createElement("span");
      bar.className = "statistics-trend-bar";
      if (bucket.count === 0) {
        bar.classList.add("is-empty");
      }
      const height = bucket.count > 0 ? Math.max(8, Math.round((bucket.count / maxCount) * 100)) : 6;
      bar.style.setProperty("--bar-height", `${height}%`);
      const showLabel = index % labelInterval === 0 || index === bucketCount - 1;
      bar.dataset.label = showLabel ? bucket.label : "";
      bar.title = `${bucket.label}: ${bucket.count}`;
      container.append(bar);
    });
  },

  renderStatisticsRows(container, rows, { emptyMessage = "No data yet.", includeBars = true, onItemClick = null } = {}) {
    if (!container) return;
    container.innerHTML = "";
    if (!rows || !rows.length) {
      const empty = document.createElement("li");
      empty.className = "muted small-text";
      empty.textContent = emptyMessage;
      container.append(empty);
      return;
    }
    const maxValue = Math.max(
      ...rows.map((row) => {
        const value = Number(row.value);
        return Number.isFinite(value) ? value : 0;
      }),
      1
    );
    rows.forEach((row) => {
      const value = Number(row.value);
      const normalizedValue = Number.isFinite(value) ? Math.max(value, 0) : 0;
      const item = document.createElement("li");
      item.className = "statistics-row";
      if (row.health === "risk" || row.health === "ok") {
        item.dataset.health = row.health;
      }
      if (onItemClick) {
        item.classList.add("is-clickable");
        item.setAttribute("role", "button");
        item.setAttribute("tabindex", "0");
        item.addEventListener("click", () => onItemClick(row));
        item.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onItemClick(row); } });
      }
      const main = document.createElement("div");
      main.className = "statistics-row-main";
      const label = document.createElement("span");
      label.className = "statistics-row-label";
      label.textContent = row.label || "Metric";
      const meta = document.createElement("span");
      meta.className = "statistics-row-meta";
      meta.textContent = row.meta || this.formatCount(normalizedValue);
      main.append(label, meta);
      item.append(main);
      if (includeBars) {
        const bar = document.createElement("div");
        bar.className = "statistics-bar";
        const fill = document.createElement("span");
        fill.className = "statistics-bar-fill";
        const width = `${Math.min(100, Math.max(0, (normalizedValue / maxValue) * 100)).toFixed(1)}%`;
        fill.style.setProperty("--bar-value", width);
        bar.append(fill);
        item.append(bar);
      }
      container.append(item);
    });
  },

  getDurationDays(startValue, endValue) {
    if (!startValue || !endValue) return null;
    const start = new Date(startValue);
    const end = new Date(endValue);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
    return Math.max(0, (end.getTime() - start.getTime()) / 86400000);
  },

  median(values = []) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[middle - 1] + sorted[middle]) / 2;
    }
    return sorted[middle];
  },
};

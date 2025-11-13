export class AnalyticsController {
  constructor(taskManager, canvasId = "reviewChart") {
    this.taskManager = taskManager;
    this.canvas = document.getElementById(canvasId);
    this.chart = null;
  }

  init() {
    if (!this.canvas) return;
    this.render();
    this.taskManager.addEventListener("statechange", () => this.updateFromState());
  }

  updateFromState() {
    if (!this.chart) {
      this.render();
      return;
    }

    const { labels, completed, remaining } = this.computeDatasets();
    this.chart.data.labels = labels;
    this.chart.data.datasets[0].data = completed;
    this.chart.data.datasets[1].data = remaining;
    if (typeof this.chart.update === "function") {
      this.chart.update();
    } else if (typeof this.chart.render === "function") {
      this.chart.render();
    }
  }

  render() {
    if (!window.Chart) {
      this.drawFallback();
      return;
    }

    const { labels, completed, remaining } = this.computeDatasets();
    const ctx = this.canvas.getContext("2d");

    this.chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Complete",
            backgroundColor: "#5b56f6",
            borderRadius: 6,
            data: completed,
          },
          {
            label: "Remaining",
            backgroundColor: "#cbd5f5",
            borderRadius: 6,
            data: remaining,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            ticks: {
              color: getComputedStyle(this.canvas).getPropertyValue("--text-muted") || "#53627c",
            },
          },
          y: {
            stacked: true,
            ticks: {
              beginAtZero: true,
              precision: 0,
              color: getComputedStyle(this.canvas).getPropertyValue("--text-muted") || "#53627c",
            },
            grid: { color: "rgba(83, 98, 124, 0.2)" },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            mode: "index",
            intersect: false,
          },
        },
      },
    });
  }

  computeDatasets() {
    const history = this.taskManager.getAnalyticsHistory();
    const summary = this.taskManager.getSummary();
    const latestOpen = summary.next + summary.inbox + summary.waiting + summary.someday;

    const labels = history.map((entry) => entry.week);
    const completed = history.map((entry) => entry.complete);
    const remaining = history.map((entry) => entry.remaining);

    if (labels.length) {
      labels[labels.length - 1] = "This Week";
      completed[completed.length - 1] = Math.max(completed[completed.length - 1], summary.next);
      remaining[remaining.length - 1] = latestOpen;
    }

    return { labels, completed, remaining };
  }

  drawFallback() {
    const ctx = this.canvas.getContext("2d");
    const { labels, completed, remaining } = this.computeDatasets();
    const width = this.canvas.width;
    const height = this.canvas.height;
    ctx.clearRect(0, 0, width, height);

    const max = Math.max(...completed, ...remaining, 1);
    const barWidth = width / (labels.length * 2);
    const gap = barWidth;

    labels.forEach((label, index) => {
      const x = index * (barWidth + gap) + 30;
      const completeHeight = (completed[index] / max) * (height - 30);
      const remainingHeight = (remaining[index] / max) * (height - 30);

      ctx.fillStyle = "#5b56f6";
      ctx.fillRect(x, height - completeHeight - 10, barWidth / 2, completeHeight);

      ctx.fillStyle = "#cbd5f5";
      ctx.fillRect(x + barWidth / 2 + 4, height - remainingHeight - 10, barWidth / 2, remainingHeight);

      ctx.fillStyle = "#53627c";
      ctx.font = "12px sans-serif";
      ctx.fillText(label, x, height - 2);
    });
  }
}

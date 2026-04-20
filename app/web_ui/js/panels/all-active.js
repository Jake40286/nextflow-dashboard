// app/web_ui/js/panels/all-active.js
// All Active panel render methods — mixed into UIController.prototype by ui.js
export default {
  renderAllActive() {
    const container = this.elements.allActiveList;
    if (!container) return;
    const tasks = this.taskManager.getTasks(this.buildTaskFilters());
    container.innerHTML = "";
    if (!tasks.length) {
      const empty = document.createElement("p");
      empty.className = "muted small-text";
      empty.textContent = "No active work right now.";
      container.append(empty);
      return;
    }
    tasks.forEach((task) => {
      container.append(this.createTaskCard(task));
    });
  },
};

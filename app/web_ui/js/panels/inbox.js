// app/web_ui/js/panels/inbox.js
// Inbox panel render methods — mixed into UIController.prototype by ui.js
import { STATUS } from "../data.js";
export default {
  renderInbox() {
    const tasks = this.sortTasks(this.taskManager.getTasks({
      ...this.buildTaskFilters({ context: "all", projectId: "all", person: "all" }),
      status: STATUS.INBOX,
    }));
    const container = this.elements.inboxList;
    container.innerHTML = "";
    if (!tasks.length) {
      const banner = document.createElement("div");
      banner.className = "inbox-zero";
      banner.innerHTML = `<strong>Inbox zero!</strong><span class="muted small-text">Capture something new to keep the system flowing.</span>`;
      container.append(banner);
      this.attachDropzone(container, STATUS.INBOX);
      return;
    }
    this.renderTaskList(container, tasks, (task) => this.createTaskCard(task));
    this.attachDropzone(container, STATUS.INBOX);
  },
};

// app/web_ui/js/panels/waiting.js
// Waiting For panel render methods — mixed into UIController.prototype by ui.js
import { STATUS } from "../data.js";
export default {
  renderWaitingFor() {
    const tasks = this.sortTasks(this.taskManager.getTasks({
      ...this.buildTaskFilters(),
      status: STATUS.WAITING,
    }));
    const container = this.elements.waitingList;
    this.renderTaskList(container, tasks, (task) => this.createTaskCard(task));
    this.attachDropzone(container, STATUS.WAITING);
  },
};

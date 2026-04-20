// app/web_ui/js/panels/someday.js
// Someday panel render methods — mixed into UIController.prototype by ui.js
export default {
  renderSomeday() {
    const tasks = this.sortTasks(this.taskManager.getTasks({
      ...this.buildTaskFilters(),
      status: STATUS.SOMEDAY,
    }));
    const container = this.elements.somedayList;
    renderTaskList(container, tasks, (task) => this.createTaskCard(task));
    this.attachDropzone(container, STATUS.SOMEDAY);

    // Parked projects section — rendered outside the dropzone
    const panelContent = container.parentElement;
    panelContent.querySelector(".parked-projects-section")?.remove();

    const parkedProjects = (this.projectCache || []).filter((p) => p.someday);
    const section = document.createElement("div");
    section.className = "parked-projects-section";

    const divider = document.createElement("div");
    divider.className = "project-section-divider";
    divider.textContent = "Parked Projects";
    section.append(divider);

    if (!parkedProjects.length) {
      const empty = document.createElement("p");
      empty.className = "muted small-text";
      empty.style.padding = "var(--space-2) 0";
      empty.textContent = "No parked projects.";
      section.append(empty);
    } else {
      parkedProjects.sort((a, b) => a.name.localeCompare(b.name)).forEach((project) => {
        const row = document.createElement("div");
        row.className = "project-row";
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

        if (project.areaOfFocus || project.themeTag) {
          const chips = document.createElement("div");
          chips.className = "project-row-chips";
          [project.areaOfFocus, project.themeTag].forEach((label) => {
            if (!label) return;
            const chip = document.createElement("span");
            chip.className = "project-row-chip";
            chip.textContent = label;
            chips.append(chip);
          });
          main.append(chips);
        }
        row.append(main);

        const meta = document.createElement("div");
        meta.className = "project-row-meta";
        const activateBtn = document.createElement("button");
        activateBtn.type = "button";
        activateBtn.className = "btn btn-light btn-small";
        activateBtn.textContent = "Activate";
        activateBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          this.taskManager.activateProject(project.id);
        });
        meta.append(activateBtn);
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

        section.append(row);
      });
    }

    panelContent.append(section);
  },
};

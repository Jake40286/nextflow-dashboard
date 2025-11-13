(function (global) {
  const helper = {
    setupDropzone(element, { onDrop }) {
      if (!element) return;
      element.addEventListener("dragover", (event) => {
        event.preventDefault();
        element.classList.add("is-drag-over");
        event.dataTransfer.dropEffect = "move";
      });

      element.addEventListener("dragleave", () => {
        element.classList.remove("is-drag-over");
      });

      element.addEventListener("drop", (event) => {
        event.preventDefault();
        element.classList.remove("is-drag-over");
        const taskId = event.dataTransfer.getData("text/task-id") || event.dataTransfer.getData("text/plain");
        if (typeof onDrop === "function" && taskId) {
          onDrop(taskId);
        }
      });
    },
  };

  global.DragDropHelper = helper;
})(window);

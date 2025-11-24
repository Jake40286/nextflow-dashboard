import test from "node:test";
import assert from "node:assert/strict";
import { TaskManager, STATUS, __testing } from "../app/web_ui/js/data.js";

const originalFetch = globalThis.fetch;
globalThis.fetch = undefined;

if (typeof globalThis.CustomEvent === "undefined") {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(name, params = {}) {
      super(name, params);
      this.detail = params.detail ?? null;
    }
  };
}

function createManager(initialState = {}) {
  const manager = new TaskManager();
  manager.remoteSyncEnabled = false;
  manager.state = {
    tasks: [],
    reference: [],
    completionLog: [],
    projects: [],
    completedProjects: [],
    checklist: [],
    analytics: { history: [] },
    settings: { theme: "light" },
    ...initialState,
  };
  return manager;
}

test("completeTask archives tasks into reference by default", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Inbox task" });
  manager.completeTask(task.id, { archive: "reference" });

  assert.equal(manager.state.tasks.length, 0, "task removed from active list");
  assert.equal(manager.state.reference.length, 1, "snapshot stored in reference");
  assert.equal(manager.state.completionLog.length, 0, "deleted log remains untouched");
  assert.equal(manager.state.reference[0].id, task.id);
});

test("completeTask writes to completionLog when archive=deleted", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Ephemeral task" });
  manager.completeTask(task.id, { archive: "deleted" });

  assert.equal(manager.state.reference.length, 0);
  assert.equal(manager.state.completionLog.length, 1);
  assert.equal(manager.state.completionLog[0].archiveType, "deleted");
});

test("restoreCompletedTask rehydrates task and reattaches to project", () => {
  const archived = {
    id: "task-sample",
    title: "Archived task",
    status: STATUS.NEXT,
    context: "@Home",
    projectId: "project-1",
    createdAt: "2024-01-01T00:00:00.000Z",
    completedAt: "2024-01-02T00:00:00.000Z",
    archivedAt: "2024-01-02T00:00:00.000Z",
    archiveType: "reference",
  };
  const manager = createManager({
    reference: [archived],
    projects: [{ id: "project-1", name: "Test Project", tasks: [] }],
  });

  const restored = manager.restoreCompletedTask("task-sample");

  assert.ok(restored, "task restored");
  assert.equal(manager.state.reference.length, 0, "entry removed from reference");
  assert.equal(manager.state.tasks[0].id, "task-sample", "task back in active list");
  assert.deepEqual(manager.state.projects[0].tasks, ["task-sample"], "project relinked");
});

const { mergeStates } = __testing;

test("mergeStates honors removal markers from reference entries", () => {
  const remoteState = {
    tasks: [{ id: "t-1", title: "Old remote task", updatedAt: "2024-01-01T00:00:00.000Z" }],
    reference: [],
    completionLog: [],
  };
  const localState = {
    tasks: [],
    reference: [
      {
        id: "t-1",
        archivedAt: "2024-02-01T00:00:00.000Z",
        completedAt: "2024-02-01T00:00:00.000Z",
      },
    ],
    completionLog: [],
  };

  const merged = mergeStates(remoteState, localState);

  assert.equal(
    merged.tasks.length,
    0,
    "task removed locally stays removed even when remote still has it"
  );
});

test("mergeStates keeps restored tasks that are newer than their removal markers", () => {
  const remoteState = {
    tasks: [{ id: "t-2", title: "Stale remote copy", updatedAt: "2024-02-01T00:00:00.000Z" }],
    reference: [
      {
        id: "t-2",
        archivedAt: "2024-02-05T00:00:00.000Z",
        completedAt: "2024-02-05T00:00:00.000Z",
      },
    ],
    completionLog: [],
  };
  const localState = {
    tasks: [{ id: "t-2", title: "Restored locally", updatedAt: "2024-03-01T00:00:00.000Z" }],
    reference: [],
    completionLog: [],
  };

  const merged = mergeStates(remoteState, localState);

  assert.equal(merged.tasks.length, 1);
  assert.equal(merged.tasks[0].title, "Restored locally");
});

test("mergeStates also respects completionLog removal markers", () => {
  const remoteState = {
    tasks: [{ id: "t-3", title: "Remote ghost", updatedAt: "2024-02-10T00:00:00.000Z" }],
    reference: [],
    completionLog: [
      {
        id: "t-3",
        archivedAt: "2024-02-15T00:00:00.000Z",
      },
    ],
  };
  const localState = {
    tasks: [],
    reference: [],
    completionLog: [],
  };

  const merged = mergeStates(remoteState, localState);

  assert.equal(merged.tasks.length, 0);
});

test("mergeStates leaves tasks untouched when no removal markers exist", () => {
  const remoteState = {
    tasks: [{ id: "t-4", title: "Remote", updatedAt: "2024-02-10T00:00:00.000Z" }],
    reference: [],
    completionLog: [],
  };
  const localState = {
    tasks: [{ id: "t-5", title: "Local", updatedAt: "2024-02-11T00:00:00.000Z" }],
    reference: [],
    completionLog: [],
  };

  const merged = mergeStates(remoteState, localState);

  const taskIds = merged.tasks.map((task) => task.id).sort();
  assert.deepEqual(taskIds, ["t-4", "t-5"]);
});

test("tasks receive short slug identifiers and keep them through completion", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Slug test" });

  assert.ok(task.slug, "slug assigned");
  assert.ok(task.slug.length <= 8, "slug is short");

  manager.completeTask(task.id, { archive: "reference" });
  const restored = manager.restoreCompletedTask(task.id);
  assert.equal(restored.slug, task.slug, "slug stays consistent");
});

test("completing a recurring task schedules the next occurrence with shifted due date", () => {
  const manager = createManager();
  const task = manager.addTask({
    title: "Daily check-in",
    status: STATUS.NEXT,
    context: "@Work",
    dueDate: "2024-03-01",
    recurrenceRule: { type: "daily", interval: 1 },
  });

  manager.completeTask(task.id, { archive: "reference" });

  assert.equal(manager.state.tasks.length, 1);
  const next = manager.state.tasks[0];
  assert.notEqual(next.id, task.id);
  assert.equal(next.title, "Daily check-in");
  assert.equal(next.dueDate, "2024-03-02");
  assert.equal(next.recurrenceRule.type, "daily");
  assert.notEqual(next.slug, task.slug, "next occurrence gets its own slug");
});

test("recurring tasks without a due date still gain a future calendar date after completion", () => {
  const manager = createManager();
  const task = manager.addTask({
    title: "Monthly review",
    status: STATUS.NEXT,
    context: "@Home",
    recurrenceRule: { type: "monthly", interval: 1 },
  });

  manager.completeTask(task.id, { archive: "reference" });

  assert.equal(manager.state.tasks.length, 1);
  const next = manager.state.tasks[0];
  assert.ok(next.calendarDate, "calendar date should be scheduled");
  assert.equal(next.recurrenceRule.type, "monthly");
});

test.after(() => {
  globalThis.fetch = originalFetch;
});

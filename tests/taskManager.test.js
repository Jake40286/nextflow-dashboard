import test from "node:test";
import assert from "node:assert/strict";
import { TaskManager, STATUS, THEME_OPTIONS, __testing } from "../app/web_ui/js/data.js";

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
    settings: {
      theme: "light",
      customTheme: {
        canvas: "#f5efe2",
        accent: "#0f766e",
        signal: "#b45309",
      },
      customThemePalettes: [],
      areaOptions: ["Work", "Personal", "Home", "Finance", "Health"],
      featureFlags: {
        showFiltersCard: true,
      },
    },
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

test("slug and ID are searchable", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Find me" });
  const slugTerm = task.slug.slice(0, 4);

  const slugMatches = manager.getTasks({ searchTerm: slugTerm });
  assert.equal(slugMatches.length, 1);
  assert.equal(slugMatches[0].id, task.id);

  const idMatches = manager.getTasks({ searchTerm: task.id.slice(-6) });
  assert.equal(idMatches.length, 1);
  assert.equal(idMatches[0].id, task.id);
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

test("getProjects excludes projects already archived in completedProjects", () => {
  const manager = createManager({
    projects: [
      { id: "p-1", name: "Christmas 2025", statusTag: "Active", someday: false, tasks: [] },
      { id: "p-2", name: "Move house", statusTag: "Active", someday: false, tasks: [] },
    ],
    completedProjects: [
      { id: "p-1", name: "Christmas 2025", completedAt: "2025-12-26T00:00:00.000Z" },
    ],
  });

  const visible = manager.getProjects({ includeSomeday: true }).map((project) => project.id);
  assert.deepEqual(visible, ["p-2"]);
});

test("updateTheme accepts known themes and normalizes invalid values to light", () => {
  const manager = createManager();
  const alternateTheme = THEME_OPTIONS.find((theme) => theme.id !== "light")?.id || "dark";

  manager.updateTheme(alternateTheme);
  assert.equal(manager.getTheme(), alternateTheme);

  manager.updateTheme("unknown-theme-id");
  assert.equal(manager.getTheme(), "light");
});

test("custom theme stores three user colors and ignores invalid updates", () => {
  const manager = createManager();
  manager.updateTheme("custom");

  manager.updateCustomTheme({
    canvas: "#112233",
    accent: "#336699",
    signal: "#ff8800",
  });

  assert.deepEqual(manager.getCustomTheme(), {
    canvas: "#112233",
    accent: "#336699",
    signal: "#ff8800",
  });

  manager.updateCustomTheme({ canvas: "not-a-color" });
  assert.deepEqual(manager.getCustomTheme(), {
    canvas: "#112233",
    accent: "#336699",
    signal: "#ff8800",
  });
});

test("custom theme palettes can be saved, applied, and deleted", () => {
  const manager = createManager();
  manager.updateCustomTheme({
    canvas: "#112233",
    accent: "#336699",
    signal: "#ff8800",
  });

  const saved = manager.saveCustomThemePalette("Focus");
  assert.ok(saved, "palette should be saved");
  assert.equal(saved.name, "Focus");
  assert.deepEqual(saved.customTheme, {
    canvas: "#112233",
    accent: "#336699",
    signal: "#ff8800",
  });

  manager.updateCustomTheme({
    canvas: "#000000",
    accent: "#111111",
    signal: "#222222",
  });
  const applied = manager.applyCustomThemePalette(saved.id);
  assert.ok(applied, "palette should apply");
  assert.equal(manager.getTheme(), "custom");
  assert.deepEqual(manager.getCustomTheme(), {
    canvas: "#112233",
    accent: "#336699",
    signal: "#ff8800",
  });

  const deleted = manager.deleteCustomThemePalette(saved.id);
  assert.equal(deleted, true);
  assert.equal(manager.getCustomThemePalettes().length, 0);
});

test("saving palettes with blank and duplicate names is handled safely", () => {
  const manager = createManager();
  const first = manager.saveCustomThemePalette("");
  const second = manager.saveCustomThemePalette("");
  assert.equal(first.name, "Custom Palette 1");
  assert.equal(second.name, "Custom Palette 2");

  manager.updateCustomTheme({
    canvas: "#abcdef",
    accent: "#456789",
    signal: "#123456",
  });
  const updated = manager.saveCustomThemePalette("custom palette 1");
  assert.equal(updated.id, first.id);
  assert.equal(updated.name, "custom palette 1");
  assert.deepEqual(updated.customTheme, {
    canvas: "#abcdef",
    accent: "#456789",
    signal: "#123456",
  });
  assert.equal(manager.getCustomThemePalettes().length, 2);
});

test("my day date is normalized and persisted through completion restore", () => {
  const manager = createManager();
  const task = manager.addTask({
    title: "Focus sprint",
    myDayDate: "2026-03-12",
  });

  assert.equal(task.myDayDate, "2026-03-12");

  manager.updateTask(task.id, { myDayDate: "not-a-date" });
  assert.equal(manager.getTaskById(task.id).myDayDate, null);

  manager.updateTask(task.id, { myDayDate: "2026-03-13T08:00:00.000Z" });
  assert.equal(manager.getTaskById(task.id).myDayDate, "2026-03-13");

  manager.completeTask(task.id, { archive: "reference" });
  const restored = manager.restoreCompletedTask(task.id);
  assert.equal(restored.myDayDate, "2026-03-13");
});

test("getTasks filters by myDayDate", () => {
  const manager = createManager();
  manager.addTask({ title: "Today task", myDayDate: "2026-03-12" });
  manager.addTask({ title: "Tomorrow task", myDayDate: "2026-03-13" });
  manager.addTask({ title: "Unscheduled task" });

  const today = manager.getTasks({ myDayDate: "2026-03-12" }).map((task) => task.title);
  assert.deepEqual(today, ["Today task"]);
});

test("my day and calendar stay linked when creating tasks", () => {
  const manager = createManager();
  const fromMyDay = manager.addTask({
    title: "From My Day",
    myDayDate: "2026-03-12",
  });
  assert.equal(fromMyDay.myDayDate, "2026-03-12");
  assert.equal(fromMyDay.calendarDate, "2026-03-12");

  const fromCalendar = manager.addTask({
    title: "From Calendar",
    calendarDate: "2026-03-13",
  });
  assert.equal(fromCalendar.calendarDate, "2026-03-13");
  assert.equal(fromCalendar.myDayDate, "2026-03-13");
});

test("my day and calendar stay linked when updating tasks", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Linked task" });

  manager.updateTask(task.id, { calendarDate: "2026-03-12", calendarTime: "09:30" });
  assert.equal(task.calendarDate, "2026-03-12");
  assert.equal(task.myDayDate, "2026-03-12");
  assert.equal(task.calendarTime, "09:30");

  manager.updateTask(task.id, { myDayDate: "2026-03-14" });
  assert.equal(task.myDayDate, "2026-03-14");
  assert.equal(task.calendarDate, "2026-03-14");
  assert.equal(task.calendarTime, "09:30");

  manager.updateTask(task.id, { myDayDate: null });
  assert.equal(task.myDayDate, null);
  assert.equal(task.calendarDate, null);
  assert.equal(task.calendarTime, null);
});

test("task notes are timestamped and restored after completion", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Investigate regression" });
  const note = manager.addTaskNote(task.id, "Reproduced on staging and captured logs.", {
    createdAt: "2026-03-12T15:45:00.000Z",
  });

  assert.ok(note, "note should be created");
  assert.equal(task.notes.length, 1);
  assert.equal(task.notes[0].text, "Reproduced on staging and captured logs.");
  assert.equal(task.notes[0].createdAt, "2026-03-12T15:45:00.000Z");

  manager.completeTask(task.id, { archive: "reference" });
  const restored = manager.restoreCompletedTask(task.id);
  assert.equal(restored.notes.length, 1);
  assert.equal(restored.notes[0].text, "Reproduced on staging and captured logs.");
  assert.equal(restored.notes[0].createdAt, "2026-03-12T15:45:00.000Z");
});

test("search matches note text", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Prepare deployment notes" });
  manager.addTaskNote(task.id, "Captured rollback command and smoke test steps.");

  const matches = manager.getTasks({ searchTerm: "rollback command" });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, task.id);
});

test("completed task entries can be edited without restore", () => {
  const manager = createManager();
  const task = manager.addTask({
    title: "Postmortem draft",
    description: "Initial description",
    status: STATUS.NEXT,
    context: "@Work",
  });

  manager.completeTask(task.id, { archive: "reference" });
  const updated = manager.updateCompletedTask(task.id, {
    title: "Postmortem draft (final)",
    description: "Updated while archived",
    myDayDate: "2026-03-20",
  });

  assert.ok(updated, "completed task should update");
  assert.equal(updated.title, "Postmortem draft (final)");
  assert.equal(updated.description, "Updated while archived");
  assert.equal(updated.myDayDate, "2026-03-20");
  assert.equal(updated.calendarDate, "2026-03-20");

  const fetched = manager.getCompletedTaskById(task.id);
  assert.equal(fetched.title, "Postmortem draft (final)");
  assert.equal(fetched.description, "Updated while archived");
  assert.equal(fetched.calendarDate, "2026-03-20");
});

test("can append notes to archived tasks", () => {
  const manager = createManager();
  const task = manager.addTask({
    title: "QA checklist",
    status: STATUS.NEXT,
    context: "@Work",
  });
  manager.completeTask(task.id, { archive: "reference" });
  const note = manager.addCompletedTaskNote(task.id, "Validated final checklist and attached evidence.", {
    createdAt: "2026-03-12T18:30:00.000Z",
  });

  assert.ok(note);
  const archived = manager.getCompletedTaskById(task.id);
  assert.equal(archived.notes.length, 1);
  assert.equal(archived.notes[0].text, "Validated final checklist and attached evidence.");
  assert.equal(archived.notes[0].createdAt, "2026-03-12T18:30:00.000Z");
});

test.after(() => {
  globalThis.fetch = originalFetch;
});

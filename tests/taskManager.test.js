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

test("completeTask with archive=log writes to completionLog with archiveType=completed", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Ephemeral task" });
  manager.completeTask(task.id, { archive: "log" });

  assert.equal(manager.state.reference.length, 0);
  assert.equal(manager.state.completionLog.length, 1);
  assert.equal(
    manager.state.completionLog[0].archiveType,
    "completed",
    "completed-and-removed entries are tagged 'completed', distinct from explicit deletions",
  );
});

test("getCompletionEntries returns reference and completed entries, excludes deleted", () => {
  const manager = createManager();
  const refTask = manager.addTask({ title: "Reference task" });
  manager.completeTask(refTask.id, { archive: "reference" });
  const logTask = manager.addTask({ title: "Quiet finish" });
  manager.completeTask(logTask.id, { archive: "log" });
  const trashTask = manager.addTask({ title: "Mistake" });
  manager.deleteTask(trashTask.id);

  const entries = manager.getCompletionEntries();
  const ids = entries.map((e) => e.id).sort();
  assert.deepEqual(ids, [logTask.id, refTask.id].sort(), "both completion paths counted; deletion excluded");
});

test("getTrashEntries returns only deleted entries, never completed", () => {
  const manager = createManager();
  const completedTask = manager.addTask({ title: "Done quietly" });
  manager.completeTask(completedTask.id, { archive: "log" });
  const deletedTask = manager.addTask({ title: "Garbage" });
  manager.deleteTask(deletedTask.id);

  const trash = manager.getTrashEntries();
  assert.equal(trash.length, 1, "only the explicitly-deleted task appears in trash");
  assert.equal(trash[0].id, deletedTask.id);
});

test("reclassifyTrashAsReference moves entry from completionLog to reference", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Was it deletion or completion?" });
  manager.deleteTask(task.id);
  assert.equal(manager.state.completionLog.length, 1);
  assert.equal(manager.getTrashEntries().length, 1);

  const ok = manager.reclassifyTrashAsReference(task.id);
  assert.equal(ok, true);
  assert.equal(manager.state.completionLog.length, 0, "entry removed from completionLog");
  assert.equal(manager.state.reference.length, 1, "entry now in reference");
  assert.equal(manager.state.reference[0].archiveType, "reference");
  assert.equal(manager.getTrashEntries().length, 0, "no longer in trash");
  assert.equal(manager.getCompletionEntries().length, 1, "now counted in stats");
  assert.ok(manager.state._tombstones?.[task.id], "tombstone preserved");
});

test("reclassifyTrashAsCompleted retags entry in place; stays in completionLog", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Quiet finish, mistakenly trashed" });
  manager.deleteTask(task.id);

  const ok = manager.reclassifyTrashAsCompleted(task.id);
  assert.equal(ok, true);
  assert.equal(manager.state.completionLog.length, 1, "entry stays in completionLog");
  assert.equal(manager.state.completionLog[0].archiveType, "completed");
  assert.equal(manager.getTrashEntries().length, 0, "no longer in trash");
  assert.equal(manager.getCompletionEntries().length, 1, "now counted in stats");
  assert.ok(manager.state._tombstones?.[task.id], "tombstone preserved");
});

test("reclassify methods refuse non-deleted entries", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Quiet finish" });
  manager.completeTask(task.id, { archive: "log" });
  assert.equal(manager.state.completionLog[0].archiveType, "completed");

  assert.equal(manager.reclassifyTrashAsReference(task.id), false, "won't move non-deleted entry");
  assert.equal(manager.reclassifyTrashAsCompleted(task.id), false, "won't retag non-deleted entry");
});

test("emptyTrash removes only deleted entries, preserves completed entries", () => {
  const manager = createManager();
  const completedTask = manager.addTask({ title: "Done quietly" });
  manager.completeTask(completedTask.id, { archive: "log" });
  const deletedTask = manager.addTask({ title: "Garbage" });
  manager.deleteTask(deletedTask.id);

  assert.equal(manager.state.completionLog.length, 2);
  manager.emptyTrash();
  assert.equal(manager.state.completionLog.length, 1, "completed entry survives");
  assert.equal(manager.state.completionLog[0].id, completedTask.id);
  assert.equal(manager.getCompletionEntries().length, 1, "stats still see the completion");
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

test("_completionsDirty starts false and is set by completeTask", () => {
  const manager = createManager();
  assert.equal(manager._completionsDirty, false, "starts clean");
  const task = manager.addTask({ title: "Done task" });
  manager.completeTask(task.id);
  assert.equal(manager._completionsDirty, true, "dirty after completeTask");
});

test("_completionsDirty is set by completeTask with archive=deleted", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Deleted task" });
  manager.completeTask(task.id, { archive: "deleted" });
  assert.equal(manager._completionsDirty, true);
});

test("_completionsDirty is set by deleteTask", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "To delete" });
  manager.deleteTask(task.id);
  assert.equal(manager._completionsDirty, true);
});

test("_completionsDirty is set by restoreCompletedTask", () => {
  const archived = {
    id: "task-r1",
    title: "Restore me",
    status: STATUS.NEXT,
    createdAt: "2024-01-01T00:00:00.000Z",
    completedAt: "2024-01-02T00:00:00.000Z",
    archivedAt: "2024-01-02T00:00:00.000Z",
    archiveType: "reference",
  };
  const manager = createManager({ reference: [archived] });
  assert.equal(manager._completionsDirty, false, "starts clean");
  manager.restoreCompletedTask("task-r1");
  assert.equal(manager._completionsDirty, true, "dirty after restore");
});

test("_completionsDirty is set by completeProject", () => {
  const manager = createManager({
    projects: [{ id: "p-1", name: "Finish me", tasks: [], status: "Active" }],
  });
  assert.equal(manager._completionsDirty, false, "starts clean");
  manager.completeProject("p-1");
  assert.equal(manager._completionsDirty, true, "dirty after completeProject");
});

const { mergeStates, mergeTasks, _buildConflictSummary, _mergeTombstones } = __testing;

test("mergeTasks suppresses a task when the tombstone is newer than both sides' updatedAt", () => {
  const localTasks  = [];
  const remoteTasks = [{ id: "t-1", title: "Old remote task", updatedAt: "2024-01-01T00:00:00.000Z" }];
  // Local tombstone for t-1, stamped after the remote task was last edited.
  const localTombstones = { "t-1": "2024-02-01T00:00:00.000Z" };

  const result = mergeTasks(localTasks, remoteTasks, localTombstones, {});

  assert.equal(result.length, 0, "tombstone suppresses the remote task");
});

test("mergeStates honors tombstones — completed local task is not resurrected by stale remote copy", () => {
  const remoteState = {
    tasks: [{ id: "t-1", title: "Old remote task", updatedAt: "2024-01-01T00:00:00.000Z" }],
  };
  const localState = {
    tasks: [],
    _tombstones: { "t-1": "2024-02-01T00:00:00.000Z" },
  };

  const merged = mergeStates(remoteState, localState);

  assert.equal(merged.tasks.length, 0, "task removed locally stays removed even when remote still has it");
});

test("feature flags include highlightStaleTasks and can be toggled", () => {
  const manager = createManager();
  assert.equal(manager.getFeatureFlag("highlightStaleTasks"), false);
  manager.updateFeatureFlag("highlightStaleTasks", true);
  assert.equal(manager.getFeatureFlag("highlightStaleTasks"), true);
});

test("stale task thresholds can be read and updated", () => {
  const manager = createManager();
  assert.deepEqual(manager.getStaleTaskThresholds(), { warn: 7, stale: 14, old: 30, ancient: 90, futureDueDaysThreshold: 30 });
  const result = manager.updateStaleTaskThresholds({ warn: 5, stale: 12, old: 28, ancient: 60 });
  assert.equal(result, true);
  assert.deepEqual(manager.getStaleTaskThresholds(), { warn: 5, stale: 12, old: 28, ancient: 60, futureDueDaysThreshold: 30 });
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

test("mergeTasks suppresses a task whose tombstone appears on the remote side", () => {
  // Device A deleted t-3 and has a tombstone. Device B still has t-3 active (stale).
  const localTasks  = [{ id: "t-3", title: "Stale local copy", updatedAt: "2024-02-10T00:00:00.000Z" }];
  const remoteTasks = [];
  const remoteTombstones = { "t-3": "2024-02-15T00:00:00.000Z" };

  const result = mergeTasks(localTasks, remoteTasks, {}, remoteTombstones);

  assert.equal(result.length, 0, "remote tombstone suppresses local active copy");
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

test("people tags use + prefix and migrate legacy @ values", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Coordinate launch" });

  const plusTag = manager.updateTask(task.id, { peopleTag: "+Alex" });
  assert.ok(plusTag, "task should update with +person tag");
  assert.equal(plusTag.peopleTag, "+Alex");

  const migrated = manager.updateTask(task.id, { peopleTag: "@Jamie" });
  assert.ok(migrated, "legacy @person tag should still be accepted");
  assert.equal(migrated.peopleTag, "+Jamie");

  manager.state.reference.push({ id: "done-1", title: "Archived handoff", peopleTag: "@Pat" });
  assert.deepEqual(manager.getPeopleTags(), ["+Jamie", "+Pat"]);
});

test("context and people options can be added without assigning to tasks", () => {
  const manager = createManager();
  const addedContext = manager.addContextOption("@DeepWork");
  assert.equal(addedContext, "@DeepWork");
  assert.ok(manager.getContexts().includes("@DeepWork"));

  const addedPeople = manager.addPeopleTagOption("+Reviewer_A");
  assert.equal(addedPeople, "+Reviewer_A");
  assert.ok(manager.getPeopleTags().includes("+Reviewer_A"));

  const duplicateContext = manager.addContextOption("@deepwork");
  assert.equal(duplicateContext, "@deepwork");
  assert.equal(manager.getContexts().filter((value) => value.toLowerCase() === "@deepwork").length, 1);

  const legacyPeople = manager.addPeopleTagOption("@Reviewer_B");
  assert.equal(legacyPeople, "+Reviewer_B");
  assert.ok(manager.getPeopleTags().includes("+Reviewer_B"));
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

test("active task notes can be edited and deleted", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Write status update" });
  const note = manager.addTaskNote(task.id, "Drafted initial bullet points.", {
    createdAt: "2026-03-12T16:00:00.000Z",
  });
  assert.ok(note);

  const updated = manager.updateTaskNote(task.id, note.id, "Drafted and shared final bullet points.");
  assert.ok(updated);
  assert.equal(updated.text, "Drafted and shared final bullet points.");
  assert.equal(updated.createdAt, "2026-03-12T16:00:00.000Z");

  const deleted = manager.deleteTaskNote(task.id, note.id);
  assert.equal(deleted, true);
  assert.equal(task.notes.length, 0);
});

test("search matches note text", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Prepare deployment notes" });
  manager.addTaskNote(task.id, "Captured rollback command and smoke test steps.");

  const matches = manager.getTasks({ searchTerm: "rollback command" });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, task.id);
});

test("people mentions in notes behave like people tags for filters", () => {
  const manager = createManager();
  const tagged = manager.addTask({ title: "Stakeholder follow-up", status: STATUS.NEXT });
  manager.addTaskNote(tagged.id, "Shared update with +John_S and captured next steps.");
  const untagged = manager.addTask({ title: "Solo task", status: STATUS.NEXT });

  const peopleTags = manager.getPeopleTags();
  assert.ok(peopleTags.includes("+John_S"));

  const personMatches = manager.getTasks({ person: "+John_S" });
  assert.equal(personMatches.length, 1);
  assert.equal(personMatches[0].id, tagged.id);

  const noneMatches = manager.getTasks({ person: "none" }).map((task) => task.id);
  assert.ok(!noneMatches.includes(tagged.id));
  assert.ok(noneMatches.includes(untagged.id));

  const searchMatches = manager.getTasks({ searchTerm: "+John_S" });
  assert.equal(searchMatches.length, 1);
  assert.equal(searchMatches[0].id, tagged.id);
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

test("archived task notes can be edited and deleted", () => {
  const manager = createManager();
  const task = manager.addTask({
    title: "Release checklist",
    status: STATUS.NEXT,
    context: "@Work",
  });
  manager.completeTask(task.id, { archive: "reference" });
  const note = manager.addCompletedTaskNote(task.id, "Initial archived note.", {
    createdAt: "2026-03-12T19:00:00.000Z",
  });
  assert.ok(note);

  const updated = manager.updateCompletedTaskNote(task.id, note.id, "Updated archived note.");
  assert.ok(updated);
  assert.equal(updated.text, "Updated archived note.");
  assert.equal(updated.createdAt, "2026-03-12T19:00:00.000Z");

  const deleted = manager.deleteCompletedTaskNote(task.id, note.id);
  assert.equal(deleted, true);
  const archived = manager.getCompletedTaskById(task.id);
  assert.equal(archived.notes.length, 0);
});

// ─── _tombstones — explicit deletion markers ──────────────────────────────────

test("deleteTask stamps a tombstone in state._tombstones", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "To delete" });
  const id = task.id;
  manager.deleteTask(id);

  assert.ok(manager.state._tombstones, "_tombstones map created");
  assert.ok(manager.state._tombstones[id], "tombstone entry written for deleted task");
  assert.equal(manager.state.tasks.length, 0, "task removed from active list");
  assert.equal(manager.state.completionLog.length, 1, "snapshot still in completionLog");
});

test("completeTask stamps a tombstone in state._tombstones", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "To complete" });
  const id = task.id;
  manager.completeTask(id, { archive: "reference" });

  assert.ok(manager.state._tombstones?.[id], "tombstone entry written for completed task");
  assert.equal(manager.state.tasks.length, 0, "task removed from active list");
});

test("restoreCompletedTask clears the tombstone so merge won't re-suppress the task", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "To restore" });
  const id = task.id;
  manager.completeTask(id, { archive: "reference" });
  assert.ok(manager.state._tombstones?.[id], "tombstone set after completion");

  manager.restoreCompletedTask(id);
  assert.ok(!manager.state._tombstones?.[id], "tombstone cleared after restore");
  assert.equal(manager.state.tasks.length, 1, "task back in active list");
});

test("_mergeTombstones unions both maps using max timestamp per id", () => {
  const a = { "t-1": "2024-01-01T00:00:00.000Z", "t-2": "2024-06-01T00:00:00.000Z" };
  const b = { "t-1": "2024-03-01T00:00:00.000Z", "t-3": "2024-02-01T00:00:00.000Z" };
  const merged = _mergeTombstones(a, b);

  assert.equal(merged["t-1"], "2024-03-01T00:00:00.000Z", "t-1: newer timestamp wins");
  assert.equal(merged["t-2"], "2024-06-01T00:00:00.000Z", "t-2: only in a, preserved");
  assert.equal(merged["t-3"], "2024-02-01T00:00:00.000Z", "t-3: only in b, preserved");
});

test("mergeTasks: restored task (newer updatedAt than tombstone) survives", () => {
  // Device B deleted t-4 (tombstone at Feb 1). Device A then restored it (updatedAt Mar 1).
  const localTasks  = [{ id: "t-4", title: "Restored", updatedAt: "2024-03-01T00:00:00.000Z" }];
  const remoteTasks = [];
  const remoteTombstones = { "t-4": "2024-02-01T00:00:00.000Z" };

  const result = mergeTasks(localTasks, remoteTasks, {}, remoteTombstones);

  assert.equal(result.length, 1, "restored task survives — updatedAt is newer than tombstone");
  assert.equal(result[0].title, "Restored");
});

// ─── mergeStates with slim (Phase-6b) remote payloads ────────────────────────

test("mergeStates with absent completionLog on remote preserves local completion log", () => {
  const remoteState = {
    tasks: [{ id: "t-1", title: "Remote task", updatedAt: "2026-01-01T00:00:00.000Z" }],
    // completionLog intentionally absent — simulates Phase-6b slim /state response
  };
  const localState = {
    tasks: [{ id: "t-1", title: "Remote task", updatedAt: "2026-01-01T00:00:00.000Z" }],
    completionLog: [{ id: "c-1", title: "Done task", completedAt: "2025-12-01T00:00:00.000Z" }],
    reference: [{ id: "r-1", title: "Archived task", completedAt: "2025-11-01T00:00:00.000Z" }],
    completedProjects: [],
  };

  const merged = mergeStates(remoteState, localState);

  assert.equal(merged.completionLog.length, 1, "local completionLog preserved when remote omits it");
  assert.equal(merged.reference.length, 1, "local reference preserved when remote omits it");
});

test("mergeStates with slim remote: local tombstone prevents task resurrection", () => {
  // Simulates: task completed locally (tombstone written), remote still has it active (slim payload).
  const remoteState = {
    tasks: [{ id: "t-zombie", title: "Should stay gone", updatedAt: "2026-01-01T00:00:00.000Z" }],
    // no completionLog — slim remote payload
  };
  const localState = {
    tasks: [],
    _tombstones: { "t-zombie": "2026-02-01T00:00:00.000Z" },
  };

  const merged = mergeStates(remoteState, localState);

  assert.equal(merged.tasks.length, 0, "task completed locally stays removed even with slim remote state");
});

// ─── persistLocally debounce ─────────────────────────────────────────────────

function createManagerWithStorage() {
  const stored = {};
  const storage = {
    setItem: (key, value) => { stored[key] = value; },
    getItem: (key) => stored[key] ?? null,
    _stored: stored,
  };
  const manager = createManager();
  manager.storage = storage;
  return { manager, storage };
}

test("persistLocally sets a debounce timer without writing immediately", () => {
  const { manager } = createManagerWithStorage();
  // No mutations — storage injection alone must not set a timer
  assert.equal(manager._localPersistTimer, null, "no timer before call");

  manager.persistLocally();
  assert.ok(manager._localPersistTimer !== null, "timer set after persistLocally()");

  clearTimeout(manager._localPersistTimer);
  manager._localPersistTimer = null;
});

test("persistLocally resets the timer when called multiple times rapidly", () => {
  const { manager } = createManagerWithStorage();

  manager.persistLocally();
  const firstTimer = manager._localPersistTimer;

  manager.persistLocally();
  const secondTimer = manager._localPersistTimer;

  assert.notEqual(firstTimer, secondTimer, "timer is replaced on each call");

  clearTimeout(manager._localPersistTimer);
  manager._localPersistTimer = null;
});

test("_persistLocallyNow writes state to storage synchronously and clears the timer", () => {
  const { manager, storage } = createManagerWithStorage();
  manager.addTask({ title: "Flush me now" });

  manager.persistLocally(); // set debounce timer
  assert.ok(manager._localPersistTimer !== null);

  manager._persistLocallyNow(); // immediate flush
  assert.equal(manager._localPersistTimer, null, "timer cleared after immediate flush");
  assert.ok(storage._stored[manager.storageKey] !== undefined, "state written to storage");

  const parsed = JSON.parse(storage._stored[manager.storageKey]);
  assert.equal(parsed.tasks[0].title, "Flush me now", "correct state persisted");
});

test("_persistLocallyNow writes current state even without a pending timer", () => {
  const { manager, storage } = createManagerWithStorage();
  manager.addTask({ title: "Direct flush" });
  // addTask triggers persistLocally() — clear that timer to isolate _persistLocallyNow
  clearTimeout(manager._localPersistTimer);
  manager._localPersistTimer = null;

  assert.equal(manager._localPersistTimer, null);
  manager._persistLocallyNow();

  assert.ok(storage._stored[manager.storageKey] !== undefined);
  const parsed = JSON.parse(storage._stored[manager.storageKey]);
  assert.equal(parsed.tasks[0].title, "Direct flush");
});

// ─── ensureCompletedLoaded ───────────────────────────────────────────────────

function mockFetchCompleted(completedPayload) {
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify(completedPayload),
  });
}

test("ensureCompletedLoaded does nothing when remoteSyncEnabled is false", async () => {
  const manager = createManager();
  // remoteSyncEnabled is already false from createManager()
  assert.equal(manager._completedDataLoaded, false);

  await manager.ensureCompletedLoaded();

  assert.equal(manager._completedDataLoaded, false, "not marked loaded when sync disabled");
  assert.equal(manager.state.completionLog.length, 0, "state untouched");
});

test("ensureCompletedLoaded merges completionLog and reference into state on first call", async () => {
  const manager = createManager();
  manager.remoteSyncEnabled = true;
  mockFetchCompleted({
    completionLog: [{ id: "cl-1", title: "Logged done", completedAt: "2026-01-15T00:00:00.000Z", archiveType: "completed" }],
    reference: [{ id: "ref-1", title: "Ref done", completedAt: "2026-01-10T00:00:00.000Z", archiveType: "reference" }],
    completedProjects: [{ id: "cp-1", name: "Old project", completedAt: "2026-01-01T00:00:00.000Z" }],
  });

  await manager.ensureCompletedLoaded();

  assert.equal(manager.state.completionLog.length, 1, "completionLog merged");
  assert.equal(manager.state.reference.length, 1, "reference merged");
  assert.equal(manager.state.completedProjects.length, 1, "completedProjects merged");
  assert.equal(manager._completedDataLoaded, true, "flagged as loaded");

  globalThis.fetch = undefined;
});

test("ensureCompletedLoaded is idempotent — second call skips the fetch", async () => {
  const manager = createManager();
  manager.remoteSyncEnabled = true;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return { ok: true, text: async () => JSON.stringify({ completionLog: [], reference: [], completedProjects: [] }) };
  };

  await manager.ensureCompletedLoaded();
  await manager.ensureCompletedLoaded();

  assert.equal(fetchCount, 1, "fetch called only once");

  globalThis.fetch = undefined;
});

test("ensureCompletedLoaded leaves _completedDataLoaded false on fetch failure to allow retry", async () => {
  const manager = createManager();
  manager.remoteSyncEnabled = true;
  globalThis.fetch = async () => { throw new Error("Network error"); };

  await manager.ensureCompletedLoaded(); // should not throw

  assert.equal(manager._completedDataLoaded, false, "not marked loaded after failure — retry allowed");

  globalThis.fetch = undefined;
});

test("ensureCompletedLoaded does not overwrite existing state when server returns empty arrays", async () => {
  const manager = createManager({
    completionLog: [{ id: "existing", title: "Keep me", completedAt: "2026-01-01T00:00:00.000Z", archiveType: "completed" }],
  });
  manager.remoteSyncEnabled = true;
  mockFetchCompleted({ completionLog: [], reference: [], completedProjects: [] });

  await manager.ensureCompletedLoaded();

  assert.equal(manager.state.completionLog.length, 1, "existing completionLog not overwritten by empty server response");
  assert.equal(manager._completedDataLoaded, true);

  globalThis.fetch = undefined;
});

// ── Op log + field-level merge tests ────────────────────────────────────────

const { mergeOpLogs, appendOpLogEntries, readOpLogEntries, MERGE_FIELD_GROUPS } = __testing;

test("updateTask emits op log entry when myDayDate changes", () => {
  const storage = new Map();
  storage.getItem = (k) => storage.get(k) ?? null;
  storage.setItem = (k, v) => storage.set(k, v);
  storage.removeItem = (k) => storage.delete(k);

  const manager = new TaskManager();
  manager.remoteSyncEnabled = false;
  manager.storage = storage;
  manager.state = {
    tasks: [], reference: [], completionLog: [], projects: [],
    completedProjects: [], checklist: [], analytics: { history: [] },
    settings: { theme: "light", customTheme: { canvas: "#f5efe2", accent: "#0f766e", signal: "#b45309" }, customThemePalettes: [], areaOptions: [], featureFlags: {} },
  };

  const task = manager.addTask({ title: "My Day test" });
  manager.updateTask(task.id, { myDayDate: "2026-03-30" });

  const entries = readOpLogEntries(storage);
  const myDayEntry = entries.find((e) => e.field === "myDayDate");
  assert.ok(myDayEntry, "op log entry created for myDayDate change");
  assert.equal(myDayEntry.next, "2026-03-30");
  assert.equal(myDayEntry.taskId, task.id);
});

test("updateTask emits op log entry when status changes", () => {
  const storage = new Map();
  storage.getItem = (k) => storage.get(k) ?? null;
  storage.setItem = (k, v) => storage.set(k, v);
  storage.removeItem = (k) => storage.delete(k);

  const manager = new TaskManager();
  manager.remoteSyncEnabled = false;
  manager.storage = storage;
  manager.state = {
    tasks: [], reference: [], completionLog: [], projects: [],
    completedProjects: [], checklist: [], analytics: { history: [] },
    settings: { theme: "light", customTheme: { canvas: "#f5efe2", accent: "#0f766e", signal: "#b45309" }, customThemePalettes: [], areaOptions: [], featureFlags: {} },
  };

  const task = manager.addTask({ title: "Status test" });
  manager.updateTask(task.id, { status: "next" });

  const entries = readOpLogEntries(storage);
  const statusEntry = entries.find((e) => e.field === "status");
  assert.ok(statusEntry, "op log entry created for status change");
  assert.equal(statusEntry.prev, "inbox");
  assert.equal(statusEntry.next, "next");
});

test("mergeOpLogs deduplicates by id and sorts newest-first", () => {
  const a = [
    { id: "op1", ts: "2026-03-30T10:00:00Z", field: "status" },
    { id: "op2", ts: "2026-03-30T09:00:00Z", field: "myDayDate" },
  ];
  const b = [
    { id: "op2", ts: "2026-03-30T09:00:00Z", field: "myDayDate" }, // duplicate
    { id: "op3", ts: "2026-03-30T11:00:00Z", field: "dueDate" },
  ];
  const merged = mergeOpLogs(a, b);
  assert.equal(merged.length, 3, "duplicates removed");
  assert.equal(merged[0].id, "op3", "sorted newest-first");
  assert.equal(merged[1].id, "op1");
  assert.equal(merged[2].id, "op2");
});

test("mergeTasks field-group merge: myDayDate from Device A survives status update from Device B", () => {
  // Simulate the reported bug: A adds task to My Day, B later changes status.
  // Before this fix, B's whole-task win would clobber A's myDayDate.
  const t1 = "2026-03-30T09:00:00Z";
  const t2 = "2026-03-30T10:00:00Z"; // B is later overall

  const deviceATask = {
    id: "task-1", title: "Test", status: "inbox",
    myDayDate: "2026-03-30", calendarDate: "2026-03-30", calendarTime: null,
    dueDate: null, followUpDate: null,
    updatedAt: t1,
    _fieldTimestamps: { scheduling: t2, status: t1, dueDate: t1, followUpDate: t1 },
    createdAt: t1,
  };

  const deviceBTask = {
    id: "task-1", title: "Test", status: "next",
    myDayDate: null, calendarDate: null, calendarTime: null,
    dueDate: null, followUpDate: null,
    updatedAt: t2,
    _fieldTimestamps: { scheduling: t1, status: t2, dueDate: t1, followUpDate: t1 },
    createdAt: t1,
  };

  const { mergeStates } = __testing;
  const merged = mergeStates(
    { tasks: [deviceBTask], reference: [], completionLog: [], completedProjects: [] },
    { tasks: [deviceATask], reference: [], completionLog: [], completedProjects: [] }
  );

  const result = merged.tasks.find((t) => t.id === "task-1");
  assert.ok(result, "task present after merge");
  assert.equal(result.status, "next", "Device B's status update wins (newer _fieldTimestamps.status)");
  assert.equal(result.myDayDate, "2026-03-30", "Device A's My Day wins (newer _fieldTimestamps.scheduling)");
});

test("mergeTasks falls back to updatedAt LWW for legacy tasks without _fieldTimestamps", () => {
  const t1 = "2026-03-29T09:00:00Z";
  const t2 = "2026-03-30T10:00:00Z";

  const older = { id: "task-2", title: "Old", status: "inbox", myDayDate: "2026-03-29", updatedAt: t1, createdAt: t1 };
  const newer = { id: "task-2", title: "Old", status: "next", myDayDate: null, updatedAt: t2, createdAt: t1 };

  const { mergeStates } = __testing;
  const merged = mergeStates(
    { tasks: [newer], reference: [], completionLog: [], completedProjects: [] },
    { tasks: [older], reference: [], completionLog: [], completedProjects: [] }
  );

  const result = merged.tasks.find((t) => t.id === "task-2");
  assert.ok(result, "task present");
  assert.equal(result.status, "next", "newer whole-task wins for all fields when no _fieldTimestamps");
  assert.equal(result.myDayDate, null, "newer whole-task wins — no field override");
});

test("mergeSettings preserves changes from both devices when different groups are modified", () => {
  const { mergeSettings } = __testing;
  const earlier = "2026-03-29T10:00:00.000Z";
  const later = "2026-03-30T10:00:00.000Z";

  const deviceA = {
    theme: "dark",
    customTheme: { canvas: "#111111", accent: "#222222", signal: "#333333" },
    customThemePalettes: [],
    googleCalendarConfig: { calendarId: "", timezone: "UTC", defaultDurationMinutes: 30 },
    featureFlags: { showFiltersCard: false },
    staleTaskThresholds: { warn: 7, stale: 14, old: 30, ancient: 90 },
    contextOptions: [], peopleOptions: [], areaOptions: [], deletedPeopleOptions: [],
    _fieldTimestamps: { appearance: later, flags: earlier, calendar: earlier, lists: earlier },
  };

  const deviceB = {
    theme: "light",
    customTheme: { canvas: "#f5efe2", accent: "#0f766e", signal: "#b45309" },
    customThemePalettes: [],
    googleCalendarConfig: { calendarId: "team@gmail.com", timezone: "America/New_York", defaultDurationMinutes: 60 },
    featureFlags: { showFiltersCard: true },
    staleTaskThresholds: { warn: 5, stale: 10, old: 20, ancient: 60 },
    contextOptions: [], peopleOptions: [], areaOptions: [], deletedPeopleOptions: [],
    _fieldTimestamps: { appearance: earlier, flags: later, calendar: later, lists: earlier },
  };

  const merged = mergeSettings(deviceA, deviceB);

  assert.equal(merged.theme, "dark", "local (device A) theme wins — theme is never synced across devices");
  assert.equal(merged.googleCalendarConfig.calendarId, "team@gmail.com",
    "device B calendar config wins (newer _fieldTimestamps.calendar)");
  assert.equal(merged.googleCalendarConfig.defaultDurationMinutes, 60,
    "all calendar fields come from the winning source");
  assert.equal(merged.featureFlags.showFiltersCard, true,
    "device B flags win (newer _fieldTimestamps.flags)");
  assert.equal(merged.staleTaskThresholds.warn, 5,
    "staleTaskThresholds merges with featureFlags in the flags group");
});

test("mergeSettings falls back to local-wins when neither side has timestamps", () => {
  const { mergeSettings } = __testing;
  const local = { theme: "dark", featureFlags: { showFiltersCard: false } };
  const remote = { theme: "light", featureFlags: { showFiltersCard: true } };

  const merged = mergeSettings(local, remote);
  assert.equal(merged.theme, "dark", "local wins when no timestamps");
  assert.equal(merged.featureFlags.showFiltersCard, false, "local flags win when no timestamps");
  assert.ok(!merged._fieldTimestamps, "no _fieldTimestamps emitted when neither side had them");
});

test("mergeStates uses per-group LWW for settings rather than local-wins", () => {
  const { mergeStates } = __testing;
  const earlier = "2026-03-29T10:00:00.000Z";
  const later = "2026-03-30T10:00:00.000Z";

  const remoteState = {
    tasks: [], reference: [], completionLog: [], completedProjects: [],
    settings: {
      theme: "light",
      googleCalendarConfig: { calendarId: "remote-cal@gmail.com", timezone: "UTC", defaultDurationMinutes: 60 },
      _fieldTimestamps: { appearance: earlier, calendar: later },
    },
  };
  const localState = {
    tasks: [], reference: [], completionLog: [], completedProjects: [],
    settings: {
      theme: "dark",
      googleCalendarConfig: { calendarId: "", timezone: "UTC", defaultDurationMinutes: 30 },
      _fieldTimestamps: { appearance: later, calendar: earlier },
    },
  };

  const merged = mergeStates(remoteState, localState);
  assert.equal(merged.settings.theme, "dark",
    "local theme always wins — theme is device-local and not synced");
  assert.equal(merged.settings.googleCalendarConfig.calendarId, "remote-cal@gmail.com",
    "remote calendar config wins (newer _fieldTimestamps.calendar) — old code would have lost this");
});

test("updateTheme stamps _fieldTimestamps.appearance (local only) and updateGoogleCalendarConfig stamps calendar", () => {
  const manager = createManager();

  assert.ok(!manager.state.settings._fieldTimestamps?.appearance, "no appearance timestamp before theme change");
  manager.updateTheme("dark");
  assert.ok(manager.state.settings._fieldTimestamps?.appearance, "appearance timestamp set locally after updateTheme (stripped before server sync)");

  assert.ok(!manager.state.settings._fieldTimestamps?.calendar, "no calendar timestamp before config change");
  manager.updateGoogleCalendarConfig({ calendarId: "test@gmail.com", timezone: "UTC", defaultDurationMinutes: 45 });
  assert.ok(manager.state.settings._fieldTimestamps?.calendar, "calendar timestamp set after updateGoogleCalendarConfig");
});

test("_fieldTimestamps in settings survive mergeStates without spurious side effects", () => {
  // _fieldTimestamps no longer needs to be stripped — conflict detection uses _rev, not hashing.
  const { mergeSettings } = __testing;
  const localSettings  = { theme: "dark",  _fieldTimestamps: { appearance: "2026-03-30T10:00:00.000Z" } };
  const remoteSettings = { theme: "light", _fieldTimestamps: { appearance: "2026-03-29T10:00:00.000Z" } };

  const merged = mergeSettings(localSettings, remoteSettings);

  assert.equal(merged.theme, "dark", "local theme always wins — device-local, not synced across devices");
  assert.ok(merged._fieldTimestamps?.appearance, "_fieldTimestamps.appearance preserved locally (not sent to server)");
});

test("addTaskNote survives a concurrent status change on the other device", () => {
  const { mergeStates } = __testing;
  const t1 = "2026-03-30T09:00:00.000Z";
  const t2 = "2026-03-30T10:00:00.000Z";

  // Device A added a note at t1
  const deviceATask = {
    id: "task-notes-1", title: "Test", status: "inbox",
    updatedAt: t1, createdAt: t1,
    _fieldTimestamps: { scheduling: t1, status: t1, dueDate: t1, followUpDate: t1 },
    notes: [{ id: "note-1", text: "Important insight", createdAt: t1, updatedAt: t1 }],
    listItems: [],
  };

  // Device B changed status at t2 (no notes)
  const deviceBTask = {
    id: "task-notes-1", title: "Test", status: "next",
    updatedAt: t2, createdAt: t1,
    _fieldTimestamps: { scheduling: t1, status: t2, dueDate: t1, followUpDate: t1 },
    notes: [],
    listItems: [],
  };

  const merged = mergeStates(
    { tasks: [deviceBTask], reference: [], completionLog: [], completedProjects: [] },
    { tasks: [deviceATask], reference: [], completionLog: [], completedProjects: [] }
  );
  const result = merged.tasks.find((t) => t.id === "task-notes-1");
  assert.ok(result, "task present");
  assert.equal(result.status, "next", "Device B status wins");
  assert.equal(result.notes.length, 1, "Device A note survives despite Device B having no notes");
  assert.equal(result.notes[0].text, "Important insight");
});

test("listItem added on device A survives whole-task LWW win by device B", () => {
  const { mergeStates } = __testing;
  const t1 = "2026-03-30T09:00:00.000Z";
  const t2 = "2026-03-30T10:00:00.000Z";

  const deviceATask = {
    id: "task-list-1", title: "Test", status: "inbox",
    updatedAt: t1, createdAt: t1,
    _fieldTimestamps: { scheduling: t1, status: t1, dueDate: t1, followUpDate: t1 },
    notes: [],
    listItems: [{ id: "li-1", text: "Buy milk", done: false, updatedAt: t1 }],
  };

  const deviceBTask = {
    id: "task-list-1", title: "Test (edited title)", status: "next",
    updatedAt: t2, createdAt: t1,
    _fieldTimestamps: { scheduling: t1, status: t2, dueDate: t1, followUpDate: t1 },
    notes: [],
    listItems: [],
  };

  const merged = mergeStates(
    { tasks: [deviceBTask], reference: [], completionLog: [], completedProjects: [] },
    { tasks: [deviceATask], reference: [], completionLog: [], completedProjects: [] }
  );
  const result = merged.tasks.find((t) => t.id === "task-list-1");
  assert.ok(result, "task present");
  assert.equal(result.listItems.length, 1, "Device A listItem survives Device B whole-task win");
  assert.equal(result.listItems[0].text, "Buy milk");
});

test("both devices add different notes — both survive in chronological order", () => {
  const { mergeStates } = __testing;
  const t1 = "2026-03-30T08:00:00.000Z";
  const t2 = "2026-03-30T09:00:00.000Z";
  const t3 = "2026-03-30T10:00:00.000Z";

  const deviceATask = {
    id: "task-both-1", title: "Both add notes", status: "inbox",
    updatedAt: t3, createdAt: t1,
    notes: [
      { id: "note-a", text: "Device A note", createdAt: t1, updatedAt: t1 },
      { id: "note-c", text: "Device A second note", createdAt: t3, updatedAt: t3 },
    ],
    listItems: [],
  };

  const deviceBTask = {
    id: "task-both-1", title: "Both add notes", status: "inbox",
    updatedAt: t2, createdAt: t1,
    notes: [
      { id: "note-a", text: "Device A note", createdAt: t1, updatedAt: t1 },
      { id: "note-b", text: "Device B note", createdAt: t2, updatedAt: t2 },
    ],
    listItems: [],
  };

  const merged = mergeStates(
    { tasks: [deviceBTask], reference: [], completionLog: [], completedProjects: [] },
    { tasks: [deviceATask], reference: [], completionLog: [], completedProjects: [] }
  );
  const result = merged.tasks.find((t) => t.id === "task-both-1");
  assert.ok(result, "task present");
  assert.equal(result.notes.length, 3, "all three notes present");
  const ids = result.notes.map((n) => n.id);
  assert.deepEqual(ids, ["note-a", "note-b", "note-c"], "sorted chronologically by createdAt");
});

test("listItem toggle on device A preserved when device B edits title", () => {
  const { mergeStates } = __testing;
  const t1 = "2026-03-30T09:00:00.000Z";
  const t2 = "2026-03-30T10:00:00.000Z";

  const deviceATask = {
    id: "task-toggle-1", title: "Task", status: "next",
    updatedAt: t2, createdAt: t1,
    _fieldTimestamps: { scheduling: t1, status: t1, dueDate: t1, followUpDate: t1 },
    notes: [],
    listItems: [{ id: "li-x", text: "Step one", done: true, updatedAt: t2 }],
  };

  const deviceBTask = {
    id: "task-toggle-1", title: "Task (edited)", status: "next",
    updatedAt: t2, createdAt: t1,
    _fieldTimestamps: { scheduling: t1, status: t1, dueDate: t1, followUpDate: t1 },
    notes: [],
    listItems: [{ id: "li-x", text: "Step one", done: false, updatedAt: t1 }],
  };

  const merged = mergeStates(
    { tasks: [deviceBTask], reference: [], completionLog: [], completedProjects: [] },
    { tasks: [deviceATask], reference: [], completionLog: [], completedProjects: [] }
  );
  const result = merged.tasks.find((t) => t.id === "task-toggle-1");
  assert.ok(result, "task present");
  assert.equal(result.listItems[0].done, true,
    "Device A toggle (newer updatedAt) wins over Device B untoggled item");
});

test("addTaskNote stamps updatedAt and addTaskListItems stamps updatedAt", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Note and list test" });

  const note = manager.addTaskNote(task.id, "My note");
  assert.ok(note.updatedAt, "note has updatedAt after creation");

  const [item] = manager.addTaskListItems(task.id, ["Step 1"]);
  assert.ok(item.updatedAt, "listItem has updatedAt after creation");

  const beforeDone = manager.getTaskById(task.id).listItems[0].done;
  manager.toggleTaskListItem(task.id, item.id);
  const toggled = manager.getTaskById(task.id).listItems[0];
  assert.notEqual(toggled.done, beforeDone, "done toggles");
  assert.ok(toggled.updatedAt, "updatedAt present after toggle");
});

test("mergeAnalytics unions history from both devices in chronological order", () => {
  const { mergeAnalytics } = __testing;
  const local  = { history: [{ week: "Week 10", complete: 5, remaining: 8 }, { week: "Week 12", complete: 3, remaining: 10 }] };
  const remote = { history: [{ week: "Week 10", complete: 5, remaining: 8 }, { week: "Week 11", complete: 7, remaining: 9 }] };

  const merged = mergeAnalytics(local, remote);
  const weeks = merged.history.map((e) => e.week);
  assert.deepEqual(weeks, ["Week 10", "Week 11", "Week 12"],
    "all weeks present; remote order first, then local-only weeks appended");
});

test("mergeAnalytics: max(complete) and min(remaining) win for the same week", () => {
  const { mergeAnalytics } = __testing;
  const local  = { history: [{ week: "Week 08", complete: 14, remaining: 3 }] };
  const remote = { history: [{ week: "Week 08", complete: 10, remaining: 6 }] };

  const merged = mergeAnalytics(local, remote);
  assert.equal(merged.history.length, 1);
  assert.equal(merged.history[0].complete,  14, "max(complete) wins");
  assert.equal(merged.history[0].remaining,  3, "min(remaining) wins");
});

test("mergeAnalytics preserves one side when the other has empty history", () => {
  const { mergeAnalytics } = __testing;
  const local  = { history: [{ week: "Week 08", complete: 12, remaining: 6 }] };
  const remote = {};

  const fromEmpty = mergeAnalytics(local, remote);
  assert.equal(fromEmpty.history.length, 1, "local history preserved when remote is empty");

  const toEmpty = mergeAnalytics({}, local);
  assert.equal(toEmpty.history.length, 1, "remote history preserved when local is empty");
});

test("mergeAnalytics: both empty returns an empty-history object without error", () => {
  const { mergeAnalytics } = __testing;
  const merged = mergeAnalytics({}, {});
  assert.ok(typeof merged === "object", "returns an object");
});

// ─── _buildConflictSummary (replaces diffConflict) ───────────────────────────

test("_buildConflictSummary identifies tasks changed, added, and removed by remote", () => {
  const earlier = "2026-03-29T10:00:00.000Z";
  const later   = "2026-03-30T10:00:00.000Z";

  const localState = {
    tasks: [
      { id: "t1", title: "Existing unchanged", updatedAt: later },
      { id: "t2", title: "Remote updated this", updatedAt: earlier },
      { id: "t3", title: "Only on local",       updatedAt: earlier },
    ],
    settings: {},
  };
  const remoteState = {
    tasks: [
      { id: "t1", title: "Existing unchanged", updatedAt: later },
      { id: "t2", title: "Remote updated this", updatedAt: later },
      { id: "t4", title: "Only on remote",      updatedAt: later },
    ],
    settings: {},
  };

  const result = _buildConflictSummary(localState, remoteState);

  assert.equal(result.changedTasks.length,  1, "one task changed by remote");
  assert.equal(result.changedTasks[0].id,   "t2");
  assert.equal(result.addedTasks.length,    1, "one task added by remote");
  assert.equal(result.addedTasks[0].id,     "t4");
  assert.equal(result.removedTasks.length,  1, "one task removed by remote");
  assert.equal(result.removedTasks[0].id,   "t3");
});

test("_buildConflictSummary detects changed settings groups when remote timestamp is newer", () => {
  const earlier = "2026-03-29T10:00:00.000Z";
  const later   = "2026-03-30T10:00:00.000Z";

  const localState = {
    tasks: [],
    settings: { _fieldTimestamps: { appearance: later, calendar: earlier } },
  };
  const remoteState = {
    tasks: [],
    settings: { _fieldTimestamps: { appearance: earlier, calendar: later } },
  };

  const result = _buildConflictSummary(localState, remoteState);

  assert.ok(!result.changedSettingsGroups.includes("appearance"), "appearance: local is newer — not a remote change");
  assert.ok(result.changedSettingsGroups.includes("calendar"), "calendar: remote is newer — flagged");
});

test("_buildConflictSummary returns empty arrays when states are identical", () => {
  const ts = "2026-03-30T10:00:00.000Z";
  const state = {
    tasks: [{ id: "t1", title: "A task", updatedAt: ts }],
    settings: { _fieldTimestamps: { appearance: ts } },
  };
  const result = _buildConflictSummary(state, state);

  assert.equal(result.changedTasks.length,        0, "no changed tasks");
  assert.equal(result.addedTasks.length,           0, "no added tasks");
  assert.equal(result.removedTasks.length,          0, "no removed tasks");
  assert.equal(result.changedSettingsGroups.length, 0, "no changed settings groups");
});

test("addTask with status 'next' returns task with correct status", (t) => {
  const manager = createManager();
  const task = manager.addTask({ title: "Write tests", status: "next" });
  assert.equal(task.status, "next");
  assert.equal(manager.getTasks({ status: "next" }).length, 1);
  assert.equal(manager.getTasks({ status: "inbox" }).length, 0);
});

test("addTask with status 'next' and projectId is retrievable by projectId filter", (t) => {
  const manager = createManager();
  const project = manager.addProject("Test Project");
  const task = manager.addTask({ title: "Do thing", status: "next", projectId: project.id });
  assert.ok(task, "task was created");
  const found = manager.getTasks({ projectId: project.id });
  assert.equal(found.length, 1);
  assert.equal(found[0].id, task.id);
});

// ── Doing-session tests ──────────────────────────────────────────────────────

test("moveTask to doing logs a session entry and sets doingStartedAt", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Focus task", status: "next" });
  manager.moveTask(task.id, "doing");
  const t = manager.getTaskById(task.id);
  assert.ok(t.doingStartedAt, "doingStartedAt set");
  assert.equal(t.doingSessions?.length, 1, "one session opened");
  assert.equal(t.doingSessions[0].end, null, "session is still open");
});

test("moveTask away from doing closes session and accumulates totalDoingSeconds", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Focus task", status: "doing" });
  // Simulate task already in doing with a known start time
  const startedAt = new Date(Date.now() - 60_000).toISOString(); // 60s ago
  manager.updateTask(task.id, { status: "doing" }); // ensure session open
  const t = manager.getTaskById(task.id);
  // Backdate the session start so we can measure elapsed
  t.doingStartedAt = startedAt;
  if (t.doingSessions?.length) t.doingSessions[t.doingSessions.length - 1].start = startedAt;

  manager.moveTask(task.id, "next");
  const after = manager.getTaskById(task.id);
  assert.equal(after.doingStartedAt, null, "doingStartedAt cleared");
  assert.ok((after.totalDoingSeconds || 0) >= 59, "at least 59s accumulated");
  const closed = after.doingSessions?.find((s) => s.end !== null);
  assert.ok(closed, "session has been closed with an end timestamp");
});

test("addDoingSession adds a manual session and updates the total", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Logged task", status: "next" });
  const start = "2026-04-13T10:00:00.000Z";
  const end   = "2026-04-13T10:30:00.000Z"; // 30 min = 1800s
  manager.addDoingSession(task.id, { start, end });
  const t = manager.getTaskById(task.id);
  assert.equal(t.doingSessions?.length, 1, "one session added");
  assert.equal(t.doingSessions[0].start, start);
  assert.equal(t.doingSessions[0].end, end);
  assert.equal(t.totalDoingSeconds, 1800, "totalDoingSeconds updated");
});

test("updateDoingSession adjusts totalDoingSeconds by the delta", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Logged task", status: "next" });
  const start = "2026-04-13T10:00:00.000Z";
  const end   = "2026-04-13T10:30:00.000Z"; // 1800s
  manager.addDoingSession(task.id, { start, end });
  const t = manager.getTaskById(task.id);
  const sessId = t.doingSessions[0].id;

  // Extend end by 15 min → 2700s total
  manager.updateDoingSession(task.id, sessId, { end: "2026-04-13T10:45:00.000Z" });
  const after = manager.getTaskById(task.id);
  assert.equal(after.totalDoingSeconds, 2700, "total updated to 45 min");
  assert.equal(after.doingSessions[0].end, "2026-04-13T10:45:00.000Z");
});

test("deleteDoingSession removes the entry and subtracts from totalDoingSeconds", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Logged task", status: "next" });
  manager.addDoingSession(task.id, { start: "2026-04-13T10:00:00.000Z", end: "2026-04-13T11:00:00.000Z" }); // 3600s
  manager.addDoingSession(task.id, { start: "2026-04-13T12:00:00.000Z", end: "2026-04-13T12:30:00.000Z" }); // 1800s
  const t = manager.getTaskById(task.id);
  assert.equal(t.totalDoingSeconds, 5400, "combined total = 90 min");
  const firstId = t.doingSessions[0].id;

  manager.deleteDoingSession(task.id, firstId);
  const after = manager.getTaskById(task.id);
  assert.equal(after.doingSessions.length, 1, "one session remains");
  assert.equal(after.totalDoingSeconds, 1800, "total reduced to 30 min");
});

// ── Prerequisite / chaining tests ──────────────────────────────────────────

test("addTask initializes prerequisiteTaskIds as empty array", () => {
  const manager = createManager();
  const task = manager.addTask({ title: "Task A" });
  assert.deepEqual(task.prerequisiteTaskIds, []);
});

test("normalizeTask defaults missing prerequisiteTaskIds to empty array", () => {
  const { normalizeTask } = __testing;
  const normalized = normalizeTask({ id: "x", title: "T", status: "inbox", createdAt: new Date().toISOString() });
  assert.deepEqual(normalized.prerequisiteTaskIds, []);
});

test("addPrerequisite links two tasks and isBlocked returns true", () => {
  const manager = createManager();
  const taskA = manager.addTask({ title: "Task A", status: "next" });
  const taskB = manager.addTask({ title: "Task B", status: "next" });
  const result = manager.addPrerequisite(taskB.id, taskA.id);
  assert.equal(result, true);
  assert.equal(manager.isBlocked(taskB.id), true, "Task B is blocked by Task A");
  assert.equal(manager.isBlocked(taskA.id), false, "Task A has no blockers");
});

test("isBlocked returns false when all prerequisites are completed", () => {
  const manager = createManager();
  const taskA = manager.addTask({ title: "Task A", status: "next" });
  const taskB = manager.addTask({ title: "Task B", status: "next" });
  manager.addPrerequisite(taskB.id, taskA.id);
  manager.completeTask(taskA.id, { archive: "log" });
  assert.equal(manager.isBlocked(taskB.id), false, "Task B is unblocked after A completes");
});

test("getBlockers returns active prerequisite tasks", () => {
  const manager = createManager();
  const taskA = manager.addTask({ title: "Task A", status: "next" });
  const taskB = manager.addTask({ title: "Task B", status: "next" });
  manager.addPrerequisite(taskB.id, taskA.id);
  const blockers = manager.getBlockers(taskB.id);
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0].id, taskA.id);
});

test("removePrerequisite unlinks tasks", () => {
  const manager = createManager();
  const taskA = manager.addTask({ title: "Task A", status: "next" });
  const taskB = manager.addTask({ title: "Task B", status: "next" });
  manager.addPrerequisite(taskB.id, taskA.id);
  manager.removePrerequisite(taskB.id, taskA.id);
  assert.equal(manager.isBlocked(taskB.id), false, "Task B is unblocked after removing prereq");
});

test("addPrerequisite prevents self-references", () => {
  const manager = createManager();
  const taskA = manager.addTask({ title: "Task A" });
  const result = manager.addPrerequisite(taskA.id, taskA.id);
  assert.equal(result, false, "self-reference rejected");
  assert.deepEqual(manager.getTaskById(taskA.id).prerequisiteTaskIds, []);
});

test("addPrerequisite detects direct cycles (A→B, B→A)", () => {
  const manager = createManager();
  const taskA = manager.addTask({ title: "Task A", status: "next" });
  const taskB = manager.addTask({ title: "Task B", status: "next" });
  manager.addPrerequisite(taskB.id, taskA.id); // B requires A
  const result = manager.addPrerequisite(taskA.id, taskB.id); // A requires B — cycle!
  assert.equal(result, false, "direct cycle rejected");
});

test("addPrerequisite detects transitive cycles (A→B→C, C→A)", () => {
  const manager = createManager();
  const taskA = manager.addTask({ title: "A", status: "next" });
  const taskB = manager.addTask({ title: "B", status: "next" });
  const taskC = manager.addTask({ title: "C", status: "next" });
  manager.addPrerequisite(taskB.id, taskA.id); // B requires A
  manager.addPrerequisite(taskC.id, taskB.id); // C requires B
  const result = manager.addPrerequisite(taskA.id, taskC.id); // A requires C — cycle!
  assert.equal(result, false, "transitive cycle rejected");
});

test("moveTask to DOING is blocked when prerequisites are incomplete", () => {
  const manager = createManager();
  const taskA = manager.addTask({ title: "Task A", status: "next" });
  const taskB = manager.addTask({ title: "Task B", status: "next" });
  manager.addPrerequisite(taskB.id, taskA.id);
  manager.moveTask(taskB.id, STATUS.DOING);
  assert.equal(manager.getTaskById(taskB.id).status, STATUS.NEXT, "status unchanged — blocked");
});

test("moveTask to DOING succeeds after prerequisites are completed", () => {
  const manager = createManager();
  const taskA = manager.addTask({ title: "Task A", status: "next" });
  const taskB = manager.addTask({ title: "Task B", status: "next" });
  manager.addPrerequisite(taskB.id, taskA.id);
  manager.completeTask(taskA.id, { archive: "log" });
  manager.moveTask(taskB.id, STATUS.DOING);
  assert.equal(manager.getTaskById(taskB.id).status, STATUS.DOING, "can move to doing once unblocked");
});

test("getUnlockedByCompletion returns tasks that become fully unblocked", () => {
  const manager = createManager();
  const taskA = manager.addTask({ title: "Task A", status: "next" });
  const taskC = manager.addTask({ title: "Task C", status: "next" });
  const taskD = manager.addTask({ title: "Task D", status: "next" });
  // D requires both A and C
  manager.addPrerequisite(taskD.id, taskA.id);
  manager.addPrerequisite(taskD.id, taskC.id);
  // Completing A alone does not unblock D
  const afterA = manager.getUnlockedByCompletion(taskA.id);
  assert.equal(afterA.length, 0, "D still has C pending");
  // Complete A in state so getTaskById won't find it
  manager.completeTask(taskA.id, { archive: "log" });
  // Now completing C should unblock D
  const afterC = manager.getUnlockedByCompletion(taskC.id);
  assert.equal(afterC.length, 1);
  assert.equal(afterC[0].id, taskD.id);
});

test("prerequisiteTaskIds field group is included in MERGE_FIELD_GROUPS", () => {
  const { MERGE_FIELD_GROUPS } = __testing;
  assert.ok("prerequisites" in MERGE_FIELD_GROUPS, "prerequisites group exists");
  assert.deepEqual(MERGE_FIELD_GROUPS.prerequisites, ["prerequisiteTaskIds"]);
});

test("mergeTasks preserves prerequisiteTaskIds via LWW per-field-group", () => {
  const { mergeTasks } = __testing;
  const now = new Date().toISOString();
  const later = new Date(Date.now() + 5000).toISOString();
  const local = {
    id: "task1", title: "Task B", status: "next",
    prerequisiteTaskIds: ["task-a"],
    _fieldTimestamps: { prerequisites: now },
    updatedAt: now, createdAt: now,
  };
  const remote = {
    id: "task1", title: "Task B", status: "next",
    prerequisiteTaskIds: [],
    _fieldTimestamps: { prerequisites: later }, // remote removed prereq more recently
    updatedAt: later, createdAt: now,
  };
  const [merged] = mergeTasks([local], [remote]);
  assert.deepEqual(merged.prerequisiteTaskIds, [], "remote wins — prereq removed");
});

test.after(() => {
  globalThis.fetch = originalFetch;
});

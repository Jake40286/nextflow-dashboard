// Pure parsing / validation / date-resolution for project-template imports.
// No DOM, no TaskManager — runnable from Node's test runner.

import {
  STATUS,
  EFFORT_LEVELS,
  TIME_REQUIREMENTS,
  PROJECT_STATUSES,
  sanitizePeopleTag,
} from "./data.js";

export const TEMPLATE_SCHEMA_VERSION = "nextflow-template@1";

export const TEMPLATE_SCHEMA_EXAMPLE = `{
  "$schema": "nextflow-template@1",
  "project": {
    "name": "Kitchen Renovation",
    "vision": "Fully renovated by summer",
    "areaOfFocus": "Home",
    "themeTag": "Family",
    "statusTag": "Active",
    "deadline": "2026-08-01"
  },
  "tasks": [
    {
      "title": "Get three contractor quotes",
      "description": "Aim for 3 to compare",
      "status": "next",
      "contexts": ["@Phone"],
      "areaOfFocus": "Home",
      "effortLevel": "medium",
      "timeRequired": "30min+",
      "peopleTags": ["+Bob"],
      "dueOffsetDays": 3,
      "followUpOffsetDays": 7,
      "notes": ["Ask about lead times"]
    },
    {
      "title": "File HOA paperwork",
      "dueDate": "2026-05-15",
      "contexts": ["@Office"]
    }
  ]
}`;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALL_STATUS_VALUES = Object.values(STATUS);

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeContext(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function dedupCaseInsensitive(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function parseProject(raw, warnings) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Template is missing the 'project' object.");
  }
  const name = clean(raw.name);
  if (!name) {
    throw new Error("Template 'project.name' is required and cannot be empty.");
  }
  const project = {
    name,
    vision: clean(raw.vision),
    areaOfFocus: clean(raw.areaOfFocus) || null,
    themeTag: clean(raw.themeTag) || null,
    statusTag: PROJECT_STATUSES.includes(raw.statusTag) ? raw.statusTag : PROJECT_STATUSES[0],
    deadline: null,
  };
  if (raw.statusTag != null && !PROJECT_STATUSES.includes(raw.statusTag)) {
    warnings.push(`Project statusTag "${raw.statusTag}" is unknown — defaulted to "${PROJECT_STATUSES[0]}".`);
  }
  if (raw.deadline != null && raw.deadline !== "") {
    const trimmed = clean(raw.deadline);
    if (ISO_DATE_PATTERN.test(trimmed)) {
      project.deadline = trimmed;
    } else {
      warnings.push(`Project deadline "${raw.deadline}" is not an ISO date (YYYY-MM-DD) — dropped.`);
    }
  }
  return project;
}

function parseTask(raw, index, warnings) {
  if (!raw || typeof raw !== "object") {
    warnings.push(`Task #${index + 1} is not an object — skipped.`);
    return null;
  }
  const title = clean(raw.title);
  if (!title) {
    warnings.push(`Task #${index + 1} is missing a title — skipped.`);
    return null;
  }

  const status = ALL_STATUS_VALUES.includes(raw.status) ? raw.status : STATUS.NEXT;
  if (raw.status != null && !ALL_STATUS_VALUES.includes(raw.status)) {
    warnings.push(`Task "${title}": status "${raw.status}" unknown — defaulted to "${STATUS.NEXT}".`);
  }

  const rawContexts = Array.isArray(raw.contexts) ? raw.contexts : [];
  const contexts = dedupCaseInsensitive(rawContexts.map(sanitizeContext).filter(Boolean));
  if (rawContexts.length && contexts.length !== rawContexts.length) {
    warnings.push(`Task "${title}": some context tags were invalid and dropped.`);
  }

  const rawPeople = Array.isArray(raw.peopleTags) ? raw.peopleTags : [];
  const peopleTags = dedupCaseInsensitive(rawPeople.map(sanitizePeopleTag).filter(Boolean));
  if (rawPeople.length && peopleTags.length !== rawPeople.length) {
    warnings.push(`Task "${title}": some people tags didn't match the +Name pattern and were dropped.`);
  }

  const effortLevel = EFFORT_LEVELS.includes(raw.effortLevel) ? raw.effortLevel : null;
  if (raw.effortLevel != null && effortLevel === null) {
    warnings.push(`Task "${title}": effortLevel "${raw.effortLevel}" unknown — dropped.`);
  }
  const timeRequired = TIME_REQUIREMENTS.includes(raw.timeRequired) ? raw.timeRequired : null;
  if (raw.timeRequired != null && timeRequired === null) {
    warnings.push(`Task "${title}": timeRequired "${raw.timeRequired}" unknown — dropped.`);
  }

  const isoOrNull = (v) =>
    typeof v === "string" && ISO_DATE_PATTERN.test(v.trim()) ? v.trim() : null;
  const intOrNull = (v) =>
    typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;

  return {
    title,
    description: clean(raw.description),
    status,
    contexts,
    peopleTags,
    areaOfFocus: clean(raw.areaOfFocus) || null,
    effortLevel,
    timeRequired,
    waitingFor: clean(raw.waitingFor) || null,
    notes: Array.isArray(raw.notes) ? raw.notes.map(clean).filter(Boolean) : [],
    dueDate: isoOrNull(raw.dueDate),
    followUpDate: isoOrNull(raw.followUpDate),
    myDayDate: isoOrNull(raw.myDayDate),
    dueOffsetDays: intOrNull(raw.dueOffsetDays),
    followUpOffsetDays: intOrNull(raw.followUpOffsetDays),
    myDayOffsetDays: intOrNull(raw.myDayOffsetDays),
  };
}

export function parseTemplateFile(jsonString) {
  let raw;
  try {
    raw = JSON.parse(jsonString);
  } catch (err) {
    throw new Error(`Could not parse JSON: ${err.message}`);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Template must be a JSON object.");
  }
  const warnings = [];
  if (raw.$schema && raw.$schema !== TEMPLATE_SCHEMA_VERSION) {
    warnings.push(`Schema "${raw.$schema}" is not "${TEMPLATE_SCHEMA_VERSION}" — proceeding anyway.`);
  }
  const project = parseProject(raw.project, warnings);
  const rawTasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  const tasks = rawTasks.map((t, i) => parseTask(t, i, warnings)).filter(Boolean);
  return { project, tasks, warnings };
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function resolveTemplateDates(parsed, importNowIso) {
  const now = importNowIso || new Date().toISOString();
  const todayIso = now.slice(0, 10);
  const next = {
    project: parsed.project,
    tasks: parsed.tasks.map((t) => ({ ...t })),
    warnings: Array.isArray(parsed.warnings) ? [...parsed.warnings] : [],
  };
  for (const task of next.tasks) {
    for (const [absKey, offKey] of [
      ["dueDate", "dueOffsetDays"],
      ["followUpDate", "followUpOffsetDays"],
      ["myDayDate", "myDayOffsetDays"],
    ]) {
      const hasAbs = task[absKey] != null;
      const hasOff = task[offKey] != null;
      if (hasAbs && hasOff) {
        next.warnings.push(
          `Task "${task.title}": both ${absKey} and ${offKey} set — kept absolute, ignored offset.`
        );
      } else if (!hasAbs && hasOff) {
        task[absKey] = addDays(todayIso, task[offKey]);
      }
      delete task[offKey];
    }
  }
  return next;
}

export function uniqueProjectName(name, existingProjects = []) {
  const trimmed = (name || "").trim();
  if (!trimmed) return trimmed;
  const lower = trimmed.toLowerCase();
  const taken = new Set(
    (existingProjects || [])
      .map((p) => (p && typeof p.name === "string" ? p.name.trim().toLowerCase() : ""))
      .filter(Boolean)
  );
  if (!taken.has(lower)) return trimmed;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${trimmed} (${i})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${trimmed} (${Date.now()})`;
}

export function buildAiPrompt() {
  return [
    "Generate a NextFlow project template as JSON in the schema below.",
    "Replace the placeholder with your goal:",
    "",
    "  Project: <describe what you want this project to accomplish>",
    "",
    "Output only the JSON, no commentary, no markdown fences.",
    "",
    "Schema example:",
    TEMPLATE_SCHEMA_EXAMPLE,
  ].join("\n");
}

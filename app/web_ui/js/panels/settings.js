// Settings panel render methods — mixed into UIController.prototype by ui.js
import { THEME_OPTIONS, STATUS_LABELS, formatFriendlyDate } from "../data.js";
export default {
  renderSettings() {
    try {
      const deviceInfo = JSON.parse(localStorage.getItem("nextflow-device-info") || "{}");
      if (this.elements.settingsDeviceNameInput) {
        this.elements.settingsDeviceNameInput.value = (deviceInfo.label || "").replace(/\s*\([a-f0-9]{4}\)$/i, "");
      }
      if (this.elements.settingsDeviceIdSuffix && deviceInfo.id) {
        this.elements.settingsDeviceIdSuffix.textContent = `(${deviceInfo.id.slice(-4)})`;
      }
    } catch { /* ignore */ }
    const themesList = this.elements.settingsThemesList;
    const featureFlagsList = this.elements.settingsFeatureFlagsList;
    const contextsList = this.elements.settingsContextsList;
    const peopleList = this.elements.settingsPeopleList;
    const areasList = this.elements.settingsAreasList;
    if (!themesList || !featureFlagsList || !contextsList || !peopleList || !areasList) return;
    const contexts = this.taskManager.getContexts();
    const peopleTags = this.taskManager.getPeopleTagOptions();
    const areas = this.taskManager.getAreasOfFocus();
    const usage = this.buildSettingsUsageCounts();
    const contextOptionsWithAreas = this.taskManager.getContextOptionsWithAreas();
    const peopleTagOptionsWithAreas = this.taskManager.getPeopleTagOptionsWithAreas();
    const contextAreasData = areas.length
      ? { all: areas, byItem: new Map(contextOptionsWithAreas.map((o) => [o.name, o.areas])) }
      : null;
    const peopleAreasData = areas.length
      ? { all: areas, byItem: new Map(peopleTagOptionsWithAreas.map((o) => [o.name, o.areas])) }
      : null;

    if (this.selectedSettingsContext && !contexts.includes(this.selectedSettingsContext)) {
      this.selectedSettingsContext = null;
    }
    this.renderThemeSettings(themesList);
    this.renderFeatureFlagSettings(featureFlagsList);
    this.renderSettingsList(contextsList, contexts, "context", usage.contexts, contextAreasData);
    this.renderSettingsList(peopleList, peopleTags, "people", usage.people, peopleAreasData);
    this.renderSettingsList(areasList, areas, "area", usage.areas);
  },

  renderThemeSettings(container) {
    container.innerHTML = "";
    const activeTheme = this.taskManager.getTheme();
    const customTheme = this.taskManager.getCustomTheme();
    const customPalettes = this.taskManager.getCustomThemePalettes();
    THEME_OPTIONS.forEach((theme) => {
      const item = document.createElement("li");
      item.className = "settings-item settings-theme-option";
      if (theme.id === activeTheme) {
        item.classList.add("is-selected");
      }

      const label = document.createElement("label");
      label.className = "settings-theme-label";
      label.setAttribute("for", `theme-option-${theme.id}`);

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "dashboardTheme";
      input.id = `theme-option-${theme.id}`;
      input.value = theme.id;
      input.checked = theme.id === activeTheme;
      input.addEventListener("change", () => {
        if (!input.checked) return;
        this.taskManager.updateTheme(theme.id);
      });

      const textWrap = document.createElement("span");
      textWrap.className = "settings-theme-copy";
      const title = document.createElement("strong");
      title.textContent = `${theme.icon} ${theme.label}`;
      const detail = document.createElement("span");
      detail.className = "settings-item-meta muted small-text";
      detail.textContent = theme.description;
      textWrap.append(title, detail);

      const swatches = document.createElement("span");
      swatches.className = "settings-theme-swatches";
      const colors = theme.id === "custom"
        ? [customTheme.canvas, customTheme.accent, customTheme.signal]
        : Array.isArray(theme.swatches)
          ? theme.swatches.slice(0, 3)
          : [];
      colors.forEach((color) => {
        const swatch = document.createElement("span");
        swatch.className = "settings-theme-swatch";
        swatch.style.setProperty("--swatch-color", color);
        swatches.append(swatch);
      });

      label.append(input, textWrap, swatches);
      item.append(label);
      if (theme.id === "custom") {
        const customColorsHeading = document.createElement("p");
        customColorsHeading.className = "settings-subgroup-heading settings-theme-custom-controls-heading";
        customColorsHeading.textContent = "Custom Colors";
        item.append(customColorsHeading);
        const controls = document.createElement("div");
        controls.className = "settings-theme-custom-controls";
        const customFields = [
          { key: "canvas", label: "Canvas" },
          { key: "accent", label: "Accent" },
          { key: "signal", label: "Highlight" },
        ];
        customFields.forEach((field) => {
          const colorField = document.createElement("label");
          colorField.className = "settings-theme-color-field";
          colorField.setAttribute("for", `theme-custom-${field.key}`);
          const fieldText = document.createElement("span");
          fieldText.className = "small-text muted";
          fieldText.textContent = field.label;
          const colorInput = document.createElement("input");
          colorInput.type = "color";
          colorInput.id = `theme-custom-${field.key}`;
          const initialHex = normalizeThemeHexInput(customTheme[field.key]) || "#000000";
          colorInput.value = initialHex;
          const hexInput = document.createElement("input");
          hexInput.type = "text";
          hexInput.inputMode = "text";
          hexInput.autocomplete = "off";
          hexInput.spellcheck = false;
          hexInput.id = `theme-custom-${field.key}-hex`;
          hexInput.className = "settings-theme-hex-input";
          hexInput.placeholder = "#000000";
          hexInput.pattern = "^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$";
          hexInput.value = initialHex;

          const applyThemeHexValue = (raw) => {
            const normalized = normalizeThemeHexInput(raw);
            const savedHex = normalizeThemeHexInput(this.taskManager.getCustomTheme()[field.key]) || "#000000";
            if (!normalized) {
              hexInput.value = savedHex;
              colorInput.value = savedHex;
              return;
            }
            hexInput.value = normalized;
            colorInput.value = normalized;
            if (normalized !== savedHex) {
              this.taskManager.updateCustomTheme({ [field.key]: normalized });
            }
          };

          colorInput.addEventListener("change", () => {
            applyThemeHexValue(colorInput.value);
          });
          hexInput.addEventListener("change", () => {
            applyThemeHexValue(hexInput.value);
          });
          hexInput.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            applyThemeHexValue(hexInput.value);
            hexInput.blur();
          });
          colorField.append(fieldText, colorInput, hexInput);
          controls.append(colorField);
        });
        const paletteManager = document.createElement("section");
        paletteManager.className = "settings-theme-palette-manager";
        const paletteSaveRow = document.createElement("div");
        paletteSaveRow.className = "settings-theme-palette-save-row";
        const paletteNameInput = document.createElement("input");
        paletteNameInput.type = "text";
        paletteNameInput.className = "settings-theme-palette-name";
        paletteNameInput.placeholder = "Palette name";
        paletteNameInput.maxLength = 40;
        paletteNameInput.value = this.customPaletteDraftName;
        paletteNameInput.addEventListener("input", () => {
          this.customPaletteDraftName = paletteNameInput.value;
        });

        const savePaletteButton = document.createElement("button");
        savePaletteButton.type = "button";
        savePaletteButton.className = "btn btn-light btn-small";
        savePaletteButton.textContent = "Save Palette";
        const handlePaletteSave = () => {
          const draftName = this.customPaletteDraftName;
          this.customPaletteDraftName = "";
          const saved = this.taskManager.saveCustomThemePalette(draftName);
          if (!saved) {
            this.customPaletteDraftName = draftName;
          }
          if (paletteNameInput.isConnected) {
            paletteNameInput.value = this.customPaletteDraftName;
          }
        };
        savePaletteButton.addEventListener("click", handlePaletteSave);
        paletteNameInput.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          handlePaletteSave();
        });
        paletteSaveRow.append(paletteNameInput, savePaletteButton);

        const paletteMeta = document.createElement("p");
        paletteMeta.className = "settings-theme-palette-meta muted small-text";
        const paletteCount = customPalettes.length;
        paletteMeta.textContent = `${paletteCount} saved palette${paletteCount === 1 ? "" : "s"}`;

        const paletteList = document.createElement("ul");
        paletteList.className = "settings-list settings-theme-palette-list";
        paletteList.setAttribute("role", "list");
        if (!customPalettes.length) {
          const empty = document.createElement("li");
          empty.className = "muted small-text";
          empty.textContent = "No saved palettes yet.";
          paletteList.append(empty);
        } else {
          customPalettes.forEach((palette) => {
            const paletteItem = document.createElement("li");
            paletteItem.className = "settings-item settings-theme-palette-item";

            const main = document.createElement("div");
            main.className = "settings-item-main";
            const labelWrap = document.createElement("div");
            labelWrap.className = "settings-item-label";
            const label = document.createElement("span");
            label.textContent = palette.name;
            const detail = document.createElement("span");
            detail.className = "settings-item-meta muted small-text";
            detail.textContent = palette.updatedAt
              ? `Updated ${formatFriendlyDate(palette.updatedAt)}`
              : "Saved palette";
            labelWrap.append(label, detail);

            const actions = document.createElement("div");
            actions.className = "settings-item-actions";
            const applyButton = document.createElement("button");
            applyButton.type = "button";
            applyButton.className = "btn btn-light btn-small";
            applyButton.textContent = "Apply";
            applyButton.addEventListener("click", () => {
              this.taskManager.applyCustomThemePalette(palette.id);
            });

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "btn btn-danger btn-small";
            deleteButton.textContent = "Delete";
            deleteButton.addEventListener("click", async () => {
              const confirmed = await this.showConfirm(`Delete palette "${palette.name}"?`, { title: "Delete palette", okLabel: "Delete", danger: true });
              if (!confirmed) return;
              this.taskManager.deleteCustomThemePalette(palette.id);
            });

            actions.append(applyButton, deleteButton);
            main.append(labelWrap, actions);

            const swatchesRow = document.createElement("div");
            swatchesRow.className = "settings-theme-swatches";
            [palette.customTheme.canvas, palette.customTheme.accent, palette.customTheme.signal].forEach((color) => {
              const swatch = document.createElement("span");
              swatch.className = "settings-theme-swatch";
              swatch.style.setProperty("--swatch-color", color);
              swatchesRow.append(swatch);
            });
            paletteItem.append(main, swatchesRow);
            paletteList.append(paletteItem);
          });
        }

        paletteManager.append(paletteSaveRow, paletteMeta, paletteList);
        item.append(controls);
        item.append(paletteManager);
      }
      container.append(item);
    });
  },

  renderFeatureFlagSettings(container) {
    container.innerHTML = "";
    const flags = this.taskManager.getFeatureFlags();
    const entries = [
      {
        key: "showDaysSinceTouched",
        label: "Show Days Since Touched",
        description: "Display how many days ago each task was last updated on task cards.",
      },
      {
        key: "highlightStaleTasks",
        label: "Highlight stale tasks",
        description: "Color task rows by last-updated age (days/weeks/months).",
        renderConfig: (configPanel) => this.renderStaleTaskThresholdConfig(configPanel),
      },
      {
        key: "googleCalendarEnabled",
        label: "Google Calendar Sync",
        description: "Mirror tasks with dates to a Google Calendar.",
        renderConfig: (configPanel) => this.renderGoogleCalendarConfig(configPanel),
      },
      {
        key: "confirmOnCompletion",
        label: "Confirm on completion",
        description: "Show a confirmation prompt before marking any task complete.",
      },
    ];
    entries.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "settings-item settings-item--block";
      const main = document.createElement("div");
      main.className = "settings-item-main";
      const labelWrap = document.createElement("div");
      labelWrap.className = "settings-item-label";
      const label = document.createElement("span");
      label.textContent = entry.label;
      const meta = document.createElement("span");
      meta.className = "settings-item-meta muted small-text";
      meta.textContent = entry.description;
      labelWrap.append(label, meta);
      const actions = document.createElement("div");
      actions.className = "settings-item-actions";
      const toggle = document.createElement("label");
      toggle.className = "toggle-switch";
      toggle.setAttribute("for", `feature-flag-${entry.key}`);
      toggle.setAttribute("title", entry.label);
      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = `feature-flag-${entry.key}`;
      input.checked = Boolean(flags[entry.key]);
      input.dataset.featureFlag = entry.key;
      const track = document.createElement("span");
      track.className = "toggle-switch-track";
      track.setAttribute("aria-hidden", "true");
      input.addEventListener("change", () => {
        if (configPanel) configPanel.hidden = !input.checked;
      });
      toggle.append(input, track);
      actions.append(toggle);
      main.append(labelWrap, actions);
      item.append(main);
      let configPanel = null;
      if (entry.renderConfig) {
        configPanel = document.createElement("div");
        configPanel.className = "feature-flag-config-panel";
        configPanel.hidden = !input.checked;
        entry.renderConfig(configPanel);
        item.append(configPanel);
      }
      container.append(item);
    });

    // Standalone config item: future due date threshold (no boolean toggle — 0 disables)
    const futureDueItem = document.createElement("li");
    futureDueItem.className = "settings-item settings-item--block";
    const futureDueMain = document.createElement("div");
    futureDueMain.className = "settings-item-main";
    const futureDueLabelWrap = document.createElement("div");
    futureDueLabelWrap.className = "settings-item-label";
    const futureDueLabel = document.createElement("span");
    futureDueLabel.textContent = "Hide far-future due dates from Pending Tasks";
    const futureDueMeta = document.createElement("span");
    futureDueMeta.className = "settings-item-meta muted small-text";
    futureDueMeta.textContent =
      'Tasks with a due date beyond this many days are hidden when "Hide scheduled items" is on. Set to 0 to disable.';
    futureDueLabelWrap.append(futureDueLabel, futureDueMeta);
    futureDueMain.append(futureDueLabelWrap);
    futureDueItem.append(futureDueMain);
    const futureDueConfigPanel = document.createElement("div");
    futureDueConfigPanel.className = "feature-flag-config-panel";
    futureDueConfigPanel.hidden = false;
    this.renderFutureDueThresholdConfig(futureDueConfigPanel);
    futureDueItem.append(futureDueConfigPanel);
    container.append(futureDueItem);
  },

  renderFutureDueThresholdConfig(panel) {
    if (!panel) return;
    panel.innerHTML = "";

    const thresholds = this.taskManager.getStaleTaskThresholds();
    const fieldWrap = document.createElement("label");
    fieldWrap.className = "feature-flag-config-field";

    const lbl = document.createElement("span");
    lbl.className = "feature-flag-config-label";
    lbl.textContent = "Days ahead (0 = disabled)";

    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "365";
    input.step = "1";
    input.value = String(thresholds.futureDueDaysThreshold);
    input.dataset.staleThresholdKey = "futureDueDaysThreshold";

    input.addEventListener("change", () => {
      const parsed = Number.parseInt(input.value, 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        this.taskManager.updateStaleTaskThresholds({ futureDueDaysThreshold: parsed });
      }
    });

    fieldWrap.append(lbl, input);
    panel.append(fieldWrap);
  },

  renderStaleTaskThresholdConfig(panel) {
    if (!panel) return;
    panel.innerHTML = "";

    const thresholds = this.taskManager.getStaleTaskThresholds();
    const fields = [
      { key: "warn", label: "Warn (days)", hint: "First stale trigger." },
      { key: "stale", label: "Stale (days)", hint: "Moderate stale highlight." },
      { key: "old", label: "Old (days)", hint: "Stronger stale highlight." },
      { key: "ancient", label: "Ancient (days)", hint: "Critical stale highlight." },
    ];

    fields.forEach((field) => {
      const fieldWrap = document.createElement("label");
      fieldWrap.className = "feature-flag-config-field";

      const lbl = document.createElement("span");
      lbl.className = "feature-flag-config-label";
      lbl.textContent = field.label;

      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.max = "365";
      input.step = "1";
      input.value = String(thresholds[field.key]);
      input.dataset.staleThresholdKey = field.key;

      const hint = document.createElement("span");
      hint.className = "settings-item-meta muted small-text";
      hint.textContent = field.hint;

      input.addEventListener("change", () => {
        this.updateStaleTaskThresholdsFromPanel(panel);
      });

      fieldWrap.append(lbl, input, hint);
      panel.append(fieldWrap);
    });

    const note = document.createElement("p");
    note.className = "muted small-text";
    note.textContent = "Thresholds must be strictly increasing (warn < stale < old < ancient).";
    panel.append(note);
  },

  renderGoogleCalendarConfig(panel) {
    const cfg = this.taskManager.getGoogleCalendarConfig();

    const makeField = (labelText, input) => {
      const wrap = document.createElement("label");
      wrap.className = "feature-flag-config-field";
      const lbl = document.createElement("span");
      lbl.className = "feature-flag-config-label";
      lbl.textContent = labelText;
      wrap.append(lbl, input);
      return wrap;
    };

    // --- Credentials section ---
    const credsStatus = document.createElement("p");
    credsStatus.className = "feature-flag-config-hint gcal-creds-status";
    credsStatus.textContent = "Checking credentials…";

    const credsTextarea = document.createElement("textarea");
    credsTextarea.className = "gcal-creds-input";
    credsTextarea.placeholder = "Paste service account JSON here…";
    credsTextarea.rows = 5;
    credsTextarea.spellcheck = false;

    const credsBtnRow = document.createElement("div");
    credsBtnRow.className = "gcal-creds-actions";

    const credsSaveBtn = document.createElement("button");
    credsSaveBtn.type = "button";
    credsSaveBtn.className = "btn btn-light";
    credsSaveBtn.textContent = "Save Credentials";

    const credsRemoveBtn = document.createElement("button");
    credsRemoveBtn.type = "button";
    credsRemoveBtn.className = "btn btn-light";
    credsRemoveBtn.textContent = "Remove";
    credsRemoveBtn.hidden = true;

    const updateCredsStatus = (configured, clientEmail) => {
      if (configured) {
        credsStatus.textContent = `Credentials configured — ${clientEmail || "service account"}`;
        credsStatus.dataset.state = "ok";
        credsRemoveBtn.hidden = false;
        credsTextarea.value = "";
        credsTextarea.placeholder = "Paste new service account JSON to replace…";
      } else {
        credsStatus.textContent = "No credentials configured.";
        credsStatus.dataset.state = "warn";
        credsRemoveBtn.hidden = true;
        credsTextarea.placeholder = "Paste service account JSON here…";
      }
    };

    fetch("/credentials/google", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => updateCredsStatus(d.configured, d.clientEmail))
      .catch(() => updateCredsStatus(false, null));

    credsSaveBtn.addEventListener("click", async () => {
      const raw = credsTextarea.value.trim();
      if (!raw) {
        this.showToast("warn", "Paste service account JSON before saving.");
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        this.showToast("error", "Invalid JSON — check the pasted credentials.");
        return;
      }
      try {
        const resp = await fetch("/credentials/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        });
        const data = await resp.json();
        if (!resp.ok) {
          this.showToast("error", data.error || "Failed to save credentials.");
          return;
        }
        updateCredsStatus(true, data.clientEmail);
        this.showToast("ok", "Google credentials saved.");
      } catch {
        this.showToast("error", "Could not reach server.");
      }
    });

    credsRemoveBtn.addEventListener("click", async () => {
      try {
        const resp = await fetch("/credentials/google", { method: "DELETE" });
        if (!resp.ok) {
          this.showToast("error", "Failed to remove credentials.");
          return;
        }
        updateCredsStatus(false, null);
        this.showToast("ok", "Google credentials removed.");
      } catch {
        this.showToast("error", "Could not reach server.");
      }
    });

    credsBtnRow.append(credsSaveBtn, credsRemoveBtn);

    // --- Calendar config section ---
    const calendarIdInput = document.createElement("input");
    calendarIdInput.type = "text";
    calendarIdInput.placeholder = "e.g. you@gmail.com";
    calendarIdInput.value = cfg.calendarId;

    const timezoneInput = document.createElement("select");
    Intl.supportedValuesOf("timeZone").forEach((tz) => {
      const opt = document.createElement("option");
      opt.value = tz;
      opt.textContent = tz;
      if (tz === (cfg.timezone || "UTC")) opt.selected = true;
      timezoneInput.append(opt);
    });

    const durationInput = document.createElement("input");
    durationInput.type = "number";
    durationInput.min = "5";
    durationInput.step = "5";
    durationInput.placeholder = "60";
    durationInput.value = cfg.defaultDurationMinutes;

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn-light";
    saveBtn.textContent = "Save Settings";
    saveBtn.addEventListener("click", () => {
      const duration = parseInt(durationInput.value, 10);
      this.taskManager.updateGoogleCalendarConfig({
        calendarId: calendarIdInput.value.trim(),
        timezone: timezoneInput.value.trim() || "UTC",
        defaultDurationMinutes: Number.isFinite(duration) && duration >= 5 ? duration : 60,
      });
      this.showToast("ok", "Google Calendar settings saved.");
    });

    panel.append(
      credsStatus,
      makeField("Service Account JSON", credsTextarea),
      credsBtnRow,
      makeField("Calendar ID", calendarIdInput),
      makeField("Timezone (IANA)", timezoneInput),
      makeField("Default event duration (minutes)", durationInput),
      saveBtn,
    );
  },

  buildSettingsUsageCounts() {
    const activeTasks = this.taskManager.getTasks({ includeCompleted: false });
    const inactiveTasks = this.taskManager.getCompletedTasks();
    const completedProjects = this.taskManager.getCompletedProjects();
    const areaByProjectId = new Map();
    (this.projectCache || []).forEach((project) => {
      if (project?.id && project?.areaOfFocus) {
        areaByProjectId.set(project.id, project.areaOfFocus);
      }
    });
    completedProjects.forEach((entry) => {
      if (entry?.id && entry?.snapshot?.areaOfFocus) {
        areaByProjectId.set(entry.id, entry.snapshot.areaOfFocus);
      }
    });
    const contexts = new Map();
    const people = new Map();
    const areas = new Map();

    const bump = (map, key, bucket) => {
      if (!key) return;
      const current = map.get(key) || { active: 0, inactive: 0 };
      current[bucket] += 1;
      map.set(key, current);
    };

    activeTasks.forEach((task) => {
      (task.contexts?.length ? task.contexts : [null]).forEach((ctx) => bump(contexts, ctx, "active"));
      bump(people, task.peopleTag, "active");
      bump(areas, this.getTaskAreaOfFocus(task), "active");
    });
    inactiveTasks.forEach((task) => {
      (task.contexts?.length ? task.contexts : [null]).forEach((ctx) => bump(contexts, ctx, "inactive"));
      bump(people, task.peopleTag, "inactive");
      const area =
        task.projectId
          ? areaByProjectId.get(task.projectId) || "No Area"
          : (typeof task.areaOfFocus === "string" && task.areaOfFocus.trim() ? task.areaOfFocus.trim() : "No Area");
      bump(areas, area, "inactive");
    });

    return { contexts, people, areas };
  },

  renderSettingsList(container, values, type, usageMap = new Map(), areasData = null) {
    container.innerHTML = "";
    if (!values.length) {
      const empty = document.createElement("li");
      empty.className = "muted small-text";
      empty.textContent = "No values yet.";
      container.append(empty);
      return;
    }
    values.forEach((value) => {
      const item = document.createElement("li");
      item.className = "settings-item";
      item.dataset.settingsType = type;
      item.dataset.settingsValue = value;
      if (type === "context" && value === this.selectedSettingsContext) {
        item.classList.add("is-selected");
      }
      const main = document.createElement("div");
      main.className = "settings-item-main";

      const labelWrap = document.createElement("div");
      labelWrap.className = "settings-item-label";
      const label = document.createElement("span");
      label.textContent = (type === "context" || type === "people") ? stripTagPrefix(value) : value;
      const meta = document.createElement("span");
      meta.className = "settings-item-meta muted small-text";
      const usage = usageMap.get(value) || { active: 0, inactive: 0 };
      meta.textContent =
        `${usage.active} active task${usage.active === 1 ? "" : "s"} • ` +
        `${usage.inactive} inactive task${usage.inactive === 1 ? "" : "s"}`;
      labelWrap.append(label, meta);
      const actions = document.createElement("div");
      actions.className = "settings-item-actions";

      const renameButton = document.createElement("button");
      renameButton.type = "button";
      renameButton.className = "btn btn-light btn-small";
      renameButton.textContent = "Rename";
      renameButton.dataset.settingsAction = "rename";
      renameButton.dataset.settingsType = type;
      renameButton.dataset.settingsValue = value;

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "btn btn-danger btn-small";
      deleteButton.textContent = "Delete";
      deleteButton.dataset.settingsAction = "delete";
      deleteButton.dataset.settingsType = type;
      deleteButton.dataset.settingsValue = value;

      // Area assignment chips — rendered inline between label and actions
      // Show chips for all contexts/people items when areas exist, even if the
      // item was added via a task (not yet in settings.contextOptions) and thus
      // absent from byItem. In that case assignedAreas defaults to [].
      if (areasData && areasData.all.length) {
        const assignedAreas = areasData.byItem.get(value) || [];
        const chipGroup = document.createElement("div");
        chipGroup.className = "settings-item-areas";
        areasData.all.forEach((area) => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "settings-area-chip";
          chip.textContent = area;
          chip.dataset.settingsAction = "toggle-area";
          chip.dataset.settingsType = type;
          chip.dataset.settingsValue = value;
          chip.dataset.settingsArea = area;
          chip.title = assignedAreas.includes(area)
            ? `Remove from ${area}`
            : `Assign to ${area}`;
          if (assignedAreas.includes(area)) chip.classList.add("is-assigned");
          chipGroup.append(chip);
        });
        main.append(labelWrap, chipGroup, actions);
      } else {
        main.append(labelWrap, actions);
      }
      item.append(main);

      if (type === "context" && value === this.selectedSettingsContext) {
        item.append(this.renderSettingsContextTasksInline(value));
      }
      container.append(item);
    });
  },

  renderSettingsContextTasksInline(context) {
    const wrapper = document.createElement("section");
    wrapper.className = "settings-context-inline";

    const header = document.createElement("header");
    header.className = "settings-context-header";
    const title = document.createElement("h4");
    title.textContent = `Tasks in ${stripTagPrefix(context)}`;
    const meta = document.createElement("p");
    meta.className = "muted small-text";

    const activeTasks = this.taskManager
      .getTasks({ includeCompleted: false })
      .filter((task) => task.contexts?.includes(context))
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    const inactiveTasks = this.taskManager
      .getCompletedTasks({ context })
      .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
    meta.textContent =
      `${activeTasks.length} active task${activeTasks.length === 1 ? "" : "s"} • ` +
      `${inactiveTasks.length} inactive task${inactiveTasks.length === 1 ? "" : "s"}`;
    header.append(title, meta);
    wrapper.append(header);

    if (!activeTasks.length && !inactiveTasks.length) {
      const empty = document.createElement("p");
      empty.className = "muted small-text";
      empty.textContent = "No tasks currently use this context.";
      wrapper.append(empty);
      return wrapper;
    }

    const contexts = this.taskManager.getContexts();
    if (activeTasks.length) {
      const activeTitle = document.createElement("p");
      activeTitle.className = "settings-context-group-label muted small-text";
      activeTitle.textContent = "Active tasks";
      wrapper.append(activeTitle);

      const activeList = document.createElement("ul");
      activeList.className = "settings-list";
      activeList.setAttribute("role", "list");
      activeTasks.forEach((task) => {
        const item = document.createElement("li");
        item.className = "settings-item settings-task-row";

        const top = document.createElement("div");
        top.className = "settings-task-row-top";
        const taskTitle = document.createElement("strong");
        taskTitle.textContent = task.title;
        const status = document.createElement("span");
        status.className = "muted small-text";
        status.textContent = STATUS_LABELS[task.status] || task.status;
        top.append(taskTitle, status);

        const actions = document.createElement("div");
        actions.className = "settings-task-actions";
        const select = document.createElement("select");
        select.dataset.settingsTaskId = task.id;
        select.dataset.settingsContextFrom = context;
        contexts.forEach((value) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          if (value === context) {
            option.selected = true;
          }
          select.append(option);
        });

        const openButton = document.createElement("button");
        openButton.type = "button";
        openButton.className = "btn btn-light btn-small";
        openButton.textContent = "Open";
        openButton.addEventListener("click", (event) => {
          event.stopPropagation();
          this.openTaskFlyout(task.id);
        });

        actions.append(select, openButton);
        item.append(top, actions);
        activeList.append(item);
      });
      wrapper.append(activeList);
    }

    if (inactiveTasks.length) {
      const inactiveTitle = document.createElement("p");
      inactiveTitle.className = "settings-context-group-label muted small-text";
      inactiveTitle.textContent = "Inactive tasks";
      wrapper.append(inactiveTitle);

      const inactiveList = document.createElement("ul");
      inactiveList.className = "settings-list";
      inactiveList.setAttribute("role", "list");
      inactiveTasks.forEach((entry) => {
        const item = document.createElement("li");
        item.className = "settings-item settings-task-row";

        const top = document.createElement("div");
        top.className = "settings-task-row-top";
        const taskTitle = document.createElement("strong");
        taskTitle.textContent = entry.title || "Completed task";
        const completed = document.createElement("span");
        completed.className = "muted small-text";
        completed.textContent = entry.completedAt
          ? `Completed ${formatFriendlyDate(entry.completedAt)}`
          : "Completed";
        top.append(taskTitle, completed);

        const actions = document.createElement("div");
        actions.className = "settings-task-actions";

        const select = document.createElement("select");
        select.dataset.settingsCompletedTaskId = entry.id;
        select.dataset.settingsContextFrom = context;
        contexts.forEach((value) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          if (value === context) {
            option.selected = true;
          }
          select.append(option);
        });

        const openButton = document.createElement("button");
        openButton.type = "button";
        openButton.className = "btn btn-light btn-small";
        openButton.textContent = "Open";
        openButton.addEventListener("click", (event) => {
          event.stopPropagation();
          this.openTaskFlyout(entry, { readOnly: true, entry });
        });

        actions.append(select, openButton);
        item.append(top, actions);
        inactiveList.append(item);
      });
      wrapper.append(inactiveList);
    }

    return wrapper;
  },
};

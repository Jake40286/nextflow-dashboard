---
description: Step-by-step checklist for adding a new panel to the NextFlow UI
---

## Usage
`/add-panel <PANEL_NAME_AND_PURPOSE>`

## Context
New panel to add: $ARGUMENTS

## Required Steps (in order)

### 1. Register the panel in `PANEL_RENDER_FNS` (`ui.js`)
`PANEL_RENDER_FNS` is a frozen map of `panel-id → render method name`. Adding a panel without an entry here means it will never render.

```js
// Find the frozen object and add your entry:
'my-panel': 'renderMyPanel',
```

### 2. Add the render method to `UIController` (`ui.js`)
```js
renderMyPanel() {
  // Read state only through TaskManager methods — never mutate here
  const container = this.elements.myPanelContainer;
  // ... render logic
}
```

### 3. Add the HTML panel element (`app/web_ui/index.html`)
- Add a `<section id="my-panel" class="panel" ...>` matching the key in `PANEL_RENDER_FNS`
- Add a nav button if the panel should appear in the sidebar

### 4. Cache the container element in `cacheElements()` (`ui.js`)
All DOM references must go through `this.elements.*` — never query the DOM inside render methods.

```js
myPanelContainer: document.getElementById('my-panel-container'),
```

### 5. Handle lazy data loading in `setActivePanel()` (`ui.js`)
If the panel needs data beyond `/state` (e.g. from `/completed` or `/feedback`), add a case:

```js
case 'my-panel':
  await this.taskManager.ensureCompletedLoaded(); // if completion data needed
  this._dirtyPanels.add('my-panel');
  this.renderPanel('my-panel');
  break;
```

### 6. Mark the panel dirty on `statechange`
`renderAll()` marks all panels in `_dirtyPanels` — confirm your panel-id is covered by the existing `markAllDirty()` call or add it explicitly if it has special conditions.

### 7. Add CSS (`app/web_ui/css/`)
Follow existing panel styles. No build step — changes are live immediately.

### 8. Tests
If the panel has non-trivial logic driven by `TaskManager`, add tests in `tests/taskManager.test.js`. No server or mock framework needed — set `manager.remoteSyncEnabled = false`.

## Key Files
- [app/web_ui/js/ui.js](app/web_ui/js/ui.js) — `PANEL_RENDER_FNS`, `cacheElements()`, `setActivePanel()`, `renderAll()`
- [app/web_ui/index.html](app/web_ui/index.html) — panel HTML and nav
- [app/web_ui/js/data.js](app/web_ui/js/data.js) — `ensureCompletedLoaded()` and other data helpers

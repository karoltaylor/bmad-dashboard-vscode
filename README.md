# BMAD Dashboard (VS Code)

Read-only JIRA-style dashboard for [BMAD method](https://github.com/bmad-method) projects, sourced directly from `_bmad-output/`.

The markdown and YAML files are the only source of truth. The extension never writes back — no sync, no drift.

## What it shows

- **Sidebar tree** (Activity Bar → BMAD): Epics → Stories → Acceptance Criteria + Tasks. Click a story to open its `.md`. Click a task to jump to the line in the file.
- **Kanban board** (Command Palette → `BMAD: Open Board`): five-column board (Backlog / Ready / In Progress / Review / Done), with epic rollups and per-story task progress.

## How it detects a BMAD project

The extension activates when a workspace folder contains:

```
_bmad-output/implementation-artifacts/sprint-status.yaml
```

Multi-root workspaces with several BMAD projects are supported — each appears as a project node.

## Files it reads

| File | What for |
| --- | --- |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Canonical epic + story status |
| `_bmad-output/implementation-artifacts/stories/story-N.M.md` | Title, AC list, tasks/subtasks, line numbers |
| `_bmad-output/planning-artifacts/epics.md` | Epic titles (`## Epic N: …` headers) |

## Running it from source

```powershell
cd bmad-dashboard-vscode
npm install
npm run compile
```

Then open this folder in VS Code and press **F5**. The included `launch.json` opens the sibling `bmad_step_by_step_SCRUM_Board` workspace in an Extension Development Host. The second launch config opens an empty EDH window so you can pick any folder.

## Auto-refresh

A `FileSystemWatcher` on `**/_bmad-output/**/*.{md,yaml,yml}` triggers a debounced reload (200 ms) whenever a BMAD agent or you edit a file. The tree and the board (if open) both update.

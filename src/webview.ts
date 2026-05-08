import * as vscode from 'vscode';
import { BmadProject, BmadStory, KANBAN_COLUMNS, StoryStatus } from './model';

interface BoardPayload {
  projects: SerializableProject[];
  generatedAt: string;
}

interface SerializableProject {
  projectName: string;
  generated: string | undefined;
  lastUpdated: string | undefined;
  epics: {
    number: number;
    title: string;
    status: StoryStatus;
    storyCount: number;
  }[];
  stories: SerializableStory[];
}

interface SerializableStory {
  id: string;
  epicNumber: number;
  storyNumber: number;
  title: string;
  status: StoryStatus;
  filePath: string | undefined;
  taskTotal: number;
  taskDone: number;
  acCount: number;
}

export class BmadBoardPanel {
  private static current: BmadBoardPanel | undefined;

  static createOrShow(extensionUri: vscode.Uri, projects: BmadProject[]): BmadBoardPanel {
    if (BmadBoardPanel.current) {
      BmadBoardPanel.current.panel.reveal(vscode.ViewColumn.Active);
      BmadBoardPanel.current.update(projects);
      return BmadBoardPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      'bmadDashboard.board',
      'BMAD Board',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    BmadBoardPanel.current = new BmadBoardPanel(panel, extensionUri);
    BmadBoardPanel.current.update(projects);
    return BmadBoardPanel.current;
  }

  static updateIfOpen(projects: BmadProject[]): void {
    BmadBoardPanel.current?.update(projects);
  }

  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri
  ) {
    this.panel.webview.html = renderHtml(this.panel.webview, extensionUri);
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables
    );
  }

  update(projects: BmadProject[]): void {
    const payload: BoardPayload = {
      projects: projects.map(serializeProject),
      generatedAt: new Date().toISOString(),
    };
    this.panel.webview.postMessage({ type: 'render', payload });
  }

  private handleMessage(msg: { type: string; [k: string]: unknown }): void {
    if (msg.type === 'openStory' && typeof msg.filePath === 'string') {
      vscode.commands.executeCommand('vscode.open', vscode.Uri.file(msg.filePath));
    } else if (msg.type === 'requestRefresh') {
      vscode.commands.executeCommand('bmadDashboard.refresh');
    }
  }

  private dispose(): void {
    BmadBoardPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      d?.dispose();
    }
  }
}

function serializeProject(p: BmadProject): SerializableProject {
  return {
    projectName: p.projectName,
    generated: p.generated,
    lastUpdated: p.lastUpdated,
    epics: p.epics.map((e) => ({
      number: e.number,
      title: e.title,
      status: e.status,
      storyCount: e.stories.length,
    })),
    stories: p.epics.flatMap((e) => e.stories.map(serializeStory)),
  };
}

function serializeStory(s: BmadStory): SerializableStory {
  return {
    id: s.id,
    epicNumber: s.epicNumber,
    storyNumber: s.storyNumber,
    title: s.title,
    status: s.status,
    filePath: s.filePath,
    taskTotal: s.taskCounts.total,
    taskDone: s.taskCounts.done,
    acCount: s.acCount,
  };
}

function renderHtml(webview: vscode.Webview, _extensionUri: vscode.Uri): string {
  const nonce = makeNonce();
  const cspSource = webview.cspSource;
  const columns = JSON.stringify(KANBAN_COLUMNS);
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<title>BMAD Board</title>
<style>
  :root {
    color-scheme: light dark;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    height: 100%;
  }
  body { display: flex; flex-direction: column; height: 100vh; }
  header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  header h1 {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
  }
  header .meta {
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
  }
  header .controls {
    margin-left: auto;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  header select, header input {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    padding: 4px 8px;
    font-family: inherit;
    font-size: 12px;
    border-radius: 2px;
  }
  header button {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    padding: 4px 10px;
    font-family: inherit;
    font-size: 12px;
    border-radius: 2px;
    cursor: pointer;
  }
  header button:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }
  .board {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(5, minmax(220px, 1fr));
    gap: 8px;
    padding: 12px;
    overflow: auto;
  }
  .column {
    background: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .column-header {
    padding: 8px 12px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .column-count {
    color: var(--vscode-descriptionForeground);
    font-weight: 400;
  }
  .column-body {
    padding: 8px;
    overflow-y: auto;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .card {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-left: 3px solid var(--card-accent, var(--vscode-panel-border));
    border-radius: 3px;
    padding: 8px 10px;
    cursor: pointer;
    transition: background 0.1s ease;
  }
  .card:hover {
    background: var(--vscode-list-hoverBackground);
  }
  .card .card-id {
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family);
  }
  .card .card-title {
    font-size: 12px;
    margin-top: 2px;
    line-height: 1.35;
  }
  .card .card-meta {
    margin-top: 6px;
    display: flex;
    gap: 10px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }
  .progress {
    height: 3px;
    background: var(--vscode-progressBar-background, transparent);
    border-radius: 2px;
    margin-top: 6px;
    overflow: hidden;
    opacity: 0.7;
  }
  .progress-fill {
    height: 100%;
    background: var(--vscode-charts-green, #4caf50);
  }
  .empty {
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    padding: 12px;
    text-align: center;
    font-style: italic;
  }
  .badge {
    display: inline-block;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
  }
  .status-done { --card-accent: var(--vscode-charts-green, #4caf50); }
  .status-in-progress { --card-accent: var(--vscode-charts-blue, #2196f3); }
  .status-review { --card-accent: var(--vscode-charts-purple, #9c27b0); }
  .status-ready-for-dev { --card-accent: var(--vscode-charts-yellow, #ffc107); }
  .status-backlog { --card-accent: var(--vscode-charts-foreground, #888); }
  .status-draft { --card-accent: var(--vscode-charts-orange, #ff9800); }
  .epic-rollup {
    padding: 0 16px 12px 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .epic-rollup .chip {
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 10px;
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-panel-border);
  }
</style>
</head>
<body>
  <header>
    <h1 id="project-name">BMAD Board</h1>
    <span class="meta" id="project-meta"></span>
    <div class="controls">
      <select id="epic-filter">
        <option value="">All epics</option>
      </select>
      <input id="search" type="search" placeholder="Search…" />
      <button id="refresh">Refresh</button>
    </div>
  </header>
  <div class="epic-rollup" id="epic-rollup"></div>
  <main class="board" id="board"></main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const COLUMNS = ${columns};
    let state = { projects: [], generatedAt: '' };
    let filterEpic = '';
    let filterText = '';

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg && msg.type === 'render') {
        state = msg.payload;
        renderAll();
      }
    });

    document.getElementById('refresh').addEventListener('click', () => {
      vscode.postMessage({ type: 'requestRefresh' });
    });
    document.getElementById('epic-filter').addEventListener('change', (e) => {
      filterEpic = e.target.value;
      renderBoard();
    });
    document.getElementById('search').addEventListener('input', (e) => {
      filterText = e.target.value.toLowerCase();
      renderBoard();
    });

    function renderAll() {
      const project = state.projects[0];
      if (!project) {
        document.getElementById('project-name').textContent = 'No BMAD project';
        document.getElementById('project-meta').textContent = '';
        document.getElementById('epic-rollup').innerHTML = '';
        document.getElementById('board').innerHTML = '<div class="empty">Open a workspace containing _bmad-output/.</div>';
        return;
      }
      document.getElementById('project-name').textContent = project.projectName;
      const metaParts = [];
      metaParts.push(project.epics.length + ' epics');
      metaParts.push(project.stories.length + ' stories');
      if (project.lastUpdated) metaParts.push('updated ' + project.lastUpdated);
      document.getElementById('project-meta').textContent = metaParts.join(' · ');

      const filterEl = document.getElementById('epic-filter');
      const currentValue = filterEl.value;
      filterEl.innerHTML = '<option value="">All epics</option>' +
        project.epics.map(e =>
          '<option value="' + e.number + '">Epic ' + e.number + ': ' + escapeHtml(e.title) + '</option>'
        ).join('');
      filterEl.value = currentValue;

      renderRollup(project);
      renderBoard();
    }

    function renderRollup(project) {
      const html = project.epics.map(e => {
        const stories = project.stories.filter(s => s.epicNumber === e.number);
        const done = stories.filter(s => s.status === 'done').length;
        return '<span class="chip">Epic ' + e.number + ' · ' + escapeHtml(statusLabel(e.status)) + ' · ' + done + '/' + stories.length + '</span>';
      }).join('');
      document.getElementById('epic-rollup').innerHTML = html;
    }

    function renderBoard() {
      const project = state.projects[0];
      if (!project) return;
      const stories = project.stories.filter(s => {
        if (filterEpic && String(s.epicNumber) !== filterEpic) return false;
        if (filterText) {
          const hay = (s.epicNumber + '.' + s.storyNumber + ' ' + s.title).toLowerCase();
          if (!hay.includes(filterText)) return false;
        }
        return true;
      });

      const buckets = {};
      for (const c of COLUMNS) buckets[c.key] = [];
      for (const s of stories) {
        const key = buckets[s.status] ? s.status : 'backlog';
        buckets[key].push(s);
      }

      const html = COLUMNS.map(col => {
        const items = (buckets[col.key] || []).sort((a, b) => {
          if (a.epicNumber !== b.epicNumber) return a.epicNumber - b.epicNumber;
          return a.storyNumber - b.storyNumber;
        });
        const cards = items.length === 0
          ? '<div class="empty">—</div>'
          : items.map(renderCard).join('');
        return (
          '<section class="column">' +
            '<div class="column-header">' +
              '<span>' + escapeHtml(col.label) + '</span>' +
              '<span class="column-count">' + items.length + '</span>' +
            '</div>' +
            '<div class="column-body">' + cards + '</div>' +
          '</section>'
        );
      }).join('');
      document.getElementById('board').innerHTML = html;

      document.querySelectorAll('.card').forEach(el => {
        el.addEventListener('click', () => {
          const filePath = el.getAttribute('data-file');
          if (filePath) {
            vscode.postMessage({ type: 'openStory', filePath });
          }
        });
      });
    }

    function renderCard(s) {
      const pct = s.taskTotal > 0 ? Math.round((s.taskDone / s.taskTotal) * 100) : 0;
      const taskMeta = s.taskTotal > 0 ? (s.taskDone + '/' + s.taskTotal + ' tasks') : '';
      const acMeta = s.acCount > 0 ? (s.acCount + ' AC') : '';
      const statusCls = 'status-' + s.status;
      const fileAttr = s.filePath ? ' data-file="' + escapeAttr(s.filePath) + '"' : '';
      const progress = s.taskTotal > 0
        ? '<div class="progress"><div class="progress-fill" style="width:' + pct + '%"></div></div>'
        : '';
      return (
        '<article class="card ' + statusCls + '"' + fileAttr + '>' +
          '<div class="card-id">' + s.epicNumber + '.' + s.storyNumber + '</div>' +
          '<div class="card-title">' + escapeHtml(s.title) + '</div>' +
          '<div class="card-meta">' +
            (taskMeta ? '<span>' + taskMeta + '</span>' : '') +
            (acMeta ? '<span>' + acMeta + '</span>' : '') +
          '</div>' +
          progress +
        '</article>'
      );
    }

    function statusLabel(s) {
      if (s === 'in-progress') return 'In Progress';
      if (s === 'ready-for-dev') return 'Ready';
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function escapeAttr(s) { return escapeHtml(s); }
  </script>
</body>
</html>`;
}

function makeNonce(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

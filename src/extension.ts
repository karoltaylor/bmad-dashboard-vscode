import * as vscode from 'vscode';
import { loadProjectsForWorkspace } from './parser';
import { BmadTreeProvider } from './treeView';
import { BmadBoardPanel } from './webview';

let treeProvider: BmadTreeProvider | undefined;
let refreshTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext): void {
  treeProvider = new BmadTreeProvider();

  const treeView = vscode.window.createTreeView('bmadDashboard.tree', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  const refresh = () => {
    if (!treeProvider) {
      return;
    }
    const projects = loadProjectsForWorkspace();
    treeProvider.setProjects(projects);
    BmadBoardPanel.updateIfOpen(projects);
    updateTreeViewMeta(treeView, projects);
  };

  const scheduleRefresh = () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(refresh, 200);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('bmadDashboard.refresh', () => refresh()),
    vscode.commands.registerCommand('bmadDashboard.openBoard', () => {
      const projects = loadProjectsForWorkspace();
      BmadBoardPanel.createOrShow(context.extensionUri, projects);
    }),
    vscode.commands.registerCommand(
      'bmadDashboard.openFile',
      async (filePath: string, line?: number) => {
        if (typeof filePath !== 'string') {
          return;
        }
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        const editor = await vscode.window.showTextDocument(doc);
        if (typeof line === 'number') {
          const pos = new vscode.Position(line, 0);
          editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
          editor.selection = new vscode.Selection(pos, pos);
        }
      }
    )
  );

  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/_bmad-output/**/*.{md,yaml,yml}'
  );
  watcher.onDidChange(scheduleRefresh);
  watcher.onDidCreate(scheduleRefresh);
  watcher.onDidDelete(scheduleRefresh);
  context.subscriptions.push(watcher);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(scheduleRefresh)
  );

  refresh();
}

export function deactivate(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = undefined;
  }
  treeProvider = undefined;
}

function updateTreeViewMeta(
  treeView: vscode.TreeView<unknown>,
  projects: { projectName: string; epics: { stories: unknown[] }[]; lastUpdated: string | undefined }[]
): void {
  if (projects.length === 0) {
    treeView.message = 'No _bmad-output/ folder detected in this workspace.';
    treeView.title = 'BMAD';
    return;
  }
  treeView.message = undefined;
  if (projects.length === 1) {
    const p = projects[0];
    const totalStories = p.epics.reduce((acc, e) => acc + e.stories.length, 0);
    treeView.title = `BMAD · ${p.projectName}`;
    treeView.description = p.lastUpdated
      ? `${totalStories} stories · ${p.lastUpdated}`
      : `${totalStories} stories`;
  } else {
    treeView.title = 'BMAD';
    treeView.description = `${projects.length} projects`;
  }
}

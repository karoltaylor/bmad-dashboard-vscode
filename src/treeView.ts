import * as vscode from 'vscode';
import { BmadDeferredItem, BmadEpic, BmadProject, BmadStory, BmadTask, StoryStatus } from './model';

type TreeNode =
  | { kind: 'project'; project: BmadProject }
  | { kind: 'epic'; project: BmadProject; epic: BmadEpic }
  | { kind: 'epicSummary'; project: BmadProject; epic: BmadEpic }
  | { kind: 'story'; project: BmadProject; epic: BmadEpic; story: BmadStory }
  | { kind: 'acGroup'; story: BmadStory }
  | { kind: 'ac'; index: number; text: string }
  | { kind: 'task'; task: BmadTask; storyFile: string | undefined }
  | { kind: 'deferredGroup'; story: BmadStory; deferredFile: string | undefined }
  | { kind: 'deferred'; item: BmadDeferredItem; deferredFile: string | undefined }
  | { kind: 'message'; text: string; icon?: vscode.ThemeIcon };

export class BmadTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _changeEmitter = new vscode.EventEmitter<TreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._changeEmitter.event;

  private projects: BmadProject[] = [];

  setProjects(projects: BmadProject[]): void {
    this.projects = projects;
    this._changeEmitter.fire();
  }

  refresh(): void {
    this._changeEmitter.fire();
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    switch (node.kind) {
      case 'message': {
        const item = new vscode.TreeItem(node.text, vscode.TreeItemCollapsibleState.None);
        item.iconPath = node.icon ?? new vscode.ThemeIcon('info');
        return item;
      }
      case 'project': {
        const item = new vscode.TreeItem(
          node.project.projectName,
          vscode.TreeItemCollapsibleState.Expanded
        );
        item.description = projectDescription(node.project);
        item.tooltip = projectTooltip(node.project);
        item.iconPath = new vscode.ThemeIcon('repo');
        item.contextValue = 'bmadProject';
        return item;
      }
      case 'epic': {
        const stories = node.epic.stories;
        const doneCount = stories.filter((s) => s.status === 'done').length;
        const item = new vscode.TreeItem(
          `Epic ${node.epic.number}: ${node.epic.title}`,
          stories.length > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None
        );
        item.description = `${statusLabel(node.epic.status)} · ${doneCount}/${stories.length}`;
        item.tooltip = epicTooltip(node.epic);
        item.iconPath = statusIcon(node.epic.status);
        item.contextValue = 'bmadEpic';
        return item;
      }
      case 'epicSummary': {
        const item = new vscode.TreeItem(
          `Retrospective: ${statusLabel(node.epic.retrospectiveStatus ?? 'unknown')}`,
          vscode.TreeItemCollapsibleState.None
        );
        item.iconPath = new vscode.ThemeIcon('history');
        return item;
      }
      case 'story': {
        const item = new vscode.TreeItem(
          `${node.story.epicNumber}.${node.story.storyNumber} ${node.story.title}`,
          node.story.tasks.length > 0 ||
          node.story.acceptanceCriteria.length > 0 ||
          node.story.deferred.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None
        );
        item.description = storyDescription(node.story);
        item.tooltip = storyTooltip(node.story);
        item.iconPath = statusIcon(node.story.status);
        item.contextValue = 'bmadStory';
        if (node.story.filePath) {
          item.command = {
            command: 'vscode.open',
            title: 'Open Story File',
            arguments: [vscode.Uri.file(node.story.filePath)],
          };
          item.resourceUri = vscode.Uri.file(node.story.filePath);
        }
        return item;
      }
      case 'acGroup': {
        const item = new vscode.TreeItem(
          `Acceptance Criteria (${node.story.acceptanceCriteria.length})`,
          node.story.acceptanceCriteria.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None
        );
        item.iconPath = new vscode.ThemeIcon('checklist');
        return item;
      }
      case 'ac': {
        const item = new vscode.TreeItem(
          `${node.index}. ${truncate(node.text, 120)}`,
          vscode.TreeItemCollapsibleState.None
        );
        item.tooltip = node.text;
        item.iconPath = new vscode.ThemeIcon('symbol-numeric');
        return item;
      }
      case 'task': {
        const item = new vscode.TreeItem(
          truncate(node.task.text, 140),
          node.task.subtasks.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None
        );
        item.iconPath = new vscode.ThemeIcon(node.task.done ? 'pass-filled' : 'circle-large-outline');
        item.tooltip = node.task.text;
        if (node.storyFile) {
          item.command = {
            command: 'bmadDashboard.openFile',
            title: 'Open at line',
            arguments: [node.storyFile, node.task.line],
          };
        }
        return item;
      }
      case 'deferredGroup': {
        const item = new vscode.TreeItem(
          `Deferred (${node.story.deferred.length})`,
          node.story.deferred.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None
        );
        item.iconPath = new vscode.ThemeIcon(
          'warning',
          new vscode.ThemeColor('charts.orange')
        );
        item.tooltip = 'Items deferred from code review — work that still needs to be done.';
        if (node.deferredFile) {
          item.command = {
            command: 'bmadDashboard.openFile',
            title: 'Open Deferred Work Log',
            arguments: [node.deferredFile, 0],
          };
          item.resourceUri = vscode.Uri.file(node.deferredFile);
        }
        return item;
      }
      case 'deferred': {
        const label = formatDeferredLabel(node.item);
        const item = new vscode.TreeItem(
          truncate(label, 140),
          vscode.TreeItemCollapsibleState.None
        );
        item.iconPath = new vscode.ThemeIcon(
          node.item.promoted ? 'arrow-up' : 'circle-outline',
          node.item.promoted
            ? new vscode.ThemeColor('charts.blue')
            : new vscode.ThemeColor('charts.orange')
        );
        item.tooltip = deferredTooltip(node.item);
        if (node.deferredFile) {
          item.command = {
            command: 'bmadDashboard.openFile',
            title: 'Open Deferred Work Log',
            arguments: [node.deferredFile, node.item.sourceLine],
          };
        }
        return item;
      }
    }
  }

  getChildren(node?: TreeNode): TreeNode[] {
    if (!node) {
      if (this.projects.length === 0) {
        return [
          {
            kind: 'message',
            text: 'No BMAD project found in this workspace.',
            icon: new vscode.ThemeIcon('warning'),
          },
        ];
      }
      if (this.projects.length === 1) {
        return this.epicNodes(this.projects[0]);
      }
      return this.projects.map((project) => ({ kind: 'project', project }));
    }

    switch (node.kind) {
      case 'project':
        return this.epicNodes(node.project);
      case 'epic': {
        const children: TreeNode[] = node.epic.stories.map((story) => ({
          kind: 'story' as const,
          project: node.project,
          epic: node.epic,
          story,
        }));
        if (node.epic.retrospectiveStatus !== undefined) {
          children.push({ kind: 'epicSummary', project: node.project, epic: node.epic });
        }
        return children;
      }
      case 'story': {
        const children: TreeNode[] = [];
        if (node.story.acceptanceCriteria.length > 0) {
          children.push({ kind: 'acGroup', story: node.story });
        }
        for (const t of node.story.tasks) {
          children.push({ kind: 'task', task: t, storyFile: node.story.filePath });
        }
        if (node.story.deferred.length > 0) {
          children.push({
            kind: 'deferredGroup',
            story: node.story,
            deferredFile: node.project.deferredFilePath,
          });
        }
        return children;
      }
      case 'acGroup':
        return node.story.acceptanceCriteria.map((text, i) => ({
          kind: 'ac' as const,
          index: i + 1,
          text,
        }));
      case 'task':
        return node.task.subtasks.map((sub) => ({
          kind: 'task' as const,
          task: sub,
          storyFile: node.storyFile,
        }));
      case 'deferredGroup':
        return node.story.deferred.map((item) => ({
          kind: 'deferred' as const,
          item,
          deferredFile: node.deferredFile,
        }));
      default:
        return [];
    }
  }

  private epicNodes(project: BmadProject): TreeNode[] {
    if (project.epics.length === 0) {
      return [
        {
          kind: 'message',
          text: 'sprint-status.yaml has no epics yet.',
          icon: new vscode.ThemeIcon('info'),
        },
      ];
    }
    return project.epics.map((epic) => ({ kind: 'epic' as const, project, epic }));
  }
}

function statusIcon(status: StoryStatus): vscode.ThemeIcon {
  switch (status) {
    case 'done':
      return new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('charts.green'));
    case 'in-progress':
      return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.blue'));
    case 'review':
      return new vscode.ThemeIcon('eye', new vscode.ThemeColor('charts.purple'));
    case 'ready-for-dev':
      return new vscode.ThemeIcon('debug-start', new vscode.ThemeColor('charts.yellow'));
    case 'draft':
      return new vscode.ThemeIcon('edit', new vscode.ThemeColor('charts.orange'));
    case 'backlog':
      return new vscode.ThemeIcon('inbox');
    case 'optional':
      return new vscode.ThemeIcon('circle-outline');
    default:
      return new vscode.ThemeIcon('circle-slash');
  }
}

function statusLabel(status: StoryStatus): string {
  switch (status) {
    case 'in-progress':
      return 'In Progress';
    case 'ready-for-dev':
      return 'Ready';
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function storyDescription(story: BmadStory): string {
  const parts = [statusLabel(story.status)];
  if (story.taskCounts.total > 0) {
    parts.push(`${story.taskCounts.done}/${story.taskCounts.total} tasks`);
  }
  if (story.acCount > 0) {
    parts.push(`${story.acCount} AC`);
  }
  if (story.deferred.length > 0) {
    parts.push(`⚠ ${story.deferred.length} deferred`);
  }
  return parts.join(' · ');
}

function storyTooltip(story: BmadStory): vscode.MarkdownString {
  const md = new vscode.MarkdownString(undefined, true);
  md.appendMarkdown(`**Story ${story.epicNumber}.${story.storyNumber}** · ${statusLabel(story.status)}\n\n`);
  md.appendMarkdown(`${story.title}\n\n`);
  md.appendMarkdown(`- ${story.acCount} acceptance criteria\n`);
  if (story.taskCounts.total > 0) {
    md.appendMarkdown(`- ${story.taskCounts.done}/${story.taskCounts.total} tasks complete\n`);
  }
  if (story.deferred.length > 0) {
    md.appendMarkdown(`- ${story.deferred.length} deferred item${story.deferred.length === 1 ? '' : 's'} from code review\n`);
  }
  if (!story.filePath) {
    md.appendMarkdown(`- _Story file not yet created_\n`);
  }
  return md;
}

function formatDeferredLabel(item: BmadDeferredItem): string {
  const tag = item.tag ? `[${item.tag}] ` : '';
  const promoted = item.promoted ? '⤴ ' : '';
  return `${promoted}${tag}${item.text}`;
}

function deferredTooltip(item: BmadDeferredItem): vscode.MarkdownString {
  const md = new vscode.MarkdownString(undefined, true);
  if (item.tag) {
    md.appendMarkdown(`**[${item.tag}]**`);
    if (item.reviewDate) {
      md.appendMarkdown(` · ${item.reviewDate}`);
    }
    md.appendMarkdown('\n\n');
  } else if (item.reviewDate) {
    md.appendMarkdown(`_${item.reviewDate}_\n\n`);
  }
  if (item.promoted) {
    md.appendMarkdown('_Promoted to a follow-up story._\n\n');
  }
  md.appendMarkdown(item.text);
  return md;
}

function epicTooltip(epic: BmadEpic): vscode.MarkdownString {
  const md = new vscode.MarkdownString(undefined, true);
  md.appendMarkdown(`**Epic ${epic.number}** · ${statusLabel(epic.status)}\n\n`);
  md.appendMarkdown(`${epic.title}\n\n`);
  md.appendMarkdown(`- ${epic.stories.length} stories\n`);
  if (epic.retrospectiveStatus) {
    md.appendMarkdown(`- Retrospective: ${statusLabel(epic.retrospectiveStatus)}\n`);
  }
  return md;
}

function projectDescription(project: BmadProject): string {
  const parts: string[] = [];
  parts.push(`${project.epics.length} epics`);
  const totalStories = project.epics.reduce((acc, e) => acc + e.stories.length, 0);
  parts.push(`${totalStories} stories`);
  if (project.lastUpdated) {
    parts.push(`updated ${project.lastUpdated}`);
  }
  return parts.join(' · ');
}

function projectTooltip(project: BmadProject): vscode.MarkdownString {
  const md = new vscode.MarkdownString(undefined, true);
  md.appendMarkdown(`**${project.projectName}**\n\n`);
  if (project.generated) {
    md.appendMarkdown(`- Generated: ${project.generated}\n`);
  }
  if (project.lastUpdated) {
    md.appendMarkdown(`- Last updated: ${project.lastUpdated}\n`);
  }
  if (project.errors.length > 0) {
    md.appendMarkdown(`\n**Parse warnings:**\n\n`);
    for (const err of project.errors) {
      md.appendMarkdown(`- ${err}\n`);
    }
  }
  return md;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

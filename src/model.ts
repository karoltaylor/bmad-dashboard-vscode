import * as vscode from 'vscode';

export type StoryStatus =
  | 'backlog'
  | 'draft'
  | 'ready-for-dev'
  | 'in-progress'
  | 'review'
  | 'done'
  | 'optional'
  | 'unknown';

export const ALL_STATUSES: StoryStatus[] = [
  'backlog',
  'draft',
  'ready-for-dev',
  'in-progress',
  'review',
  'done',
  'optional',
];

export const KANBAN_COLUMNS: { key: StoryStatus; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'ready-for-dev', label: 'Ready' },
  { key: 'in-progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
];

export interface BmadTask {
  text: string;
  done: boolean;
  line: number;
  subtasks: BmadTask[];
}

export interface BmadStory {
  id: string;
  epicNumber: number;
  storyNumber: number;
  title: string;
  status: StoryStatus;
  filePath: string | undefined;
  acceptanceCriteria: string[];
  tasks: BmadTask[];
  taskCounts: { total: number; done: number };
  acCount: number;
}

export interface BmadEpic {
  id: string;
  number: number;
  title: string;
  status: StoryStatus;
  retrospectiveStatus: StoryStatus | undefined;
  stories: BmadStory[];
}

export interface BmadProject {
  workspaceFolder: vscode.WorkspaceFolder;
  rootDir: string;
  bmadDir: string;
  projectName: string;
  generated: string | undefined;
  lastUpdated: string | undefined;
  epics: BmadEpic[];
  errors: string[];
}

export function normalizeStatus(raw: string | undefined): StoryStatus {
  if (!raw) {
    return 'unknown';
  }
  const trimmed = raw.trim().toLowerCase();
  switch (trimmed) {
    case 'backlog':
    case 'draft':
    case 'ready-for-dev':
    case 'in-progress':
    case 'review':
    case 'done':
    case 'optional':
      return trimmed;
    default:
      return 'unknown';
  }
}

import * as fs from 'fs';
import { BmadTask, StoryStatus, normalizeStatus } from '../model';

export interface ParsedStoryFile {
  title: string;
  status: StoryStatus;
  acceptanceCriteria: string[];
  tasks: BmadTask[];
}

const TITLE_RE = /^#\s+Story\s+\d+\.\d+:\s*(.+?)\s*$/;
const STATUS_RE = /^Status:\s*([A-Za-z0-9\-_]+)/;
const SECTION_RE = /^##\s+(.+?)\s*$/;
const AC_ITEM_RE = /^(\d+)\.\s+(.+)$/;
const TASK_RE = /^(\s*)- \[([ xX])\]\s+(.+?)\s*$/;

export function parseStoryFile(filePath: string): ParsedStoryFile {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);

  let title = '';
  let status: StoryStatus = 'unknown';
  const acceptanceCriteria: string[] = [];
  const tasks: BmadTask[] = [];

  let section: 'preamble' | 'ac' | 'tasks' | 'other' = 'preamble';
  const taskStack: { indent: number; node: BmadTask }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (i === 0) {
      const m = line.match(TITLE_RE);
      if (m) {
        title = m[1];
        continue;
      }
    }

    if (status === 'unknown') {
      const sm = line.match(STATUS_RE);
      if (sm) {
        status = normalizeStatus(sm[1]);
        continue;
      }
    }

    const sectionMatch = line.match(SECTION_RE);
    if (sectionMatch) {
      const heading = sectionMatch[1].toLowerCase();
      if (heading.startsWith('acceptance criteria')) {
        section = 'ac';
      } else if (heading.startsWith('tasks')) {
        section = 'tasks';
        taskStack.length = 0;
      } else {
        section = 'other';
      }
      continue;
    }

    if (section === 'ac') {
      const m = line.match(AC_ITEM_RE);
      if (m) {
        acceptanceCriteria.push(stripMarkdown(m[2]));
      }
      continue;
    }

    if (section === 'tasks') {
      const m = line.match(TASK_RE);
      if (m) {
        const indent = m[1].length;
        const done = m[2].toLowerCase() === 'x';
        const text = stripMarkdown(m[3]);
        const node: BmadTask = { text, done, line: i, subtasks: [] };

        while (taskStack.length > 0 && taskStack[taskStack.length - 1].indent >= indent) {
          taskStack.pop();
        }
        if (taskStack.length === 0) {
          tasks.push(node);
        } else {
          taskStack[taskStack.length - 1].node.subtasks.push(node);
        }
        taskStack.push({ indent, node });
      }
      continue;
    }
  }

  return { title, status, acceptanceCriteria, tasks };
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

export function countTasks(tasks: BmadTask[]): { total: number; done: number } {
  let total = 0;
  let done = 0;
  const walk = (list: BmadTask[]) => {
    for (const t of list) {
      total++;
      if (t.done) {
        done++;
      }
      if (t.subtasks.length > 0) {
        walk(t.subtasks);
      }
    }
  };
  walk(tasks);
  return { total, done };
}

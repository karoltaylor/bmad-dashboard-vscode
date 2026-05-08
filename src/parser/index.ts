import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { BmadDeferredItem, BmadEpic, BmadProject, BmadStory, normalizeStatus } from '../model';
import { parseDeferredWorkFile } from './deferred';
import { parseEpicTitles } from './epics';
import { parseSprintStatus } from './sprintStatus';
import { countTasks, parseStoryFile } from './story';

const SPRINT_STATUS_REL = path.join('_bmad-output', 'implementation-artifacts', 'sprint-status.yaml');
const STORIES_REL = path.join('_bmad-output', 'implementation-artifacts', 'stories');
const EPICS_REL = path.join('_bmad-output', 'planning-artifacts', 'epics.md');
const DEFERRED_REL = path.join('_bmad-output', 'implementation-artifacts', 'deferred-work.md');

export function loadProjectsForWorkspace(): BmadProject[] {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const projects: BmadProject[] = [];
  for (const folder of folders) {
    const project = loadProject(folder);
    if (project) {
      projects.push(project);
    }
  }
  return projects;
}

export function loadProject(folder: vscode.WorkspaceFolder): BmadProject | undefined {
  const rootDir = folder.uri.fsPath;
  const sprintStatusPath = path.join(rootDir, SPRINT_STATUS_REL);
  if (!fs.existsSync(sprintStatusPath)) {
    return undefined;
  }

  const errors: string[] = [];
  let sprint;
  try {
    sprint = parseSprintStatus(sprintStatusPath);
  } catch (e) {
    errors.push(`Failed to parse sprint-status.yaml: ${(e as Error).message}`);
    return {
      workspaceFolder: folder,
      rootDir,
      bmadDir: path.join(rootDir, '_bmad-output'),
      projectName: folder.name,
      generated: undefined,
      lastUpdated: undefined,
      epics: [],
      deferredFilePath: undefined,
      errors,
    };
  }

  const epicTitles = (() => {
    try {
      return parseEpicTitles(path.join(rootDir, EPICS_REL));
    } catch (e) {
      errors.push(`Failed to parse epics.md: ${(e as Error).message}`);
      return new Map<number, string>();
    }
  })();

  const deferredPath = path.join(rootDir, DEFERRED_REL);
  const deferredFileExists = fs.existsSync(deferredPath);
  const deferredByStory = (() => {
    if (!deferredFileExists) {
      return new Map<string, BmadDeferredItem[]>();
    }
    try {
      return parseDeferredWorkFile(deferredPath);
    } catch (e) {
      errors.push(`Failed to parse deferred-work.md: ${(e as Error).message}`);
      return new Map<string, BmadDeferredItem[]>();
    }
  })();

  const storiesByEpic = new Map<number, BmadStory[]>();
  for (const [, info] of sprint.storyStatuses) {
    const deferred = deferredByStory.get(`${info.epicNumber}.${info.storyNumber}`) ?? [];
    const story = buildStory(rootDir, info, deferred, errors);
    const list = storiesByEpic.get(info.epicNumber) ?? [];
    list.push(story);
    storiesByEpic.set(info.epicNumber, list);
  }

  const epicNumbers = new Set<number>([
    ...sprint.epicStatuses.keys(),
    ...sprint.retrospectiveStatuses.keys(),
    ...storiesByEpic.keys(),
  ]);

  const epics: BmadEpic[] = Array.from(epicNumbers)
    .sort((a, b) => a - b)
    .map((number) => {
      const stories = (storiesByEpic.get(number) ?? []).sort(
        (a, b) => a.storyNumber - b.storyNumber
      );
      return {
        id: `epic-${number}`,
        number,
        title: epicTitles.get(number) ?? `Epic ${number}`,
        status: sprint.epicStatuses.get(number) ?? 'unknown',
        retrospectiveStatus: sprint.retrospectiveStatuses.get(number),
        stories,
      };
    });

  return {
    workspaceFolder: folder,
    rootDir,
    bmadDir: path.join(rootDir, '_bmad-output'),
    projectName: sprint.projectName ?? folder.name,
    generated: sprint.generated,
    lastUpdated: sprint.lastUpdated,
    epics,
    deferredFilePath: deferredFileExists ? deferredPath : undefined,
    errors,
  };
}

function buildStory(
  rootDir: string,
  info: { epicNumber: number; storyNumber: number; status: import('../model').StoryStatus; rawKey: string },
  deferred: BmadDeferredItem[],
  errors: string[]
): BmadStory {
  const fileName = `story-${info.epicNumber}.${info.storyNumber}.md`;
  const filePath = path.join(rootDir, STORIES_REL, fileName);
  const exists = fs.existsSync(filePath);

  let title = `Story ${info.epicNumber}.${info.storyNumber}`;
  let acceptanceCriteria: string[] = [];
  let tasks: import('../model').BmadTask[] = [];
  let parsedStatus = info.status;

  if (exists) {
    try {
      const parsed = parseStoryFile(filePath);
      if (parsed.title) {
        title = parsed.title;
      }
      acceptanceCriteria = parsed.acceptanceCriteria;
      tasks = parsed.tasks;
      if (parsed.status !== 'unknown') {
        parsedStatus = parsed.status;
      }
    } catch (e) {
      errors.push(`Failed to parse ${fileName}: ${(e as Error).message}`);
    }
  } else if (slugFromRawKey(info.rawKey)) {
    title = `Story ${info.epicNumber}.${info.storyNumber}: ${slugFromRawKey(info.rawKey)}`;
  }

  // YAML status is the canonical source of truth — prefer it when set.
  const status = info.status !== 'unknown' ? info.status : normalizeStatus(parsedStatus);

  return {
    id: info.rawKey,
    epicNumber: info.epicNumber,
    storyNumber: info.storyNumber,
    title,
    status,
    filePath: exists ? filePath : undefined,
    acceptanceCriteria,
    tasks,
    taskCounts: countTasks(tasks),
    acCount: acceptanceCriteria.length,
    deferred,
  };
}

function slugFromRawKey(rawKey: string): string | undefined {
  const m = rawKey.match(/^\d+-\d+-(.+)$/);
  if (!m) {
    return undefined;
  }
  return m[1].split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

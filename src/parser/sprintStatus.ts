import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { StoryStatus, normalizeStatus } from '../model';

export interface SprintStatusFile {
  generated: string | undefined;
  lastUpdated: string | undefined;
  projectName: string | undefined;
  epicStatuses: Map<number, StoryStatus>;
  retrospectiveStatuses: Map<number, StoryStatus>;
  storyStatuses: Map<string, { epicNumber: number; storyNumber: number; status: StoryStatus; rawKey: string }>;
}

const STORY_KEY_RE = /^(\d+)-(\d+)-/;
const EPIC_KEY_RE = /^epic-(\d+)$/;
const RETRO_KEY_RE = /^epic-(\d+)-retrospective$/;

export function parseSprintStatus(filePath: string): SprintStatusFile {
  const raw = fs.readFileSync(filePath, 'utf8');
  const doc = yaml.load(raw) as Record<string, unknown> | undefined;

  const epicStatuses = new Map<number, StoryStatus>();
  const retrospectiveStatuses = new Map<number, StoryStatus>();
  const storyStatuses = new Map<string, {
    epicNumber: number;
    storyNumber: number;
    status: StoryStatus;
    rawKey: string;
  }>();

  if (!doc || typeof doc !== 'object') {
    return {
      generated: undefined,
      lastUpdated: undefined,
      projectName: undefined,
      epicStatuses,
      retrospectiveStatuses,
      storyStatuses,
    };
  }

  const generated = stringValue(doc['generated']);
  const lastUpdated = stringValue(doc['last_updated']);
  const projectName = stringValue(doc['project']);

  const development = doc['development_status'];
  if (development && typeof development === 'object') {
    for (const [key, value] of Object.entries(development)) {
      const status = normalizeStatus(stringValue(value));
      const epicMatch = key.match(EPIC_KEY_RE);
      if (epicMatch) {
        epicStatuses.set(Number(epicMatch[1]), status);
        continue;
      }
      const retroMatch = key.match(RETRO_KEY_RE);
      if (retroMatch) {
        retrospectiveStatuses.set(Number(retroMatch[1]), status);
        continue;
      }
      const storyMatch = key.match(STORY_KEY_RE);
      if (storyMatch) {
        const epicNumber = Number(storyMatch[1]);
        const storyNumber = Number(storyMatch[2]);
        storyStatuses.set(`${epicNumber}.${storyNumber}`, {
          epicNumber,
          storyNumber,
          status,
          rawKey: key,
        });
      }
    }
  }

  return {
    generated,
    lastUpdated,
    projectName,
    epicStatuses,
    retrospectiveStatuses,
    storyStatuses,
  };
}

function stringValue(v: unknown): string | undefined {
  if (typeof v === 'string') {
    return v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  return undefined;
}

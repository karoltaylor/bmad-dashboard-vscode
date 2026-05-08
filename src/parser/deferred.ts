import * as fs from 'fs';
import { BmadDeferredItem } from '../model';

const SECTION_RE = /^##\s+Deferred from:.*?story-(\d+)\.(\d+)\b.*?(?:\((\d{4}-\d{2}-\d{2})\))?\s*$/i;
const ANY_H2_RE = /^##\s+/;
const BULLET_RE = /^-\s+(?:\[([A-Za-z0-9]+)\])?\s*(.*)$/;

export function parseDeferredWorkFile(filePath: string): Map<string, BmadDeferredItem[]> {
  const result = new Map<string, BmadDeferredItem[]>();
  if (!fs.existsSync(filePath)) {
    return result;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);

  let currentKey: string | undefined;
  let currentDate: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const sectionMatch = line.match(SECTION_RE);
    if (sectionMatch) {
      currentKey = `${Number(sectionMatch[1])}.${Number(sectionMatch[2])}`;
      currentDate = sectionMatch[3];
      if (!result.has(currentKey)) {
        result.set(currentKey, []);
      }
      continue;
    }

    if (ANY_H2_RE.test(line)) {
      currentKey = undefined;
      currentDate = undefined;
      continue;
    }

    if (!currentKey) {
      continue;
    }

    const bulletMatch = line.match(BULLET_RE);
    if (!bulletMatch) {
      continue;
    }
    const text = stripMarkdown(bulletMatch[2]);
    if (!text) {
      continue;
    }
    result.get(currentKey)!.push({
      tag: bulletMatch[1],
      text,
      promoted: /\bPROMOTED\b/.test(bulletMatch[2]),
      reviewDate: currentDate,
      sourceLine: i,
    });
  }

  return result;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

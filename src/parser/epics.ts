import * as fs from 'fs';

const EPIC_HEADER_RE = /^##\s+Epic\s+(\d+):\s*(.+?)\s*$/;

export function parseEpicTitles(filePath: string): Map<number, string> {
  const titles = new Map<number, string>();
  if (!fs.existsSync(filePath)) {
    return titles;
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(EPIC_HEADER_RE);
    if (m) {
      const number = Number(m[1]);
      if (!titles.has(number)) {
        titles.set(number, m[2]);
      }
    }
  }
  return titles;
}

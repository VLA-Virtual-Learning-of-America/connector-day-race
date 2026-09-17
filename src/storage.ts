import type { StickerCode } from './race';

export interface GhostRun {
  sticker?: StickerCode | null;
  name: string;
  timeMs: number;
  positions: number[]; // x offset in px, sampled every ~50ms from start
  createdAt: number;
}

const KEY = "vla-race-ghosts-v1";
const MAX_GHOSTS = 20;

export function loadGhosts(): GhostRun[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGhost(run: GhostRun) {
  const all = loadGhosts();
  all.push(run);
  all.sort((a, b) => a.timeMs - b.timeMs);
  const trimmed = all.slice(0, MAX_GHOSTS);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // storage full or unavailable: fail silently, race still worked locally
  }
}

export function bestGhost(): GhostRun | null {
  const all = loadGhosts();
  return all.length ? all[0] : null;
}

export function leaderboardTop(n = 8): GhostRun[] {
  return loadGhosts().slice(0, n);
}

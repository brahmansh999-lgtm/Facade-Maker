import { create } from 'zustand';
import type { FaceKey, Project, Side } from '../model/types.ts';
import { defaultProject, normaliseProject } from '../model/defaults.ts';

export type ViewKind = 'elev' | 'axo' | 'plan' | 'section' | 'schedule';
export type Tool = 'select' | 'split' | 'stair';

export interface UIState {
  view: ViewKind;
  elevSide: Side;
  planLevel: number | 'roof';
  compare: boolean;
  compareIds: string[];
  selRooms: string[];
  selOpening: string | null;
  tool: Tool;
  scope: 'all' | FaceKey;
  briefOpen: boolean;
  status: string;
  fitNonce: number;
  sheetNonce: number;
  trueScaleNonce: number;
}

/** deep links: #plan, #axo, #section, #schedule, #compare, #elev-rear … */
function initialView(): Partial<UIState> {
  const h = typeof location !== 'undefined' ? location.hash.slice(1) : '';
  if (h === 'plan' || h === 'axo' || h === 'section' || h === 'schedule') return { view: h };
  if (h === 'compare') return { view: 'elev', compare: true };
  const m = /^elev-(front|rear|left|right)$/.exec(h);
  if (m) return { view: 'elev', elevSide: m[1] as Side };
  if (h === 'roof') return { view: 'plan', planLevel: 'roof' };
  return {};
}

interface Store {
  project: Project;
  past: Project[];
  future: Project[];
  lastMerge: string | null;
  ui: UIState;
  /** apply a change; commits with the same merge key (e.g. one slider drag) share one undo step */
  commit: (fn: (p: Project) => Project, merge?: string) => void;
  replace: (p: Project) => void;
  undo: () => void;
  redo: () => void;
  setUI: (u: Partial<UIState>) => void;
}

const KEY = 'facade-maker.project.v1';
function load(): Project {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return normaliseProject(JSON.parse(s));
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return defaultProject();
}
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function save(p: Project) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ } }, 400);
}

export const useStore = create<Store>((set, get) => ({
  project: load(),
  past: [],
  future: [],
  lastMerge: null,
  ui: {
    view: 'axo', elevSide: 'front', planLevel: 0, compare: false, compareIds: ['jaali', 'fins', 'louvres'],
    selRooms: [], selOpening: null, tool: 'select', scope: 'all', briefOpen: false, status: '', fitNonce: 0, sheetNonce: 0, trueScaleNonce: 0,
    ...initialView(),
  },
  commit: (fn, merge) => {
    const { project, past, lastMerge } = get();
    const next = fn(project);
    if (next === project) return;
    const sameStep = merge !== undefined && merge === lastMerge;
    set({ project: next, past: sameStep ? past : [...past.slice(-99), project], future: [], lastMerge: merge ?? null });
    save(next);
  },
  replace: (p) => { const { project, past } = get(); set({ project: p, past: [...past.slice(-99), project], future: [], lastMerge: null }); save(p); },
  undo: () => {
    const { past, project, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future], lastMerge: null });
    save(prev);
  },
  redo: () => {
    const { past, project, future } = get();
    if (!future.length) return;
    const next = future[0];
    set({ project: next, past: [...past, project], future: future.slice(1), lastMerge: null });
    save(next);
  },
  setUI: (u) => set({ ui: { ...get().ui, ...u } }),
}));

import type { BoardPalette, FinishType, GuitarLook, RenderData } from '../types';

/** Local fixtures: the catalogue (M11-04) is built in parallel. */
export const ROSEWOOD: BoardPalette = {
  '--wood': '#4a2f22',
  '--wood-dark': '#3a2419',
  '--string': '#ddd3c4',
  '--fret-wire': '#c9c3bb',
  '--inlay': '#e8dfd2',
};

export const FINISHES: Record<FinishType, { name: string; render: RenderData['finish'] }> = {
  solid: { name: 'Red', render: { type: 'solid', stops: [{ offset: 0, colour: '#b3262d' }] } },
  sunburst: {
    name: 'Cherry sunburst',
    render: {
      type: 'sunburst',
      stops: [
        { offset: 0, colour: '#f2b33d' },
        { offset: 0.55, colour: '#c0392b' },
        { offset: 1, colour: '#1e0806' },
      ],
    },
  },
  natural: {
    name: 'Natural ash',
    render: { type: 'natural', stops: [{ offset: 0, colour: '#d9b98a' }] },
  },
  metallic: {
    name: 'Blue metallic',
    render: { type: 'metallic', stops: [{ offset: 0, colour: '#3c6fb3' }] },
  },
  sparkle: {
    name: 'Silver sparkle',
    render: { type: 'sparkle', stops: [{ offset: 0, colour: '#5a5f68' }] },
  },
};

export function look(overrides: Partial<GuitarLook> = {}): GuitarLook {
  return {
    body: { name: 'Single-cut', render: { shape: 'single-cut' } },
    finish: FINISHES.sunburst,
    pickguard: { name: 'Cream', render: { colour: '#efe3c8' } },
    hardware: { name: 'Gold', render: { colour: '#d4b15a' } },
    board: { name: 'Rosewood', render: { palette: ROSEWOOD } },
    inlay: { name: 'Blocks', render: { shape: 'blocks' } },
    ...overrides,
  };
}

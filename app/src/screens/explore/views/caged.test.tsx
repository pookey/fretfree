import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SKILLS } from '../../../engine';
import { focusHref, noteSkillIds } from '../../../session/focus';
import { CAGED_QUALITIES, chromaOf, midiAt, type CagedQuality } from '../../../theory';
import {
  STEP_MS,
  View,
  cagedContent,
  cagedQuizFocus,
  cagedSkillIds,
  chainMarkers,
  chainRange,
  linkMarkers,
} from './caged';
import { frontierSkillIds } from './fretboard-explorer';

/** Every registered skill open, as for a learner who has unlocked them all. */
const ALL_OPEN: ReadonlySet<string> = new Set(SKILLS.map((s) => s.id));

/** A fresh learner: nothing stored, so only the first skills are on the frontier. */
const FRESH = frontierSkillIds(SKILLS, new Map());

function mockReducedMotion(matches: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    matches,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mq),
  );
  return {
    set(next: boolean) {
      mq.matches = next;
      listeners.forEach((cb) => cb());
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const cells = (ms: { string: number; fret: number }[]) => ms.map((m) => `${m.string}:${m.fret}`);

describe('cagedContent', () => {
  it('chains C major up the neck from the open C shape', () => {
    const c = cagedContent(0, 'major');
    expect(c.name).toBe('C');
    expect(c.chain.map((l) => l.shape.shape)).toEqual(['C', 'A', 'G', 'E', 'D']);
    expect(c.chain.map((l) => l.span)).toEqual([
      { from: 0, to: 3 },
      { from: 3, to: 5 },
      { from: 5, to: 8 },
      { from: 8, to: 10 },
      { from: 10, to: 13 },
    ]);
  });

  it('starts the chain wherever the lowest shape is', () => {
    expect(cagedContent(7, 'major').chain.map((l) => l.shape.shape)).toEqual([
      'G',
      'E',
      'D',
      'C',
      'A',
    ]);
  });

  it('spells the chord as the explorer does and maps degrees to notes', () => {
    expect(cagedContent(1, 'major').name).toBe('Db');
    expect(cagedContent(1, 'minor').name).toBe('C#m');
    const a7 = cagedContent(9, 'dominant7');
    expect(a7.name).toBe('A7');
    expect([...a7.notes]).toEqual([
      ['R', 'A'],
      ['3', 'C#'],
      ['5', 'E'],
      ['b7', 'G'],
    ]);
  });

  it('falls back to major for an unknown quality', () => {
    const c = cagedContent(0, 'lydian' as CagedQuality);
    expect([c.name, c.quality]).toEqual(['C', 'major']);
  });

  it('fits every chord on the neck, sounding its own notes', () => {
    for (const quality of CAGED_QUALITIES) {
      for (let chroma = 0; chroma < 12; chroma++) {
        const c = cagedContent(chroma, quality);
        const range = chainRange(c);
        expect(range.from).toBe(0);
        expect(range.to).toBeGreaterThanOrEqual(15);
        const markers = chainMarkers(c, null, 'degrees');
        for (const m of markers) {
          expect(m.fret).toBeLessThanOrEqual(range.to);
          expect(m.fret).toBeGreaterThanOrEqual(range.from);
        }
        const pcs = new Set(markers.map((m) => midiAt(m) % 12));
        expect(pcs).toEqual(new Set([...c.notes.values()].map(chromaOf)));
        // Lowest first, five distinct shapes.
        const froms = c.chain.map((l) => l.span.from);
        expect(froms).toEqual([...froms].sort((a, b) => a - b));
        expect(new Set(c.chain.map((l) => l.shape.shape)).size).toBe(5);
      }
    }
  });
});

describe('linkMarkers', () => {
  it('styles the triad core by degree and the rest of the shape as guide notes', () => {
    const c = cagedContent(0, 'major');
    const ms = linkMarkers(c, c.chain[0]!, 'degrees');
    const core = ms.filter((m) => m.style !== 'ghost');
    expect(core.map((m) => [m.string, m.fret, m.style, m.label])).toEqual([
      [3, 0, 'fifth', '5'],
      [2, 1, 'root', 'R'],
      [1, 0, 'third', '3'],
    ]);
    expect(ms.filter((m) => m.style === 'ghost').map((m) => [m.string, m.fret, m.label])).toEqual([
      [5, 3, 'R'],
      [4, 2, '3'],
    ]);
    expect(new Set(ms.map((m) => m.group))).toEqual(new Set(['C-shape']));
  });

  it('labels by note name', () => {
    const c = cagedContent(0, 'major');
    expect(linkMarkers(c, c.chain[0]!, 'names').map((m) => m.label)).toEqual([
      'G',
      'C',
      'E',
      'C',
      'E',
    ]);
  });

  it('shows a dominant-7 shape whole, its b7 a hexagon over the major core', () => {
    const c = cagedContent(0, 'dominant7');
    const link = c.chain.find((l) => l.shape.shape === 'E')!;
    const ms = linkMarkers(c, link, 'degrees');
    expect(ms.filter((m) => m.style === 'seventh').map((m) => m.label)).toEqual(['b7']);
    for (const n of link.shape.notes) expect(cells(ms)).toContain(`${n.string}:${n.fret}`);
    expect(ms.filter((m) => ['root', 'third', 'fifth'].includes(m.style))).toHaveLength(3);
  });

  it('labels a degree the spelling lacks by the degree itself', () => {
    const c = { ...cagedContent(0, 'major'), notes: new Map() };
    expect(linkMarkers(c, c.chain[0]!, 'names')[0]!.label).toBe('5');
  });
});

describe('chainMarkers', () => {
  it('shows one shape per step', () => {
    const c = cagedContent(0, 'major');
    expect(cells(chainMarkers(c, 1, 'degrees'))).toEqual(
      cells(linkMarkers(c, c.chain[1]!, 'degrees')),
    );
  });

  it('shows the whole chain once per cell, a core note over a guide note', () => {
    const c = cagedContent(0, 'major');
    const ms = chainMarkers(c, null, 'degrees');
    expect(new Set(cells(ms)).size).toBe(ms.length);
    // String 5 fret 3 is the C shape's (guide) root and the A shape's root, in no core.
    expect(ms.find((m) => m.string === 5 && m.fret === 3)?.style).toBe('ghost');
    // The G shape's core shares cells with its neighbours' guide notes, and keeps its styles.
    const g = c.chain.find((l) => l.shape.shape === 'G')!;
    for (const n of g.core.notes) {
      expect(ms.find((m) => m.string === n.string && m.fret === n.fret)?.style).not.toBe('ghost');
    }
  });
});

describe('"Quiz me on this"', () => {
  it('finds the C6 skills of each quality', () => {
    expect(cagedSkillIds(SKILLS, 'major')).toEqual(['C6.triad-cores', 'C6.major-shapes']);
    expect(cagedSkillIds(SKILLS, 'minor')).toEqual(['C6.minor-cores', 'C6.minor-shapes']);
    expect(cagedSkillIds(SKILLS, 'dominant7')).toEqual(['C6.dominant7-shapes']);
  });

  it('quizzes the open shapes of the quality on show', () => {
    expect(cagedQuizFocus('major', ALL_OPEN)).toEqual({
      skillIds: ['C6.triad-cores', 'C6.major-shapes'],
    });
    expect(cagedQuizFocus('major', new Set(['C6.triad-cores']))).toEqual({
      skillIds: ['C6.triad-cores'],
    });
  });

  it('walks back to the nearest open prerequisites while the shapes are gated', () => {
    expect(cagedQuizFocus('minor', new Set(['C6.triad-cores', 'F2.string6-naturals']))).toEqual({
      skillIds: ['C6.triad-cores'],
    });
    const fresh = cagedQuizFocus('major', FRESH).skillIds ?? [];
    expect(fresh.length).toBeGreaterThan(0);
    for (const id of fresh) {
      expect(FRESH.has(id)).toBe(true);
      expect(SKILLS.find((s) => s.id === 'C6.triad-cores')!.prerequisites).toContain(id);
    }
  });

  it('falls back to the notes when nothing on the way is open', () => {
    expect(cagedQuizFocus('dominant7')).toEqual({ skillIds: noteSkillIds(SKILLS) });
    expect(cagedQuizFocus('major', new Set(), [])).toEqual({ skillIds: [] });
  });
});

function renderView() {
  return render(
    <MemoryRouter>
      <View />
    </MemoryRouter>,
  );
}

const pressed = () =>
  within(screen.getByRole('list', { name: /CAGED chain/ }))
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.textContent);

describe('<View>', () => {
  it('shows the first shape of C major with its core, and steps the chain by hand', () => {
    mockReducedMotion(false);
    renderView();
    expect(screen.getByTestId('caged-name')).toHaveTextContent('C: C shape');
    expect(screen.getByTestId('caged-detail')).toHaveTextContent(
      'Root on string 5, frets 0–3. Triad core on strings 3–1. Next up the neck: the A shape.',
    );
    expect(pressed()).toEqual(['C shapefrets 0–3']);
    const neck = screen.getByRole('group', { name: 'C shape of C, frets 0–3' });
    expect(neck.querySelectorAll('[data-testid="marker-root"]')).toHaveLength(1);
    expect(neck.querySelectorAll('[data-testid="marker-ghost"]')).toHaveLength(2);
    expect(
      within(screen.getByTestId('caged-legend'))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Root', '3rd', '5th', 'Rest of the shape']);

    fireEvent.click(screen.getByTestId('chain-E'));
    expect(screen.getByTestId('caged-name')).toHaveTextContent('C: E shape');
    expect(screen.getByRole('group', { name: 'E shape of C, frets 8–10' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Whole chain/ }));
    expect(screen.getByTestId('caged-name')).toHaveTextContent('C: the whole chain');
    expect(screen.getByRole('group', { name: 'Every CAGED shape of C' })).toBeInTheDocument();
    expect(screen.queryAllByTestId('dimmed-fret')).toHaveLength(0);
  });

  it('plays the chain once when a chord is picked, and pauses', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    mockReducedMotion(false);
    renderView();
    fireEvent.change(screen.getByRole('combobox', { name: 'Root' }), { target: { value: '7' } });
    // The label says what the button does, so it carries no pressed state too.
    expect(screen.getByRole('button', { name: 'Pause' })).not.toHaveAttribute('aria-pressed');
    expect(screen.getByTestId('caged-name')).toHaveTextContent('G: G shape');
    act(() => vi.advanceTimersByTime(STEP_MS));
    expect(screen.getByTestId('caged-name')).toHaveTextContent('G: E shape');
    for (let i = 0; i < 6; i++) act(() => vi.advanceTimersByTime(STEP_MS));
    expect(screen.getByTestId('caged-name')).toHaveTextContent('G: A shape');
    expect(screen.getByRole('button', { name: 'Play the chain' })).toBeInTheDocument();

    // Play from the last shape starts over; Pause holds it.
    fireEvent.click(screen.getByRole('button', { name: 'Play the chain' }));
    expect(screen.getByTestId('caged-name')).toHaveTextContent('G: G shape');
    act(() => vi.advanceTimersByTime(STEP_MS));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    act(() => vi.advanceTimersByTime(STEP_MS * 3));
    expect(screen.getByTestId('caged-name')).toHaveTextContent('G: E shape');

    // Tapping a shape stops the chain on it.
    fireEvent.click(screen.getByRole('button', { name: 'Play the chain' }));
    fireEvent.click(screen.getByTestId('chain-C'));
    act(() => vi.advanceTimersByTime(STEP_MS * 3));
    expect(screen.getByTestId('caged-name')).toHaveTextContent('G: C shape');
  });

  it("gives a new chord's first shape a full step", () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    mockReducedMotion(false);
    renderView();
    fireEvent.change(screen.getByRole('combobox', { name: 'Root' }), { target: { value: '7' } });
    act(() => vi.advanceTimersByTime(STEP_MS - 300));
    expect(screen.getByTestId('caged-name')).toHaveTextContent('G: G shape');
    // Picked just before G's first step was due: A's lowest shape stays a full step.
    fireEvent.change(screen.getByRole('combobox', { name: 'Root' }), { target: { value: '9' } });
    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByTestId('caged-name')).toHaveTextContent('A: A shape');
    act(() => vi.advanceTimersByTime(STEP_MS - 600));
    expect(screen.getByTestId('caged-name')).toHaveTextContent('A: G shape');
  });

  it('never plays under reduced motion, and stops if it is turned on mid-chain', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const media = mockReducedMotion(true);
    renderView();
    expect(screen.queryByRole('button', { name: 'Play the chain' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Chord' }), {
      target: { value: 'minor' },
    });
    act(() => vi.advanceTimersByTime(STEP_MS * 3));
    expect(screen.getByTestId('caged-name')).toHaveTextContent('Cm: C shape');

    act(() => media.set(false));
    fireEvent.click(screen.getByRole('button', { name: 'Play the chain' }));
    act(() => media.set(true));
    act(() => vi.advanceTimersByTime(STEP_MS * 3));
    expect(screen.getByTestId('caged-name')).toHaveTextContent('Cm: C shape');

    // Turning motion back on doesn't resume the chain unasked.
    act(() => media.set(false));
    expect(screen.getByRole('button', { name: 'Play the chain' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(STEP_MS * 3));
    expect(screen.getByTestId('caged-name')).toHaveTextContent('Cm: C shape');
  });

  it('labels by note name and links the quiz to the shown quality', () => {
    mockReducedMotion(true);
    renderView();
    fireEvent.click(screen.getByRole('radio', { name: 'Note names' }));
    const neck = screen.getByRole('group', { name: /C shape of C/ });
    expect(neck.querySelector('[data-testid="marker-root"] text')).toHaveTextContent('C');
    fireEvent.change(screen.getByRole('combobox', { name: 'Chord' }), {
      target: { value: 'dominant7' },
    });
    expect(screen.getByTestId('caged-legend')).toHaveTextContent('b7');
    expect(screen.getByRole('link', { name: 'Quiz me on this' })).toHaveAttribute(
      'href',
      focusHref(cagedQuizFocus('dominant7')),
    );
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useAppStore } from '../../../app-store';
import { DEFAULT_SETTINGS, SKILLS, deriveStatus, type SkillStatus } from '../../../engine';
import { focusHref, noteSkillIds } from '../../../session/focus';
import { CAGED_QUALITIES, chromaOf, midiAt, type CagedQuality } from '../../../theory';
import { keySpelledRoot } from '../../../theory/key-spelling';
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

/** Every skill's status from `seeded`, derived in registry order as the runner does. */
function statusesFrom(seeded: Record<string, SkillStatus>): Map<string, SkillStatus> {
  const out = new Map(Object.entries(seeded));
  for (const s of SKILLS) out.set(s.id, deriveStatus(s, out, out.get(s.id)));
  return out;
}

/** Every registered skill practising, as for a learner who has opened them all. */
const ALL_OPEN = new Map<string, SkillStatus>(SKILLS.map((s) => [s.id, 'practising']));

/** A fresh learner: nothing stored, so only the first skills are open. */
const FRESH = statusesFrom({});

/** The notes, the octaves and every interval mastered: C4's sharp keys open. */
const BASE: Record<string, SkillStatus> = Object.fromEntries(
  SKILLS.filter((s) => /^(F\d|C1|C2|C3)$/.test(s.topic)).map((s) => [s.id, 'mastered']),
);

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
  useAppStore.setState({ settings: { ...DEFAULT_SETTINGS } });
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

  it("spells every chord's root from its key, the preference only breaking ties", () => {
    for (const quality of CAGED_QUALITIES) {
      for (const pref of ['sharp', 'flat'] as const) {
        for (let chroma = 0; chroma < 12; chroma++) {
          const c = cagedContent(chroma, quality, pref);
          expect(c.root, `${chroma} ${quality} ${pref}`).toBe(
            keySpelledRoot(chroma, quality, pref),
          );
          expect(c.notes.get('R')).toBe(c.root);
        }
      }
    }
    // A learner who prefers sharps sees B♭ and its D and F, never A♯.
    const bb = cagedContent(10, 'major', 'sharp');
    expect(bb.name).toBe('Bb');
    expect(bb.spelling).toBe('flat');
    expect([...bb.notes.values()]).toEqual(['Bb', 'D', 'F']);
    expect(cagedContent(6, 'major', 'flat').name).toBe('Gb');
    expect(cagedContent(6, 'major', 'sharp').name).toBe('F#');
    expect(cagedContent(1, 'dominant7', 'sharp').name).toBe('Db7');
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

  /** Triads practising: the cores open, the shapes waiting on them. */
  const CORES = statusesFrom({ ...BASE, 'C4.sharp-keys': 'practising', 'C5.triads': 'practising' });

  it('quizzes the open shapes of the quality on show', () => {
    expect(cagedQuizFocus('major', ALL_OPEN)).toEqual({
      skillIds: ['C6.triad-cores', 'C6.major-shapes'],
    });
    expect(CORES.get('C6.major-shapes')).toBe('locked');
    expect(cagedQuizFocus('major', CORES)).toEqual({ skillIds: ['C6.triad-cores'] });
  });

  it('walks back to the nearest open prerequisites while the shapes are gated', () => {
    expect(cagedQuizFocus('minor', CORES)).toEqual({ skillIds: ['C6.triad-cores'] });
    const fresh = cagedQuizFocus('major', FRESH).skillIds ?? [];
    expect(fresh.length).toBeGreaterThan(0);
    for (const id of fresh) {
      expect(FRESH.get(id)).toBe('unlocked');
      expect(SKILLS.find((s) => s.id === 'C6.triad-cores')!.prerequisites).toContain(id);
    }
  });

  it('walks back through soft gates still unmet while the shapes are locked', () => {
    // M10-02 (PM call): C6.triad-cores has its hard gates (F2) mastered and
    // waits only on C5.triads practising (soft), so that is what to practise.
    const statuses = statusesFrom({ ...BASE, 'C4.sharp-keys': 'practising' });
    expect(statuses.get('C5.triads')).toBe('unlocked');
    expect(statuses.get('C6.triad-cores')).toBe('locked');
    expect(cagedQuizFocus('major', statuses)).toEqual({ skillIds: ['C5.triads'] });
    expect(cagedQuizFocus('minor', statuses)).toEqual({ skillIds: ['C5.triads'] });
  });

  it('falls back to the notes when nothing on the way is open', () => {
    expect(cagedQuizFocus('dominant7')).toEqual({ skillIds: noteSkillIds(SKILLS) });
    expect(cagedQuizFocus('major', new Map(), [])).toEqual({ skillIds: [] });
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

  it('names a flat-key chord with flats for a learner who prefers sharps', () => {
    mockReducedMotion(true);
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, accidentalPref: 'sharp' } });
    renderView();
    fireEvent.change(screen.getByRole('combobox', { name: 'Root' }), { target: { value: '10' } });
    expect(screen.getByTestId('caged-name')).toHaveTextContent('Bb: A shape');
    fireEvent.click(screen.getByRole('radio', { name: 'Note names' }));
    const neck = screen.getByRole('group', { name: /^A shape of Bb/ });
    expect(neck.querySelector('[data-testid="marker-root"] text')).toHaveTextContent('B♭');
    expect(neck).not.toHaveTextContent(/A[#♯]/);
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

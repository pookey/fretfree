import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useAppStore } from '../app-store';
import { DRILLS as ALL_DRILLS, getDrill, preloadDrill } from '../drills/registry';
import {
  DEFAULT_SETTINGS,
  createScheduler,
  deriveStatus,
  parseNoteItemId,
  type Skill,
  type SkillStatus,
} from '../engine';
import { MODULES, type Module } from '../engine/frontier';
import { SKILLS as ALL_SKILLS, getSkill } from '../engine/skills';
import { FretworkDB, getSkillStates } from '../storage';
import { noteAt } from '../theory';
import { TestOut, opensOnceText } from './TestOut';

// A module whose one skill needs string 6's natural notes mastered (a hard
// gate). Only D1 runs here, so the test-out probes string 6's 8 `note@`
// items: 4 probes, all 4 fluent to pass.
const STRING6 = getSkill('F2.string6-naturals') as Skill;
const GATED: Skill = {
  id: 'T1.gated',
  topic: 'T1',
  order: 0,
  title: 'The gated skill',
  prerequisites: [STRING6.id],
  drillTypes: ['name-the-note'],
  items: () => [],
};
const MODULE: Module = {
  id: 'gated',
  title: 'Gated',
  topics: ['T1'],
  unlocksAfter: 'Neck basics',
  track: 'core',
  summary: 'A module behind a hard gate.',
};
const SKILLS = [STRING6, GATED];
const DRILLS = [getDrill('name-the-note')!];
const NOW = new Date('2026-10-19T09:00:00Z');

function derive(stored: ReadonlyMap<string, SkillStatus> = new Map()): Map<string, SkillStatus> {
  const out = new Map(stored);
  for (const s of SKILLS) out.set(s.id, deriveStatus(s, out, stored.get(s.id)));
  return out;
}

let db: FretworkDB;
let n = 0;
let t: number;

// The dialog waits on the drill's lazily loaded logic and views. Cold, under a
// loaded verify, transforming them took longer than any per-test wait.
beforeAll(() => preloadDrill(DRILLS[0]!), 60_000);

beforeEach(() => {
  db = new FretworkDB(`test-out-ui-${n++}`);
  t = 0;
  useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, soundOn: false }, loaded: true });
});
afterEach(async () => {
  await db.delete();
});

function renderOffer({
  offer = true,
  statuses = derive() as ReadonlyMap<string, SkillStatus> | undefined,
  onSaved = () => {},
} = {}) {
  return render(
    <MemoryRouter>
      <TestOut
        module={MODULE}
        offer={offer}
        statuses={statuses}
        onSaved={onSaved}
        skills={SKILLS}
        drills={DRILLS}
        probe={{
          now: () => t,
          clock: () => NOW,
          rng: () => 0.5,
          db,
          scheduler: createScheduler({ enableFuzz: false }),
        }}
      />
    </MemoryRouter>,
  );
}

const dialog = () => screen.getByRole('dialog', { name: 'Test out' });

/** Tap "Test out": the probes start once the learner's cards are read. */
async function startTestOut() {
  fireEvent.click(screen.getByRole('button', { name: 'Test out' }));
  await screen.findByRole('dialog', { name: 'Test out' }, { timeout: 3000 });
}

async function answerRight() {
  const id = screen.getByTestId('placement-probe').dataset.item!;
  const group = within(dialog()).getByRole('group', { name: 'Name the highlighted note' });
  fireEvent.click(within(group).getByRole('button', { name: noteAt(parseNoteItemId(id)!).pc }));
  expect(await screen.findByTestId('feedback-correct', {}, { timeout: 3000 })).toBeInTheDocument();
}

async function nextProbe(id: string) {
  await waitFor(() => expect(screen.queryByTestId('placement-probe')?.dataset.item).not.toBe(id), {
    timeout: 3000,
  });
}

describe('opensOnceText', () => {
  it('names what one opener still needs to master and be practising (M10-01 wording)', () => {
    expect(opensOnceText('Chords', [{ master: ['3rds'], practise: ['Sharp keys'] }])).toBe(
      'Chords opens once you’ve mastered 3rds and are practising Sharp keys.',
    );
    expect(opensOnceText('Pentatonic', [{ master: [], practise: ['A', 'B'] }])).toBe(
      'Pentatonic opens once you’re practising A and B.',
    );
    expect(opensOnceText('Keys', [{ master: ['A', 'B', 'C'], practise: [] }])).toBe(
      'Keys opens once you’ve mastered A, B and C.',
    );
    expect(opensOnceText('Keys', [])).toBe('Keys opens once you’ve mastered what it builds on.');
    expect(opensOnceText('Keys', [{ master: [], practise: [] }])).toBe(
      'Keys opens once you’ve mastered what it builds on.',
    );
  });

  it('names a skill once when an opener needs it mastered and practising', () => {
    expect(
      opensOnceText('Progressions', [
        { master: ['Triads'], practise: ['Sharp keys', 'Triads', 'Numerals'] },
      ]),
    ).toBe(
      'Progressions opens once you’ve mastered Triads and are practising Sharp keys and Numerals.',
    );
    // Named once, it counts once: one gate each, so "or".
    expect(
      opensOnceText('Keys', [
        { master: ['A'], practise: ['A'] },
        { master: ['B'], practise: [] },
      ]),
    ).toBe('Keys opens once you’ve mastered A or B.');
  });

  it('says "or" between openers that each wait for one thing: any one opens it (M10-21)', () => {
    expect(
      opensOnceText('Ear', [
        { master: [], practise: ['The musical alphabet'] },
        { master: [], practise: ['Natural notes on string 6'] },
      ]),
    ).toBe('Ear opens once you’re practising The musical alphabet or Natural notes on string 6.');
    expect(
      opensOnceText('Keys', [
        { master: ['A'], practise: [] },
        { master: ['B'], practise: [] },
        { master: ['C'], practise: [] },
      ]),
    ).toBe('Keys opens once you’ve mastered A, B or C.');
    expect(
      opensOnceText('Keys', [
        { master: ['A'], practise: [] },
        { master: [], practise: ['B'] },
      ]),
    ).toBe('Keys opens once you’ve mastered A or are practising B.');
  });

  it('names only the nearest opener when one waits for several things, never "and" across openers', () => {
    expect(
      opensOnceText('Chords', [
        { master: ['3rds', '4ths'], practise: [] },
        { master: [], practise: ['Sharp keys'] },
      ]),
    ).toBe('Chords opens once you’re practising Sharp keys.');
    // Of as many gates, the fewer to master is nearer.
    expect(
      opensOnceText('Progressions', [
        { master: ['Triads'], practise: ['Roman numerals'] },
        { master: [], practise: ['Sharp keys', 'Triads'] },
      ]),
    ).toBe('Progressions opens once you’re practising Sharp keys and Triads.');
    // A full tie goes to the earliest opener.
    expect(
      opensOnceText('Chords', [
        { master: ['3rds'], practise: ['Sharp keys'] },
        { master: ['4ths', '5ths'], practise: [] },
      ]),
    ).toBe('Chords opens once you’ve mastered 3rds and are practising Sharp keys.');
  });
});

describe('TestOut', () => {
  it('offers a locked module a test of what it still needs', () => {
    renderOffer();
    const offer = screen.getByRole('region', { name: 'Already know this?' });
    expect(offer).toHaveTextContent(/Gated opens once you’ve mastered Natural notes on string 6\./);
    expect(offer).toHaveTextContent(/a short test of Natural notes on string 6/);
    expect(within(offer).getByRole('button', { name: 'Test out' })).toBeInTheDocument();
  });

  it('leaves out a first skill gated where placement can’t probe (the Ear module, M4-16)', () => {
    const ear = MODULES.find((m) => m.id === 'ear')!;
    const statuses = new Map<string, SkillStatus>();
    for (const s of ALL_SKILLS) statuses.set(s.id, deriveStatus(s, statuses, undefined));
    // Progression ear is a locked first skill, behind C9 in Progressions.
    expect(statuses.get('I6.progressions-pop')).toBe('locked');
    render(
      <MemoryRouter>
        <TestOut module={ear} offer statuses={statuses} skills={ALL_SKILLS} drills={ALL_DRILLS} />
      </MemoryRouter>,
    );
    const offer = screen.getByRole('region', { name: 'Already know this?' });
    // Either first skill opens the module, so its gates are alternatives (M10-21).
    expect(offer).toHaveTextContent(
      /Ear opens once you’re practising The musical alphabet or Natural notes on string 6\./,
    );
    expect(offer).toHaveTextContent(
      /a short test of The musical alphabet and Natural notes on string 6\./,
    );
    expect(offer).not.toHaveTextContent(/Progressions/);
  });

  it('leaves out an opener that adds no new way in (M10-21)', () => {
    const string5 = getSkill('F2.string5-naturals') as Skill;
    const opener = (id: string, order: number, prerequisites: string[]): Skill => ({
      ...GATED,
      id,
      order,
      prerequisites,
    });
    // Ways in: string 6, string 6 again, string 6 and 5 together, or string 5.
    // The twin and the pair add nothing, so the two single ways remain.
    const skills = [
      STRING6,
      string5,
      GATED,
      opener('T1.twin', 1, [STRING6.id]),
      opener('T1.pair', 2, [STRING6.id, string5.id]),
      opener('T1.five', 3, [string5.id]),
    ];
    const statuses = new Map<string, SkillStatus>();
    for (const s of skills) statuses.set(s.id, deriveStatus(s, statuses, undefined));
    render(
      <MemoryRouter>
        <TestOut module={MODULE} offer statuses={statuses} skills={skills} drills={DRILLS} />
      </MemoryRouter>,
    );
    const offer = screen.getByRole('region', { name: 'Already know this?' });
    expect(offer).toHaveTextContent(
      /Gated opens once you’ve mastered Natural notes on string 6 or Natural notes on string 5\. /,
    );
  });

  it('names a skill once across openers: mastering it meets practising it', () => {
    // One way in needs string 6 mastered, another only practising: the second will do.
    const soft: Skill = {
      ...GATED,
      id: 'T1.soft',
      order: 1,
      prerequisites: [],
      softPrerequisites: [STRING6.id],
    };
    const skills = [STRING6, GATED, soft];
    const statuses = new Map<string, SkillStatus>();
    for (const s of skills) statuses.set(s.id, deriveStatus(s, statuses, undefined));
    expect(statuses.get(soft.id)).toBe('locked');
    render(
      <MemoryRouter>
        <TestOut module={MODULE} offer statuses={statuses} skills={skills} drills={DRILLS} />
      </MemoryRouter>,
    );
    const offer = screen.getByRole('region', { name: 'Already know this?' });
    expect(offer).toHaveTextContent(
      /Gated opens once you’re practising Natural notes on string 6\. /,
    );
  });

  it('offers nothing to an open module, before statuses load, or before settings load', () => {
    const { unmount } = renderOffer({ offer: false });
    expect(screen.queryByRole('button', { name: 'Test out' })).not.toBeInTheDocument();
    unmount();
    renderOffer({ statuses: undefined }).unmount();
    expect(screen.queryByRole('button', { name: 'Test out' })).not.toBeInTheDocument();
    useAppStore.setState({ loaded: false });
    renderOffer();
    expect(screen.queryByRole('button', { name: 'Test out' })).not.toBeInTheDocument();
  });

  it('offers nothing once what it builds on is met', () => {
    renderOffer({ statuses: derive(new Map([[STRING6.id, 'mastered']])) });
    expect(screen.queryByRole('button', { name: 'Test out' })).not.toBeInTheDocument();
  });

  it('starts at once, and a fluent test-out masters the prerequisite and opens the module', async () => {
    const onSaved = vi.fn();
    renderOffer({ onSaved });
    await startTestOut();
    expect(dialog()).toHaveAttribute('aria-modal', 'true');
    expect(
      within(dialog()).getByRole('progressbar', { name: 'Test out progress' }),
    ).toBeInTheDocument();
    for (let i = 0; i < 3; i++) {
      const id = screen.getByTestId('placement-probe').dataset.item!;
      await answerRight();
      await nextProbe(id);
    }
    await answerRight();
    const result = await screen.findByTestId('test-out-result', {}, { timeout: 3000 });
    // Focus moves in an effect after the result renders.
    await waitFor(() => expect(result).toHaveFocus());
    expect(within(result).getByRole('list', { name: 'What the test found' })).toHaveTextContent(
      'Neck basics: known.',
    );
    expect(result).toHaveTextContent(/Gated is open/);
    expect(within(result).getByRole('link', { name: 'Start a Gated session' })).toHaveAttribute(
      'href',
      '/session?skill=T1.gated',
    );
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect((await getSkillStates(db)).get(STRING6.id)).toMatchObject({ status: 'mastered' });
    // Probes are logged as placement reviews (rule 17).
    expect((await db.reviewLogs.toArray()).map((l) => l.drillType)).toEqual(
      Array(4).fill('placement:name-the-note'),
    );
  });

  it('a test-out ended early says what to practise, and opens nothing', async () => {
    renderOffer();
    await startTestOut();
    await answerRight();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Finish now' }));
    const result = await screen.findByTestId('test-out-result');
    expect(result).toHaveTextContent('Neck basics: let’s practise those first.');
    expect(result).toHaveTextContent(
      /Gated opens once you’ve mastered Natural notes on string 6\./,
    );
    expect(within(result).queryByRole('link')).not.toBeInTheDocument();
    expect((await getSkillStates(db)).has(STRING6.id)).toBe(false);
  });

  it('a slow answer fails the test-out: every probe must be fluent', async () => {
    renderOffer();
    await startTestOut();
    // Correct but well past the speed target.
    t = 10_000;
    await answerRight();
    const result = await screen.findByTestId('test-out-result', {}, { timeout: 3000 });
    expect(result).toHaveTextContent('Neck basics: let’s practise those first.');
  });
  it('a still-locked module can be tested out again', async () => {
    renderOffer();
    await startTestOut();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Finish now' }));
    const result = await screen.findByTestId('test-out-result');
    fireEvent.click(within(result).getByRole('button', { name: 'Test out again' }));
    expect(screen.queryByTestId('test-out-result')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Already know this?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test out' })).toHaveFocus();
    await startTestOut();
    expect(screen.getByTestId('placement-probe')).toBeInTheDocument();
  });

  it('an opened module offers no second test-out', async () => {
    const { rerender } = renderOffer();
    await startTestOut();
    for (let i = 0; i < 3; i++) {
      const id = screen.getByTestId('placement-probe').dataset.item!;
      await answerRight();
      await nextProbe(id);
    }
    await answerRight();
    const result = await screen.findByTestId('test-out-result', {}, { timeout: 3000 });
    expect(within(result).queryByRole('button', { name: 'Test out again' })).toBeNull();
    // Nor once the screen reloads and the module isn't locked.
    rerender(
      <MemoryRouter>
        <TestOut
          module={MODULE}
          offer={false}
          statuses={derive()}
          skills={SKILLS}
          drills={DRILLS}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: 'Test out again' })).toBeNull();
  });

  it('asks first about an item whose own card is still weak', async () => {
    // The last of the 8 `note@` items: the shuffle alone would start with the first.
    const weak = STRING6.items()
      .filter((i) => i.id.startsWith('note@'))
      .at(-1)!;
    const scheduler = createScheduler({ enableFuzz: false });
    await db.cards.put(scheduler.seedKnownCard(weak, NOW, 1));
    const { unmount } = renderOffer();
    await startTestOut();
    expect(screen.getByTestId('placement-probe').dataset.item).toBe(weak.id);
    unmount();
  });
});

import { Element as VexElement } from 'vexflow/bravura';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useAppStore } from '../../app-store';
import { DEFAULT_SETTINGS, type GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import type { SizeClass } from '../../shell/size-class';
import { resolveView } from '../lazy-view';
import { getDrill } from '../registry';
import type { DrillFeedback } from '../types';
import { MeterContextPanel } from './ContextPanel';
import { D30View } from './D30View';
import { d30Check, d30Clip, d30MakePrompt, type D30Answer, type D30Prompt } from './logic';
import { playClip, stopClip } from './play';

vi.mock('./play', () => ({
  playClip: vi.fn(() => Promise.resolve()),
  stopClip: vi.fn(),
}));

const prompt = (meter = '6/8', scopeLevel = 1, r = 0) =>
  d30MakePrompt(
    { id: `meter-ear:${meter}`, skillId: 'T4.test' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel, rng: () => r },
  );

interface Opts {
  guided?: boolean;
  sizeClass?: SizeClass;
  feedback?: DrillFeedback<D30Answer> | null;
}

function renderView(p: D30Prompt, opts: Opts = {}) {
  const onAnswer = vi.fn();
  const props = {
    prompt: p,
    guideLevel: 3 as GuideLevel,
    guided: opts.guided ?? false,
    handedness: 'right' as const,
    sizeClass: opts.sizeClass ?? ('regular-wide' as SizeClass),
    tuning: STANDARD_TUNING,
    feedback: opts.feedback ?? null,
    onAnswer,
    aside: <aside data-testid="context-panel" />,
  };
  const utils = render(<D30View {...props} />);
  return { onAnswer, props, ...utils };
}

const answers = () =>
  within(screen.getByRole('group', { name: /Which meter|This is/ })).getAllByRole('button');
const fb = (p: D30Prompt, answer: D30Answer) => ({ answer, result: d30Check(p, answer) });

// jsdom has no canvas; give VexFlow a stand-in to measure glyphs with, as Staff.test does.
beforeAll(() => {
  VexElement.setTextMeasurementCanvas({
    getContext: () => ({
      font: '',
      measureText: (t: string) => ({
        width: 10 * t.length,
        actualBoundingBoxAscent: 10,
        actualBoundingBoxDescent: 10,
      }),
    }),
  } as unknown as HTMLCanvasElement);
});

beforeEach(() => {
  vi.mocked(playClip).mockClear();
  vi.mocked(stopClip).mockClear();
});

afterEach(() => {
  useAppStore.setState({ settings: DEFAULT_SETTINGS });
});

describe('<D30View>', () => {
  it('is registered as the meter drill for T4 and T7, needing sound', async () => {
    const drill = getDrill('hear-the-meter')!;
    expect(await resolveView(drill.render)).toBe(D30View);
    expect(await resolveView(drill.contextPanel!)).toBe(MeterContextPanel);
    expect(drill.skills).toEqual(['T4.simple', 'T4.compound', 'T7.odd']);
    expect(drill.requiresSound).toBe(true);
    expect(drill.feedbackHoldMs).toBeGreaterThan(1000);
  });

  it('plays the clip as the prompt opens, and again on demand', () => {
    const p = prompt();
    const { unmount } = renderView(p);
    expect(playClip).toHaveBeenCalledTimes(1);
    expect(playClip).toHaveBeenLastCalledWith(d30Clip(p));

    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(playClip).toHaveBeenLastCalledWith(d30Clip(p), { fromGesture: true });
    fireEvent.keyDown(window, { key: 'r' });
    expect(playClip).toHaveBeenCalledTimes(3);

    unmount();
    expect(stopClip).toHaveBeenCalled();
  });

  it('asks with meter names first, and no notation until the answer is in', () => {
    const { onAnswer, container } = renderView(prompt());
    expect(screen.getByText('Which meter is it?')).toBeVisible();
    expect(answers().map((b) => b.getAttribute('aria-label'))).toEqual(['3/4 time', '6/8 time']);
    expect(answers().map((b) => b.textContent)).toEqual(['3/4waltz', '6/8ballad, jig']);
    expect(screen.getByRole('button', { name: '6/8 time' })).toHaveAttribute(
      'aria-keyshortcuts',
      '2',
    );
    // Sound before symbol: no staff, no counting.
    expect(screen.queryByTestId('d30-notation')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '6/8 time' }));
    expect(onAnswer).toHaveBeenCalledWith('6/8');
    fireEvent.keyDown(window, { key: '1' });
    expect(onAnswer).toHaveBeenLastCalledWith('3/4');
    fireEvent.keyDown(window, { key: '1', ctrlKey: true });
    fireEvent.keyDown(window, { key: '5' });
    expect(onAnswer).toHaveBeenCalledTimes(2);
  });

  it('walks a new item through first: names the meter, then asks for it (rule 8)', () => {
    renderView(prompt('3/4', 0), { guided: true });
    expect(screen.getByText(/This is 3\/4\. Three beats/)).toBeVisible();
    expect(screen.getByText(/Listen, then tap/)).toHaveTextContent(/Listen, then tap 3\/4\.$/);
  });

  it('shows the time signature, a note per beat and the counting after a right answer (rule 10)', async () => {
    const p = prompt();
    renderView(p, { feedback: fb(p, '6/8') });
    expect(screen.getByRole('button', { name: '6/8 time' })).toHaveAttribute(
      'data-state',
      'correct',
    );
    expect(screen.getByTestId('d30-feedback')).toHaveTextContent(
      '6/8. Compound duple: 2 dotted-quarter beats, each split in 3.',
    );
    const staff = screen.getByRole('group', { name: 'One bar of 6/8: 2 beats' });
    await waitFor(() => expect(staff).toHaveAttribute('data-ready', 'true'));
    expect(
      within(staff)
        .getAllByRole('img')
        .map((n) => n.getAttribute('aria-label')),
    ).toEqual([
      expect.stringMatching(/^dotted quarter note/),
      expect.stringMatching(/^dotted quarter note/),
    ]);
    const count = screen.getByRole('list', { name: 'Counted 1 la li 2 la li' });
    expect(
      within(count)
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('data-accent')),
    ).toEqual(['bar', 'off', 'off', 'beat', 'off', 'off']);
    // Heard already: no replay, nothing to compare.
    expect(playClip).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('group', { name: 'Compare the meters' })).toBeNull();
  });

  it('replays the right meter after a wrong answer, and both side by side on demand', () => {
    const p = prompt();
    renderView(p, { feedback: fb(p, '3/4') });
    expect(screen.getByRole('button', { name: '3/4 time' })).toHaveAttribute('data-state', 'wrong');
    expect(screen.getByRole('button', { name: '6/8 time' })).toHaveAttribute(
      'data-state',
      'expected',
    );
    expect(screen.getByTestId('d30-feedback')).toHaveTextContent(/Both bars hold six eighths/);
    expect(playClip).toHaveBeenCalledTimes(2);

    const compare = screen.getByRole('group', { name: 'Compare the meters' });
    fireEvent.click(within(compare).getByRole('button', { name: 'Hear yours: 3/4' }));
    expect(playClip).toHaveBeenLastCalledWith(d30Clip(p, '3/4'), { fromGesture: true });
    fireEvent.click(within(compare).getByRole('button', { name: 'Hear the answer: 6/8' }));
    expect(playClip).toHaveBeenLastCalledWith(d30Clip(p, '6/8'), { fromGesture: true });
    // Answers are closed in feedback.
    const calls = vi.mocked(playClip).mock.calls.length;
    fireEvent.keyDown(window, { key: '1' });
    expect(playClip).toHaveBeenCalledTimes(calls);
  });

  it('names the grouping an odd meter was played in', () => {
    const p = prompt('7/8', 0, 0.5);
    renderView(p, { feedback: fb(p, '7/8') });
    expect(screen.getByTestId('d30-feedback')).toHaveTextContent('7/8 (3+2+2). Odd meter');
    expect(screen.getByRole('list', { name: 'Counted 1 la li 2 & 3 &' })).toBeInTheDocument();
  });

  it('says when silent mode leaves the clip unheard', () => {
    act(() => useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, soundOn: false } }));
    renderView(prompt());
    expect(screen.getByRole('status')).toHaveTextContent('Sound is off');
  });

  it('places the panel beside the card on iPad landscape, below elsewhere', () => {
    const wide = renderView(prompt());
    const upper = wide.container.querySelector('[data-testid="d30-drill"] > div')!;
    expect(upper.lastElementChild).toBe(screen.getByTestId('context-panel'));
    wide.unmount();
    const { container } = renderView(prompt(), { sizeClass: 'compact' });
    const drill = container.querySelector('[data-testid="d30-drill"]')!;
    expect(drill.lastElementChild).toBe(screen.getByTestId('context-panel'));
    expect(drill).toHaveAttribute('data-item', 'meter-ear:6/8');
  });
});

describe('<MeterContextPanel>', () => {
  const panel = (guideLevel: GuideLevel, guided = false) => {
    const p = prompt('6/8', 2);
    return render(
      <MeterContextPanel
        prompt={p}
        guideLevel={guideLevel}
        guided={guided}
        handedness="right"
        tuning={STANDARD_TUNING}
        feedback={null}
      />,
    );
  };

  it('counts every button alike from level 1, and adds what to listen for from level 2', () => {
    const { rerender, container } = panel(1);
    expect(screen.getByRole('heading', { name: 'Meters' })).toBeVisible();
    expect(container.querySelectorAll('dt')).toHaveLength(6);
    expect(screen.getByText('1 la li 2 la li')).toBeVisible();
    expect(screen.queryByText(/Two big beats/)).toBeNull();
    rerender(
      <MeterContextPanel
        prompt={prompt('6/8', 2)}
        guideLevel={2}
        guided={false}
        handedness="right"
        tuning={STANDARD_TUNING}
        feedback={null}
      />,
    );
    expect(screen.getByText(/Two big beats/)).toBeVisible();
  });

  it('is empty at level 0, but full for a worked example', () => {
    const empty = panel(0);
    expect(empty.container.querySelectorAll('dt')).toHaveLength(0);
    empty.unmount();
    const guided = panel(0, true);
    expect(guided.container.querySelectorAll('dt')).toHaveLength(6);
  });
});

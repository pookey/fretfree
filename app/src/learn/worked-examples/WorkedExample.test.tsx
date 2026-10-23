import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useAppStore } from '../../app-store';
import { playNotes } from '../../audio/audio';
import { DEFAULT_SETTINGS } from '../../engine';
import { WORKED_EXAMPLES } from './index';
import { WorkedExample } from './WorkedExample';

vi.mock('../../audio/audio', () => ({ playNotes: vi.fn(() => Promise.resolve()) }));

const gb = WORKED_EXAMPLES.find((e) => e.id === 'c2-gb-octaves')!;
const thirds = WORKED_EXAMPLES.find((e) => e.id === 'c3-gb-thirds')!;

const neck = () => screen.getByRole('group', { name: 'Worked example neck' });
const tap = (string: number, fret: number) =>
  fireEvent.pointerDown(
    within(neck()).getByRole('button', { name: `string ${string}, fret ${fret}` }),
  );
const stage = () => screen.getByTestId('worked-example').getAttribute('data-stage');
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));

beforeEach(() => {
  vi.mocked(playNotes).mockClear();
  useAppStore.setState({ settings: { ...DEFAULT_SETTINGS } });
});

describe('<WorkedExample>', () => {
  it('works the example, then fades the guides to a hint, then to none', () => {
    render(<WorkedExample example={gb} />);
    // Worked: full guides, the answer shown, the unshifted shape as a ghost.
    expect(stage()).toBe('worked');
    expect(neck()).toHaveAttribute('data-guide-level', '3');
    expect(screen.getByTestId('example-prompt')).toHaveTextContent(
      'Find the octave of G on string 2.',
    );
    expect(screen.getByText(/major 3rd above G, not a 4th/)).toBeInTheDocument();
    expect(screen.getByTestId('marker-target')).toHaveAttribute('data-fret', '8');
    expect(screen.getByTestId('marker-ghost')).toHaveAttribute('data-fret', '7');
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Worked example');

    // Tapping elsewhere only nudges; tapping the answer completes the stage.
    tap(2, 7);
    expect(screen.getByTestId('example-instruction')).toHaveTextContent('Tap the highlighted G');
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    tap(2, 8);
    expect(screen.getByTestId('example-correct')).toBeInTheDocument();
    expect(playNotes).toHaveBeenCalledWith(['G3', 'G4'], { muted: false, volume: 0.8 });
    next();

    // Faded: roots and a hint, no answer on the neck.
    expect(stage()).toBe('faded');
    expect(neck()).toHaveAttribute('data-guide-level', '2');
    expect(screen.getByTestId('example-hint')).toHaveTextContent('Two strings up, three frets up.');
    expect(screen.queryByTestId('marker-target')).toBeNull();
    tap(1, 5);
    expect(screen.getByTestId('example-correct')).toHaveTextContent('string 1, fret 5');
    expect(screen.queryByTestId('example-hint')).toBeNull();
    next();

    // Independent: inlays only, no hint, no explanation until the answer.
    expect(stage()).toBe('independent');
    expect(neck()).toHaveAttribute('data-guide-level', '1');
    expect(screen.queryByTestId('example-hint')).toBeNull();
    expect(screen.queryByText(/major 3rd above G/)).toBeNull();
    tap(2, 10);
    expect(screen.getByTestId('example-done')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('calls out the G–B misconception when the learner falls for it', () => {
    render(<WorkedExample example={gb} />);
    tap(2, 8);
    next();
    tap(1, 4);
    const wrong = screen.getByTestId('example-wrong');
    expect(wrong).toHaveTextContent('That’s G♯.');
    expect(within(wrong).getByRole('complementary', { name: 'Watch out for' })).toHaveTextContent(
      'Fret 4 is the shape without the G–B shift.',
    );
    expect(screen.getByTestId('marker-correct')).toHaveAttribute('data-fret', '5');
    expect(screen.getByTestId('marker-wrong')).toHaveAttribute('data-fret', '4');
  });

  it('corrects other mistakes without the callout, then starts again', () => {
    render(<WorkedExample example={gb} />);
    tap(2, 8);
    next();
    tap(1, 5);
    next();
    tap(3, 8);
    expect(screen.getByTestId('example-wrong')).toHaveTextContent('That’s D♯.');
    expect(screen.queryByTestId('example-trap')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start again' }));
    expect(stage()).toBe('worked');
    expect(screen.queryByTestId('example-done')).toBeNull();
  });

  it('respects the sound setting, and plays once per answer', () => {
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, soundOn: false } });
    render(<WorkedExample example={gb} />);
    tap(2, 8);
    expect(playNotes).toHaveBeenCalledTimes(1);
    expect(playNotes).toHaveBeenCalledWith(['G3', 'G4'], { muted: true, volume: 0.8 });
    // Changing settings after the answer doesn't replay it; nor does a second tap.
    act(() => useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, volume: 0.3 } }));
    tap(2, 8);
    expect(playNotes).toHaveBeenCalledTimes(1);
  });

  it('spells the trap as its interval, whatever the accidental preference', () => {
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, accidentalPref: 'sharp' } });
    render(<WorkedExample example={thirds} />);
    // C → fret 4 on the B string is a minor 3rd: E♭, even for a sharps learner.
    expect(screen.getByTestId('marker-ghost')).toHaveTextContent('E♭');
    tap(2, 5);
    next();
    tap(2, 9);
    expect(screen.getByTestId('example-wrong')).toHaveTextContent('✗ That’s A♭.');
    // The tapped trap on the neck agrees: A♭, not the sharps learner's G♯.
    expect(screen.getByTestId('marker-wrong')).toHaveTextContent(/^A♭$/);
    expect(screen.getByTestId('marker-wrong')).toHaveAccessibleName('A flat');
    expect(screen.getByTestId('example-trap')).toHaveTextContent("That's Ab: a minor 3rd");
  });

  it('spells other wrong taps with the learner’s preference', () => {
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, accidentalPref: 'flat' } });
    render(<WorkedExample example={gb} />);
    tap(2, 8);
    next();
    tap(1, 6);
    expect(screen.getByTestId('example-wrong')).toHaveTextContent('✗ That’s B♭.');
  });
});

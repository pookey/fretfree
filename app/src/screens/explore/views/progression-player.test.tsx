import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import * as audio from '../../../audio/audio';
import { useAppStore } from '../../../app-store';
import { SKILLS } from '../../../engine';
import { getProgression, getTuning, majorKey, minorKey } from '../../../theory';
import {
  View,
  chartLabel,
  chartSubLabel,
  chordMarkers,
  closeVoicing,
  keyChoices,
  keyForProgression,
  keyTitle,
  openVoicing,
  playerChart,
  playerQuizFocus,
  pretty,
} from './progression-player';

afterEach(() => vi.restoreAllMocks());

const frets = (v: ReturnType<typeof openVoicing>) =>
  [6, 5, 4, 3, 2, 1].map((s) => v?.find((n) => n.string === s)?.fret ?? 'x').join('');

describe('keys and spelling', () => {
  it('writes accidentals as symbols', () => {
    expect(pretty('F#m')).toBe('F♯m');
    expect(pretty('Bb7')).toBe('B♭7');
    expect(pretty('bVII')).toBe('♭VII');
    expect(pretty('b7')).toBe('♭7');
    expect(pretty('i–bVII–bVI')).toBe('i–♭VII–♭VI');
    expect(pretty('Bdim')).toBe('Bdim');
    expect(keyTitle(minorKey('Eb'))).toBe('E♭ minor');
  });

  it('lists the twelve keys of a mode, spelled as the circle names them', () => {
    expect(keyChoices('major').map((k) => k.tonic)).toEqual([
      'C',
      'Db',
      'D',
      'Eb',
      'E',
      'F',
      'F#',
      'G',
      'Ab',
      'A',
      'Bb',
      'B',
    ]);
    expect(keyChoices('minor').map((k) => k.tonic)).toContain('F#');
    expect(new Set(keyChoices('minor').map((k) => k.mode))).toEqual(new Set(['minor']));
  });

  it('keeps the key for a progression in its mode and moves to the relative otherwise', () => {
    const minor = getProgression('i-bVII-bVI-bVII');
    const pop = getProgression('I-V-vi-IV');
    expect(keyForProgression(majorKey('G'), pop)).toEqual(majorKey('G'));
    expect(keyForProgression(majorKey('C'), minor)).toEqual(minorKey('A'));
    expect(keyForProgression(majorKey('Bb'), minor)).toEqual(minorKey('G'));
    expect(keyForProgression(minorKey('E'), pop)).toEqual(majorKey('G'));
  });
});

describe('openVoicing', () => {
  it('picks the open chords near the nut', () => {
    expect(frets(openVoicing({ root: 'C', quality: 'major' }))).toBe('x32010');
    expect(frets(openVoicing({ root: 'A', quality: 'minor' }))).toBe('x02210');
    expect(frets(openVoicing({ root: 'E', quality: 'minor' }))).toBe('022000');
    expect(frets(openVoicing({ root: 'D', quality: 'major' }))).toBe('xx0232');
  });

  it('falls back to a barre chord, preferring the fuller shape on a tie', () => {
    expect(frets(openVoicing({ root: 'F', quality: 'major' }))).toBe('133211');
    expect(frets(openVoicing({ root: 'Bb', quality: 'major' }))).toBe('x13331');
  });

  it('voices sevenths, and gives nothing for chords with no movable shape', () => {
    expect(openVoicing({ root: 'E', quality: 'dominant7' })?.some((n) => n.degree === 'b7')).toBe(
      true,
    );
    expect(openVoicing({ root: 'B', quality: 'diminished' })).toBeNull();
    expect(openVoicing({ root: 'C', quality: 'major' }, undefined, 0)).toBeNull();
  });
});

describe('playerChart', () => {
  const pop = getProgression('I-V-vi-IV');

  it('realises a progression in a key with sounding pitches', () => {
    const chart = playerChart(pop, majorKey('C'));
    expect(chart.map((c) => c.shape.symbol)).toEqual(['C', 'G', 'Am', 'F']);
    expect(chart.map((c) => c.roman)).toEqual(['I', 'V', 'vi', 'IV']);
    expect(chart.map((c) => c.nashville)).toEqual(['1', '5', '6m', '4']);
    expect(chart[0]!.notes).toEqual(['C3', 'E3', 'G3', 'C4', 'E4']);
  });

  it('keeps the numerals when the key moves', () => {
    const chart = playerChart(pop, majorKey('D'));
    expect(chart.map((c) => c.shape.symbol)).toEqual(['D', 'A', 'Bm', 'G']);
    expect(chart.map((c) => c.roman)).toEqual(['I', 'V', 'vi', 'IV']);
  });

  it('fingers shapes under a capo and sounds the key', () => {
    const chart = playerChart(pop, majorKey('Bb'), 3);
    expect(chart.map((c) => c.shape.symbol)).toEqual(['G', 'D', 'Em', 'C']);
    expect(chart.map((c) => c.sounding.symbol)).toEqual(['Bb', 'F', 'Gm', 'Eb']);
    // The open G shape, three frets up: B♭ D F B♭ D B♭.
    expect(chart[0]!.notes).toEqual(['A#2', 'D3', 'F3', 'A#3', 'D4', 'A#4']);
    expect(chordMarkers(chart[0]!, 3).map((m) => m.label)).toEqual([
      'B♭',
      'D',
      'F',
      'B♭',
      'D',
      'B♭',
    ]);
    expect(chordMarkers(chart[0]!, 3).every((m) => m.fret >= 3)).toBe(true);
  });

  it('marks the voicing by degree on the neck', () => {
    const [c] = playerChart(pop, majorKey('C'));
    const markers = chordMarkers(c!);
    expect(markers.find((m) => m.string === 5)).toMatchObject({ fret: 3, style: 'root' });
    expect(markers.find((m) => m.string === 4)).toMatchObject({ style: 'third', label: 'E' });
    expect(markers.find((m) => m.string === 3)).toMatchObject({ fret: 0, style: 'fifth' });
    const blues = playerChart(getProgression('12-bar-blues'), majorKey('A'));
    expect(chordMarkers(blues[0]!).some((m) => m.style === 'seventh')).toBe(true);
  });

  it('plays a close-position chord where there is no voicing', () => {
    expect(closeVoicing({ root: 'C', quality: 'major' })).toEqual(['C3', 'E3', 'G3']);
    expect(closeVoicing({ root: 'B', quality: 'diminished' })).toEqual(['B3', 'D4', 'F4']);
    const [c] = playerChart(getProgression('I-IV-V'), majorKey('C'), 0, getTuning('drop-d'));
    expect(chordMarkers({ ...c!, voicing: null })).toEqual([]);
  });

  it('labels a card by chord, Roman numeral or Nashville number', () => {
    const minor = playerChart(getProgression('i-bVII-bVI-bVII'), minorKey('A'));
    const flat7 = minor[1]!;
    expect(chartLabel(flat7, 'chords')).toBe('G');
    expect(chartSubLabel(flat7, 'chords')).toBe('♭VII');
    expect(chartLabel(flat7, 'roman')).toBe('♭VII');
    expect(chartSubLabel(flat7, 'roman')).toBe('G');
    expect(chartLabel(flat7, 'nashville')).toBe('♭7');
  });
});

describe('playerQuizFocus', () => {
  const ids = (topic: string) => SKILLS.filter((s) => s.topic === topic).map((s) => s.id);

  it('quizzes the C9 skill that teaches the progression once it is open', () => {
    expect(playerQuizFocus('vi-IV-I-V', 0, new Set(['C9.pop']))).toEqual({ skillIds: ['C9.pop'] });
    expect(playerQuizFocus('12-bar-blues', 0, new Set(['C9.blues']))).toEqual({
      skillIds: ['C9.blues'],
    });
  });

  it('adds the capo skills with a capo on', () => {
    const open = new Set(['C9.pop', ...ids('C10')]);
    expect(playerQuizFocus('I-IV-V', 2, open)).toEqual({ skillIds: ['C9.pop', ...ids('C10')] });
  });

  it('walks back to the nearest open prerequisite while the skill is locked', () => {
    expect(playerQuizFocus('ii-V-I', 0, new Set(['C8.numerals-major']))).toEqual({
      skillIds: ['C8.numerals-major'],
    });
  });

  it('falls back to the progression skill when nothing on the way is open', () => {
    expect(playerQuizFocus('I-V-vi-IV', 0)).toEqual({ skillIds: ['C9.pop'] });
    expect(playerQuizFocus('I-V-vi-IV', 0, new Set(), [])).toEqual({ skillIds: [] });
  });
});

function renderView() {
  return render(
    <MemoryRouter>
      <View />
    </MemoryRouter>,
  );
}

const cards = () => screen.getAllByTestId('player-chord');

interface Captured {
  chords: readonly audio.ProgressionChord[];
  opts: audio.ProgressionOptions;
  stop: ReturnType<typeof vi.fn>;
}

/** Stand in for the Transport: record each start, and let the test fire its cues. */
function fakePlayback(started = true) {
  const runs: Captured[] = [];
  const spy = vi.spyOn(audio, 'playProgression').mockImplementation(async (chords, opts = {}) => {
    const stop = vi.fn(() => opts.onEnd?.());
    runs.push({ chords, opts, stop });
    return { started, stop, done: Promise.resolve() };
  });
  return { runs, spy };
}

describe('<View>', () => {
  it('shows the pop progression in C with its chart and the first chord on the neck', () => {
    renderView();
    expect(screen.getByTestId('player-title')).toHaveTextContent('I–V–vi–IV in C major');
    expect(cards().map((c) => c.textContent)).toEqual(['CI', 'GV', 'Amvi', 'FIV']);
    expect(cards()[0]).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('player-neck-chord')).toHaveTextContent('C');
    expect(screen.getByRole('group', { name: 'C voicing' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quiz me on this' }).getAttribute('href')).toMatch(
      /^\/session\?skill=/,
    );
  });

  it('switches between chord names, numerals and Nashville numbers', () => {
    renderView();
    fireEvent.click(screen.getByRole('radio', { name: 'Numerals' }));
    expect(cards().map((c) => c.textContent)).toEqual(['IC', 'VG', 'viAm', 'IVF']);
    fireEvent.click(screen.getByRole('radio', { name: 'Nashville' }));
    expect(cards().map((c) => c.textContent)).toEqual(['1C', '5G', '6mAm', '4F']);
  });

  it('transposes to another key and keeps the key signature for a minor progression', () => {
    renderView();
    fireEvent.change(screen.getByRole('combobox', { name: 'Key' }), { target: { value: '7' } });
    expect(screen.getByTestId('player-title')).toHaveTextContent('in G major');
    expect(cards().map((c) => c.textContent)).toEqual(['GI', 'DV', 'Emvi', 'CIV']);

    fireEvent.change(screen.getByRole('combobox', { name: 'Progression' }), {
      target: { value: 'i-bVII-bVI-bVII' },
    });
    expect(screen.getByTestId('player-title')).toHaveTextContent('i–♭VII–♭VI–♭VII in E minor');
    expect(cards().map((c) => c.textContent)).toEqual(['Emi', 'D♭VII', 'C♭VI', 'D♭VII']);
  });

  it('fingers capo shapes and offers the open-shape capos for the key', () => {
    renderView();
    fireEvent.change(screen.getByRole('combobox', { name: 'Key' }), { target: { value: '10' } });
    const suggest = screen.getByRole('button', { name: 'Capo 3: G major shapes' });
    fireEvent.click(suggest);
    expect(suggest).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: 'Capo' })).toHaveValue('3');
    expect(screen.getByTestId('player-capo')).toHaveTextContent(
      'Capo on fret 3: play G major shapes, sounding B♭ major.',
    );
    expect(cards()[0]).toHaveTextContent('GIsounds B♭');
    expect(screen.getByTestId('player-neck-chord')).toHaveTextContent('G shape, capo 3: sounds B♭');
    expect(screen.getByRole('group', { name: 'G voicing, capo on fret 3' })).toBeInTheDocument();
  });

  it('strums a tapped chord and shows it on the neck', async () => {
    const strum = vi.spyOn(audio, 'strum').mockResolvedValue();
    renderView();
    fireEvent.click(cards()[2]!);
    expect(cards()[2]).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('player-neck-chord')).toHaveTextContent('Am');
    await vi.waitFor(() =>
      expect(strum).toHaveBeenCalledWith(
        ['A2', 'E3', 'A3', 'C4', 'E4'],
        expect.objectContaining({ muted: false }),
      ),
    );
  });

  it('plays the progression on a loop, marking each chord as it sounds', async () => {
    const { runs } = fakePlayback();
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    const [run] = runs;
    expect(run!.chords).toHaveLength(4);
    expect(run!.opts).toMatchObject({ bpm: 80, pattern: 'once', loop: true });
    expect(await screen.findByRole('button', { name: 'Stop' })).toBeInTheDocument();

    act(() => run!.opts.onChord?.(1));
    expect(cards()[1]).toHaveAttribute('aria-current', 'step');
    expect(cards()[1]).toHaveAttribute('data-playing', 'true');
    expect(screen.getByTestId('player-neck-chord')).toHaveTextContent('G');

    // Tapping a card while it plays doesn't strum over it.
    const strum = vi.spyOn(audio, 'strum').mockResolvedValue();
    fireEvent.click(cards()[3]!);
    expect(strum).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(run!.stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(cards()[3]).toHaveAttribute('aria-current', 'step');
    expect(document.querySelector('[data-playing]')).toBeNull();
  });

  it('plays once through when the loop is off, and resets at the end', async () => {
    const { runs } = fakePlayback();
    renderView();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Loop' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Strum' }), {
      target: { value: 'folk' },
    });
    fireEvent.change(screen.getByRole('slider', { name: 'Tempo' }), { target: { value: '120' } });
    expect(screen.getByText('120 bpm')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    expect(runs[0]!.opts).toMatchObject({ bpm: 120, pattern: 'folk', loop: false });
    act(() => runs[0]!.opts.onEnd?.());
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('restarts a playing loop with a change, ignoring the old one’s cues', async () => {
    const { runs } = fakePlayback();
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    fireEvent.change(screen.getByRole('combobox', { name: 'Key' }), { target: { value: '2' } });
    await vi.waitFor(() => expect(runs).toHaveLength(2));
    expect(runs[1]!.chords[0]!.notes).toContain('D3');
    // The first run's late cue and its ending (as the second start stops it) change nothing.
    act(() => {
      runs[0]!.opts.onChord?.(3);
      runs[0]!.opts.onEnd?.();
    });
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(document.querySelector('[data-playing]')).toBeNull();
  });

  it('drops back to Play when the start is refused', async () => {
    const { runs } = fakePlayback(false);
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('stops the music when the view goes away', async () => {
    const { runs } = fakePlayback();
    const view = renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    await screen.findByRole('button', { name: 'Stop' });
    view.unmount();
    expect(runs[0]!.stop).toHaveBeenCalled();
  });

  it('cancels a start still waiting when stopped or unmounted', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const stop = vi.fn();
    vi.spyOn(audio, 'playProgression').mockImplementation(async () => {
      await gate;
      return { started: true, stop, done: Promise.resolve() };
    });
    const stopAudio = vi.spyOn(audio, 'stopAudio').mockImplementation(() => undefined);
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    await vi.waitFor(() => expect(audio.playProgression).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await vi.waitFor(() => expect(stopAudio).toHaveBeenCalled());
    await act(async () => release());
    // The overtaken start is stopped as soon as it lands.
    expect(stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('follows sound off for a tapped chord', async () => {
    const strum = vi.spyOn(audio, 'strum').mockResolvedValue();
    useAppStore.setState((s) => ({ settings: { ...s.settings, soundOn: false } }));
    renderView();
    fireEvent.click(cards()[1]!);
    await vi.waitFor(() =>
      expect(strum).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ muted: true }),
      ),
    );
    useAppStore.setState((s) => ({ settings: { ...s.settings, soundOn: true } }));
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import * as audio from '../../../audio/audio';
import { useAppStore } from '../../../app-store';
import { SKILLS } from '../../../engine';
import { CIRCLE_OF_FIFTHS, keySignature, majorKey, minorKey } from '../../../theory';
import {
  View,
  circleQuizFocus,
  circleSpellings,
  keyDetail,
  keyFamily,
  keyFromArrow,
  keyOfWedge,
  keyTitle,
  onCircle,
  pretty,
  signatureShort,
  signatureText,
  spoken,
  tonicTriad,
  wedgeId,
  wedgePath,
} from './circle-of-fifths';
import { frontierSkillIds } from './fretboard-explorer';

afterEach(() => vi.restoreAllMocks());

describe('spelling', () => {
  it('writes accidentals as symbols and words', () => {
    expect(pretty('F#')).toBe('F♯');
    expect(pretty('Bbm')).toBe('B♭m');
    expect(pretty('bVII')).toBe('♭VII');
    expect(pretty('Bdim')).toBe('Bdim');
    expect(spoken('F#')).toBe('F sharp');
    expect(spoken('Bb')).toBe('B flat');
    expect(spoken('C')).toBe('C');
    expect(keyTitle(minorKey('Eb'))).toBe('E♭ minor');
  });

  it('gives both spellings at the bottom of the circle, primary first', () => {
    expect(circleSpellings(0, 'major')).toEqual(['C']);
    expect(circleSpellings(5, 'major')).toEqual(['B', 'Cb']);
    expect(circleSpellings(6, 'major')).toEqual(['F#', 'Gb']);
    expect(circleSpellings(7, 'major')).toEqual(['Db', 'C#']);
    expect(circleSpellings(6, 'minor')).toEqual(['D#', 'Eb']);
    expect(circleSpellings(7, 'minor')).toEqual(['Bb', 'A#']);
    expect(circleSpellings(-1, 'major')).toEqual(['F']);
  });

  it('keeps a spelling the circle has and swaps a theoretical one for the primary', () => {
    expect(onCircle(majorKey('Gb'))).toEqual(majorKey('Gb'));
    expect(onCircle(majorKey('G#'))).toEqual(majorKey('Ab'));
    expect(onCircle(majorKey('Fb'))).toEqual(majorKey('E'));
    expect(onCircle(minorKey('A#'))).toEqual(minorKey('A#'));
  });

  it('describes signatures in full and in short', () => {
    expect(signatureText(keySignature(majorKey('C')))).toBe('No sharps or flats');
    expect(signatureText(keySignature(majorKey('G')))).toBe('1 sharp: F♯');
    expect(signatureText(keySignature(majorKey('Gb')))).toBe('6 flats: B♭ E♭ A♭ D♭ G♭ C♭');
    expect(signatureText(keySignature(majorKey('F#')))).toBe('6 sharps: F♯ C♯ G♯ D♯ A♯ E♯');
    expect(signatureShort(keySignature(majorKey('C')))).toBe('0');
    expect(signatureShort(keySignature(majorKey('A')))).toBe('3♯');
    expect(signatureShort(keySignature(minorKey('G')))).toBe('2♭');
  });
});

describe('keyFamily', () => {
  it('marks I, IV, V outside and ii, iii, vi inside for a major key', () => {
    const family = keyFamily(majorKey('C'));
    expect([...family.entries()].map(([id, c]) => `${id} ${c.numeral} ${c.tonic}`)).toEqual([
      'major:0 I C',
      'minor:11 ii D',
      'minor:1 iii E',
      'major:11 IV F',
      'major:1 V G',
      'minor:0 vi A',
    ]);
  });

  it('marks i, iv, v inside and ♭III, ♭VI, ♭VII outside for a minor key', () => {
    const family = keyFamily(minorKey('A'));
    expect(new Map([...family].map(([id, c]) => [id, c.numeral]))).toEqual(
      new Map([
        ['minor:0', 'i'],
        ['major:0', '♭III'],
        ['minor:11', 'iv'],
        ['minor:1', 'v'],
        ['major:11', '♭VI'],
        ['major:1', '♭VII'],
      ]),
    );
  });

  it('spells the chords as the key does, on either side of the bottom', () => {
    expect(keyFamily(majorKey('F#')).get('major:7')).toEqual({ numeral: 'V', tonic: 'C#' });
    expect(keyFamily(majorKey('Gb')).get('major:5')).toEqual({ numeral: 'IV', tonic: 'Cb' });
    // Every key's six chords sit in a block of three positions, both rings.
    for (const e of CIRCLE_OF_FIFTHS) {
      for (const key of [majorKey(e.major), minorKey(e.minor)]) {
        const ids = [...keyFamily(key).keys()].sort();
        const near = [-1, 0, 1].flatMap((d) => [
          wedgeId(e.position + d, 'major'),
          wedgeId(e.position + d, 'minor'),
        ]);
        expect(ids).toEqual(near.sort());
      }
    }
  });
});

describe('keyOfWedge', () => {
  it("takes the selected key's spelling where the circle has it", () => {
    const fromFSharp = keyFamily(majorKey('F#'));
    expect(keyOfWedge(7, 'major', fromFSharp)).toEqual(majorKey('C#'));
    expect(keyOfWedge(7, 'major')).toEqual(majorKey('Db'));
    // C♯ major's V is G♯, eight sharps: the wedge gives A♭.
    expect(keyOfWedge(8, 'major', keyFamily(majorKey('C#')))).toEqual(majorKey('Ab'));
    expect(keyOfWedge(6, 'minor', keyFamily(majorKey('Gb')))).toEqual(minorKey('Eb'));
  });
});

describe('keyFromArrow', () => {
  it('steps round the circle and between the rings', () => {
    expect(keyFromArrow(majorKey('C'), 'ArrowRight')).toEqual(majorKey('G'));
    expect(keyFromArrow(majorKey('C'), 'ArrowLeft')).toEqual(majorKey('F'));
    expect(keyFromArrow(majorKey('F#'), 'ArrowRight')).toEqual(majorKey('C#'));
    expect(keyFromArrow(majorKey('C#'), 'ArrowRight')).toEqual(majorKey('Ab'));
    expect(keyFromArrow(majorKey('Cb'), 'ArrowLeft')).toEqual(majorKey('E'));
    expect(keyFromArrow(majorKey('Eb'), 'ArrowDown')).toEqual(minorKey('C'));
    expect(keyFromArrow(minorKey('C'), 'ArrowUp')).toEqual(majorKey('Eb'));
    expect(keyFromArrow(majorKey('Eb'), 'ArrowUp')).toBeNull();
    expect(keyFromArrow(minorKey('C'), 'ArrowDown')).toBeNull();
    expect(keyFromArrow(minorKey('E'), 'Home')).toEqual(minorKey('A'));
    expect(keyFromArrow(majorKey('E'), 'Home')).toEqual(majorKey('C'));
    expect(keyFromArrow(majorKey('E'), 'x')).toBeNull();
  });
});

describe('keyDetail', () => {
  it('collects the signature, relative key, neighbours and chords', () => {
    const d = keyDetail(majorKey('A'));
    expect(d.spellings).toEqual(['A']);
    expect(d.signature.sharps).toBe(3);
    expect(d.relative).toEqual(minorKey('F#'));
    expect(d.down).toEqual({ numeral: 'IV', key: majorKey('D') });
    expect(d.up).toEqual({ numeral: 'V', key: majorKey('E') });
    expect(d.chords.map((c) => c.symbol)).toEqual(['A', 'Bm', 'C#m', 'D', 'E', 'F#m', 'G#dim']);
    const m = keyDetail(minorKey('Eb'));
    expect(m.spellings).toEqual(['D#', 'Eb']);
    expect(m.relative).toEqual(majorKey('Gb'));
    expect(m.down.numeral).toBe('iv');
    expect(m.up).toEqual({ numeral: 'v', key: minorKey('Bb') });
  });

  it('plays the tonic triad from octave 3', () => {
    expect(tonicTriad(majorKey('C'))).toEqual(['C3', 'E3', 'G3']);
    expect(tonicTriad(minorKey('A'))).toEqual(['A3', 'C4', 'E4']);
    expect(tonicTriad(majorKey('Gb'))).toEqual(['F#3', 'A#3', 'C#4']);
  });

  it('draws each wedge as a closed annular sector', () => {
    expect(wedgePath(0, 'major')).toMatch(/^M\S+ \S+ A194 194 0 0 1 .* L.* A128 128 0 0 0 .* Z$/);
    expect(wedgePath(3, 'minor')).toMatch(/A128 128 .* A64 64 /);
  });
});

describe('Quiz me on this', () => {
  const I3 = ['I3.sharp-signatures', 'I3.flat-signatures', 'I3.dominants', 'I3.relative-minors'];

  it('focuses the I3 skills the learner has open', () => {
    expect(circleQuizFocus(new Set(SKILLS.map((s) => s.id)))).toEqual({ skillIds: I3 });
    expect(circleQuizFocus(new Set(['I3.sharp-signatures', 'C4.sharp-keys']))).toEqual({
      skillIds: ['I3.sharp-signatures'],
    });
  });

  it('walks back to the nearest open steps while I3 is gated', () => {
    // I3 opens after C4's sharp keys, which open after F1's steps.
    expect(circleQuizFocus(new Set(['C4.sharp-keys', 'F1.alphabet']))).toEqual({
      skillIds: ['C4.sharp-keys'],
    });
    const fresh = frontierSkillIds(SKILLS, new Map());
    const ids = circleQuizFocus(fresh).skillIds ?? [];
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(fresh.has(id)).toBe(true);
  });

  it('falls back to every I3 skill when nothing on the way is open', () => {
    expect(circleQuizFocus()).toEqual({ skillIds: I3 });
    expect(circleQuizFocus(new Set(), [])).toEqual({ skillIds: [] });
  });
});

function renderView() {
  return render(
    <MemoryRouter>
      <View />
    </MemoryRouter>,
  );
}

const wedge = (name: RegExp) => screen.getByRole('radio', { name });

describe('<View>', () => {
  it('links "Quiz me on this" to a focused session', async () => {
    renderView();
    const quiz = screen.getByRole('link', { name: 'Quiz me on this' });
    expect(quiz.getAttribute('href')).toMatch(/^\/session\?skill=/);
  });

  it('starts on C major with its chords marked', () => {
    renderView();
    const group = screen.getByRole('radiogroup', { name: 'Keys on the circle of fifths' });
    expect(within(group).getAllByRole('radio')).toHaveLength(24);
    expect(wedge(/^C major, no sharps or flats; I in C major$/)).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByTestId('circle-key')).toHaveTextContent('C major');
    expect(screen.getByTestId('circle-signature')).toHaveTextContent('No sharps or flats');
    expect(document.querySelectorAll('[data-outline="family"]')).toHaveLength(5);
    expect(screen.getByTestId('circle-chords')).toHaveTextContent(
      'IC' + 'iiDm' + 'iiiEm' + 'IVF' + 'VG' + 'viAm' + 'vii°Bdim',
    );
    // No spelling choice where the circle has one spelling.
    expect(screen.queryByRole('group', { name: 'Spelling' })).toBeNull();
  });

  it('selects a tapped key, plays its tonic triad and shows its facts', async () => {
    const play = vi.spyOn(audio, 'playNotes').mockResolvedValue();
    renderView();
    fireEvent.click(wedge(/^A major, 3 sharps$/));
    expect(wedge(/^A major, 3 sharps/)).toHaveAttribute('aria-checked', 'true');
    expect(wedge(/^A major, 3 sharps/)).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('circle-key')).toHaveTextContent('A major');
    expect(screen.getByTestId('circle-signature')).toHaveTextContent('3 sharps: F♯ C♯ G♯');
    expect(wedge(/^F sharp minor, 3 sharps; vi in A major$/)).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(play).toHaveBeenLastCalledWith(
        ['A3', 'C#4', 'E4'],
        expect.objectContaining({ muted: false }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'F♯ minor' }));
    expect(screen.getByTestId('circle-key')).toHaveTextContent('F♯ minor');
    expect(screen.getByText('Relative major')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /v: C♯ minor/ }));
    expect(screen.getByTestId('circle-key')).toHaveTextContent('C♯ minor');
    fireEvent.click(screen.getByRole('button', { name: /iv: F♯ minor/ }));
    expect(screen.getByTestId('circle-key')).toHaveTextContent('F♯ minor');
  });

  it('stays silent with sound off', async () => {
    const play = vi.spyOn(audio, 'playNotes').mockResolvedValue();
    useAppStore.setState((s) => ({ settings: { ...s.settings, soundOn: false } }));
    renderView();
    fireEvent.click(wedge(/^G major/));
    await vi.waitFor(() =>
      expect(play).toHaveBeenLastCalledWith(
        ['G3', 'B3', 'D4'],
        expect.objectContaining({ muted: true }),
      ),
    );
    useAppStore.setState((s) => ({ settings: { ...s.settings, soundOn: true } }));
  });

  it('shows both spellings at F♯/G♭ and switches between them', () => {
    renderView();
    const fSharp = wedge(/^F sharp major, 6 sharps, or G flat major, 6 flats$/);
    expect(fSharp).toHaveTextContent('F♯ / G♭');
    expect(fSharp).toHaveTextContent('6♯ / 6♭');
    expect(wedge(/^D sharp minor, 6 sharps, or E flat minor, 6 flats$/)).toHaveTextContent(
      'D♯mE♭m',
    );
    fireEvent.click(fSharp);
    expect(screen.getByTestId('circle-key')).toHaveTextContent('F♯ major');
    // Its neighbours keep the sharp side: C♯, not D♭.
    expect(wedge(/; V in F♯ major$/)).toHaveTextContent('C♯');
    expect(wedge(/; V in F♯ major$/)).not.toHaveTextContent('D♭');

    fireEvent.click(screen.getByRole('radio', { name: 'G♭ major' }));
    expect(screen.getByTestId('circle-key')).toHaveTextContent('G♭ major');
    expect(screen.getByTestId('circle-signature')).toHaveTextContent('6 flats: B♭ E♭ A♭ D♭ G♭ C♭');
    expect(wedge(/; IV in G♭ major$/)).toHaveTextContent('C♭');
    expect(screen.getByTestId('circle-chords')).toHaveTextContent('vii°Fdim');
    expect(screen.getByRole('button', { name: 'E♭ minor' })).toBeInTheDocument();
  });

  it('moves round the circle by keyboard, with focus following', () => {
    renderView();
    const c = wedge(/^C major/);
    c.focus();
    fireEvent.keyDown(c, { key: 'ArrowRight' });
    const g = wedge(/^G major/);
    expect(g).toHaveAttribute('aria-checked', 'true');
    expect(g).toHaveFocus();
    fireEvent.keyDown(g, { key: 'ArrowDown' });
    expect(wedge(/^E minor/)).toHaveFocus();
    expect(screen.getByTestId('circle-key')).toHaveTextContent('E minor');
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' });
    expect(screen.getByTestId('circle-key')).toHaveTextContent('A minor');
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    expect(screen.getByTestId('circle-key')).toHaveTextContent('B minor');
    fireEvent.keyDown(document.activeElement as Element, { key: 'Tab' });
    expect(screen.getByTestId('circle-key')).toHaveTextContent('B minor');
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
    expect(screen.getByTestId('circle-key')).toHaveTextContent('A minor');
    fireEvent.keyDown(document.activeElement as Element, { key: 'Enter' });
    expect(screen.getByTestId('circle-key')).toHaveTextContent('A minor');
  });
});

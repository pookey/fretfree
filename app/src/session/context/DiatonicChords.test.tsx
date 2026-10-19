import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { DiatonicChords } from './DiatonicChords';

const items = (name: string | RegExp) =>
  within(screen.getByRole('list', { name }))
    .getAllByRole('listitem')
    .map((li) => li.textContent);

describe('<DiatonicChords>', () => {
  it('shows only the numerals until revealed: the chord names spell the scale', () => {
    render(<DiatonicChords tonic="F#" reveal={false} />);
    expect(items('Chords in a major key')).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
    expect(screen.getByTestId('diatonic-chords')).not.toHaveTextContent(/[A-G]/);
  });

  it('names each chord in the key once revealed, with real accidentals', () => {
    render(<DiatonicChords tonic="F#" reveal />);
    expect(items('Chords in F♯ major')).toEqual([
      'IF♯',
      'iiG♯m',
      'iiiA♯m',
      'IVB',
      'VC♯',
      'viD♯m',
      'vii°E♯dim',
    ]);
  });

  it('spells flat keys with flats', () => {
    render(<DiatonicChords tonic="Eb" reveal />);
    expect(items('Chords in E♭ major')).toEqual([
      'IE♭',
      'iiFm',
      'iiiGm',
      'IVA♭',
      'VB♭',
      'viCm',
      'vii°Ddim',
    ]);
  });
});

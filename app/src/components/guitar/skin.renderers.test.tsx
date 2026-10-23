import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { d13MakePrompt } from '../../drills/d13-capo/logic';
import { CapoNeck } from '../../drills/d13-capo/CapoNeck';
import { STANDARD_TUNING } from '../../theory';
import { ChordDiagram, parseVoicing } from '../chord-diagram';
import { Fretboard } from '../fretboard/Fretboard';
import { FretboardHeatmap } from '../heatmap';

// The board's marker colours and neck ink apply only inside `[data-neck]`
// (styles/boards.css). skin.contrast.test.ts checks their pairings on every
// board, assuming each renderer puts its on-wood content there: this checks
// that it does, and that nothing drawn on the page is inside.
describe('renderers mark what they draw on the wood', () => {
  it('the Fretboard', () => {
    render(<Fretboard fretRange={{ from: 0, to: 5 }} />);
    expect(screen.getByRole('group', { name: 'Fretboard' })).toHaveAttribute('data-neck');
  });

  it('the chord diagram: fretted dots and barres, not the markers above the nut', () => {
    render(<ChordDiagram voicing={parseVoicing('x32010', { root: 'C' })} />);
    for (const d of screen.getAllByTestId('chord-dot'))
      expect(d.closest('[data-neck]')).not.toBeNull();
    for (const o of screen.getAllByTestId('chord-open'))
      expect(o.closest('[data-neck]')).toBeNull();
    for (const m of screen.getAllByTestId('chord-muted'))
      expect(m.closest('[data-neck]')).toBeNull();

    render(<ChordDiagram voicing={parseVoicing('133211', { fingers: '134211', root: 'F' })} />);
    const barre = screen.getByTestId('chord-barre');
    expect(barre.closest('[data-neck]')).not.toBeNull();
    // Dots on the barre are ringed, so their shape stands clear of it.
    const onBarre = screen
      .getAllByTestId('chord-dot')
      .filter((d) => d.hasAttribute('data-on-barre'))
      .map((d) => d.getAttribute('data-string'));
    expect(onBarre.length).toBeGreaterThan(0);
    for (const s of onBarre) {
      const dot = screen
        .getAllByTestId('chord-dot')
        .find((d) => d.getAttribute('data-string') === s)!;
      expect(dot).toHaveAttribute('data-fret', barre.getAttribute('data-fret'));
    }
  });

  it('the heatmap', () => {
    render(<FretboardHeatmap cells={[]} fretRange={{ from: 0, to: 12 }} />);
    expect(screen.getByRole('group', { name: 'Fretboard mastery map' })).toHaveAttribute(
      'data-neck',
    );
  });

  it('the capo neck', () => {
    const prompt = d13MakePrompt(
      { id: 'capo-sound:G', skillId: 'C10.capo-g-c-d' },
      { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng: () => 0.6 },
    );
    render(<CapoNeck prompt={prompt} revealed fretNumbers handedness="right" />);
    expect(screen.getByTestId('d13-neck')).toHaveAttribute('data-neck');
  });
});

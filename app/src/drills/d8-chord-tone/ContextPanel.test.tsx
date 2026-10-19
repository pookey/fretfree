import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import { ChordTonePanel } from './ContextPanel';
import chordTone from './drill';
import { d8Check, d8MakePrompt, type D8Answer, type D8Prompt } from './logic';

/** A cycling rng: the first value picks the shape, the second the root (0.75: A). */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] as number;
}

const prompt = (id: string, rng = seq(0, 0.75, 0)) =>
  d8MakePrompt(
    { id, skillId: 'C5.tones-roots' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng },
  );

function panel(
  p: D8Prompt,
  guideLevel: GuideLevel,
  over: { guided?: boolean; answer?: D8Answer } = {},
) {
  return render(
    <ChordTonePanel
      prompt={p}
      guideLevel={guideLevel}
      guided={over.guided ?? false}
      handedness="right"
      tuning={STANDARD_TUNING}
      feedback={over.answer ? { answer: over.answer, result: d8Check(p, over.answer) } : null}
    />,
  );
}

const diagram = () => screen.findByRole('img', { name: /^Chord diagram:/ });
const dots = (svg: HTMLElement) => Array.from(svg.querySelectorAll('[data-testid="chord-dot"]'));

describe('<ChordTonePanel> chord diagram (M3-11)', () => {
  it('is the D8 plugin’s context panel, loaded on first use', async () => {
    const Panel = chordTone.contextPanel!;
    const p = prompt('chord-tone:b3@m7');
    render(
      <Panel
        prompt={p}
        guideLevel={2}
        guided={false}
        handedness="right"
        tuning={STANDARD_TUNING}
        feedback={null}
      />,
    );
    // The first lazy load transforms every drill's views: seconds on a busy machine.
    const heading = await screen.findByRole(
      'heading',
      { name: `Chord tones of ${p.chord}` },
      { timeout: 30_000 },
    );
    expect(heading).toBeVisible();
    expect(await diagram()).toBeInTheDocument();
  }, 40_000);

  it('draws the shape on the neck as a chart, one dot per fretted note', async () => {
    const p = prompt('chord-tone:b3@m7');
    panel(p, 1);
    const svg = await diagram();
    const fretted = p.notes.filter((n) => n.fret > 0);
    expect(
      dots(svg).map((d) => [
        Number(d.getAttribute('data-string')),
        Number(d.getAttribute('data-fret')),
      ]),
    ).toEqual(expect.arrayContaining(fretted.map((n) => [n.string, n.fret])));
    expect(dots(svg)).toHaveLength(fretted.length);
  });

  it('never labels or styles the degrees before an answer (rule 4)', async () => {
    const p = prompt('chord-tone-name:b7@m7');
    panel(p, 3);
    const svg = await diagram();
    expect(svg.querySelectorAll('[data-testid="chord-dot"] text')).toHaveLength(0);
    for (const d of dots(svg)) expect(['root', 'tone']).toContain(d.getAttribute('data-style'));
    expect(svg).not.toHaveAccessibleName(/3rd|5th|7th|labelled/);
  });

  it('squares roots only where the neck does: from level 2, never when the root is asked', async () => {
    const styles = async () => (await diagram()).querySelectorAll('[data-style="root"]').length;
    const p = prompt('chord-tone:b3@m7');
    const { unmount } = panel(p, 1);
    expect(await styles()).toBe(0);
    unmount();
    const r = panel(p, 2);
    expect(await styles()).toBeGreaterThan(0);
    r.unmount();
    panel(prompt('chord-tone:1@m7'), 3);
    expect(await styles()).toBe(0);
  });

  it('labels each dot by degree, in its marker shape, once answered', async () => {
    const p = prompt('chord-tone-name:b7@m7');
    panel(p, 1, { answer: 'b3' });
    const svg = await diagram();
    const labels = Array.from(svg.querySelectorAll('[data-testid="chord-dot"] text')).map(
      (t) => t.textContent,
    );
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) expect(['R', '♭3', '5', '♭7']).toContain(l);
    expect(
      svg.querySelectorAll('[data-style="seventh"], [data-style="third"]').length,
    ).toBeGreaterThan(0);
  });

  it('labels them in the worked example too', async () => {
    panel(prompt('chord-tone:b3@m7'), 3, { guided: true });
    const svg = await diagram();
    expect(svg.querySelectorAll('[data-testid="chord-dot"] text').length).toBeGreaterThan(0);
  });
});

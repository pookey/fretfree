import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import { VoiceLeadingPanel } from './ContextPanel';
import voiceLeading from './drill';
import { d19Check, d19MakePrompt, type D19Prompt } from './logic';

const prompt = (id: string, rng: () => number = () => 0) =>
  d19MakePrompt(
    { id, skillId: 'I1.voice-leading-top-sets' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng },
  );

function panel(
  p: D19Prompt,
  guideLevel: GuideLevel,
  over: { guided?: boolean; answered?: boolean } = {},
) {
  const answer = { taps: p.targets };
  return render(
    <VoiceLeadingPanel
      prompt={p}
      guideLevel={guideLevel}
      guided={over.guided ?? false}
      handedness="right"
      tuning={STANDARD_TUNING}
      feedback={over.answered ? { answer, result: d19Check(p, answer) } : null}
    />,
  );
}

const chords = () => within(screen.getByRole('list', { name: 'Chords' })).getAllByRole('listitem');
const rows = () => chords().map((li) => li.textContent);

describe('<VoiceLeadingPanel>', () => {
  it('is the D19 plugin’s context panel, loaded on first use', async () => {
    const Panel = voiceLeading.contextPanel!;
    render(
      <Panel
        prompt={prompt('voice-lead:I-IV@s3')}
        guideLevel={1}
        guided={false}
        handedness="right"
        tuning={STANDARD_TUNING}
        feedback={null}
      />,
    );
    expect(await screen.findByRole('heading', { name: 'I–IV–V in C' })).toBeInTheDocument();
  });

  it('tags the chords it moves from and to, without spelling them at low guide levels', () => {
    panel(prompt('voice-lead:I-IV@s3'), 1);
    expect(rows()).toEqual(['ICfrom', 'IVFto', 'VG']);
    expect(chords()[0]).toHaveAttribute('data-role', 'from');
    expect(chords()[1]).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByTestId('d19-moves')).toBeNull();
    expect(screen.queryByText(/Hold the note/)).toBeNull();
  });

  it('spells each chord from guide level 2, and states the rule at level 3 (rule 9)', () => {
    const { unmount } = panel(prompt('voice-lead:IV-V@s3'), 2);
    expect(rows()).toEqual(['ICC E G', 'IVFF A Cfrom', 'VGG B Dto']);
    expect(screen.queryByText(/Hold the note/)).toBeNull();
    unmount();
    panel(prompt('voice-lead:IV-V@s3'), 3);
    expect(screen.getByText(/Hold the note the two chords share/)).toBeInTheDocument();
  });

  it('spells the chords for the key', () => {
    panel(
      prompt('voice-lead:I-IV@s3', () => 0.5),
      2,
    );
    expect(screen.getByRole('heading')).toHaveTextContent('I–IV–V in F');
    expect(rows()).toEqual(['IFF A Cfrom', 'IVB♭B♭ D Fto', 'VCC E G']);
  });

  it('lists how each voice moved once answered, and on a guided rep', () => {
    const p = prompt('voice-lead:I-IV@s3');
    const { unmount } = panel(p, 0, { answered: true });
    const moves = within(screen.getByTestId('d19-moves'))
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(moves).toEqual([
      'String 3 C stays',
      'String 2 E up 1 fret to F',
      'String 1 G up 2 frets to A',
    ]);
    unmount();
    panel(p, 0, { guided: true });
    expect(screen.getByTestId('d19-moves')).toBeInTheDocument();
  });
});

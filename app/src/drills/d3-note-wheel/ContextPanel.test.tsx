import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import type { DrillFeedback } from '../types';
import { NoteWheelContextPanel } from './ContextPanel';
import noteWheel from './drill';
import { d3Check, d3MakePrompt, d3TapAnswer, type D3Answer, type D3Prompt } from './logic';
import { resolveView } from '../lazy-view';

const prompt = (id: string, accidentalPref: 'sharp' | 'flat' = 'sharp') =>
  d3MakePrompt(
    { id, skillId: 'F1.test' },
    { tuning: STANDARD_TUNING, accidentalPref, scopeLevel: 0, rng: () => 0 },
  );

const fb = (p: D3Prompt, answer: D3Answer): DrillFeedback<D3Answer> => ({
  answer,
  result: d3Check(p, answer),
});

function panel(
  p: D3Prompt,
  over: { guideLevel?: GuideLevel; guided?: boolean; feedback?: DrillFeedback<D3Answer> } = {},
) {
  return render(
    <NoteWheelContextPanel
      prompt={p}
      guideLevel={over.guideLevel ?? 3}
      guided={over.guided ?? false}
      handedness="right"
      tuning={STANDARD_TUNING}
      feedback={over.feedback ?? null}
    />,
  );
}

const wheelNote = (pc: string) =>
  within(screen.getByTestId('note-wheel')).getByTestId(`wheel-note-${pc}`);

describe('<NoteWheelContextPanel>', () => {
  it('is the D3 plugin’s context panel', async () => {
    expect(await resolveView(noteWheel.contextPanel!)).toBe(NoteWheelContextPanel);
  });

  it('shows the note wheel, highlighting B–C and E–F', () => {
    const { container } = panel(prompt('step:+1@E'));
    expect(screen.getByRole('heading', { name: 'Note wheel' })).toBeInTheDocument();
    expect(screen.getByTestId('half-step-B-C')).toBeInTheDocument();
    expect(screen.getByTestId('half-step-E-F')).toBeInTheDocument();
    expect(wheelNote('E')).toHaveAttribute('data-role', 'start');
    // The answer is not marked on the wheel before answering.
    expect(wheelNote('F')).not.toHaveAttribute('data-role');
    expect(container).toHaveTextContent(/No sharp between B–C and E–F/);
    expect(container).toHaveTextContent(/neighbours in the musical alphabet/);
    expect(container.textContent).not.toMatch(/letter/i);
    expect(screen.getByRole('img').getAttribute('aria-label')).not.toMatch(/letter/i);
  });

  it('fades with the guide level', () => {
    const p = prompt('step:+1@E');
    const { unmount } = panel(p, { guideLevel: 3 });
    expect(screen.getByTestId('wheel-note-C#')).toHaveTextContent('C#');
    expect(screen.getByText(/one fret/)).toBeInTheDocument();
    unmount();

    const two = panel(p, { guideLevel: 2 });
    expect(screen.getByTestId('wheel-note-C#')).toHaveTextContent('');
    expect(screen.getByTestId('half-step-E-F')).toHaveTextContent('½');
    expect(screen.queryByText(/one fret/)).toBeNull();
    two.unmount();

    panel(p, { guideLevel: 1 });
    expect(screen.queryByTestId('wheel-note-C#')).toBeNull();
    expect(screen.getByTestId('half-step-E-F')).toHaveTextContent('');
    expect(screen.queryByText(/No sharp/)).toBeNull();
  });

  it('shows full guides in the worked example', () => {
    panel(prompt('step:+1@E'), { guided: true, guideLevel: 1 });
    expect(screen.getByTestId('wheel-note-C#')).toHaveTextContent('C#');
    expect(screen.getByText(/one fret/)).toBeInTheDocument();
  });

  it('spells the wheel with the flat preference', () => {
    panel(prompt('step:+2@E', 'flat'));
    expect(screen.getByTestId('wheel-note-Gb')).toHaveTextContent('Gb');
  });

  it('marks the answer and a wrong button answer once answered', () => {
    const p = prompt('step:+2@E');
    panel(p, { feedback: fb(p, 'G') });
    expect(wheelNote('F#')).toHaveAttribute('data-role', 'expected');
    expect(wheelNote('G')).toHaveAttribute('data-role', 'given');
  });

  it('marks a wrong tap on the neck as the given note', () => {
    const p = prompt('step:+2@E');
    panel(p, { feedback: fb(p, d3TapAnswer({ string: 3, fret: 0 }, STANDARD_TUNING, p.pref)) });
    expect(wheelNote('G')).toHaveAttribute('data-role', 'given');
  });

  it('marks only the answer when it was right', () => {
    const p = prompt('step:+2@E');
    panel(p, { feedback: fb(p, 'F#') });
    expect(wheelNote('F#')).toHaveAttribute('data-role', 'expected');
    expect(screen.getByTestId('note-wheel').querySelector('[data-role="given"]')).toBeNull();
  });
});

import { ENGINE_CONFIG } from '../../engine/config';
import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D20Answer, D20Prompt } from './logic';
import type * as views from './views';
import { D20_ID, D20_SCOPE, d20CanTest, d20ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d20-rhythm', (l: typeof logic) => ({
  makePrompt: l.d20MakePrompt,
  check: l.d20Check,
  describeAnswer: l.d20DescribeAnswer,
  sounds: l.d20Sounds,
  gradedResponseMs: l.d20GradedResponseMs,
  rating: l.d20Rating,
}));
const parts = lazyParts<typeof views>('d20-rhythm', lazy);

const tapStrumRhythm: DrillType<D20Prompt, D20Answer> = {
  id: D20_ID,
  title: 'Tap and strum rhythm',
  // Every F4 skill names this drill.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D20_ID)).map((s) => s.id),
  // The pad (pointer, Space or Enter), or a real guitar in mic mode.
  inputModes: ['tap', 'keyboard', 'mic'],
  // The click is the prompt: with sound off it is silent, so nothing can be timed.
  requiresSound: true,
  scope: D20_SCOPE,
  // The hit-by-hit marks are the feedback: keep a right answer's on screen.
  feedbackHoldMs: ENGINE_CONFIG.rhythm.feedbackHoldMs,
  canTest: d20CanTest,
  conceptOf: d20ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default tapStrumRhythm;

import { ENGINE_CONFIG } from '../../engine/config';
import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D31Answer, D31Prompt } from './logic';
import type * as views from './views';
import { D31_ID, D31_SCOPE, d31CanTest, d31ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d31-accent-strum', (l: typeof logic) => ({
  makePrompt: l.d31MakePrompt,
  check: l.d31Check,
  describeAnswer: l.d31DescribeAnswer,
  sounds: l.d31Sounds,
  gradedResponseMs: l.d31GradedResponseMs,
  rating: l.d31Rating,
}));
const parts = lazyParts<typeof views>('d31-accent-strum', lazy);

const accentStrum: DrillType<D31Prompt, D31Answer> = {
  id: D31_ID,
  title: 'Accent and strum in meter',
  // Every T3 and T5 skill names this drill.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D31_ID)).map((s) => s.id),
  // The two pads (pointer, or F/Space and J/Enter), or a real guitar in mic mode.
  inputModes: ['tap', 'keyboard', 'mic'],
  // The click is the prompt: with sound off nothing can be timed.
  requiresSound: true,
  scope: D31_SCOPE,
  // The stroke-by-stroke marks are the feedback: keep a right answer's on screen.
  feedbackHoldMs: ENGINE_CONFIG.accentStrum.feedbackHoldMs,
  canTest: d31CanTest,
  conceptOf: d31ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default accentStrum;

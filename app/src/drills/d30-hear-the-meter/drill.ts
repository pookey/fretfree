import { ENGINE_CONFIG } from '../../engine/config';
import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D30Answer, D30Prompt } from './logic';
import type * as views from './views';
import { D30_ID, D30_SCOPE, d30CanTest, d30ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d30-hear-the-meter', (l: typeof logic) => ({
  makePrompt: l.d30MakePrompt,
  check: l.d30Check,
  describeAnswer: l.d30DescribeAnswer,
  sounds: l.d30Sounds,
  gradedResponseMs: l.d30GradedResponseMs,
}));
const parts = lazyParts<typeof views>('d30-hear-the-meter', lazy);

const hearTheMeter: DrillType<D30Prompt, D30Answer> = {
  id: D30_ID,
  title: 'Hear the meter',
  // Every skill that names this drill (T4, T7), without editing this file.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D30_ID)).map((s) => s.id),
  inputModes: ['choice', 'keyboard'],
  // The prompt is the sound: nothing to answer with sound off.
  requiresSound: true,
  // Long enough to see the time signature and the counting (rule 10).
  feedbackHoldMs: ENGINE_CONFIG.hearTheMeter.feedbackHoldMs,
  scope: D30_SCOPE,
  canTest: d30CanTest,
  conceptOf: d30ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default hearTheMeter;

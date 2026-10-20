import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D14Answer, D14Prompt } from './logic';
import type * as views from './views';
import { D14_ID, D14_SCOPE, d14CanTest, d14ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d14-ear-identify', (l: typeof logic) => ({
  makePrompt: l.d14MakePrompt,
  check: l.d14Check,
  describeAnswer: l.d14DescribeAnswer,
  sounds: l.d14Sounds,
  gradedResponseMs: l.d14GradedResponseMs,
}));
const parts = lazyParts<typeof views>('d14-ear-identify', lazy);

const earIdentify: DrillType<D14Prompt, D14Answer> = {
  id: D14_ID,
  title: 'Hear it → identify',
  // Every skill that names this drill (I6), without editing this file.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D14_ID)).map((s) => s.id),
  inputModes: ['choice', 'keyboard'],
  // The prompt is the sound: nothing to answer with sound off.
  requiresSound: true,
  scope: D14_SCOPE,
  canTest: d14CanTest,
  conceptOf: d14ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default earIdentify;

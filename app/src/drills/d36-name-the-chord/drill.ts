import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D36Answer, D36Prompt } from './logic';
import type * as views from './views';
import { SKILLS } from '../../engine/skills';
import { D36_ID, D36_SCOPE, d36CanTest, d36ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d36-name-the-chord', (l: typeof logic) => ({
  makePrompt: l.d36MakePrompt,
  check: l.d36Check,
  describeAnswer: l.d36DescribeAnswer,
  sounds: l.d36Sounds,
  gradedResponseMs: l.d36GradedResponseMs,
}));
const parts = lazyParts<typeof views>('d36-name-the-chord', lazy);

const nameTheChord: DrillType<D36Prompt, D36Answer> = {
  id: D36_ID,
  title: 'What chord is this?',
  skills: SKILLS.filter((s) => s.drillTypes.includes(D36_ID)).map((s) => s.id),
  inputModes: ['choice', 'keyboard'],
  scope: D36_SCOPE,
  canTest: d36CanTest,
  conceptOf: d36ConceptOf,
  logic: lazy,
  render: parts.render,
};

export default nameTheChord;

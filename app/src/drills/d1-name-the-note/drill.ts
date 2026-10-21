import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D1Answer, D1Prompt } from './logic';
import type * as views from './views';
import { D1_ID, D1_SCOPE, d1CanTest, d1ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d1-name-the-note', (l: typeof logic) => ({
  makePrompt: l.d1MakePrompt,
  check: l.d1Check,
  describeAnswer: (a: D1Answer) => a,
  sounds: l.d1Sounds,
  feedbackPositions: l.d1FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d1-name-the-note', lazy);

const nameTheNote: DrillType<D1Prompt, D1Answer> = {
  id: D1_ID,
  title: 'Name the highlighted note',
  // F2's strings 6 and 5, then every C2 stage (M10-12).
  skills: SKILLS.filter((s) => s.drillTypes.includes(D1_ID)).map((s) => s.id),
  inputModes: ['choice', 'keyboard'],
  scope: D1_SCOPE,
  canTest: d1CanTest,
  conceptOf: d1ConceptOf,
  logic: lazy,
  render: parts.render,
};

export default nameTheNote;

import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D23Answer, D23Prompt } from './logic';
import type * as views from './views';
import { D23_ID, D23_SCOPE, d23CanTest, d23ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d23-staff-to-fret', (l: typeof logic) => ({
  makePrompt: l.d23MakePrompt,
  check: l.d23Check,
  describeAnswer: l.d23DescribeAnswer,
  sounds: l.d23Sounds,
  feedbackPositions: l.d23FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d23-staff-to-fret', lazy);

const staffToFret: DrillType<D23Prompt, D23Answer> = {
  id: D23_ID,
  title: 'Staff → fretboard',
  // Every skill that names this drill: the R2 position skills.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D23_ID)).map((s) => s.id),
  inputModes: ['tap', 'keyboard'],
  scope: D23_SCOPE,
  canTest: d23CanTest,
  conceptOf: d23ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default staffToFret;

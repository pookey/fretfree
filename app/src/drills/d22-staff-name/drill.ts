import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D22Answer, D22Prompt } from './logic';
import type * as views from './views';
import { D22_ID, D22_SCOPE, d22CanTest, d22ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d22-staff-name', (l: typeof logic) => ({
  makePrompt: l.d22MakePrompt,
  check: l.d22Check,
  describeAnswer: l.d22DescribeAnswer,
  sounds: l.d22Sounds,
  feedbackPositions: l.d22FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d22-staff-name', lazy);

const staffName: DrillType<D22Prompt, D22Answer> = {
  id: D22_ID,
  title: 'Name the note on the staff',
  // Every skill that names this drill (R1), without editing this file.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D22_ID)).map((s) => s.id),
  inputModes: ['choice', 'tap', 'keyboard'],
  scope: D22_SCOPE,
  canTest: d22CanTest,
  conceptOf: d22ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default staffName;

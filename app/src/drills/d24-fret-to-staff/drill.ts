import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D24Answer, D24Prompt } from './logic';
import type * as views from './views';
import { D24_ID, D24_SCOPE, d24CanTest, d24ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d24-fret-to-staff', (l: typeof logic) => ({
  makePrompt: l.d24MakePrompt,
  check: l.d24Check,
  describeAnswer: l.d24DescribeAnswer,
  sounds: l.d24Sounds,
  feedbackPositions: l.d24FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d24-fret-to-staff', lazy);

const fretToStaff: DrillType<D24Prompt, D24Answer> = {
  id: D24_ID,
  title: 'Fretboard → staff',
  // Every skill that names this drill (R2), without editing this file.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D24_ID)).map((s) => s.id),
  inputModes: ['tap', 'keyboard'],
  scope: D24_SCOPE,
  canTest: d24CanTest,
  conceptOf: d24ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default fretToStaff;

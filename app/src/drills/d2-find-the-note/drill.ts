import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D2Answer, D2Prompt } from './logic';
import type * as views from './views';
import { D2_ID, D2_SCOPE, d2CanTest, d2ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d2-find-the-note', (l: typeof logic) => ({
  makePrompt: l.d2MakePrompt,
  check: l.d2Check,
  describeAnswer: l.d2DescribeAnswer,
  sounds: l.d2Sounds,
  feedbackPositions: l.d2FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d2-find-the-note', lazy);

const findTheNote: DrillType<D2Prompt, D2Answer> = {
  id: D2_ID,
  title: 'Find the note',
  skills: ['F2.string6-naturals', 'F2.string5-naturals', 'C2.all-notes'],
  inputModes: ['tap', 'keyboard'],
  scope: D2_SCOPE,
  canTest: d2CanTest,
  conceptOf: d2ConceptOf,
  logic: lazy,
  render: parts.render,
};

export default findTheNote;

import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D10Answer, D10Prompt } from './logic';
import type * as views from './views';
import { D10_ID, D10_SCOPE, d10CanTest, d10ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d10-which-shape', (l: typeof logic) => ({
  makePrompt: l.d10MakePrompt,
  check: l.d10Check,
  describeAnswer: l.d10DescribeAnswer,
  sounds: l.d10Sounds,
  feedbackPositions: l.d10FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d10-which-shape', lazy);

const whichShape: DrillType<D10Prompt, D10Answer> = {
  id: D10_ID,
  title: 'Which shape, and which comes next?',
  skills: ['C6.major-shapes', 'C6.minor-shapes', 'C6.dominant7-shapes'],
  inputModes: ['choice'],
  scope: D10_SCOPE,
  canTest: d10CanTest,
  conceptOf: d10ConceptOf,
  logic: lazy,
  render: parts.render,
};

export default whichShape;

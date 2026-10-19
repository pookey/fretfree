import { lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as views from './views';
import {
  D2_ID,
  D2_SCOPE,
  d2CanTest,
  d2Check,
  d2ConceptOf,
  d2DescribeAnswer,
  d2FeedbackPositions,
  d2MakePrompt,
  d2Sounds,
  type D2Answer,
  type D2Prompt,
} from './logic';

// Lazy: the views stay out of first-load JS (design §10).
const parts = lazyParts<typeof views>('d2-find-the-note');

const findTheNote: DrillType<D2Prompt, D2Answer> = {
  id: D2_ID,
  title: 'Find the note',
  skills: ['F2.string6-naturals', 'F2.string5-naturals', 'C2.all-notes'],
  inputModes: ['tap', 'keyboard'],
  scope: D2_SCOPE,
  canTest: d2CanTest,
  makePrompt: d2MakePrompt,
  check: d2Check,
  describeAnswer: d2DescribeAnswer,
  sounds: d2Sounds,
  feedbackPositions: d2FeedbackPositions,
  conceptOf: d2ConceptOf,
  render: parts.render,
};

export default findTheNote;

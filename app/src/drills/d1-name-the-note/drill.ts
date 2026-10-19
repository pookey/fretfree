import { lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as views from './views';
import {
  D1_ID,
  D1_SCOPE,
  d1CanTest,
  d1Check,
  d1ConceptOf,
  d1FeedbackPositions,
  d1MakePrompt,
  d1Sounds,
  type D1Answer,
  type D1Prompt,
} from './logic';

// Lazy: the views stay out of first-load JS (design §10).
const parts = lazyParts<typeof views>('d1-name-the-note');

const nameTheNote: DrillType<D1Prompt, D1Answer> = {
  id: D1_ID,
  title: 'Name the highlighted note',
  skills: ['F2.string6-naturals', 'F2.string5-naturals', 'C2.all-notes'],
  inputModes: ['choice', 'keyboard'],
  scope: D1_SCOPE,
  canTest: d1CanTest,
  makePrompt: d1MakePrompt,
  check: d1Check,
  describeAnswer: (a) => a,
  sounds: d1Sounds,
  feedbackPositions: d1FeedbackPositions,
  conceptOf: d1ConceptOf,
  render: parts.render,
};

export default nameTheNote;

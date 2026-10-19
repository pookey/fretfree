import { lazyView } from '../lazy-view';
import type { DrillType } from '../types';
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
  render: lazyView(() => import('../views').then((m) => m.D2View)),
};

export default findTheNote;

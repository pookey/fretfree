import { lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as views from './views';
import {
  D4_ID,
  D4_SCOPE,
  d4CanTest,
  d4Check,
  d4ConceptOf,
  d4DescribeAnswer,
  d4FeedbackPositions,
  d4GradedResponseMs,
  d4MakePrompt,
  d4Sounds,
  type D4Answer,
  type D4Prompt,
} from './logic';

// Lazy: the views stay out of first-load JS (design §10).
const parts = lazyParts<typeof views>('d4-octave-finder');

const octaveFinder: DrillType<D4Prompt, D4Answer> = {
  id: D4_ID,
  title: 'Octave finder',
  skills: ['C1.octaves', 'C1.octaves-gb-shift', 'C1.double-octaves', 'C1.every-octave'],
  inputModes: ['tap'],
  scope: D4_SCOPE,
  canTest: d4CanTest,
  makePrompt: d4MakePrompt,
  check: d4Check,
  describeAnswer: d4DescribeAnswer,
  gradedResponseMs: d4GradedResponseMs,
  sounds: d4Sounds,
  feedbackPositions: d4FeedbackPositions,
  conceptOf: d4ConceptOf,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default octaveFinder;

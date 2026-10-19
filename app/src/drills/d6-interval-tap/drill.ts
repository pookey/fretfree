import { lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as views from './views';
import {
  D6_ID,
  D6_SCOPE,
  d6CanTest,
  d6Check,
  d6ConceptOf,
  d6DescribeAnswer,
  d6FeedbackPositions,
  d6MakePrompt,
  d6Sounds,
  type D6Answer,
  type D6Prompt,
} from './logic';

// Lazy: the views stay out of first-load JS (design §10).
const parts = lazyParts<typeof views>('d6-interval-tap');

const intervalTap: DrillType<D6Prompt, D6Answer> = {
  id: D6_ID,
  title: 'Tap the interval',
  skills: ['C3.thirds', 'C3.fourths-fifths', 'C3.sevenths', 'C3.sixths', 'C3.seconds'],
  inputModes: ['tap', 'keyboard'],
  scope: D6_SCOPE,
  canTest: d6CanTest,
  makePrompt: d6MakePrompt,
  check: d6Check,
  describeAnswer: d6DescribeAnswer,
  sounds: d6Sounds,
  feedbackPositions: d6FeedbackPositions,
  conceptOf: d6ConceptOf,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default intervalTap;

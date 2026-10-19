import { lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as views from './views';
import {
  D10_ID,
  D10_SCOPE,
  d10CanTest,
  d10Check,
  d10ConceptOf,
  d10DescribeAnswer,
  d10FeedbackPositions,
  d10MakePrompt,
  d10Sounds,
  type D10Answer,
  type D10Prompt,
} from './logic';

// Lazy: the views stay out of first-load JS (design §10).
const parts = lazyParts<typeof views>('d10-which-shape');

const whichShape: DrillType<D10Prompt, D10Answer> = {
  id: D10_ID,
  title: 'Which shape, and which comes next?',
  skills: ['C6.major-shapes', 'C6.minor-shapes', 'C6.dominant7-shapes'],
  inputModes: ['choice'],
  scope: D10_SCOPE,
  canTest: d10CanTest,
  makePrompt: d10MakePrompt,
  check: d10Check,
  describeAnswer: d10DescribeAnswer,
  sounds: d10Sounds,
  feedbackPositions: d10FeedbackPositions,
  conceptOf: d10ConceptOf,
  render: parts.render,
};

export default whichShape;

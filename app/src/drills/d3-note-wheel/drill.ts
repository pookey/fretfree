import { lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as views from './views';
import {
  D3_ID,
  D3_SCOPE,
  d3CanTest,
  d3Check,
  d3ConceptOf,
  d3DescribeAnswer,
  d3FeedbackPositions,
  d3MakePrompt,
  d3Sounds,
  type D3Answer,
  type D3Prompt,
} from './logic';

// Lazy: the views stay out of first-load JS (design §10).
const parts = lazyParts<typeof views>('d3-note-wheel');

const noteWheel: DrillType<D3Prompt, D3Answer> = {
  id: D3_ID,
  title: 'Note-wheel steps',
  skills: ['F1.alphabet', 'F1.b-c-e-f', 'F1.half-steps', 'F1.whole-steps'],
  inputModes: ['choice', 'tap', 'keyboard'],
  scope: D3_SCOPE,
  canTest: d3CanTest,
  makePrompt: d3MakePrompt,
  check: d3Check,
  describeAnswer: d3DescribeAnswer,
  sounds: d3Sounds,
  feedbackPositions: d3FeedbackPositions,
  conceptOf: d3ConceptOf,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default noteWheel;

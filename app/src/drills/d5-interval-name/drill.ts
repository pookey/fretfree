import { lazyView } from '../lazy-view';
import type { DrillType } from '../types';
import {
  D5_ID,
  D5_SCOPE,
  d5CanTest,
  d5Check,
  d5ConceptOf,
  d5DescribeAnswer,
  d5FeedbackPositions,
  d5MakePrompt,
  d5Sounds,
  type D5Answer,
  type D5Prompt,
} from './logic';

const intervalName: DrillType<D5Prompt, D5Answer> = {
  id: D5_ID,
  title: 'Name the interval from two dots',
  skills: ['C3.thirds', 'C3.fourths-fifths', 'C3.sevenths', 'C3.sixths', 'C3.seconds'],
  inputModes: ['choice', 'keyboard'],
  scope: D5_SCOPE,
  canTest: d5CanTest,
  makePrompt: d5MakePrompt,
  check: d5Check,
  describeAnswer: d5DescribeAnswer,
  sounds: d5Sounds,
  feedbackPositions: d5FeedbackPositions,
  conceptOf: d5ConceptOf,
  render: lazyView(() => import('../views').then((m) => m.D5View)),
  contextPanel: lazyView(() => import('../views').then((m) => m.IntervalContextPanel)),
};

export default intervalName;

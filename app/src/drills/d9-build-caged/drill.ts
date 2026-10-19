import { lazyView } from '../lazy-view';
import type { DrillType } from '../types';
import {
  D9_ID,
  D9_SCOPE,
  d9CanTest,
  d9Check,
  d9ConceptOf,
  d9DescribeAnswer,
  d9FeedbackPositions,
  d9GradedResponseMs,
  d9MakePrompt,
  d9Sounds,
  type D9Answer,
  type D9Prompt,
} from './logic';

const buildCaged: DrillType<D9Prompt, D9Answer> = {
  id: D9_ID,
  title: 'Build the CAGED shape at a root',
  skills: [
    'C6.triad-cores',
    'C6.major-shapes',
    'C6.minor-cores',
    'C6.minor-shapes',
    'C6.dominant7-shapes',
  ],
  inputModes: ['tap'],
  scope: D9_SCOPE,
  canTest: d9CanTest,
  makePrompt: d9MakePrompt,
  check: d9Check,
  describeAnswer: d9DescribeAnswer,
  gradedResponseMs: d9GradedResponseMs,
  sounds: d9Sounds,
  feedbackPositions: d9FeedbackPositions,
  conceptOf: d9ConceptOf,
  render: lazyView(() => import('../views').then((m) => m.D9View)),
};

export default buildCaged;

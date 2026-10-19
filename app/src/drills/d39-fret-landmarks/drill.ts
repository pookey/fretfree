import { lazyView } from '../lazy-view';
import type { DrillType } from '../types';
import {
  D39_ID,
  D39_SCOPE,
  d39CanTest,
  d39Check,
  d39ConceptOf,
  d39DescribeAnswer,
  d39FeedbackPositions,
  d39MakePrompt,
  d39Sounds,
  type D39Answer,
  type D39Prompt,
} from './logic';

const fretLandmarks: DrillType<D39Prompt, D39Answer> = {
  id: D39_ID,
  title: 'Fret landmarks',
  skills: ['F3.markers', 'F3.repeat-12'],
  inputModes: ['choice', 'tap', 'keyboard'],
  scope: D39_SCOPE,
  canTest: d39CanTest,
  makePrompt: d39MakePrompt,
  check: d39Check,
  describeAnswer: d39DescribeAnswer,
  sounds: d39Sounds,
  feedbackPositions: d39FeedbackPositions,
  conceptOf: d39ConceptOf,
  render: lazyView(() => import('./D39View').then((m) => m.D39View)),
  contextPanel: lazyView(() => import('./ContextPanel').then((m) => m.LandmarksContextPanel)),
};

export default fretLandmarks;

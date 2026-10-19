import { lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as views from './views';
import { SKILLS } from '../../engine/skills';
import {
  D37_ID,
  D37_SCOPE,
  d37CanTest,
  d37Check,
  d37ConceptOf,
  d37DescribeAnswer,
  d37FeedbackPositions,
  d37GradedResponseMs,
  d37MakePrompt,
  d37Sounds,
  type D37Answer,
  type D37Prompt,
} from './logic';

// Lazy: the views stay out of first-load JS (design §10).
const parts = lazyParts<typeof views>('d37-chord-tones-neck');

const chordTonesNeck: DrillType<D37Prompt, D37Answer> = {
  id: D37_ID,
  title: 'Chord tones across the neck',
  skills: SKILLS.filter((s) => s.drillTypes.includes(D37_ID)).map((s) => s.id),
  inputModes: ['tap'],
  scope: D37_SCOPE,
  canTest: d37CanTest,
  makePrompt: d37MakePrompt,
  check: d37Check,
  describeAnswer: d37DescribeAnswer,
  gradedResponseMs: d37GradedResponseMs,
  sounds: d37Sounds,
  feedbackPositions: d37FeedbackPositions,
  conceptOf: d37ConceptOf,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default chordTonesNeck;

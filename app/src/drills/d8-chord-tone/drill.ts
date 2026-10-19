import { lazyView } from '../lazy-view';
import type { DrillType } from '../types';
import { SKILLS } from '../../engine/skills';
import {
  D8_ID,
  D8_SCOPE,
  d8CanTest,
  d8Check,
  d8ConceptOf,
  d8DescribeAnswer,
  d8FeedbackPositions,
  d8MakePrompt,
  d8Sounds,
  type D8Answer,
  type D8Prompt,
} from './logic';

const chordTone: DrillType<D8Prompt, D8Answer> = {
  id: D8_ID,
  title: 'Find the chord tone in a shape',
  skills: SKILLS.filter((s) => s.drillTypes.includes(D8_ID)).map((s) => s.id),
  inputModes: ['tap', 'choice', 'keyboard'],
  scope: D8_SCOPE,
  canTest: d8CanTest,
  makePrompt: d8MakePrompt,
  check: d8Check,
  describeAnswer: d8DescribeAnswer,
  sounds: d8Sounds,
  feedbackPositions: d8FeedbackPositions,
  conceptOf: d8ConceptOf,
  render: lazyView(() => import('./D8View').then((m) => m.D8View)),
  contextPanel: lazyView(() => import('./ContextPanel').then((m) => m.ChordTonePanel)),
};

export default chordTone;

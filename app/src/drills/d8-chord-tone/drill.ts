import { lazyPart } from '../../session/context/lazy-part';
import type { DrillType } from '../types';
import { SKILLS } from '../../engine/skills';
import { D8View } from './D8View';
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
  render: D8View,
  // Loaded on first use, outside first-load JS (session/context/lazy-part.tsx).
  contextPanel: lazyPart(() =>
    import('../../session/context/panels').then((m) => m.ChordTonePanel),
  ),
};

export default chordTone;

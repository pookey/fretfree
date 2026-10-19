import type { DrillType } from '../types';
import { NoteWheelContextPanel } from './ContextPanel';
import { D3View } from './D3View';
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
  render: D3View,
  contextPanel: NoteWheelContextPanel,
};

export default noteWheel;

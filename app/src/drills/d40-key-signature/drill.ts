import { SKILLS } from '../../engine/skills';
import { lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as views from './views';
import {
  D40_ID,
  D40_SCOPE,
  d40CanTest,
  d40Check,
  d40ConceptOf,
  d40DescribeAnswer,
  d40MakePrompt,
  d40Sounds,
  type D40Answer,
  type D40Prompt,
} from './logic';

// Lazy: the views stay out of first-load JS (design §10).
const parts = lazyParts<typeof views>('d40-key-signature');

const keySignatureCards: DrillType<D40Prompt, D40Answer> = {
  id: D40_ID,
  title: 'Key-signature cards',
  // Every skill that names this drill (I3), without editing this file.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D40_ID)).map((s) => s.id),
  inputModes: ['choice', 'keyboard'],
  scope: D40_SCOPE,
  canTest: d40CanTest,
  makePrompt: d40MakePrompt,
  check: d40Check,
  describeAnswer: d40DescribeAnswer,
  sounds: d40Sounds,
  conceptOf: d40ConceptOf,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default keySignatureCards;

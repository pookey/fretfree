import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D40Answer, D40Prompt } from './logic';
import type * as views from './views';
import { D40_ID, D40_SCOPE, d40CanTest, d40ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d40-key-signature', (l: typeof logic) => ({
  makePrompt: l.d40MakePrompt,
  check: l.d40Check,
  describeAnswer: l.d40DescribeAnswer,
  sounds: l.d40Sounds,
}));
const parts = lazyParts<typeof views>('d40-key-signature', lazy);

const keySignatureCards: DrillType<D40Prompt, D40Answer> = {
  id: D40_ID,
  title: 'Key-signature cards',
  // Every skill that names this drill (I3), without editing this file.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D40_ID)).map((s) => s.id),
  inputModes: ['choice', 'keyboard'],
  scope: D40_SCOPE,
  canTest: d40CanTest,
  conceptOf: d40ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default keySignatureCards;

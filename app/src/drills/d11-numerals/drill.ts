import { SKILLS } from '../../engine/skills';
import { lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as views from './views';
import {
  D11_ID,
  D11_SCOPE,
  d11CanTest,
  d11Check,
  d11ConceptOf,
  d11DescribeAnswer,
  d11MakePrompt,
  d11Sounds,
  type D11Answer,
  type D11Prompt,
} from './logic';

// Lazy: the views stay out of first-load JS (design §10).
const parts = lazyParts<typeof views>('d11-numerals');

const numerals: DrillType<D11Prompt, D11Answer> = {
  id: D11_ID,
  title: 'Roman numeral ↔ chord in a key',
  // Every skill that names this drill: C8 now, and I4's minor-key numerals
  // when they list `numerals`, without editing this file.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D11_ID)).map((s) => s.id),
  inputModes: ['choice', 'keyboard'],
  scope: D11_SCOPE,
  canTest: d11CanTest,
  makePrompt: d11MakePrompt,
  check: d11Check,
  describeAnswer: d11DescribeAnswer,
  sounds: d11Sounds,
  conceptOf: d11ConceptOf,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default numerals;

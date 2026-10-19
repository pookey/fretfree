import { lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as views from './views';
import {
  D16_ID,
  D16_SCOPE,
  d16CanTest,
  d16Check,
  d16ConceptOf,
  d16DescribeAnswer,
  d16FeedbackPositions,
  d16GradedResponseMs,
  d16MakePrompt,
  d16Sounds,
  type D16Answer,
  type D16Prompt,
} from './logic';

// Lazy: the views stay out of first-load JS (design §10).
const parts = lazyParts<typeof views>('d16-play-note');

const playTheNote: DrillType<D16Prompt, D16Answer> = {
  id: D16_ID,
  title: 'Play the note',
  // TODO(M5-06): once the plugin type has M5-06's mic flag, which the picker
  // honours with `settings.micEnabled`, set it here and name D16's skills:
  // 'F2.string6-naturals', 'F2.string5-naturals', 'C2.all-notes',
  // 'C1.octaves' and 'C1.octaves-gb-shift' (each listing 'play-the-note' in
  // its drillTypes). Until then no skill serves D16, so learners without a
  // mic never meet it.
  skills: [],
  inputModes: ['mic'],
  scope: D16_SCOPE,
  canTest: d16CanTest,
  makePrompt: d16MakePrompt,
  check: d16Check,
  describeAnswer: d16DescribeAnswer,
  sounds: d16Sounds,
  feedbackPositions: d16FeedbackPositions,
  gradedResponseMs: d16GradedResponseMs,
  conceptOf: d16ConceptOf,
  render: parts.render,
};

export default playTheNote;

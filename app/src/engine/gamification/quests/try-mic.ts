import { ENGINE_CONFIG } from '../../config';
import { MIC_SKILLS, isMicDrill } from '../achievements/mic-drills';
import { counts, dailyQuest } from './helpers';
import type { QuestTemplate } from './types';

const { target } = ENGINE_CONFIG.quests['try-mic'];

/**
 * Play answers on the guitar: the motor-transfer drill (research/02 rule 10,
 * design §3.7 "try a mic drill"). Drawn only in mic mode, since sessions
 * serve mic drills only then (design §9), and once the learner has practised
 * a skill a mic drill serves, so today's session can offer one. Any answer
 * counts, right or wrong, since the quest is about trying the real
 * instrument, but never one to a not-due card (rule 15).
 */
const tryMic: QuestTemplate = {
  id: 'try-mic',
  draw: (snapshot) =>
    snapshot.micEnabled && snapshot.priorReviews.some((r) => MIC_SKILLS.has(r.skillId))
      ? dailyQuest('try-mic', {
          title: `Play ${target} answers on your guitar`,
          description: 'Mic mode turns what you know on screen into notes under your fingers.',
          progress: (ctx) => ctx.answers.filter((a) => counts(a) && isMicDrill(a.drillType)).length,
        })
      : null,
};

export default tryMic;

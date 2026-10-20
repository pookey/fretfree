import { MIC_ACCURACY_COPY, micAchievement } from './mic-drills';

/** D16: named notes played on the guitar and heard by the mic. */
export default micAchievement({
  id: 'mic-notes',
  title: 'Notes in your hands',
  description: `You play named notes on your guitar, right ${MIC_ACCURACY_COPY}.`,
  order: 40,
  drillType: 'play-the-note',
});

import { MIC_ACCURACY_COPY, micAchievement } from './mic-drills';

/** D17: intervals, arpeggios and scales played note by note on the guitar. */
export default micAchievement({
  id: 'mic-sequences',
  title: 'Shapes in your hands',
  description: `You play intervals, arpeggios and scales on your guitar, right ${MIC_ACCURACY_COPY}.`,
  order: 50,
  drillType: 'play-sequence',
});

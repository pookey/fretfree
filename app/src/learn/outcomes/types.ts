/**
 * What a skill lets the learner do, in one plain sentence (research/03's
 * "Learner can DO" column, research/02 rule 15): skill ID → outcome. Shown
 * under the skill's title on Learn, so a locked skill previews more than
 * its name.
 */
export type Outcomes = Readonly<Record<string, string>>;

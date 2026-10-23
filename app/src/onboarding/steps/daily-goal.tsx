import { useEffect, useState } from 'react';
import { getDb, getGamification, saveGamification, type DailyGoalMinutes } from '../../storage';
import { Choices, StepForm } from '../Choices';
import { DAILY_GOAL_OPTIONS } from '../options';
import type { OnboardingStepProps } from '../registry';

export const id = 'daily-goal';
export const order = 30;
export const title = 'Your daily goal';
export const skippable = true;
export const explanation = (
  <p>
    Each day you reach your goal, your streak grows. A little every day beats a long cram: spaced
    practice is what makes it stick. Start small; you can raise it later.
  </p>
);

export function Step({ onNext }: OnboardingStepProps) {
  const [minutes, setMinutes] = useState<DailyGoalMinutes | null>(null);
  useEffect(() => {
    let live = true;
    void getGamification(getDb()).then((g) => live && setMinutes(g.dailyGoalMinutes));
    return () => {
      live = false;
    };
  }, []);
  const save = async () => {
    if (minutes !== null) await saveGamification(getDb(), { dailyGoalMinutes: minutes });
    onNext();
  };
  return (
    <StepForm onSubmit={() => void save()}>
      {minutes !== null && (
        <Choices
          legend="Daily goal"
          options={DAILY_GOAL_OPTIONS}
          value={minutes}
          onChange={setMinutes}
        />
      )}
    </StepForm>
  );
}

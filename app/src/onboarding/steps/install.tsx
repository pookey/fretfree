import {
  InstallSteps,
  PromptInstall,
  StorageNote,
  useHasProgress,
  useInstallOffer,
} from '../../shell/InstallHint';
import {
  browserInstallEnv,
  getInstallPrompt,
  installOffer,
  isInstallTipDismissed,
  type InstallEnv,
} from '../../shell/install';
import type { OnboardingStepProps } from '../registry';
import styles from '../Onboarding.module.css';
import local from './install.module.css';

export const id = 'install';
// First: on iOS the Home Screen app has its own storage, so install before
// anything is saved (design §2).
export const order = 0;
export const title = 'Install FretFree';
export const skippable = true;
// Not a question, so the welcome screen's count leaves it out.
export const question = false;
export const explanation = (
  <>
    <p>Added to your Home Screen, FretFree works like an app:</p>
    <ul className={local.reasons}>
      <li>It opens full screen, without the browser’s bars.</li>
      <li>It works offline.</li>
      <li>One tap starts today’s practice.</li>
      <li>
        Your progress is kept safe. A browser may clear a website’s data after a week or so without
        a visit; a Home Screen app keeps it.
      </li>
    </ul>
  </>
);

/**
 * Only where the app can be installed, isn't running standalone, and the
 * learner hasn't already said "Not now" to the tip on this device.
 */
export function available(env: InstallEnv = browserInstallEnv()): boolean {
  if (isInstallTipDismissed()) return false;
  return installOffer({ env, canPrompt: getInstallPrompt() !== null }) !== null;
}

export function InstallStep({ onNext, env }: OnboardingStepProps & { env?: InstallEnv }) {
  const offer = useInstallOffer(env);
  const hasProgress = useHasProgress() ?? false;
  return (
    <div className={local.step}>
      {offer?.kind === 'ios' && (
        <>
          <InstallSteps platform={offer.platform} />
          <StorageNote browser={offer.platform.browser} hasProgress={hasProgress} during="setup" />
        </>
      )}
      {offer?.kind === 'prompt' && (
        <div className={local.prompt}>
          <p>Install FretFree as an app: it opens in its own window and works offline.</p>
          <PromptInstall className={styles.primary} />
        </div>
      )}
      {/* Never a gate: setup carries on here as well. */}
      <button type="button" className={local.continue} onClick={onNext}>
        Continue in the browser
      </button>
    </div>
  );
}

export function Step({ onNext }: OnboardingStepProps) {
  return <InstallStep onNext={onNext} />;
}

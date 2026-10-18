import { useState } from 'react';
import {
  PromptInstall,
  ShareIcon,
  StorageNote,
  shareInstruction,
  useHasProgress,
  useInstallOffer,
} from '../../../shell/InstallHint';
import { dismissInstallTip, isInstallTipDismissed, type InstallEnv } from '../../../shell/install';
import screens from '../../screens.module.css';
import styles from './install.module.css';

export const id = 'install';
// Under the hero, so starting a session stays the first thing on Today.
export const order = 12;

/**
 * The install tip in compact form (design §2, §7 Today): the onboarding
 * step's advice, where the app can be installed and isn't running
 * standalone. "Not now" hides it on this device.
 */
export function Card({ env }: { env?: InstallEnv }) {
  const offer = useInstallOffer(env);
  const hasProgress = useHasProgress();
  const [dismissed, setDismissed] = useState(isInstallTipDismissed);
  // Wait for the progress check, so the storage advice doesn't change under the learner.
  if (!offer || dismissed || hasProgress === null) return null;

  return (
    <section
      className={styles.card}
      aria-labelledby="install-heading"
      data-testid="install-card"
      data-offer={offer.kind}
      data-platform={offer.kind === 'ios' ? offer.platform.device : undefined}
    >
      <div className={styles.body}>
        <h2 id="install-heading" className={screens.sectionTitle}>
          Install FretFree
        </h2>
        {offer.kind === 'ios' && (
          <>
            <p className={styles.how}>
              <ShareIcon />
              <span>
                {shareInstruction(offer.platform)} Then choose <b>Add to Home Screen</b>. It opens
                full screen and works offline.
              </span>
            </p>
            <StorageNote
              browser={offer.platform.browser}
              hasProgress={hasProgress}
              during="practice"
            />
          </>
        )}
        {offer.kind === 'prompt' && (
          <>
            <p>It opens in its own window and works offline.</p>
            <div>
              <PromptInstall />
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => {
          dismissInstallTip();
          setDismissed(true);
        }}
      >
        Not now
      </button>
    </section>
  );
}

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { GuitarSpec } from '../../../engine/garage';
import { resolveLook } from '../model';
import { cardFileName, displayUrl, earnedBadgeTitles } from './card';
import { shareOrDownload } from './deliver';
import { renderCard } from './render';
import styles from './Share.module.css';

interface ShareGuitarProps {
  /** The equipped build: try-ons aren't shared. */
  spec: GuitarSpec;
  name: string;
  achievements: readonly { id: string }[];
}

interface Card {
  key: string;
  file: Promise<File>;
}

/** How long the build must hold still before the card is drawn ahead of a tap. */
const PREPARE_MS = 400;

/**
 * "Share my guitar" (design §3.8 sharing). The card is drawn on the device
 * shortly after the build last changed, so a tap opens the share sheet at
 * once: Safari only shares straight after a tap. Badges are left off unless
 * the learner adds them. Nothing is uploaded.
 */
export function ShareGuitar({ spec, name, achievements }: ShareGuitarProps) {
  const [withBadges, setWithBadges] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const toggleId = useId();
  const earned = useMemo(() => earnedBadgeTitles(achievements), [achievements]);
  const badges = withBadges ? earned : [];
  const key = JSON.stringify([spec, name, badges]);
  const card = useRef<Card | null>(null);

  const prepare = (): Promise<File> => {
    if (card.current?.key === key) return card.current.file;
    const look = resolveLook(spec);
    const file = renderCard(look, {
      name,
      model: `${look.body.name} · ${look.finish.name}`,
      badges,
      url: displayUrl(window.location.origin),
    }).then((blob) => new File([blob], cardFileName(name), { type: 'image/png' }));
    // A failed early draw is retried on the tap.
    file.catch(() => {
      if (card.current?.file === file) card.current = null;
    });
    card.current = { key, file };
    return file;
  };

  useEffect(() => {
    const timer = setTimeout(prepare, PREPARE_MS);
    return () => clearTimeout(timer);
    // `key` captures everything the card shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const onShare = async () => {
    setBusy(true);
    setMessage('');
    try {
      const file = await prepare();
      const outcome = await shareOrDownload(file, {
        title: name,
        text: `${name}, built in FretFree. ${window.location.origin}`,
      });
      if (outcome === 'downloaded') setMessage(`Saved ${file.name}.`);
    } catch (e) {
      console.error('Sharing the guitar failed', e);
      setMessage('Couldn’t make the picture. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.share}>
      <button type="button" className={styles.button} disabled={busy} onClick={onShare}>
        Share my guitar
      </button>
      {earned.length > 0 && (
        <label className={styles.toggle} htmlFor={toggleId}>
          <input
            id={toggleId}
            type="checkbox"
            checked={withBadges}
            onChange={(e) => setWithBadges(e.target.checked)}
          />
          Add my badges
        </label>
      )}
      <p className={styles.status} role="status">
        {message}
      </p>
    </div>
  );
}

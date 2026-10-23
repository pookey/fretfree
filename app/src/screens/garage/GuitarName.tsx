import { useId, useState } from 'react';
import { GUITAR_NAME_MAX, cleanGuitarName } from '../../engine/garage';
import { getDb } from '../../storage';
import { saveGarage } from '../../storage/garage-repo';
import styles from './Garage.module.css';

/**
 * The guitar's name, edited in place and saved on blur (or Enter). An empty
 * name falls back to the default, as `cleanGuitarName` stores it.
 */
export function GuitarName({ name }: { name: string }) {
  const id = useId();
  // What's typed while editing; null shows the stored name.
  const [draft, setDraft] = useState<string | null>(null);
  // A saved name, shown until the stored `name` moves on from `from`.
  const [saved, setSaved] = useState<{ from: string; to: string } | null>(null);
  const shown = draft ?? (saved?.from === name ? saved.to : name);

  const save = () => {
    if (draft === null) return;
    const clean = cleanGuitarName(draft);
    setDraft(null);
    if (clean === name) return;
    setSaved({ from: name, to: clean });
    saveGarage(getDb(), { name: clean }).catch((e: unknown) =>
      console.error('Saving the guitar name failed', e),
    );
  };

  return (
    <div className={styles.name}>
      <label htmlFor={id}>Guitar name</label>
      <input
        id={id}
        type="text"
        value={shown}
        maxLength={GUITAR_NAME_MAX}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </div>
  );
}

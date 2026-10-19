import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import type { GuideLevel } from '../../engine/model';
import type { DrillRenderProps } from '../types';
import { d12Verdicts, pretty, type D12Answer, type D12Prompt } from './logic';
import {
  clearSlot,
  d12Columns,
  d12Explain,
  d12Guides,
  d12KeyAction,
  d12MoveTarget,
  d12SlotNoun,
  d12Subject,
  d12Task,
  d12WorkedExample,
  emptySlots,
  isFull,
  moveChord,
  nextEmpty,
  placeChord,
  spokenChord,
} from './present';
import styles from './D12View.module.css';

/** Pointer travel (px) before a press becomes a drag rather than a tap. */
const DRAG_THRESHOLD = 8;

type Slots = (string | null)[];

interface Edit {
  prompt: D12Prompt;
  slots: Slots;
  /** Earlier charts, for Undo. */
  history: Slots[];
  /** The selected slot: a tapped tile or a number key fills it. */
  current: number;
}

/** A chord in motion: from the palette (`from` null) or out of a slot. */
interface Carried {
  chord: string;
  from: number | null;
}

interface PointerDrag extends Carried {
  x: number;
  y: number;
  over: number | null;
}

interface KeyboardGrab extends Carried {
  target: number;
}

/** Pointer or keyboard state, kept only for the prompt it began on. */
interface Held<T> {
  prompt: D12Prompt;
  value: T;
}

function fresh(prompt: D12Prompt): Edit {
  return { prompt, slots: emptySlots(prompt), history: [], current: 0 };
}

/** The slot under a point, if any. */
function slotAt(x: number, y: number): number | null {
  const el = document.elementFromPoint?.(x, y)?.closest<HTMLElement>('[data-slot-index]');
  return el ? Number(el.dataset.slotIndex) : null;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * D12 view (design §6 D12): the progression's slots above a palette of chord
 * tiles. A chord is dragged into a slot with a pointer (finger, Pencil or
 * trackpad), or with the keyboard: Space picks a tile or a filled slot up,
 * the arrow keys choose the slot, Space drops it and Escape cancels. Tapping
 * a tile fills the selected slot, which is quicker for a 12-bar blues.
 * Dragging a placed chord to another slot swaps them; dragging it off the
 * chart removes it. Checking is explicit, so a slip can be undone first.
 */
export function D12View({
  prompt,
  guideLevel,
  guided,
  sizeClass,
  feedback,
  onAnswer,
  aside,
}: DrillRenderProps<D12Prompt, D12Answer>) {
  const [stored, setEdit] = useState<Edit>(() => fresh(prompt));
  // A new prompt starts empty.
  const edit = stored.prompt === prompt ? stored : fresh(prompt);
  const { slots, current } = edit;
  const update = useCallback(
    (fn: (e: Edit) => Edit) => setEdit((e) => fn(e.prompt === prompt ? e : fresh(prompt))),
    [prompt],
  );

  // A drag or a grab ends with its prompt, and when the answer is checked.
  const [dragHeld, setDragHeld] = useState<Held<PointerDrag> | null>(null);
  const [grabHeld, setGrabHeld] = useState<Held<KeyboardGrab> | null>(null);
  const live = (h: Held<unknown>) => !feedback && h.prompt === prompt;
  const drag = dragHeld && live(dragHeld) ? dragHeld.value : null;
  const grab = grabHeld && live(grabHeld) ? grabHeld.value : null;
  const setDrag = useCallback(
    (value: PointerDrag | null) => setDragHeld(value && { prompt, value }),
    [prompt],
  );
  const setGrab = useCallback(
    (value: KeyboardGrab | null) => setGrabHeld(value && { prompt, value }),
    [prompt],
  );
  const [said, setSaid] = useState('');
  const press = useRef<(Carried & { x: number; y: number; id: number; prompt: D12Prompt }) | null>(
    null,
  );
  const dragged = useRef(false);
  const slotRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const noun = d12SlotNoun(prompt);
  const columns = d12Columns(slots.length);

  /** Apply a chart change, keeping the old chart for Undo. */
  const commit = useCallback(
    (change: (s: Slots) => Slots, select?: (s: Slots) => number) =>
      update((e) => {
        const next = change(e.slots);
        return {
          ...e,
          slots: next,
          history: [...e.history, e.slots],
          current: select ? select(next) : e.current,
        };
      }),
    [update],
  );

  const fill = useCallback(
    (index: number, chord: string) =>
      commit(
        (s) => placeChord(s, index, chord),
        (s) => nextEmpty(s, index + 1),
      ),
    [commit],
  );
  const move = useCallback(
    (from: number, to: number) => commit((s) => moveChord(s, from, to)),
    [commit],
  );
  const clear = useCallback(
    (index: number) =>
      commit(
        (s) => clearSlot(s, index),
        () => index,
      ),
    [commit],
  );
  const undo = useCallback(
    () =>
      update((e) => {
        const prev = e.history.at(-1);
        if (!prev) return e;
        return { ...e, slots: prev, history: e.history.slice(0, -1), current: nextEmpty(prev, 0) };
      }),
    [update],
  );
  const select = useCallback(
    (index: number) => update((e) => ({ ...e, current: index })),
    [update],
  );

  const full = isFull(slots);
  const check = useCallback(() => {
    if (isFull(slots)) onAnswer({ chords: [...slots] });
  }, [slots, onAnswer]);

  /**
   * Put a carried chord down on a slot, or off the chart (removing a placed
   * one). Back on its own slot changes nothing, so it leaves no Undo step.
   */
  const drop = useCallback(
    (c: Carried, target: number | null) => {
      if (target === null) {
        if (c.from !== null) clear(c.from);
      } else if (c.from === null) fill(target, c.chord);
      else if (c.from !== target) move(c.from, target);
    },
    [clear, fill, move],
  );

  const slotName = useCallback(
    (i: number) => {
      const chord = slots[i];
      return `${capitalise(noun)} ${i + 1}: ${chord ? spokenChord(chord) : 'empty'}`;
    },
    [slots, noun],
  );

  // Pointer drag: watched on the window so a finger can leave the tile.
  useEffect(() => {
    const moveTo = (e: globalThis.PointerEvent) => {
      const p = press.current;
      if (!p || e.pointerId !== p.id || p.prompt !== prompt || feedback) return;
      if (!dragged.current && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) {
        return;
      }
      dragged.current = true;
      setDrag({
        chord: p.chord,
        from: p.from,
        x: e.clientX,
        y: e.clientY,
        over: slotAt(e.clientX, e.clientY),
      });
    };
    const release = (e: globalThis.PointerEvent) => {
      const p = press.current;
      if (!p || e.pointerId !== p.id) return;
      press.current = null;
      // A press from an earlier prompt, or one still down at Check, drops nothing.
      if (dragged.current && p.prompt === prompt && !feedback) {
        const target = slotAt(e.clientX, e.clientY);
        drop(p, target);
        setSaid(
          target === null
            ? p.from === null
              ? ''
              : `Removed ${spokenChord(p.chord)}.`
            : `Dropped ${spokenChord(p.chord)} in ${noun} ${target + 1}.`,
        );
      }
      setDrag(null);
    };
    const cancel = (e: globalThis.PointerEvent) => {
      if (press.current?.id !== e.pointerId) return;
      press.current = null;
      setDrag(null);
    };
    window.addEventListener('pointermove', moveTo);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', moveTo);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [drop, noun, prompt, feedback, setDrag]);

  const startPress = (e: PointerEvent, c: Carried | null) => {
    // Browsers send no click to the pressed element after a drag, so a new
    // press, even on an empty slot, clears the last drag's flag.
    dragged.current = false;
    if (!c || feedback || (e.pointerType === 'mouse' && e.button !== 0)) return;
    press.current = { ...c, x: e.clientX, y: e.clientY, id: e.pointerId, prompt };
    setGrab(null);
  };

  /** A click that ends a drag (on the element it started from) is not a tap. */
  const tapped = () => {
    if (!dragged.current) return true;
    dragged.current = false;
    return false;
  };

  // Keyboard: the drag pattern on a focused tile or slot, then shortcuts.
  useEffect(() => {
    if (feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const activate = e.key === ' ' || e.key === 'Enter';
      if (grab) {
        if (e.key === 'Escape') {
          setGrab(null);
          setSaid(`Cancelled. ${spokenChord(grab.chord)} not moved.`);
        } else if (activate) {
          drop(grab, grab.target);
          setGrab(null);
          setSaid(`Dropped ${spokenChord(grab.chord)} in ${noun} ${grab.target + 1}.`);
          if (grab.from !== null) slotRefs.current[grab.target]?.focus();
        } else {
          const target = d12MoveTarget(e.key, grab.target, slots.length, columns);
          if (target === null) return;
          setGrab({ ...grab, target });
          setSaid(slotName(target));
        }
        e.preventDefault();
        return;
      }
      const el = e.target instanceof HTMLElement ? e.target : null;
      const tile = el?.dataset.tileIndex;
      const slot = el?.dataset.slotIndex;
      if (activate && tile !== undefined) {
        const chord = prompt.palette[Number(tile)]?.symbol as string;
        setGrab({ chord, from: null, target: current });
        setSaid(
          `Picked up ${spokenChord(chord)}. ${slotName(current)}. Arrow keys choose a ${noun}, Space drops it, Escape cancels.`,
        );
        e.preventDefault();
        return;
      }
      if (slot !== undefined) {
        const i = Number(slot);
        const chord = slots[i];
        if (activate) {
          if (chord) {
            setGrab({ chord, from: i, target: i });
            setSaid(
              `Picked up ${spokenChord(chord)} from ${noun} ${i + 1}. Arrow keys choose a ${noun}, Space drops it.`,
            );
          } else {
            select(i);
            setSaid(`${capitalise(noun)} ${i + 1} selected.`);
          }
          e.preventDefault();
          return;
        }
        if ((e.key === 'Backspace' || e.key === 'Delete') && chord) {
          clear(i);
          setSaid(`Removed ${spokenChord(chord)}.`);
          e.preventDefault();
          return;
        }
      }
      const action = d12KeyAction(e.key, prompt.palette.length);
      if (!action) return;
      // Enter on a focused button is that button's click, not "check".
      if (action.type === 'check' && e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      if (action.type === 'tile') fill(current, prompt.palette[action.index]?.symbol as string);
      else if (action.type === 'undo') undo();
      else check();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    feedback,
    grab,
    setGrab,
    drop,
    noun,
    slots,
    columns,
    slotName,
    prompt.palette,
    current,
    select,
    clear,
    fill,
    undo,
    check,
  ]);

  // The worked example shows full guides (design §3.3 step 2).
  const level: GuideLevel = guided ? 3 : guideLevel;
  const guides = d12Guides(level);
  const answer = feedback?.answer;
  const shown: Slots = answer ? answer.chords : slots;
  const verdicts = answer ? d12Verdicts(prompt, answer) : [];
  const explanation =
    feedback && !feedback.result.correct && answer ? d12Explain(prompt, answer) : [];
  const named = guided || guides.sourceNumerals || Boolean(feedback);
  const target = grab?.target ?? drag?.over ?? null;
  // A 12-bar chart: smaller slots, and on an iPad the source chart in two
  // rows of six. A phone keeps the slots' rows of four.
  const long = slots.length > 4;
  const sourceColumns = long && sizeClass !== 'compact' ? 6 : columns;

  return (
    <div
      className={styles.drill}
      data-size-class={sizeClass}
      data-long={long ? 'true' : undefined}
      data-testid="d12-drill"
    >
      <div className={styles.upper}>
        <div className={styles.top}>
          <p className={styles.subject} data-testid="d12-subject">
            {d12Subject(prompt, named)}
          </p>
          <p className={styles.prompt} id="drill-prompt">
            {guided ? (
              <>{d12WorkedExample(prompt)} Drag each chord into its slot to continue.</>
            ) : (
              d12Task(prompt)
            )}
          </p>
          {prompt.from && (
            <figure className={styles.source} data-testid="d12-source">
              <figcaption>In {prompt.from.keyName}</figcaption>
              <ol className={styles.chart} style={{ '--columns': sourceColumns } as CSSProperties}>
                {prompt.from.chords.map((c, i) => (
                  <li key={i}>
                    <span className={styles.chartChord}>{pretty(c)}</span>
                    {(guides.sourceNumerals || feedback) && (
                      <span className={styles.numeral}>{pretty(prompt.numerals[i] as string)}</span>
                    )}
                  </li>
                ))}
              </ol>
            </figure>
          )}
          <ol
            className={styles.slots}
            aria-label={prompt.from ? `In ${prompt.keyName}` : 'Progression'}
            style={{ '--columns': columns } as CSSProperties}
          >
            {shown.map((chord, i) => {
              const verdict = answer ? (verdicts[i] ? 'correct' : 'wrong') : undefined;
              const state = feedback
                ? 'answered'
                : target === i
                  ? 'target'
                  : i === current
                    ? 'current'
                    : chord
                      ? 'filled'
                      : 'empty';
              const ghost = guided && !feedback && !chord ? prompt.expected[i] : undefined;
              const numeral = pretty(prompt.numerals[i] as string);
              const showNumeral = guides.slotNumerals || Boolean(feedback);
              return (
                <li key={i} className={styles.slotItem}>
                  <button
                    type="button"
                    ref={(el) => {
                      slotRefs.current[i] = el;
                    }}
                    className={styles.slot}
                    data-slot-index={i}
                    data-state={state}
                    data-verdict={verdict}
                    data-testid="d12-slot"
                    disabled={Boolean(feedback)}
                    aria-label={`${capitalise(noun)} ${i + 1}${showNumeral ? `, ${numeral}` : ''}: ${
                      chord ? spokenChord(chord) : 'empty'
                    }${verdict ? `, ${verdict}` : ''}`}
                    onPointerDown={(e) => startPress(e, chord ? { chord, from: i } : null)}
                    onClick={() => {
                      if (tapped()) select(i);
                    }}
                  >
                    {chord ? (
                      pretty(chord)
                    ) : ghost ? (
                      <span className={styles.ghost}>{pretty(ghost)}</span>
                    ) : null}
                    {verdict && (
                      <span className={styles.mark} aria-hidden="true">
                        {verdict === 'correct' ? '✓' : '✗'}
                      </span>
                    )}
                  </button>
                  {/* The numeral first, so the row lines up when corrections show below. */}
                  {showNumeral && (
                    <span className={styles.numeral} aria-hidden="true">
                      {numeral}
                    </span>
                  )}
                  {verdict === 'wrong' && (
                    <span className={styles.expected} data-testid="d12-expected">
                      {pretty(prompt.expected[i] as string)}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          {explanation.length > 0 && (
            <ul className={styles.explanation} data-testid="d12-explanation">
              {explanation.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>
      {!feedback && (
        <div className={styles.answer}>
          <p id="d12-how" className={styles.hint}>
            Drag a chord into a slot, or select a slot and tap a chord.
          </p>
          <div
            className={styles.palette}
            role="group"
            aria-label="Chords"
            aria-describedby="d12-how d12-keys"
          >
            {prompt.palette.map((t, i) => (
              <button
                key={t.symbol}
                type="button"
                className={styles.tile}
                data-tile-index={i}
                data-grabbed={grab?.from === null && grab.chord === t.symbol ? 'true' : undefined}
                aria-label={spokenChord(t.symbol)}
                aria-keyshortcuts={i < 9 ? String(i + 1) : undefined}
                onPointerDown={(e) => startPress(e, { chord: t.symbol, from: null })}
                onClick={() => {
                  if (tapped()) fill(current, t.symbol);
                }}
              >
                <span>{pretty(t.symbol)}</span>
                {guides.tileNumerals && (
                  <span className={styles.tileNumeral} aria-hidden="true">
                    {pretty(t.roman)}
                  </span>
                )}
              </button>
            ))}
          </div>
          <p id="d12-keys" className="visually-hidden">
            With a keyboard, Space picks a chord up, the arrow keys choose a slot, and Space drops
            it.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={undo}
              disabled={edit.history.length === 0}
              aria-keyshortcuts="Backspace"
            >
              Undo
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={check}
              disabled={!full}
              aria-keyshortcuts="Enter"
            >
              Check
            </button>
          </div>
        </div>
      )}
      <p className="visually-hidden" role="status" data-testid="d12-status">
        {said}
      </p>
      {drag && (
        <div
          className={styles.dragGhost}
          style={{ left: drag.x, top: drag.y }}
          aria-hidden="true"
          data-testid="d12-drag"
        >
          {pretty(drag.chord)}
        </div>
      )}
      {/* iPad portrait: below. Compact: the session styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}

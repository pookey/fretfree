import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { DRILLS } from '../../drills/registry';
import { SKILLS, type Goal } from '../../engine';
import { createDrillPicker } from '../../session/drill-picker';
import { firstTestOut, useOfferJump } from './LearnScreen';
import { buildMap, skillStatuses, type ModuleView } from './map-model';

// M10-16: the Learn map header's "Test out of …" and the jump to its offer.

const PICKER = createDrillPicker(SKILLS, DRILLS);
const fresh = skillStatuses(SKILLS, new Map());
const mapFor = (goal: Goal) =>
  buildMap({ skills: SKILLS, goal, stored: new Map(), cards: [], canServe: PICKER.canServe });

describe('firstTestOut', () => {
  it('picks the first locked module in the goal’s order', () => {
    // Neck basics is open on a fresh profile, so Whole neck is the first locked.
    expect(firstTestOut(mapFor('general'), fresh)?.module.id).toBe('notes-2');
    expect(firstTestOut(mapFor('improvise'), fresh)?.module.id).toBe('pentatonic');
  });

  it('passes over a locked module with nothing a drill can test', () => {
    const map = mapFor('general');
    const notes2 = map.find((v) => v.module.id === 'notes-2')!;
    // Locked, with skills, but no topic of its own: no first skill waits on a testable prerequisite.
    const untestable: ModuleView = {
      ...notes2,
      module: { ...notes2.module, id: 'untestable', topics: [] },
    };
    expect(firstTestOut([untestable, ...map], fresh)?.module.id).toBe('notes-2');
    // And a module that isn't locked never counts, whatever it waits on.
    const open: ModuleView = { ...notes2, state: 'open' };
    expect(firstTestOut([open], fresh)).toBeUndefined();
  });

  it('offers nothing once no locked module has a test', () => {
    const locked = mapFor('general').filter((v) => v.state === 'locked');
    const untestable = locked.map((v) => ({ ...v, module: { ...v.module, topics: [] } }));
    expect(firstTestOut(untestable, fresh)).toBeUndefined();
  });
});

describe('useOfferJump', () => {
  /** A detail pane holding a test-out offer, or not. */
  function pane(withOffer: boolean) {
    const el = document.createElement('div');
    if (withOffer)
      el.innerHTML = '<section data-testid="test-out"><button>Test out</button></section>';
    document.body.append(el);
    // jsdom has no layout.
    el.querySelectorAll('section').forEach((s) => (s.scrollIntoView = () => {}));
    return { current: el };
  }
  const button = (ref: { current: HTMLElement }) => ref.current.querySelector('button')!;

  it('focuses the offer once the module it jumped to shows', () => {
    const ref = pane(true);
    const { result, rerender } = renderHook(({ id }) => useOfferJump(id, ref), {
      initialProps: { id: 'notes-1' as string | undefined },
    });
    result.current('notes-2');
    rerender({ id: 'notes-1' });
    expect(document.activeElement).not.toBe(button(ref));
    rerender({ id: 'notes-2' });
    expect(document.activeElement).toBe(button(ref));
  });

  it('focuses at once when the module already shows', () => {
    const ref = pane(true);
    const { result } = renderHook(() => useOfferJump('notes-2', ref));
    result.current('notes-2');
    expect(document.activeElement).toBe(button(ref));
  });

  it('drops the jump on moving to another module, so a later visit keeps its focus', () => {
    const ref = pane(false);
    const { result, rerender } = renderHook(({ id }) => useOfferJump(id, ref), {
      initialProps: { id: 'notes-1' as string | undefined },
    });
    result.current('notes-2');
    // The offer isn't there when the module shows, so nothing is focused…
    rerender({ id: 'notes-2' });
    // …then the learner moves on, and comes back later to an offer.
    rerender({ id: 'intervals' });
    ref.current.innerHTML = '<section data-testid="test-out"><button>Test out</button></section>';
    rerender({ id: 'notes-2' });
    expect(document.activeElement).not.toBe(button(ref));
  });
});

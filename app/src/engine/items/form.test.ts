import { describe, expect, it } from 'vitest';
import { itemId, parseItemId } from '../model';
import form, { FORM_SHAPES, formItemId, parseFormItemId, pickupItemId } from './form';

describe('form items', () => {
  it('builds and parses pickup cards: `pickup:<meter>:<beats>:<task>`', () => {
    expect(pickupItemId('4/4', 1, 'bar')).toBe('pickup:4/4:1:bar');
    expect(pickupItemId('6/8', 3, 'start')).toBe('pickup:6/8:3:start');
    expect(parseFormItemId('pickup:3/4:2:start')).toEqual({
      kind: 'pickup',
      meter: '3/4',
      beats: 2,
      task: 'start',
    });
  });

  it('builds and parses road maps: `form:<shape>:<task>`', () => {
    expect(formItemId('repeat-inner', 'next')).toBe('form:repeat-inner:next');
    for (const shape of FORM_SHAPES) {
      for (const task of ['next', 'order'] as const)
        expect(parseFormItemId(formItemId(shape, task))).toEqual({ kind: 'form', shape, task });
    }
  });

  it('rejects malformed IDs, pickups of a whole bar and unknown shapes', () => {
    for (const id of [
      'pickup:4/4:4:bar',
      'pickup:4/4:0:bar',
      'pickup:4/4:01:bar',
      'pickup:4/3:1:bar',
      'pickup:4/4:1:end',
      'pickup:4/4:1',
      'form:repeat-sideways:next',
      'form:repeat-all:play',
      'form:repeat-all',
    ])
      expect(parseFormItemId(id), id).toBeNull();
    expect(() => pickupItemId('3/4', 3, 'bar')).toThrow(RangeError);
    expect(() => pickupItemId('C', 1, 'bar')).toThrow(RangeError);
    expect(() => pickupItemId('4/4', 1.5, 'bar')).toThrow(RangeError);
    expect(() => formItemId('nope' as never, 'next')).toThrow(RangeError);
  });

  it('round-trips through the item registry', () => {
    expect(form.kinds).toEqual(['pickup', 'form']);
    for (const id of ['pickup:6/8:1:bar', 'form:endings-long:order']) {
      const ref = parseItemId(id);
      expect(ref?.kind).toBe(id.split(':')[0]);
      expect(itemId(ref!)).toBe(id);
    }
  });
});

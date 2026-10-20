import { describe, expect, it } from 'vitest';
import {
  collectItemKinds,
  findItemId,
  findMarkerItemId,
  intervalItemId,
  itemId,
  keyFactItemId,
  letterItemId,
  markerItemId,
  noteItemId,
  octavesItemId,
  parseFindItemId,
  degreeItemId,
  numeralItemId,
  parseDegreeItemId,
  parseNumeralItemId,
  parseIntervalItemId,
  parseKeyFactItemId,
  parseSignatureKeyItemId,
  parseSpellChordItemId,
  parseSpellKeyItemId,
  spellChordItemId,
  spellKeyItemId,
  parseItemId,
  parseLetterItemId,
  parseMarkerItemId,
  parseNoteItemId,
  parseOctavesItemId,
  parseRepeatItemId,
  parseStepItemId,
  repeatItemId,
  signatureKeyItemId,
  stepItemId,
  ITEM_KINDS,
  type ItemKind,
  type ItemRef,
} from './model';
import { SKILLS } from './skills';

describe('item IDs', () => {
  it('formats each kind canonically', () => {
    expect(noteItemId({ string: 6, fret: 5 })).toBe('note@s6f5');
    expect(findItemId('G', 5)).toBe('find:G@s5');
    expect(findItemId('C#', 3)).toBe('find:C#@s3');
    expect(stepItemId(2, 'E')).toBe('step:+2@E');
    expect(stepItemId(-1, 'C')).toBe('step:-1@C');
    expect(letterItemId(1, 'G')).toBe('letter:+1@G');
    expect(markerItemId(7)).toBe('marker:f7');
    expect(findMarkerItemId(12)).toBe('find-marker:f12');
    expect(repeatItemId(12, 3)).toBe('repeat:+12@f3');
    expect(repeatItemId(-12, 15)).toBe('repeat:-12@f15');
    expect(intervalItemId('interval', 'M3', 6, 5)).toBe('interval:M3@s6→s5');
    expect(intervalItemId('interval-name', 'TT', 3, 1)).toBe('interval-name:TT@s3→s1');
    expect(octavesItemId('G')).toBe('octaves:G');
    expect(() => intervalItemId('interval', 'X9' as 'M3', 6, 5)).toThrow(RangeError);
    expect(spellKeyItemId('F#')).toBe('spell-key:F#');
    expect(spellChordItemId('m7', 'B')).toBe('spell-chord:m7@B');
    expect(spellChordItemId('7', 'Gb')).toBe('spell-chord:7@Gb');
    expect(degreeItemId('degree', 6, 'Eb')).toBe('degree:6@Eb');
    expect(degreeItemId('degree-of', 7, 'F#')).toBe('degree-of:7@F#');
    expect(keyFactItemId('key-signature', 'Eb')).toBe('key-signature:Eb');
    expect(keyFactItemId('relative-minor', 'F#')).toBe('relative-minor:F#');
    expect(keyFactItemId('dominant', 'C')).toBe('dominant:C');
    expect(signatureKeyItemId(0)).toBe('signature-key:0');
    expect(signatureKeyItemId(3)).toBe('signature-key:3#');
    expect(signatureKeyItemId(-7)).toBe('signature-key:7b');
  });

  it('parses each kind', () => {
    expect(parseNoteItemId('note@s6f5')).toEqual({ string: 6, fret: 5 });
    expect(parseFindItemId('find:Bb@s2')).toEqual({ pc: 'Bb', string: 2 });
    expect(parseStepItemId('step:+2@E')).toEqual({ semitones: 2, from: 'E' });
    expect(parseLetterItemId('letter:-1@A')).toEqual({ steps: -1, from: 'A' });
    expect(parseMarkerItemId('marker:f0')).toEqual({ kind: 'marker', fret: 0 });
    expect(parseMarkerItemId('find-marker:f9')).toEqual({ kind: 'find-marker', fret: 9 });
    expect(parseRepeatItemId('repeat:-12@f17')).toEqual({ frets: -12, from: 17 });
    expect(parseIntervalItemId('interval:b7@s5→s3')).toBeNull();
    expect(parseOctavesItemId('octaves:F#')).toEqual({ pc: 'F#' });
    expect(parseSpellKeyItemId('spell-key:Cb')).toEqual({ tonic: 'Cb' });
    expect(parseSpellChordItemId('spell-chord:m7b5@F#')).toEqual({ chord: 'm7b5', root: 'F#' });
    expect(parseSpellChordItemId('spell-chord:m9@F#')).toBeNull();
    expect(parseDegreeItemId('degree-of:3@Ab')).toEqual({
      kind: 'degree-of',
      degree: 3,
      tonic: 'Ab',
    });
    expect(parseKeyFactItemId('dominant:Gb')).toEqual({ kind: 'dominant', tonic: 'Gb' });
    expect(parseSignatureKeyItemId('signature-key:6b')).toEqual({ alteration: -6 });
    expect(parseSignatureKeyItemId('signature-key:0')).toEqual({ alteration: 0 });
  });

  const refs: ItemRef[] = [
    { kind: 'note', position: { string: 1, fret: 12 } },
    { kind: 'find', pc: 'F#', string: 4 },
    { kind: 'step', semitones: -2, from: 'C' },
    { kind: 'letter', steps: 1, from: 'B' },
    { kind: 'marker', fret: 3 },
    { kind: 'find-marker', fret: 5 },
    { kind: 'repeat', frets: 12, from: 0 },
    { kind: 'interval', interval: 'm7', from: 5, to: 3 },
    { kind: 'interval-name', interval: 'M3', from: 3, to: 2 },
    { kind: 'octave', from: { string: 6, fret: 5 }, string: 4 },
    { kind: 'octaves', pc: 'G' },
    { kind: 'spell-key', tonic: 'Gb' },
    { kind: 'spell-chord', chord: 'major', root: 'E' },
    { kind: 'degree', degree: 6, tonic: 'Eb' },
    { kind: 'degree-of', degree: 2, tonic: 'C#' },
    { kind: 'key-signature', tonic: 'Cb' },
    { kind: 'relative-minor', tonic: 'Eb' },
    { kind: 'dominant', tonic: 'F#' },
    { kind: 'signature-key', alteration: 4 },
    { kind: 'signature-key', alteration: -2 },
    { kind: 'signature-key', alteration: 0 },
  ];

  it.each(refs)('round-trips $kind refs', (ref) => {
    const id = itemId(ref);
    expect(parseItemId(id)).toEqual(ref);
    expect(itemId(parseItemId(id)!)).toBe(id);
  });

  it.each([
    '',
    'note@s06f5',
    'note@s6f05',
    'note@s6',
    'find:H@s5',
    'find:G@s',
    'find:g@s5',
    'step:2@E',
    'step:+0@E',
    'step:+02@E',
    'step:+2@E#x',
    'letter:+1@C#',
    'marker:7',
    'marker:f-1',
    'repeat:12@f3',
    'interval:M9@s6→s5',
    'interval:M3@s06→s5',
    'interval:M3@s6-s5',
    'interval-name:M3@s6',
    'nope:G',
    'octaves:H',
    'octaves:g',
    'octaves:G@s6',
    'spell-key:F##',
    'spell-key:f',
    'spell-chord:Bm7',
    'spell-chord:min@B',
    'degree:8@C',
    'degree:0@C',
    'degree:6@Eb major',
    'degree-of:C@Eb',
    'key-signature:Eb major',
    'dominant:eb',
    'signature-key:3',
    'signature-key:8#',
    'signature-key:0#',
    'signature-key:-3',
  ])('rejects non-canonical %j', (id) => {
    expect(parseItemId(id)).toBeNull();
  });

  it('refuses to build IDs that would not parse', () => {
    expect(() => noteItemId({ string: 6, fret: -1 })).toThrow(RangeError);
    expect(() => noteItemId({ string: 1.5, fret: 0 })).toThrow(RangeError);
    expect(() => findItemId('H', 5)).toThrow(RangeError);
    expect(() => stepItemId(0, 'E')).toThrow(RangeError);
    expect(() => stepItemId(1.5, 'E')).toThrow(RangeError);
    expect(() => letterItemId(1, 'C#')).toThrow(RangeError);
    expect(() => markerItemId(-3)).toThrow(RangeError);
    expect(() => repeatItemId(12, -1)).toThrow(RangeError);
    expect(() => octavesItemId('H')).toThrow(RangeError);
    expect(() => spellKeyItemId('E##')).toThrow(RangeError);
    expect(() => spellChordItemId('m9' as 'm7', 'B')).toThrow(RangeError);
    expect(() => degreeItemId('degree', 8, 'C')).toThrow(RangeError);
    expect(() => degreeItemId('degree', 2.5, 'C')).toThrow(RangeError);
    expect(() => keyFactItemId('dominant', 'H')).toThrow(RangeError);
    expect(() => signatureKeyItemId(8)).toThrow(RangeError);
    expect(() => signatureKeyItemId(1.5)).toThrow(RangeError);
  });
});

describe('numeral item IDs', () => {
  it('formats and parses numerals, numerals-of and Nashville numbers in a key', () => {
    expect(numeralItemId('numeral', 'vi', 'D')).toBe('numeral:vi@key=D');
    expect(numeralItemId('numeral-of', 'vii°', 'Bb')).toBe('numeral-of:vii°@key=Bb');
    expect(numeralItemId('nashville', '6m', 'F#')).toBe('nashville:6m@key=F#');
    expect(numeralItemId('numeral', 'bVII', 'Am')).toBe('numeral:bVII@key=Am');
    expect(parseNumeralItemId('nashville:7°@key=Eb')).toEqual({
      kind: 'nashville',
      numeral: '7°',
      key: 'Eb',
    });
  });

  it.each([
    { kind: 'numeral', numeral: 'IV', key: 'C' },
    { kind: 'numeral-of', numeral: 'ii°', key: 'Em' },
    { kind: 'nashville', numeral: 'b7', key: 'Dm' },
  ] as ItemRef[])('round-trips $kind refs', (ref) => {
    const id = itemId(ref);
    expect(parseItemId(id)).toEqual(ref);
  });

  it.each([
    'numeral:viio@key=C',
    'numeral:6m@key=C',
    'numeral:vi@key=c',
    'numeral:vi@key=Dmin',
    'numeral:vi@D',
    'numeral-of:I+X@key=C',
    'nashville:vi@key=C',
    'nashville:6-@key=C',
    'nashville:6m@key=H',
  ])('rejects non-canonical %j', (id) => {
    expect(parseItemId(id)).toBeNull();
  });

  it('refuses to build IDs that would not parse', () => {
    expect(() => numeralItemId('numeral', 'viio', 'C')).toThrow(RangeError);
    expect(() => numeralItemId('nashville', 'vi', 'C')).toThrow(RangeError);
    expect(() => numeralItemId('numeral', 'vi', 'D major')).toThrow(RangeError);
    expect(() => numeralItemId('numeral', 'vi', 'Q')).toThrow(RangeError);
  });
});

describe('item kind registry', () => {
  // IDs as stored before item kinds moved into `items/` (M1-43), one or more
  // per kind. Cards and review logs are keyed by these, so they must not change.
  const STORED: readonly (readonly [id: string, kind: string])[] = [
    ['note@s6f0', 'note'],
    ['find:C#@s3', 'find'],
    ['step:+1@E', 'step'],
    ['step:-2@C', 'step'],
    ['letter:+1@C', 'letter'],
    ['marker:f3', 'marker'],
    ['find-marker:f12', 'find-marker'],
    ['repeat:-12@f15', 'repeat'],
    ['octave:s6f0→s4', 'octave'],
    ['octaves:F#', 'octaves'],
    ['interval:m3@s6→s5', 'interval'],
    ['interval-name:TT@s3→s1', 'interval-name'],
    ['spell-key:Gb', 'spell-key'],
    ['spell-chord:m7b5@F#', 'spell-chord'],
    ['degree:6@Eb', 'degree'],
    ['degree-of:2@C#', 'degree-of'],
    ['caged:C-shape@dominant7', 'caged'],
    ['caged-core:A-shape@minor', 'caged-core'],
    ['chord-tone:b3@m7', 'chord-tone'],
    ['chord-tone-name:1@major', 'chord-tone-name'],
    ['chord-name:E-shape@major', 'chord-name'],
    ['build-chord:m7@s5', 'build-chord'],
    ['capo-sound:G', 'capo-sound'],
    ['capo-shape:Am', 'capo-shape'],
    ['capo-fret:G', 'capo-fret'],
    ['numeral:bVII@key=Am', 'numeral'],
    ['numeral-of:vii°@key=Bb', 'numeral-of'],
    ['nashville:6m@key=F#', 'nashville'],
    ['prog:I-IV-V:build', 'progression'],
    ['chord-tones:C', 'chord-tones'],
    ['chord-tones:b7@Cm7', 'chord-tones'],
    ['key-signature:Cb', 'key-signature'],
    ['relative-minor:Eb', 'relative-minor'],
    ['dominant:F#', 'dominant'],
    ['signature-key:7b', 'signature-key'],
    ['penta-box:1@minor', 'penta-box'],
    ['penta-relative:5@major', 'penta-relative'],
  ];

  it.each(STORED)('keeps the stored ID %j (%s)', (id, kind) => {
    const ref = parseItemId(id);
    expect(ref?.kind).toBe(kind);
    expect(itemId(ref!)).toBe(id);
  });

  const skillItems = SKILLS.flatMap((s) => s.items().map((i) => i.id));

  it('round-trips every kind, through the items the skills hold', () => {
    const used = new Set<string>();
    for (const id of skillItems) {
      const ref = parseItemId(id);
      expect(ref, id).not.toBeNull();
      expect(itemId(ref!)).toBe(id);
      used.add(ref!.kind);
    }
    // A kind no skill holds is never scheduled: a dead file, or a skill not yet added.
    expect([...used].sort()).toEqual([...ITEM_KINDS].sort());
  });

  it('parses each ID in exactly one kind family', () => {
    const families = [
      ...new Set(
        Object.values(
          import.meta.glob<{ default: ItemKind }>(
            ['./items/*.ts', '!./items/helpers.ts', '!./items/*.test.ts'],
            { eager: true },
          ),
        ).map((m) => m.default),
      ),
    ];
    for (const id of [...skillItems, ...STORED.map(([id]) => id)]) {
      expect(
        families.filter((f) => f.parse(id) !== null),
        id,
      ).toHaveLength(1);
    }
  });

  it('refuses a kind no file defines', () => {
    expect(() => itemId({ kind: 'nope' } as unknown as ItemRef)).toThrow(RangeError);
  });

  it('collects kinds by file, and fails on a missing export or a kind defined twice', () => {
    const a: ItemKind = { kinds: ['a', 'b'], id: () => 'a', parse: () => null };
    const c: ItemKind = { kinds: ['c'], id: () => 'c', parse: () => null };
    const kinds = collectItemKinds({
      './items/a.ts': { default: a },
      './items/c.ts': { default: c },
    });
    expect([...kinds.keys()]).toEqual(['a', 'b', 'c']);
    expect(kinds.get('b')).toBe(a);
    expect(() => collectItemKinds({ './items/x.ts': {} })).toThrow(
      /items\/x\.ts must default-export/,
    );
    expect(() =>
      collectItemKinds({ './items/a.ts': { default: a }, './items/b.ts': { default: a } }),
    ).toThrow(/kind a is defined twice/);
  });
});

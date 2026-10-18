import {
  MAX_FRET,
  STANDARD_TUNING,
  allStrings,
  chromaOf,
  noteAt,
  stringCount,
  type Position,
  type Tuning,
} from './fretboard';

/**
 * Pure tab model (docs/design/tab-track.md). Tab draws one line per string
 * with the highest-pitched string on top, so tab line 0 is string 1 (high E),
 * matching the theory numbering. A phrase is a single-note line: a sequence of
 * {string, fret} events read left to right.
 */

/** One note in a tab phrase. */
export type TabEvent = Position;

/** A short phrase, in playing order. */
export type TabPhrase = readonly TabEvent[];

export class TabParseError extends Error {
  /** 1-based line of the input text, when the error has one. */
  readonly line?: number;
  /** 1-based column of the input text, when the error has one. */
  readonly column?: number;

  constructor(message: string, at?: { line: number; column?: number }) {
    super(at ? `${message} (line ${at.line}${at.column ? `, column ${at.column}` : ''})` : message);
    this.name = 'TabParseError';
    this.line = at?.line;
    this.column = at?.column;
  }
}

function assertString(string: number, tuning: Tuning): void {
  if (!Number.isInteger(string) || string < 1 || string > stringCount(tuning)) {
    throw new RangeError(`String ${string} is outside 1–${stringCount(tuning)}`);
  }
}

/** The string a tab line shows. Line 0 is the top line. */
export function lineToString(line: number, tuning: Tuning = STANDARD_TUNING): number {
  if (!Number.isInteger(line) || line < 0 || line >= stringCount(tuning)) {
    throw new RangeError(`Tab line ${line} is outside 0–${stringCount(tuning) - 1}`);
  }
  return line + 1;
}

/** The tab line (0 = top) that shows a string. */
export function stringToLine(string: number, tuning: Tuning = STANDARD_TUNING): number {
  assertString(string, tuning);
  return string - 1;
}

/**
 * The name written at the left of a string's tab line: its open note's pitch
 * class, with the top line in lower case (`e B G D A E` in standard tuning) so
 * the two E strings read apart.
 */
export function tabLineName(string: number, tuning: Tuning = STANDARD_TUNING): string {
  assertString(string, tuning);
  const pc = noteAt({ string, fret: 0 }, tuning, 'flat').pc;
  return string === 1 ? pc.charAt(0).toLowerCase() + pc.slice(1) : pc;
}

/** Every line, top first: `{ line, string, name }`. */
export function tabLines(
  tuning: Tuning = STANDARD_TUNING,
): { line: number; string: number; name: string }[] {
  return allStrings(tuning).map((string) => ({
    line: stringToLine(string, tuning),
    string,
    name: tabLineName(string, tuning),
  }));
}

const FRET_TOKEN = /^(0|[1-9][0-9]?)$/;

/** The fret a tab token names (`'0'`–`'24'`), or `null` if it isn't one. */
export function parseFretToken(token: string): number | null {
  if (!FRET_TOKEN.test(token)) return null;
  const fret = Number(token);
  return fret <= MAX_FRET ? fret : null;
}

/** The tab token for a fret. */
export function formatFretToken(fret: number): string {
  if (!Number.isInteger(fret) || fret < 0 || fret > MAX_FRET) {
    throw new RangeError(`Fret ${fret} is outside 0–${MAX_FRET}`);
  }
  return String(fret);
}

/** Checks every event fits the tuning and the neck; returns the phrase. */
export function validatePhrase(phrase: TabPhrase, tuning: Tuning = STANDARD_TUNING): TabPhrase {
  for (const e of phrase) {
    assertString(e.string, tuning);
    formatFretToken(e.fret);
  }
  return phrase;
}

/** Dashes either side of each note, so `e|--3--|` for one note. */
const GAP = '--';

/**
 * Plain-text tab for a phrase: one column per event, the top line first.
 *
 *     e|--3---------|
 *     B|-----5--12--|  ← a two-digit fret widens its column on every line
 */
export function formatTab(phrase: TabPhrase, tuning: Tuning = STANDARD_TUNING): string {
  validatePhrase(phrase, tuning);
  const names = tabLines(tuning).map((l) => l.name);
  const nameW = Math.max(...names.map((n) => n.length));
  return tabLines(tuning)
    .map(({ string, name }) => {
      const body = phrase
        .map((e) => {
          const w = formatFretToken(e.fret).length;
          const cell = e.string === string ? formatFretToken(e.fret) : '';
          return GAP + cell.padEnd(w, '-');
        })
        .join('');
      return `${name.padEnd(nameW)}|${body}${GAP}|`;
    })
    .join('\n');
}

// A tab line: an optional note name (`e`, `Bb`, `F#`), then the first bar line.
const TAB_LINE = /^\s*([A-Ga-g][#b]?)?\s*\|/;

interface Token {
  string: number;
  fret: number;
  start: number;
  end: number;
  line: number;
  column: number;
}

/**
 * Reads plain-text tab into a phrase. Accepts one or more blocks (systems) of
 * one line per string, top line first, with optional line names that must
 * match the tuning. Blocks are separated by any line that isn't tab, and
 * their notes join in order. Lines may hold `-`, `|`, spaces and fret numbers.
 *
 * Throws a `TabParseError` on a block with the wrong number of lines, a
 * misnamed line, a fret outside 0–24, a technique symbol (`h`, `p`, `/`, …),
 * or notes that overlap in time: phrases are single-note lines.
 */
export function parseTab(text: string, tuning: Tuning = STANDARD_TUNING): TabEvent[] {
  const lines = text.split(/\r?\n/);
  const n = stringCount(tuning);
  const events: TabEvent[] = [];
  let block: { text: string; index: number }[] = [];

  const flush = () => {
    if (block.length === 0) return;
    if (block.length !== n) {
      throw new TabParseError(`A tab block needs ${n} lines, one per string, not ${block.length}`, {
        line: block[0]!.index + 1,
      });
    }
    events.push(...parseBlock(block, tuning));
    block = [];
  };

  lines.forEach((text, index) => {
    if (TAB_LINE.test(text)) block.push({ text, index });
    else flush();
  });
  flush();
  return events;
}

function parseBlock(block: { text: string; index: number }[], tuning: Tuning): TabEvent[] {
  const tokens: Token[] = [];
  block.forEach(({ text, index }, line) => {
    const string = lineToString(line, tuning);
    const match = TAB_LINE.exec(text)!;
    const name = match[1];
    if (name !== undefined && chromaOf(name) !== chromaOf(tabLineName(string, tuning))) {
      throw new TabParseError(
        `Line "${name}" is in the place of string ${string} (${tabLineName(string, tuning)})`,
        { line: index + 1, column: text.indexOf(name) + 1 },
      );
    }
    // Columns count from the first bar line so the blocks' names may differ in width.
    const bar = match[0].length - 1;
    const body = text.slice(bar);
    for (let i = 0; i < body.length;) {
      const ch = body[i]!;
      if (ch >= '0' && ch <= '9') {
        let j = i;
        while (j < body.length && body[j]! >= '0' && body[j]! <= '9') j++;
        const token = body.slice(i, j);
        const fret = parseFretToken(token);
        const at = { line: index + 1, column: bar + i + 1 };
        if (fret === null) throw new TabParseError(`"${token}" is not a fret from 0 to 24`, at);
        tokens.push({ string, fret, start: i, end: j - 1, ...at });
        i = j;
      } else if (ch === '-' || ch === '|' || ch === ' ' || ch === '\t') {
        i++;
      } else {
        throw new TabParseError(`Unsupported tab symbol "${ch}"`, {
          line: index + 1,
          column: bar + i + 1,
        });
      }
    }
  });

  tokens.sort((a, b) => a.start - b.start || a.string - b.string);
  let lastEnd = -1;
  let last: Token | undefined;
  for (const t of tokens) {
    if (last && t.start <= lastEnd) {
      throw new TabParseError(
        `Strings ${last.string} and ${t.string} sound together; a phrase is one note at a time`,
        { line: t.line, column: t.column },
      );
    }
    lastEnd = Math.max(lastEnd, t.end);
    last = t;
  }
  return tokens.map(({ string, fret }) => ({ string, fret }));
}

/** VoiceOver label for a tab note: "string 3, fret 5". */
export function tabEventLabel(e: TabEvent): string {
  return `string ${e.string}, fret ${e.fret}`;
}

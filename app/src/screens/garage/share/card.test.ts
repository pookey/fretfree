import { describe, expect, it } from 'vitest';
import {
  CARD,
  GUITAR_BOX,
  badgeLines,
  cardFileName,
  displayUrl,
  drawCard,
  earnedBadgeTitles,
  nameLines,
  wrapText,
  type CardContext,
} from './card';

/** Every character is 10 units wide. */
const mono = (s: string) => s.length * 10;

describe('wrapText', () => {
  it('breaks at spaces to fit the width', () => {
    expect(wrapText('one two three four', 90, mono, 3)).toEqual({
      lines: ['one two', 'three', 'four'],
      truncated: false,
    });
  });

  it('breaks a word too long for a line', () => {
    expect(wrapText('abcdefghijkl', 50, mono, 4).lines).toEqual(['abcde', 'fghij', 'kl']);
  });

  it('ends the last line with an ellipsis on overflow', () => {
    const out = wrapText('aaaa bbbb cccc dddd', 40, mono, 2);
    expect(out.truncated).toBe(true);
    expect(out.lines).toEqual(['aaaa', 'bbb…']);
  });

  it('draws nothing for blank text', () => {
    expect(wrapText('   ', 100, mono, 2)).toEqual({ lines: [], truncated: false });
  });
});

describe('badgeLines', () => {
  it('lists every badge when they fit', () => {
    expect(badgeLines(['Whole neck', 'Speed demon'], 1000, mono, 2)).toEqual([
      'Badges: Whole neck, Speed demon',
    ]);
  });

  it('lists as many as fit, then how many more', () => {
    const titles = ['Aaaa', 'Bbbb', 'Cccc', 'Dddd', 'Eeee'];
    const lines = badgeLines(titles, 240, mono, 1);
    expect(lines).toEqual(['Badges: Aaaa and 4 more']);
  });

  it('has no line without badges', () => {
    expect(badgeLines([], 1000, mono, 3)).toEqual([]);
  });

  it('cuts even one badge short when the column is tiny', () => {
    const lines = badgeLines(['Whole neck'], 60, mono, 1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/…$/);
  });
});

describe('nameLines', () => {
  it('keeps a short name at the largest size', () => {
    expect(nameLines('My guitar', () => mono)).toEqual({ size: 68, lines: ['My guitar'] });
  });

  it('steps down for a long name, then cuts it short at the smallest size', () => {
    // Width scales with the size, so smaller sizes fit more.
    const at = (size: number) => (s: string) => s.length * size * 0.55;
    const long = nameLines('The Midnight Sunflower Special Deluxe Edition', at);
    expect(long.size).toBeLessThan(68);
    expect(long.lines.join(' ')).toBe('The Midnight Sunflower Special Deluxe Edition');

    const huge = nameLines('word '.repeat(60), at);
    expect(huge.size).toBe(50);
    expect(huge.lines).toHaveLength(4);
    expect(huge.lines[3]).toMatch(/…$/);
  });
});

describe('earnedBadgeTitles', () => {
  it('names the earned badges in shelf order and skips unknown IDs', () => {
    const titles = earnedBadgeTitles([{ id: 'speed-demon' }, { id: 'nope' }, { id: 'whole-neck' }]);
    expect(titles).toContain('Whole neck');
    expect(titles).toHaveLength(2);
    expect(earnedBadgeTitles([])).toEqual([]);
  });
});

describe('displayUrl and cardFileName', () => {
  it('drops the scheme and a trailing slash', () => {
    expect(displayUrl('https://fretfree.app/')).toBe('fretfree.app');
    expect(displayUrl('https://example.org/fretfree/')).toBe('example.org/fretfree');
  });

  it('names the file after the guitar', () => {
    expect(cardFileName('My guitar')).toBe('fretfree-my-guitar.png');
    expect(cardFileName('  Café Noir!! ')).toBe('fretfree-cafe-noir.png');
    expect(cardFileName('🎸')).toBe('fretfree-guitar.png');
    // A long name is cut between words, or inside a word only if it's one long word.
    expect(cardFileName('The Sunburst Dream of Saturday Nights Forever')).toBe(
      'fretfree-the-sunburst-dream-of-saturday-nights.png',
    );
    expect(cardFileName('a'.repeat(39) + ' b')).toBe(`fretfree-${'a'.repeat(39)}.png`);
    expect(cardFileName('a'.repeat(40) + ' b')).toBe(`fretfree-${'a'.repeat(40)}.png`);
    expect(cardFileName('a'.repeat(50))).toBe(`fretfree-${'a'.repeat(40)}.png`);
  });
});

describe('drawCard', () => {
  function fakeContext() {
    const texts: { text: string; font: string; fill: unknown }[] = [];
    const images: number[][] = [];
    const gradient = { addColorStop: () => undefined };
    const ctx = {
      fillStyle: '' as unknown,
      font: '',
      textBaseline: 'top',
      shadowColor: '',
      shadowBlur: 0,
      shadowOffsetY: 0,
      fillRect: () => undefined,
      fillText(text: string) {
        texts.push({ text, font: this.font, fill: this.fillStyle });
      },
      measureText: (s: string) => ({ width: s.length * 18 }),
      drawImage: (_img: unknown, ...box: number[]) => images.push(box),
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      save: () => undefined,
      restore: () => undefined,
    };
    return { ctx: ctx as unknown as CardContext, texts, images };
  }

  it('draws the guitar, its name, model, badges and the app address', () => {
    const { ctx, texts, images } = fakeContext();
    drawCard(ctx, {} as CanvasImageSource, {
      name: 'Blue Moon',
      model: 'Stratocaster · Blue',
      badges: ['Whole neck'],
      url: 'fretfree.app',
    });
    expect(images).toEqual([[GUITAR_BOX.x, GUITAR_BOX.y, GUITAR_BOX.width, GUITAR_BOX.height]]);
    expect(texts.map((t) => t.text)).toEqual([
      'Blue Moon',
      'Stratocaster · Blue',
      'Badges: Whole neck',
      'FretFree',
      'fretfree.app',
    ]);
    expect(texts[0]!.font).toMatch(/^700 68px/);
    expect(texts[3]!.fill).toBe('#f5c542');
  });

  it('leaves the badges line out when there are none', () => {
    const { ctx, texts } = fakeContext();
    drawCard(ctx, {} as CanvasImageSource, {
      name: 'My guitar',
      model: 'Telecaster · Black',
      badges: [],
      url: 'fretfree.app',
    });
    expect(texts.some((t) => t.text.startsWith('Badges'))).toBe(false);
  });

  it('keeps the guitar inside the card', () => {
    expect(GUITAR_BOX.y + GUITAR_BOX.height).toBeLessThanOrEqual(CARD.height);
    expect(GUITAR_BOX.width / GUITAR_BOX.height).toBeCloseTo(370 / 1010, 2);
  });
});

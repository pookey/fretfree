import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { cagedShape } from '../../theory';
import { ChordDiagram } from './ChordDiagram';
import { parseVoicing, voicingFromShape } from './model';

const C = parseVoicing('x32010', { fingers: 'x32-1-', root: 'C' });
const F = parseVoicing('133211', { fingers: '134211', root: 'F' });
const A_BARRE = parseVoicing('577655', { fingers: '134211', root: 'A' });

const attr = (els: Element[], name: string) => els.map((e) => e.getAttribute(name));
/** Centre of a dot's shape: a root square or a circle. */
const centre = (string: number) => {
  const shape = dot(string).querySelector('rect, circle')!;
  const n = (name: string) => Number(shape.getAttribute(name));
  return shape.tagName === 'rect'
    ? { x: n('x') + n('width') / 2, y: n('y') + n('height') / 2 }
    : { x: n('cx'), y: n('cy') };
};
const dot = (string: number) =>
  screen.getAllByTestId('chord-dot').find((d) => d.getAttribute('data-string') === String(string))!;

describe('<ChordDiagram>', () => {
  it('draws an open chord from the nut with open, muted and fretted strings', () => {
    render(<ChordDiagram voicing={C} name="C" />);
    const svg = screen.getByRole('img', { name: /^C diagram: string 6 muted/ });
    expect(svg).toHaveAttribute('data-base-fret', '1');
    expect(screen.getByTestId('chord-nut')).toBeInTheDocument();
    expect(screen.queryByTestId('chord-position')).not.toBeInTheDocument();
    expect(attr(screen.getAllByTestId('chord-muted'), 'data-string')).toEqual(['6']);
    expect(attr(screen.getAllByTestId('chord-open'), 'data-string')).toEqual(['3', '1']);
    expect(attr(screen.getAllByTestId('chord-dot'), 'data-fret')).toEqual(['3', '2', '1']);
    expect(screen.getByText('C', { selector: 'figcaption' })).toBeInTheDocument();
  });

  it('runs vertically: the low string on the left, frets going down', () => {
    render(<ChordDiagram voicing={C} />);
    expect(centre(5).x).toBeLessThan(centre(4).x);
    expect(centre(2).y).toBeLessThan(centre(4).y);
    expect(centre(4).y).toBeLessThan(centre(5).y);
    const strings = document.querySelectorAll('line[class*="string"]');
    expect(strings).toHaveLength(6);
    strings.forEach((l) => expect(l.getAttribute('x1')).toBe(l.getAttribute('x2')));
  });

  it('mirrors for left-handers', () => {
    const { unmount } = render(<ChordDiagram voicing={C} />);
    const rightX = centre(5).x;
    unmount();
    render(<ChordDiagram voicing={C} handedness="left" />);
    expect(screen.getByRole('img')).toHaveAttribute('data-handedness', 'left');
    expect(centre(5).x).toBeGreaterThan(rightX);
    expect(centre(5).x).toBeGreaterThan(centre(4).x);
  });

  it('draws a barre behind its dots and shows fingers', () => {
    render(<ChordDiagram voicing={F} name="F" />);
    const [barre] = screen.getAllByTestId('chord-barre');
    expect(barre).toHaveAttribute('data-fret', '1');
    expect(barre).toHaveAttribute('data-from', '1');
    expect(barre).toHaveAttribute('data-to', '6');
    // Earlier in the SVG means painted underneath.
    expect(barre!.compareDocumentPosition(dot(6)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dot(5)).toHaveTextContent('3');
    expect(dot(3)).toHaveTextContent('2');
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(
      /barre at fret 1 from string 6 to string 1$/,
    );
  });

  it('labels the position up the neck instead of drawing the nut', () => {
    render(<ChordDiagram voicing={A_BARRE} />);
    expect(screen.getByRole('img')).toHaveAttribute('data-base-fret', '5');
    expect(screen.queryByTestId('chord-nut')).not.toBeInTheDocument();
    expect(screen.getByTestId('chord-position')).toHaveTextContent('5fr');
    expect(screen.getAllByTestId('chord-barre')[0]).toHaveAttribute('data-fret', '5');
  });

  it('puts the position label on the other side for left-handers', () => {
    const { unmount } = render(<ChordDiagram voicing={A_BARRE} />);
    const rightX = Number(screen.getByTestId('chord-position').getAttribute('x'));
    unmount();
    render(<ChordDiagram voicing={A_BARRE} handedness="left" />);
    expect(Number(screen.getByTestId('chord-position').getAttribute('x'))).toBeGreaterThan(rightX);
  });

  it('highlights roots with the root square, open roots too', () => {
    render(<ChordDiagram voicing={parseVoicing('x02210', { root: 'A' })} />);
    expect(dot(3)).toHaveAttribute('data-style', 'root');
    expect(dot(3).querySelector('rect')).not.toBeNull();
    expect(dot(4)).toHaveAttribute('data-style', 'tone');
    expect(dot(4).querySelector('circle')).not.toBeNull();
    const opens = screen.getAllByTestId('chord-open');
    expect(attr(opens, 'data-style')).toEqual(['root', 'tone']);
    expect(opens[0]!.querySelector('rect')).not.toBeNull();
    expect(opens[1]!.querySelector('circle')).not.toBeNull();
  });

  it('hides roots when the root is the answer', () => {
    render(<ChordDiagram voicing={C} highlightRoots={false} />);
    expect(attr(screen.getAllByTestId('chord-dot'), 'data-style')).toEqual([
      'tone',
      'tone',
      'tone',
    ]);
    const name = screen.getByRole('img').getAttribute('aria-label')!;
    expect(name).toMatch(/^Chord diagram:/);
    expect(name).not.toMatch(/root/);
  });

  it('draws degrees with the neck shapes and fades their labels', () => {
    const shape = voicingFromShape(cagedShape('E', 'A', { quality: 'dominant7' }));
    const { rerender } = render(<ChordDiagram voicing={shape} dotText="label" />);
    const styles = new Set(attr(screen.getAllByTestId('chord-dot'), 'data-style'));
    expect(styles).toEqual(new Set(['root', 'third', 'fifth', 'seventh']));
    const fifth = screen
      .getAllByTestId('chord-dot')
      .find((d) => d.getAttribute('data-style') === 'fifth')!;
    expect(fifth.querySelector('polygon')!.getAttribute('points')!.split(' ')).toHaveLength(3);
    const seventh = screen
      .getAllByTestId('chord-dot')
      .find((d) => d.getAttribute('data-style') === 'seventh')!;
    expect(seventh.querySelector('polygon')!.getAttribute('points')!.split(' ')).toHaveLength(6);
    expect(seventh).toHaveTextContent('b7');
    expect(screen.getAllByTestId('chord-string-name')).toHaveLength(6);

    rerender(<ChordDiagram voicing={shape} dotText="label" guideLevel={2} />);
    expect(seventh.querySelector('text')).toBeNull();
    const roots = screen
      .getAllByTestId('chord-dot')
      .filter((d) => d.getAttribute('data-style') === 'root');
    roots.forEach((r) => expect(r).toHaveTextContent('R'));
    expect(screen.getAllByTestId('chord-string-name')).toHaveLength(6);

    rerender(<ChordDiagram voicing={shape} dotText="label" guideLevel={1} />);
    screen.getAllByTestId('chord-dot').forEach((d) => expect(d.querySelector('text')).toBeNull());
    expect(screen.queryByTestId('chord-string-name')).not.toBeInTheDocument();
  });

  it('keeps fingers at every guide level, and can draw bare dots', () => {
    const { rerender } = render(<ChordDiagram voicing={C} guideLevel={0} />);
    expect(dot(5)).toHaveTextContent('3');
    rerender(<ChordDiagram voicing={C} dotText="none" />);
    screen.getAllByTestId('chord-dot').forEach((d) => expect(d.querySelector('text')).toBeNull());
    expect(screen.getByRole('img').getAttribute('aria-label')).not.toMatch(/finger/);
  });

  it('shrinks a long label to fit', () => {
    const voicing = { notes: [{ string: 3, fret: 2, label: 'F##' }] };
    render(<ChordDiagram voicing={voicing} dotText="label" />);
    expect(dot(3).querySelector('text')!.getAttribute('class')).toMatch(/longLabel/);
  });

  it('takes an explicit accessible name and class', () => {
    const { container } = render(
      <ChordDiagram voicing={C} label="Mystery chord" className="extra" name="C" />,
    );
    expect(screen.getByRole('img', { name: 'Mystery chord' })).toBeInTheDocument();
    expect(container.querySelector('figure')!.className).toMatch(/extra/);
  });

  it('grows the window for a wide voicing', () => {
    render(<ChordDiagram voicing={parseVoicing('x-5-7-9-x-x')} minRows={3} />);
    const svg = screen.getByRole('img');
    expect(svg).toHaveAttribute('data-rows', '5');
    // Five rows from fret 5: a wire on the top edge and one below each row.
    expect(document.querySelectorAll('line[class*="wire"]')).toHaveLength(6);
  });
});

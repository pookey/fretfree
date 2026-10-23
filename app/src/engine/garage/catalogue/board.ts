import { garage } from '../../config/garage';
import type { CatalogueItem } from '../types';

/**
 * Fretboard woods (design §3.8). Rosewood's palette is the neck tokens of
 * `styles/tokens.css`, so the starter board looks exactly like today's neck.
 * Every palette keeps strings, fret wire, inlays and markers at 3:1 or more
 * against its wood (`catalogue.test.ts`), so pale maple takes dark strings
 * and inlays, and darker shades of the Okabe–Ito marker hues.
 */
const boards: readonly CatalogueItem<'board'>[] = [
  {
    id: 'board.rosewood',
    category: 'board',
    name: 'Rosewood',
    price: garage.prices['board.rosewood'],
    render: {
      palette: {
        '--wood': '#4a2f22',
        '--wood-dark': '#3a2419',
        '--string': '#ddd3c4',
        '--fret-wire': '#c9c3bb',
        '--inlay': '#e8dfd2',
      },
    },
  },
  {
    id: 'board.maple',
    category: 'board',
    name: 'Maple',
    price: garage.prices['board.maple'],
    render: {
      palette: {
        '--wood': '#ecd5a9',
        '--wood-dark': '#cdb07c',
        '--string': '#3a2d22',
        '--fret-wire': '#5c4d3f',
        '--inlay': '#1a1410',
        '--root': '#965800',
        '--tone': '#0072b2',
        '--correct': '#007a59',
        '--wrong': '#b84f00',
        '--chord-fifth': '#6b6300',
        '--chord-seventh': '#9c3f7a',
      },
    },
  },
  {
    id: 'board.ebony',
    category: 'board',
    name: 'Ebony',
    price: garage.prices['board.ebony'],
    render: {
      palette: {
        '--wood': '#1f1916',
        '--wood-dark': '#14100e',
        '--string': '#ddd3c4',
        '--fret-wire': '#c9c3bb',
        '--inlay': '#e8dfd2',
      },
    },
  },
];

export default boards;

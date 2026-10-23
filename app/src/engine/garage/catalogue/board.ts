import { garage } from '../../config/garage';
import type { CatalogueItem } from '../types';

/**
 * Fretboard woods (design §3.8). Rosewood's palette is the neck tokens of
 * `styles/tokens.css`, so the starter board looks exactly like today's neck.
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
];

export default boards;

import { garage } from '../../config/garage';
import type { CatalogueItem } from '../types';

/** Body shapes (design §3.8): generic names, original outlines (M11-03). */
const bodies: readonly CatalogueItem<'body'>[] = [
  {
    id: 'body.s-style',
    category: 'body',
    name: 'S-style',
    price: garage.prices['body.s-style'],
    render: { shape: 's-style' },
  },
];

export default bodies;

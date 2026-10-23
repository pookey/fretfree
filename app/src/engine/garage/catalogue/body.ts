import { garage } from '../../config/garage';
import type { CatalogueItem } from '../types';

/** Body shapes (design §3.8): model names (user decision 2026-10-23), original outlines (M11-03). */
const bodies: readonly CatalogueItem<'body'>[] = [
  {
    id: 'body.stratocaster',
    category: 'body',
    name: 'Stratocaster',
    price: garage.prices['body.stratocaster'],
    render: { shape: 'stratocaster' },
  },
];

export default bodies;

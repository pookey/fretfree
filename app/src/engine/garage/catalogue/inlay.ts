import { garage } from '../../config/garage';
import type { CatalogueItem } from '../types';

/** Inlay shapes (design §3.8). Positions stay standard; only the shape changes. */
const inlays: readonly CatalogueItem<'inlay'>[] = [
  {
    id: 'inlay.dots',
    category: 'inlay',
    name: 'Dots',
    price: garage.prices['inlay.dots'],
    render: { shape: 'dots' },
  },
];

export default inlays;

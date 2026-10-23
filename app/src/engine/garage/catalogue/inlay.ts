import { garage } from '../../config/garage';
import type { CatalogueItem, InlayShape } from '../types';

/** Inlay shapes (design §3.8). Positions stay standard; only the shape changes. */
const inlay = (shape: InlayShape, name: string): CatalogueItem<'inlay'> => ({
  id: `inlay.${shape}`,
  category: 'inlay',
  name,
  price: garage.prices[`inlay.${shape}`],
  render: { shape },
});

const inlays: readonly CatalogueItem<'inlay'>[] = [
  inlay('dots', 'Dots'),
  inlay('blocks', 'Blocks'),
  inlay('trapezoids', 'Trapezoids'),
];

export default inlays;

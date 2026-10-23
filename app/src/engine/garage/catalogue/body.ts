import { garage } from '../../config/garage';
import type { CatalogueItem } from '../types';

/**
 * Body shapes (design §3.8): model names (user decision 2026-10-23), original
 * outlines. `shape` is the body file's name in `components/guitar/bodies/`
 * (M11-03, M11-05, M11-11). A body is listed before its drawing lands; the
 * Garage shows only those whose shape is registered (`hasBody`, M11-06).
 */
const body = (shape: string, name: string): CatalogueItem<'body'> => ({
  id: `body.${shape}`,
  category: 'body',
  name,
  price: garage.prices[`body.${shape}`],
  render: { shape },
});

const bodies: readonly CatalogueItem<'body'>[] = [
  // Electrics.
  body('stratocaster', 'Stratocaster'),
  body('telecaster', 'Telecaster'),
  body('les-paul', 'Les Paul'),
  body('sg', 'SG'),
  body('jazzmaster', 'Jazzmaster'),
  body('es-335', 'ES-335'),
  body('superstrat', 'Superstrat'),
  // Acoustics.
  body('dreadnought', 'Dreadnought'),
  body('jumbo', 'Jumbo'),
  body('parlour', 'Parlour'),
  body('concert', 'Concert (OM)'),
  body('classical', 'Classical'),
];

export default bodies;

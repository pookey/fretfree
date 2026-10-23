/**
 * The Garage screen's path, or undefined until its route file exists (M11-06).
 * Read from the route file itself, so balance lines become links the moment
 * the route lands, with no list to update.
 */
export const GARAGE_PATH: string | undefined = Object.values(
  import.meta.glob<string>('../../routes/garage.route.tsx', { eager: true, import: 'path' }),
)[0];

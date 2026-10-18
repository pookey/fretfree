export interface NavItem {
  to: string;
  label: string;
  icon: string;
}

/** The four sections (design §7 navigation). Settings live under Progress. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Today', icon: '☀︎' },
  { to: '/learn', label: 'Learn', icon: '◎' },
  { to: '/explore', label: 'Explore', icon: '⌕' },
  { to: '/progress', label: 'Progress', icon: '▤' },
];

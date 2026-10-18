/** The FretFree mark: a guitar pick with a smile (brand/README.md). */
export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      focusable="false"
    >
      <path
        d="M32 59C22 49 7 33 8 20 9 9 20 5 32 5s23 4 24 15c1 13-14 29-24 39Z"
        fill="currentColor"
      />
      <path
        d="M20 25q12 13 24 0"
        fill="none"
        stroke="var(--logo-cut, var(--bg-raised))"
        strokeWidth={size <= 20 ? 7 : 5}
        strokeLinecap="round"
      />
    </svg>
  );
}

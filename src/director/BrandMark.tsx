/**
 * NWSA brand mark, drawn as crisp SVG so it stays sharp at any size and needs
 * no white box. The original logo sits on a teal field — the same teal as our
 * app header — so on the header we render the foreground (white mountain, gold
 * peak, purple swoosh) directly on the teal background, matching the brand.
 */
export function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="NWSA"
      role="img"
    >
      {/* White mountain "A", split down the middle (gap lets the teal show through) */}
      <polygon points="32,9 30,49 8,49" fill="#ffffff" />
      <polygon points="32,9 34,49 56,49" fill="#ffffff" />
      {/* Gold inner peak */}
      <polygon points="32,30 42,49 22,49" fill="#c8a52a" />
      {/* Purple swoosh */}
      <path
        d="M7 54 Q32 61 57 54"
        stroke="#7b3578"
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Admin nav icon (small square mark) — the "ف" monogram on the brand magenta.
 * Registered via `admin.components.graphics.Icon`. Kept as inline SVG so it needs
 * no asset pipeline and matches the public favicon (`src/app/icon.svg`).
 */
export default function Icon() {
  return (
    <svg width="28" height="28" viewBox="0 0 64 64" role="img" aria-label="لالة فاطمة">
      <rect width="64" height="64" rx="14" fill="#bc0168" />
      <text
        x="32"
        y="33"
        fontFamily="'Tajawal','Segoe UI',sans-serif"
        fontSize="36"
        fontWeight="800"
        fill="#ffffff"
        textAnchor="middle"
        dominantBaseline="central"
      >
        ف
      </text>
    </svg>
  )
}

/**
 * Admin login-screen wordmark — the "ف" mark plus the full Arabic name in brand
 * magenta. Registered via `admin.components.graphics.Logo`. Inline SVG + text so
 * it needs no asset upload and stays consistent with the favicon/nav icon.
 */
export default function Logo() {
  return (
    <div dir="rtl" style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
      <svg width="48" height="48" viewBox="0 0 64 64" role="img" aria-label="لالة فاطمة">
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
      <span style={{ fontSize: '1.7rem', fontWeight: 800, color: '#bc0168' }}>لالة فاطمة</span>
    </div>
  )
}

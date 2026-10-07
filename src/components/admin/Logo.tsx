/**
 * Admin login-screen logo — the real brand lockup, served as a static file from
 * `public/brand/`. Registered via `admin.components.graphics.Logo`.
 *
 * Deliberately a plain image on a committed asset rather than the admin-managed
 * Site Settings → الهوية → الشعار media doc: this renders on the *login* screen,
 * which must not depend on a database round-trip or on object storage being
 * reachable. The two are kept in step by `pnpm seed:logo`, which publishes the
 * same source artwork to `media`.
 *
 * Also deliberately not an inline SVG glyph: the previous mark typeset "ف" in
 * Tajawal, so it rendered against whatever face happened to resolve and sat off
 * its box — which is what made the login screen look broken. A raster of the real
 * artwork has no font dependency at all. Intrinsic size is declared so the login
 * card doesn't reflow while the image decodes; the displayed width is capped in
 * `src/app/(payload)/custom.scss`.
 *
 * eslint-disable-next-line on the <img> below, not an oversight: `next/image`
 * routes through the project's custom loader (lib/image-loader.ts), which rewrites
 * every src onto NEXT_PUBLIC_IMAGE_HOST's Cloudflare zone. That zone fronts object
 * storage, not the Next app's static files, so an optimized <Image> would resolve
 * this asset to a URL that 404s in production. A plain <img> on a ~30KB static PNG
 * is both correct and cheaper here.
 */
export default function Logo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/logo-lalla-fatema.png"
      alt="مجلة لالة فاطمة — مجلة المرأة والعائلة المغربية"
      width={560}
      height={163}
      className="lf-admin-logo"
    />
  )
}

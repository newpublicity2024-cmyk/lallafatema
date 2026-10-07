/**
 * Admin nav mark — the "ف" monogram on brand magenta, used by Payload in the
 * step-nav home slot (`.step-nav__home`, a hard 18×18 box). Registered via
 * `admin.components.graphics.Icon`.
 *
 * The brand artwork is a wordmark with no monogram of its own, and a 3.4:1 lockup
 * is an unreadable smudge in an 18px square — so this slot keeps the monogram.
 * What changed is how it is drawn: it used to typeset the glyph live, which left
 * it at the mercy of whichever face resolved first (Tajawal is `font-display:
 * swap` here) and of inconsistent `dominant-baseline` handling for Arabic, so it
 * rendered off-centre. It is now a pre-rasterised PNG of that same glyph in real
 * Tajawal 800, optically centred on its ink box — deterministic at every size.
 *
 * To regenerate: render U+0641 at a large size in Tajawal 800 (the woff2 in
 * public/fonts/tajawal) on a transparent ground, trim to the glyph's ink, then
 * centre it at ~56% of a 256px magenta #bc0168 tile with a 56px corner radius.
 *
 * eslint-disable-next-line on the <img> below, not an oversight: `next/image`
 * routes through the project's custom loader (lib/image-loader.ts), which rewrites
 * every src onto NEXT_PUBLIC_IMAGE_HOST's Cloudflare zone. That zone fronts object
 * storage, not the Next app's static files, so an optimized <Image> would resolve
 * this asset to a URL that 404s in production. A plain <img> on a ~30KB static PNG
 * is both correct and cheaper here.
 */
export default function Icon() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/icon-lalla-fatema.png"
      alt="لالة فاطمة"
      width={256}
      height={256}
      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
    />
  )
}

import { test, expect, type Page, type Locator } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const BASE = 'http://localhost:3000'

// Accept-all consent cookie so the banner doesn't overlay the base page during
// static audits. The banner's own a11y is covered by the keyboard spec (Task 3)
// and consent.e2e.spec.ts.
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: 'lf-consent', value: '1:a=1,ads=1', url: BASE }])
})

async function contrastViolations(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'load' })
  const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  return results.violations
}

/**
 * Resolves the first link href (within `#main` or `nav`) matching `re` to an absolute
 * URL. Shared by the axe gate (which audits the matched route) and the Arabic contrast
 * sweep (which navigates to it) — both need to find a live "article"/"category"/etc.
 * route from the current seed rather than hardcoding one.
 */
async function firstMatchingHref(page: Page, re: RegExp) {
  const hrefs = await page
    .locator('#main a, nav a')
    .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href') ?? ''))
  const match = hrefs.find((h) => re.test(h))
  expect(match, `expected a link matching ${re}`).toBeTruthy()
  return new URL(match!, BASE).toString()
}

/**
 * Deterministic, language-agnostic WCAG 2.x contrast ratio for one text element.
 *
 * axe-core's `color-contrast` rule silently skips most Arabic-script text on this
 * site (its icon-ligature heuristic false-positives on Arabic contextual joining),
 * so it cannot guard the timestamp fix. This computes the ratio directly instead:
 * it reads the element's own text color and the first non-transparent ancestor
 * background, rasterizes each through a 1x1 canvas — which resolves ANY CSS color
 * serialization (rgb/rgba, hex, named, and the lab()/oklch() forms Tailwind v4
 * emits via getComputedStyle, where a plain rgb() parser would return NaN) — then
 * returns (Llighter + 0.05) / (Ldarker + 0.05). Colorspace- and language-agnostic;
 * reused by the per-route audits in Task 4.
 */
async function contrastRatio(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    type Rgba = [number, number, number, number]

    // Resolve any CSS color string to straight-alpha sRGB bytes via a rasterized pixel.
    const toRgba = (color: string): Rgba => {
      const ctx = document.createElement('canvas').getContext('2d')!
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = color
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }

    // Composite a possibly-translucent source over an opaque backdrop.
    const flatten = (src: Rgba, dst: Rgba): Rgba => {
      const a = src[3]
      return [
        src[0] * a + dst[0] * (1 - a),
        src[1] * a + dst[1] * (1 - a),
        src[2] * a + dst[2] * (1 - a),
        1,
      ]
    }

    // WCAG 2.x relative luminance from sRGB bytes.
    const luminance = (rgb: Rgba): number => {
      const lin = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
    }

    // Effective background: nearest ancestor (incl. self) with a non-transparent
    // background, flattened over white (the page's opaque base).
    const white: Rgba = [255, 255, 255, 1]
    let bg: Rgba = white
    for (let node: Element | null = el; node; node = node.parentElement) {
      const c = toRgba(getComputedStyle(node).backgroundColor)
      if (c[3] > 0) {
        bg = flatten(c, white)
        break
      }
    }

    const fg = flatten(toRgba(getComputedStyle(el).color), bg)
    const light = luminance(fg) + 0.05
    const dark = luminance(bg) + 0.05
    return light > dark ? light / dark : dark / light
  })
}

/** Assert one text element clears the WCAG AA 4.5:1 floor via computed contrast. */
async function expectAaTextContrast(locator: Locator) {
  await expect(locator).toBeVisible()
  const ratio = await contrastRatio(locator)
  expect(
    ratio,
    `computed contrast ${ratio.toFixed(2)}:1 (AA requires >= 4.5:1)`,
  ).toBeGreaterThanOrEqual(4.5)
}

test('homepage has no color-contrast violations', async ({ page }) => {
  const violations = await contrastViolations(page, BASE)
  const summary = violations
    .flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} — ${n.failureSummary}`))
    .join('\n')
  expect(violations, summary || 'no color-contrast violations').toEqual([])
})

// Guards the RelativeTime timestamp contrast fix directly, since axe skips these
// Arabic <time> nodes. The lead/default PostCard variants sit inside `.lf-card`;
// the first such timestamp is the hero's default-variant card (PostCard.tsx:159).
// Fails (~2.6:1) if that token regresses to text-zinc-400.
test('homepage timestamp meets AA contrast (computed)', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'load' })
  await expectAaTextContrast(page.locator('.lf-card time').first())
})

// The compact PostCard variant (LeadListBlock sidebar list, PostCard.tsx:57/67) has
// NO `.lf-card` wrapper, so the test above never reaches it — it's the only variant
// whose <article> uses `items-start`. Guards PostCard.tsx:67 specifically; fails
// (~2.6:1) if that token regresses to text-zinc-400.
test('homepage compact-variant timestamp meets AA contrast (computed)', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'load' })
  await expectAaTextContrast(page.locator('article.items-start time').first())
})

test('skip link is the first focusable element and moves focus to main', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'load' })
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'تخطَّ إلى المحتوى' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
})

test.describe('consent dialog focus', () => {
  // These need the banner to actually open, so clear the accept-all cookie set in beforeEach.
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('moves focus into the dialog when it opens', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'load' })
    const dialog = page.getByRole('dialog', { name: 'إعدادات ملفات تعريف الارتباط' })
    await expect(dialog).toBeVisible()
    // focus is inside the dialog (the container itself, tabIndex=-1)
    const focusedInDialog = await dialog.evaluate((el) => el.contains(document.activeElement))
    expect(focusedInDialog).toBe(true)
  })

  test('Esc collapses the Customize panel but keeps the banner', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'load' })
    const dialog = page.getByRole('dialog', { name: 'إعدادات ملفات تعريف الارتباط' })
    await dialog.getByRole('button', { name: 'تخصيص' }).click()
    await expect(dialog.getByLabel('إحصاءات')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog.getByLabel('إحصاءات')).toBeHidden()
    await expect(dialog).toBeVisible()
  })

  test('returns focus to the footer trigger after reopen + choose', async ({ page, context }) => {
    // Establish a prior choice so the banner does not auto-open.
    await context.addCookies([{ name: 'lf-consent', value: '1:a=1,ads=1', url: BASE }])
    await page.goto(BASE, { waitUntil: 'load' })
    const trigger = page.getByRole('button', { name: 'إعدادات ملفات تعريف الارتباط' })
    await trigger.focus()
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'إعدادات ملفات تعريف الارتباط' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'قبول الكل' }).click()
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })
})

test.describe('axe gate — WCAG A/AA, 7 routes', () => {
  const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

  async function audit(page: Page, url: string) {
    await page.goto(url, { waitUntil: 'load' })
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
    const summary = results.violations
      .map((v) => `${v.id} (${v.nodes.length} node(s)) — ${v.help}\n  ${v.helpUrl}`)
      .join('\n')
    expect(results.violations, summary || 'no violations').toEqual([])
  }

  test('/', async ({ page }) => audit(page, BASE))
  test('/search', async ({ page }) => audit(page, `${BASE}/search`))
  test('/about (static page)', async ({ page }) => audit(page, `${BASE}/about`))
  test('/magazine (archive)', async ({ page }) => audit(page, `${BASE}/magazine`))

  test('article', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'load' })
    await audit(page, await firstMatchingHref(page, /^\/[^/]+\/[^/]+-\d+$/))
  })
  test('category', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'load' })
    await audit(page, await firstMatchingHref(page, /^\/[^/]+$/))
  })
  test('video watch', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'load' })
    await audit(page, await firstMatchingHref(page, /^\/videos\//))
  })
  test('magazine issue', async ({ page }) => {
    await page.goto(`${BASE}/magazine`, { waitUntil: 'load' })
    await audit(page, await firstMatchingHref(page, /^\/magazine\/\d+/))
  })
})

/**
 * Arabic computed-contrast sweep — the guard axe cannot provide.
 *
 * axe-core 4.12's `color-contrast` rule marks most Arabic-script runs "inapplicable"
 * (its icon-ligature heuristic false-positives on Arabic contextual letter-joining), so
 * the axe gate above does NOT actually verify Arabic text contrast. This sweep reuses the
 * deterministic `expectAaTextContrast` (canvas rasterization → WCAG ratio, colorspace- and
 * language-agnostic) to assert AA (>= 4.5:1) on the representative Arabic text that sits on
 * SOLID / token backgrounds, per route — especially the homepage bands, where a token that
 * clears AA on white can fail on a band. Task 1 found the compact timestamp that way
 * (zinc-500 → zinc-600, 4.24:1 → 6.77:1 on the then-#f0f0f0 band); the later move to the
 * peach `--color-surface` (#fbc490, luminance .62 vs white's 1.0) caught two more the same
 * way — zinc-500 at 3.08:1 and brand-600 at 4.01:1, now zinc-700 and brand-700.
 *
 * EXCLUDED (documented limitation): text overlaid on PHOTOGRAPHS. The hero
 * `PostCard variant="overlay"` title (text-white) and date (text-white/70) sit on the
 * featured image, so their contrast depends on the photograph, not a token — a computed
 * assertion would be non-deterministic/flaky. The `from-black/80` gradient scrim is the
 * mitigation. Same for VideoCard thumbnails (play glyph / duration pill over the image).
 */
test.describe('Arabic contrast sweep', () => {
  // Assert AA only when the element is actually present — for genuinely optional content
  // (excerpts, prose paragraphs, related sections, seed-dependent bands). Guaranteed
  // elements (h1, section headings, nav, footer, buttons) are asserted unconditionally so
  // the gate can never silently no-op.
  async function expectAaIfPresent(locator: Locator) {
    if (await locator.count()) await expectAaTextContrast(locator.first())
  }

  test('/ — header, white cards, peach band, dark video band, footer', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'load' })

    // Header (peach --color-surface): the masthead is an <img> logo now, not a text
    // wordmark, so there is no brand token to measure — assert it is present and
    // labelled instead. The zinc-800 section-nav links carry the header's contrast.
    const logo = page.locator('header a[href="/"] img')
    await expect(logo).toBeVisible()
    await expect(logo).toHaveAttribute('alt', /\S/)
    await expectAaTextContrast(page.locator('header nav[aria-label="الأقسام"] a').first())

    // Default/lead cards on the white .lf-card: brand-700 kicker + zinc-900 title.
    await expectAaTextContrast(page.locator('.lf-card a.text-brand-700').first())
    await expectAaTextContrast(page.locator('.lf-card h3').first())

    // PEACH BAND .lf-band (#fbc490): section heading, plus the compact card that sits
    // DIRECTLY on the band (no white card wrapper) — kicker/title/timestamp. This is the
    // exact surface where a white-passing token can fail: the peach surface is markedly
    // darker than white (luminance .62 vs 1.0), which is why the muted tokens here are
    // zinc-700/brand-700 rather than the zinc-500/brand-600 that only clear AA on white.
    await expectAaTextContrast(page.locator('.lf-band h2').first())
    await expectAaIfPresent(page.locator('.lf-band article.items-start a.text-brand-700'))
    await expectAaIfPresent(page.locator('.lf-band article.items-start h3'))
    await expectAaIfPresent(page.locator('.lf-band article.items-start time'))

    // DARK BAND .lf-band-dark (#23112c): light section heading + white/70 lead description
    // + white/90 list title, all on the solid dark fill.
    await expectAaIfPresent(page.locator('.lf-band-dark h2'))
    await expectAaIfPresent(page.locator('.lf-band-dark p'))
    await expectAaIfPresent(page.locator('.lf-band-dark h3'))

    // Footer (peach --color-surface): brand-700 wordmark, zinc-600 tagline + nav links,
    // and the zinc-700 copyright line. zinc-600 is the tightest footer token on peach
    // (4.93:1) — anything lighter fails, which is what the zinc-500 sweep fixed.
    await expectAaTextContrast(page.locator('footer h3').first())
    await expectAaTextContrast(page.locator('footer p').first())
    await expectAaTextContrast(page.locator('footer nav a').first())
    await expectAaTextContrast(page.getByText(/جميع الحقوق محفوظة/))
  })

  test('/search — heading, submit button, status text', async ({ page }) => {
    await page.goto(`${BASE}/search`, { waitUntil: 'load' })
    await expectAaTextContrast(page.locator('#main h1'))
    // White label on the brand-600 submit button.
    await expectAaTextContrast(page.getByRole('button', { name: 'بحث' }))
    // zinc-700 status line (present in every state: disabled / empty / no-results).
    await expectAaTextContrast(page.locator('#main p.text-zinc-700').first())
  })

  test('/about — heading, breadcrumb, prose body', async ({ page }) => {
    await page.goto(`${BASE}/about`, { waitUntil: 'load' })
    await expectAaTextContrast(page.locator('#main h1'))
    // Breadcrumb home link (zinc-700 on peach).
    await expectAaTextContrast(page.locator('#main nav a').first())
    // Rendered rich-text body (.prose-ar, #27272a on peach).
    await expectAaIfPresent(page.locator('#main .prose-ar p'))
  })

  test('/magazine — section heading + issue-card title/date', async ({ page }) => {
    await page.goto(`${BASE}/magazine`, { waitUntil: 'load' })
    await expectAaTextContrast(page.locator('#main h2').first())
    await expectAaIfPresent(page.locator('#main article.lf-card h3'))
    // Issue timestamp (zinc-700 on peach) — a magazine surface axe never checks.
    await expectAaIfPresent(page.locator('#main article.lf-card time'))
  })

  test('article — h1, category kicker, byline date, excerpt, prose', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'load' })
    await page.goto(await firstMatchingHref(page, /^\/[^/]+\/[^/]+-\d+$/), { waitUntil: 'load' })

    await expectAaTextContrast(page.locator('#main h1'))
    // Breadcrumb category link (bold brand-700 on peach).
    await expectAaIfPresent(page.locator('#main article a.text-brand-700'))
    // Byline/date meta (zinc-700 on peach).
    await expectAaIfPresent(page.locator('#main article time'))
    // Excerpt (zinc-600 on peach) — optional field.
    await expectAaIfPresent(page.locator('#main article > p'))
    // Rendered article body (.prose-ar).
    await expectAaIfPresent(page.locator('#main .prose-ar p'))
  })

  test('category — section heading + card title/kicker/date on peach', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'load' })
    await page.goto(await firstMatchingHref(page, /^\/[^/]+$/), { waitUntil: 'load' })

    await expectAaTextContrast(page.locator('#main h2').first())
    await expectAaIfPresent(page.locator('#main .lf-card h3'))
    await expectAaIfPresent(page.locator('#main .lf-card a.text-brand-700'))
    // Category listing timestamp (zinc-700 on peach).
    await expectAaIfPresent(page.locator('#main .lf-card time'))
  })

  test('video watch — breadcrumb, category, h1, date', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'load' })
    await page.goto(await firstMatchingHref(page, /^\/videos\//), { waitUntil: 'load' })

    await expectAaTextContrast(page.locator('#main h1'))
    await expectAaIfPresent(page.locator('#main nav a').first()) // breadcrumb (zinc-700)
    await expectAaIfPresent(page.locator('#main a.text-brand-700').first()) // category kicker
    await expectAaIfPresent(page.locator('#main time').first()) // publish date (zinc-700)
    // Related videos, when present, render in the dark band.
    await expectAaIfPresent(page.locator('.lf-band-dark h2'))
  })

  test('magazine issue — breadcrumb, h1, date, description', async ({ page }) => {
    await page.goto(`${BASE}/magazine`, { waitUntil: 'load' })
    await page.goto(await firstMatchingHref(page, /^\/magazine\/\d+/), { waitUntil: 'load' })

    await expectAaTextContrast(page.locator('#main h1'))
    await expectAaIfPresent(page.locator('#main nav a').first()) // breadcrumb (zinc-700)
    await expectAaIfPresent(page.locator('#main time').first()) // issue date (zinc-700)
    await expectAaIfPresent(page.locator('#main header p')) // description (zinc-600)
  })
})

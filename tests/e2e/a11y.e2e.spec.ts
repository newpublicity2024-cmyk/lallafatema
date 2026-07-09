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

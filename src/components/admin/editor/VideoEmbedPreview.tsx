'use client'

import { useFormFields } from '@payloadcms/ui'
import { useState } from 'react'

import { parseEmbed, type EmbedKind, type EmbedProvider } from '../../../lib/embeds'

/**
 * Live preview of the link pasted into the `videoEmbed` block's `url` field.
 *
 * WHY: before this existed, the only feedback an editor got about a pasted link was a
 * validation error on save (and, before the validator was fixed, not even that — any
 * parseable string was accepted). A link that is *valid but points at the wrong video* is
 * the common mistake, and no amount of validation catches it. Showing the resolved
 * provider, the rebuilt canonical URL and the actual frame turns "I pasted something" into
 * "I can see it is the right clip" without leaving the editor.
 *
 * It renders from the SAME parser the public page uses (`parseEmbed`), so this preview
 * cannot flatter a link the renderer would refuse: if the admin shows a player, the
 * article shows a player.
 *
 * Click-to-load, exactly like the public facade: nothing is requested from YouTube,
 * Facebook, Instagram or TikTok until the editor asks for the frame. A rich-text field can
 * hold several of these blocks, and auto-loading every frame would hand every third party
 * a page view (and a cookie attempt) for every article anyone opens in the admin.
 */

const PROVIDER_NAMES: Record<EmbedProvider, string> = {
  dailymotion: 'ديلي موشن',
  facebook: 'فيسبوك',
  instagram: 'إنستغرام',
  tiktok: 'تيك توك',
  vimeo: 'فيميو',
  youtube: 'يوتيوب',
}

const KIND_NAMES: Record<EmbedKind, string> = {
  post: 'منشور',
  reel: 'ريل',
  video: 'فيديو',
}

const panel: React.CSSProperties = {
  background: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: '.5rem',
  lineHeight: 1.8,
  marginBottom: '1rem',
  padding: '.75rem 1rem',
}

/**
 * The block's own form is the nearest form context, so the sibling field is simply `url`.
 * The `.url` suffix fallback keeps this working if Payload ever renders block fields under
 * a prefixed path — a wrong-looking preview is a support ticket, and silently reading
 * `undefined` is exactly how you get one.
 */
function useSiblingUrl(): string {
  return useFormFields(([fields]) => {
    if (!fields) return ''
    const key = Object.keys(fields).find((name) => name === 'url' || name.endsWith('.url'))
    const value = key ? fields[key]?.value : undefined
    return typeof value === 'string' ? value : ''
  })
}

export default function VideoEmbedPreview() {
  const url = useSiblingUrl()
  const trimmed = url.trim()
  const embed = trimmed === '' ? null : parseEmbed(trimmed)

  // Playback is stored as "the URL the editor asked to play", not as a boolean. Pasting a
  // different link therefore drops back to the poster on the very same render, with no
  // effect and no intermediate frame showing the PREVIOUS video under the new link's label.
  const [playingUrl, setPlayingUrl] = useState<string | null>(null)
  const playing = playingUrl !== null && playingUrl === trimmed

  if (trimmed === '') {
    return (
      <div dir="rtl" style={{ ...panel, opacity: 0.75 }}>
        ستظهر معاينة الفيديو هنا بعد لصق الرابط.
      </div>
    )
  }

  if (!embed) {
    return (
      <div
        dir="rtl"
        // Advisory, not an error: the field validator is what refuses the save. Announcing
        // it politely means a screen-reader user hears it while typing, without the row
        // being reported as invalid before they have finished pasting.
        role="status"
        style={{
          ...panel,
          background: 'var(--theme-warning-50, var(--theme-elevation-50))',
          borderColor: 'var(--theme-warning-250, var(--theme-elevation-150))',
        }}
      >
        <strong style={{ display: 'block' }}>لم نتعرّف على هذا الرابط</strong>
        <span>
          المنصات المدعومة: يوتيوب، فيميو، ديلي موشن، فيسبوك (فيديو/ريل/منشور)، إنستغرام
          (منشور/ريل) وتيك توك. انسخ الرابط كاملًا من شريط العنوان بحيث يبدأ بـ https.
        </span>
      </div>
    )
  }

  const providerName = PROVIDER_NAMES[embed.provider]
  const kindName = KIND_NAMES[embed.kind]

  return (
    <div dir="rtl" style={panel}>
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
        <strong>{`${providerName} — ${kindName}`}</strong>
        <a
          href={embed.canonicalUrl}
          // The canonical URL is the one we REBUILT from the validated id, never the pasted
          // string, so this anchor can never carry attacker-controlled text.
          rel="noopener noreferrer"
          style={{ fontSize: '.85em', opacity: 0.8 }}
          target="_blank"
        >
          فتح على {providerName} ↗
        </a>
      </div>

      {playing ? (
        <div
          style={{
            aspectRatio: '16 / 9',
            background: '#000',
            borderRadius: '.375rem',
            marginTop: '.6rem',
            overflow: 'hidden',
          }}
        >
          <iframe
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            src={embed.embedSrc}
            style={{ border: 0, display: 'block', height: '100%', width: '100%' }}
            title={`معاينة ${kindName} من ${providerName}`}
          />
        </div>
      ) : (
        <button
          onClick={() => setPlayingUrl(trimmed)}
          style={{
            alignItems: 'center',
            aspectRatio: '16 / 9',
            background: 'var(--theme-elevation-100)',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: '.375rem',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'center',
            marginTop: '.6rem',
            overflow: 'hidden',
            padding: 0,
            position: 'relative',
            width: '100%',
          }}
          type="button"
        >
          {/* A third-party provider thumbnail inside the admin: next/image would route it
              through this project's custom Cloudflare loader, which only knows how to
              serve our own stored media, so a plain <img> is the correct element here. */}
          {embed.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              src={embed.thumbnailUrl}
              style={{ height: '100%', objectFit: 'cover', width: '100%' }}
            />
          ) : null}
          <span
            style={{
              background: 'rgba(0,0,0,.65)',
              borderRadius: '2rem',
              color: '#fff',
              padding: '.4rem 1rem',
              position: 'relative',
            }}
          >
            ▶ تشغيل المعاينة
          </span>
        </button>
      )}

      {embed.requiresClickToLoad ? (
        <p style={{ fontSize: '.8em', margin: '.5rem 0 0', opacity: 0.7 }}>
          لن يُحمَّل المشغّل من {providerName} إلا بعد الضغط على التشغيل، في المعاينة وفي
          الموقع.
        </p>
      ) : null}
    </div>
  )
}

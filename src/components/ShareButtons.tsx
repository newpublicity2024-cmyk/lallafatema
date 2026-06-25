'use client'

import { useState } from 'react'

import { FacebookIcon, XIcon } from './icons'

export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false)
  const e = encodeURIComponent
  const links = [
    { label: 'فيسبوك', href: `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`, Icon: FacebookIcon },
    { label: 'إكس', href: `https://twitter.com/intent/tweet?url=${e(url)}&text=${e(title)}`, Icon: XIcon },
    {
      label: 'بنترست',
      href: `https://pinterest.com/pin/create/button/?url=${e(url)}&description=${e(title)}`,
      Icon: PinterestIcon,
    },
    { label: 'بريد إلكتروني', href: `mailto:?subject=${e(title)}&body=${e(url)}`, Icon: MailIcon },
  ]

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-bold text-zinc-700">شارك:</span>
      {links.map(({ label, href, Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`مشاركة عبر ${label}`}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-brand-600 hover:text-white"
        >
          <Icon width={18} height={18} />
        </a>
      ))}
      <button
        type="button"
        onClick={copy}
        aria-label="نسخ الرابط"
        className="flex h-9 items-center gap-1 rounded-full bg-zinc-100 px-3 text-sm text-zinc-600 transition-colors hover:bg-brand-600 hover:text-white"
      >
        {copied ? 'تم النسخ ✓' : 'نسخ الرابط'}
      </button>
    </div>
  )
}

const PinterestIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
    <path d="M12 2a10 10 0 0 0-3.6 19.3c-.1-.8-.2-2 0-2.9l1.2-4.9s-.3-.6-.3-1.5c0-1.4.8-2.4 1.8-2.4.9 0 1.3.6 1.3 1.4 0 .9-.5 2.2-.8 3.4-.2.9.5 1.7 1.4 1.7 1.7 0 2.9-2.2 2.9-4.7 0-1.9-1.3-3.4-3.7-3.4a4.2 4.2 0 0 0-4.4 4.2c0 .8.3 1.4.6 1.8.1.2.2.3.1.5l-.2.9c-.1.3-.3.4-.6.2-1.1-.5-1.7-2-1.7-3.2 0-2.6 1.9-5 5.4-5 2.9 0 5.1 2 5.1 4.8 0 2.9-1.8 5.2-4.3 5.2-.8 0-1.6-.4-1.9-.9l-.5 2c-.2.7-.7 1.6-1 2.1A10 10 0 1 0 12 2Z" />
  </svg>
)

const MailIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" strokeLinecap="round" />
  </svg>
)

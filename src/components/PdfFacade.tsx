'use client'

import { useState } from 'react'

import type { Media } from '@/payload-types'
import { PostImage } from './PostImage'

/**
 * Cover-first PDF facade. Shows the cover + read/download buttons; the (large)
 * PDF is only fetched when the reader clicks "قراءة العدد" — so it stays off the
 * initial render's critical path (mirrors the video-facade pattern). The native
 * <iframe> lets the browser render the PDF; download is a plain anchor.
 */
export function PdfFacade({
  pdfUrl,
  cover,
  title,
}: {
  pdfUrl: string
  cover: number | Media | null | undefined
  title: string
}) {
  const [reading, setReading] = useState(false)

  if (reading) {
    return (
      <iframe
        src={pdfUrl}
        title={title}
        className="h-[80vh] w-full rounded-lg border border-zinc-200"
      />
    )
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-brand-100">
        <PostImage image={cover} alt={title} sizes="(max-width: 768px) 100vw, 384px" />
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => setReading(true)}
          className="rounded-md bg-brand-600 px-5 py-2 text-sm font-bold text-white"
        >
          قراءة العدد
        </button>
        <a
          href={pdfUrl}
          download
          rel="noopener"
          className="rounded-md border border-brand-600 px-5 py-2 text-sm font-bold text-brand-700"
        >
          تحميل PDF
        </a>
      </div>
    </div>
  )
}

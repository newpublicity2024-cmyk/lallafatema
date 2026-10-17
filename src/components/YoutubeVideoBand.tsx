'use client'

import { useState } from 'react'

import type { YoutubeVideo } from '@/payload-types'
import { Carousel } from './Carousel'
import { YoutubeVideoFrame } from './YoutubeVideoFrame'

/**
 * The homepage video band, sourced from the Lalla Fatema YouTube channel.
 *
 * WHAT CHANGED AND WHY. This band used to be `VideoCard`s linking to ARTICLES whose
 * featured media happened to be a video. That made it a by-product of the editorial
 * calendar — it moved only when somebody wrote an article — while the channel itself
 * publishes several times a day. It now mirrors the channel, synced by `/sync-youtube`.
 *
 * The consequence for interaction is the interesting part: a channel video has no article
 * to navigate to. Sending the reader to youtube.com would hand the magazine's most
 * valuable above-the-fold slot to a competitor for attention, so the band plays in place
 * instead. Picking any item in the list promotes it into the lead frame and starts it,
 * which is the behaviour readers already know from a YouTube playlist — and it means only
 * ever ONE iframe exists on the page, however much the reader clicks around.
 *
 * TWO TREES, TWO INDEPENDENT STATES. The mobile carousel and the desktop lead+list are
 * both in the DOM at all times; only CSS decides which one is visible. They therefore MUST
 * NOT share playback state. They did at first, and the result was measurable: one click on
 * the desktop lead created two `<iframe>`s for the same video — one visible, one inside
 * the `md:hidden` subtree — because a `display:none` iframe still loads its src. That is
 * two YouTube players, two sets of cookies and two autoplay attempts for one click, i.e.
 * precisely the cost the click-to-load facade exists to avoid. Splitting the state means
 * the invisible tree never renders a player.
 */

/** Mobile (<md): a swipe carousel where each slide plays in place. */
function BandCarousel({ videos }: { videos: YoutubeVideo[] }) {
  const [playingId, setPlayingId] = useState<string | null>(null)

  return (
    <Carousel dotColor="light">
      {videos.map((video, i) => (
        <article key={video.videoId} className="group">
          <YoutubeVideoFrame
            video={video}
            large
            priority={i === 0}
            playing={playingId === video.videoId}
            onPlay={() => setPlayingId(video.videoId)}
          />
          <h3 className="mt-3 text-xl leading-tight font-extrabold text-white">{video.title}</h3>
        </article>
      ))}
    </Carousel>
  )
}

/** Desktop (md+): the established lead + stacked list shape. */
function BandLeadAndList({ videos }: { videos: YoutubeVideo[] }) {
  // Which video occupies the lead frame. Null means "the newest", i.e. the default view.
  const [activeId, setActiveId] = useState<string | null>(null)
  // Playback is tracked separately so the lead can change without auto-starting on load.
  const [playingId, setPlayingId] = useState<string | null>(null)

  const lead = videos.find((v) => v.videoId === activeId) ?? videos[0]
  const rest = videos.filter((v) => v.videoId !== lead.videoId).slice(0, 4)

  const select = (video: YoutubeVideo) => {
    setActiveId(video.videoId)
    setPlayingId(video.videoId)
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <article className="group">
        <YoutubeVideoFrame
          video={lead}
          large
          priority
          playing={playingId === lead.videoId}
          onPlay={() => setPlayingId(lead.videoId)}
        />
        <h3 className="mt-3 text-xl leading-tight font-extrabold text-white sm:text-2xl">
          {lead.title}
        </h3>
        {/*
          NO DESCRIPTION HERE, deliberately. The band's previous incarnation showed a
          post's `excerpt` — a line an editor wrote for the page. A YouTube description is
          not that: on this channel every video carries the same promotional block
          ("لا تنسوا متابعة قناتنا" plus the site, Facebook and Instagram URLs), so
          rendering it put a paragraph of repeated link text under the lead video on the
          homepage. It is still stored on the row — worth having in the admin and for
          future structured data — it just has no business on the band.
        */}
      </article>

      {rest.length > 0 && (
        <ul className="flex flex-col gap-4">
          {rest.map((video) => (
            <li key={video.videoId}>
              {/*
                One button wrapping the whole row rather than a button over the thumbnail
                plus a separate link on the title: two controls that do the same thing
                double the tab stops for a keyboard reader and give a screen reader two
                near-identical announcements per item.
              */}
              <button
                type="button"
                onClick={() => select(video)}
                aria-label={`تشغيل: ${video.title}`}
                className="group flex w-full items-start gap-3 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <span className="w-40 flex-none">
                  <YoutubeVideoFrame
                    video={video}
                    playing={false}
                    interactive={false}
                    onPlay={() => select(video)}
                  />
                </span>
                <span className="min-w-0 pt-1">
                  <span className="line-clamp-3 block text-sm leading-snug font-bold text-white/90 group-hover:text-brand-200">
                    {video.title}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function YoutubeVideoBand({ videos }: { videos: YoutubeVideo[] }) {
  if (videos.length === 0) return null

  return (
    <>
      <div className="md:hidden">
        <BandCarousel videos={videos} />
      </div>
      <div className="hidden md:block">
        <BandLeadAndList videos={videos} />
      </div>
    </>
  )
}

import { permanentRedirect } from 'next/navigation'

// The standalone video watch pages are retired; video is now an article property.
// Any old /videos/<slug>-<id> link 301s to the aggregated listing.
export default async function LegacyVideoWatchRedirect() {
  permanentRedirect('/videos')
}

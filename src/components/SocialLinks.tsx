import { SOCIAL_LINKS, type SocialKey } from '@/lib/site'
import { FacebookIcon, InstagramIcon, TiktokIcon, XIcon, YoutubeIcon } from './icons'

const ICONS: Record<SocialKey, typeof FacebookIcon> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  x: XIcon,
  youtube: YoutubeIcon,
  tiktok: TiktokIcon,
}

export function SocialLinks({
  className = '',
  links = SOCIAL_LINKS,
}: {
  className?: string
  links?: { key: SocialKey; label: string; href: string }[]
}) {
  return (
    <ul className={`flex items-center gap-3 ${className}`}>
      {links.map(({ key, label, href }) => {
        const Icon = ICONS[key]
        return (
          <li key={key}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="text-current transition-colors hover:text-brand-700"
            >
              <Icon />
            </a>
          </li>
        )
      })}
    </ul>
  )
}

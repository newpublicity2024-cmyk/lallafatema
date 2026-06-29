import type { SVGProps } from 'react'

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'currentColor',
  'aria-hidden': true,
  ...props,
})

export const SearchIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)} fill="none" stroke="currentColor" strokeWidth={2}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" strokeLinecap="round" />
  </svg>
)

export const MenuIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <path d="M3 6h18M3 12h18M3 18h18" />
  </svg>
)

export const FacebookIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0 0 22 12Z" />
  </svg>
)

export const InstagramIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)} fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
)

export const XIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M18.9 2H22l-7.3 8.3L23 22h-6.6l-5.2-6.8L5.3 22H2l7.8-8.9L1.5 2h6.8l4.7 6.2L18.9 2Zm-2.3 18h1.7L7.5 3.8H5.7L16.6 20Z" />
  </svg>
)

export const YoutubeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M23 12s0-3.2-.4-4.7a2.5 2.5 0 0 0-1.8-1.8C19.2 5 12 5 12 5s-7.2 0-8.8.5A2.5 2.5 0 0 0 1.4 7.3C1 8.8 1 12 1 12s0 3.2.4 4.7a2.5 2.5 0 0 0 1.8 1.8C4.8 19 12 19 12 19s7.2 0 8.8-.5a2.5 2.5 0 0 0 1.8-1.8C23 15.2 23 12 23 12Zm-13 3V9l5.2 3-5.2 3Z" />
  </svg>
)

export const PlayIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M8 5v14l11-7L8 5Z" />
  </svg>
)

export const TiktokIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M16.5 3c.3 2.3 1.6 3.7 3.8 3.9v2.6c-1.3.1-2.5-.3-3.8-1v6.1c0 3.6-2.6 5.8-5.7 5.4-3.4-.4-4.9-3.8-3.5-6.5.9-1.7 2.8-2.6 4.9-2.3v2.7c-.4-.1-.8-.2-1.2-.1-1.2.1-2 1-1.9 2.2.1 1.2 1.1 1.9 2.3 1.7 1-.2 1.6-1 1.6-2.1V3h3.5Z" />
  </svg>
)

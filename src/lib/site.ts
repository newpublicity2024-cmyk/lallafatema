/** Static site config. Social/profile URLs become editable globals in Phase 3. */
export const SITE = {
  name: 'لالة فاطمة',
  tagline: 'مجلة المرأة المغربية — مشاهير، موضة، جمال، صحة ومطبخ',
}

export type SocialKey = 'facebook' | 'x' | 'instagram' | 'youtube' | 'tiktok'

export const SOCIAL_LINKS: { key: SocialKey; label: string; href: string }[] = [
  { key: 'facebook', label: 'فيسبوك', href: 'https://www.facebook.com/lallafatema.ma' },
  { key: 'instagram', label: 'إنستغرام', href: 'https://www.instagram.com/lallafatema.ma' },
  { key: 'x', label: 'إكس', href: 'https://x.com/lallafatema' },
  { key: 'youtube', label: 'يوتيوب', href: 'https://www.youtube.com/@lallafatema' },
  { key: 'tiktok', label: 'تيك توك', href: 'https://www.tiktok.com/@lallafatema' },
]

/** NewPub network cross-links (footer). */
export const NEWPUB_LINKS: { label: string; href: string }[] = [
  { label: 'MFM Radio', href: 'https://www.mfmradio.fm' },
  { label: 'VH.ma', href: 'https://vh.ma' },
  { label: 'Challenge.ma', href: 'https://www.challenge.ma' },
  { label: 'Tomobile360', href: 'https://www.tomobile360.ma' },
]

/** Static/legal pages (built in Phase 8; linked from the footer). */
export const FOOTER_PAGES: { label: string; href: string }[] = [
  { label: 'من نحن', href: '/about' },
  { label: 'هيئة التحرير', href: '/editorial-board' },
  { label: 'للإعلان على موقعنا', href: '/advertise' },
  { label: 'سياسة الخصوصية', href: '/privacy' },
  { label: 'شروط الاستخدام', href: '/terms' },
]

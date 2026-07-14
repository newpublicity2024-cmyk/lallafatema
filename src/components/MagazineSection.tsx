import type { MagazineIssue } from '@/payload-types'
import { magazineArchiveUrl } from '@/lib/routes'
import { Carousel } from './Carousel'
import { IssueCard } from './IssueCard'
import { SectionHeading } from './SectionHeading'

/**
 * Homepage magazine band (foochia dark shelf): the newest issues as covers on a
 * full-bleed dark purple band. Mirrors SectionBlock; renders nothing when empty.
 */
export function MagazineSection({ issues }: { issues: MagazineIssue[] }) {
  if (!issues.length) return null
  return (
    <section className="lf-band-dark">
      <div className="lf-container py-12">
        <SectionHeading title="مجلة لالة فاطمة" href={magazineArchiveUrl()} light />
        <Carousel dotColor="light" trackClassName="md:grid-cols-6">
          {issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} variant="shelf" />
          ))}
        </Carousel>
      </div>
    </section>
  )
}

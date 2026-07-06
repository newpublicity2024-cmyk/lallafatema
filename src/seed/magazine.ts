import 'dotenv/config'
import { writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { getPayload } from 'payload'

import config from '../payload.config'

// A minimal valid single-page PDF (blank A4) — enough for the archive to serve
// and the browser to render inside the facade iframe.
const MINIMAL_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj
trailer<</Root 1 0 R>>
%%EOF
`

const ISSUE_NUMBER = 999

async function main() {
  const payload = await getPayload({ config: await config })

  const existing = await payload.find({
    collection: 'magazine-issues',
    where: { issueNumber: { equals: ISSUE_NUMBER } },
    limit: 1,
  })
  if (existing.docs.length) {
    console.log(`Magazine issue #${ISSUE_NUMBER} already seeded — skipping.`)
    return
  }

  const cover = await payload.create({
    collection: 'media',
    data: { alt: 'غلاف عدد تجريبي' },
    filePath: join(process.cwd(), 'ref-foochia-top.jpeg'),
  })

  const pdfPath = join(tmpdir(), 'lf-sample-issue.pdf')
  writeFileSync(pdfPath, MINIMAL_PDF)
  const pdf = await payload.create({
    collection: 'media',
    data: { alt: 'ملف عدد تجريبي (PDF)' },
    filePath: pdfPath,
  })

  await payload.create({
    collection: 'magazine-issues',
    data: {
      issueNumber: ISSUE_NUMBER,
      title: 'عدد تجريبي',
      publishDate: new Date('2026-07-01').toISOString(),
      cover: cover.id,
      pdf: pdf.id,
      description: 'عدد تجريبي لأغراض العرض والاختبار.',
      _status: 'published',
    },
  })

  console.log(`Seeded published magazine issue #${ISSUE_NUMBER}.`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

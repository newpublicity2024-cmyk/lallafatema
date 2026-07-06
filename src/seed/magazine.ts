import 'dotenv/config'
import { writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { getPayload } from 'payload'

import config from '../payload.config'

// A minimal but structurally valid single-page PDF (blank A4). Built with a real
// xref table so Payload's validatePDF — which requires both `xref` and `%%EOF` in
// the trailer — accepts it, and the byte offsets are computed so browsers render it
// in the facade iframe. Latin1 so the offsets are byte-accurate.
function minimalPdf(): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body, 'latin1'))
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const startxref = Buffer.byteLength(body, 'latin1')
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.forEach((off) => {
    body += `${String(off).padStart(10, '0')} 00000 n \n`
  })
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

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
  writeFileSync(pdfPath, minimalPdf())
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

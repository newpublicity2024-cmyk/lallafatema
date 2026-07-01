import { getPayloadClient } from '@/lib/payload'

export const revalidate = 300

/** Cached exact-match redirect map consumed by middleware. */
export async function GET() {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'redirects',
    where: { active: { equals: true } },
    limit: 5000,
    depth: 0,
  })

  const map: Record<string, { to: string; type: number }> = {}
  for (const r of docs) {
    if (r.from && r.to) map[r.from] = { to: r.to, type: r.type === '302' ? 302 : 301 }
  }

  return Response.json(map)
}

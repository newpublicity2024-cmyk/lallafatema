import { getPayload } from 'payload'
import config from '../../src/payload.config.js'

export const testUser = {
  email: 'dev@payloadcms.com',
  password: 'test',
  name: 'Dev User',
  role: 'admin' as const,
}

/**
 * Seeds a test user for e2e admin tests.
 */
export async function seedTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  // Delete existing test user if any
  await payload.delete({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
  })

  // Create fresh test user
  await payload.create({
    collection: 'users',
    data: testUser,
  })
}

/**
 * Role fixtures for the editor-visibility e2e checks.
 *
 * Each role owns a DISTINCT email. Playwright runs spec files in parallel, so a
 * spec that seeded and deleted the shared `testUser` would race whichever other
 * spec is using it.
 */
export const journalistUser = {
  email: 'journalist@payloadcms.com',
  password: 'test',
  name: 'Journalist User',
  role: 'journalist' as const,
}

export const editorUser = {
  email: 'editor@payloadcms.com',
  password: 'test',
  name: 'Editor User',
  role: 'editor' as const,
}

type SeedableUser = { email: string; password: string; name: string; role: string }

/** Replaces any existing account with the same email, then creates it fresh. */
export async function seedUser(user: SeedableUser): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({ collection: 'users', where: { email: { equals: user.email } } })
  await payload.create({ collection: 'users', data: user as never })
}

export async function removeUser(user: SeedableUser): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({ collection: 'users', where: { email: { equals: user.email } } })
}

export const seedJournalistUser = () => seedUser(journalistUser)
export const cleanupJournalistUser = () => removeUser(journalistUser)
export const seedEditorUser = () => seedUser(editorUser)
export const cleanupEditorUser = () => removeUser(editorUser)

/**
 * Cleans up test user after tests
 */
export async function cleanupTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
  })
}

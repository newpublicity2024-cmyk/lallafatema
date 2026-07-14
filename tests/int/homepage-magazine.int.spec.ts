import { describe, it, expect } from 'vitest'

import { magazineInsertAfterIndex } from '@/lib/homepage'

describe('magazineInsertAfterIndex', () => {
  it('inserts after fashion when present', () => {
    expect(magazineInsertAfterIndex(['news', 'fashion', 'beauty', 'health'])).toBe(1)
  })

  it('inserts before beauty when fashion is absent and beauty is mid-list', () => {
    expect(magazineInsertAfterIndex(['news', 'beauty', 'health'])).toBe(0)
  })

  it('inserts before the first section when fashion is absent and beauty is first', () => {
    expect(magazineInsertAfterIndex(['beauty', 'health'])).toBe(-1)
  })

  it('inserts after the last section when both fashion and beauty are absent', () => {
    expect(magazineInsertAfterIndex(['news', 'health'])).toBe(1)
  })

  it('inserts before the first section when the slug list is empty', () => {
    expect(magazineInsertAfterIndex([])).toBe(-1)
  })
})

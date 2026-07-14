/**
 * Index in the homepage's ordered category sections AFTER which the magazine band
 * is inserted: after موضة (fashion); else immediately before جمال (beauty); else
 * after the last section. Returns -1 to mean "before the first section".
 */
export function magazineInsertAfterIndex(slugs: string[]): number {
  const fashion = slugs.indexOf('fashion')
  if (fashion !== -1) return fashion
  const beauty = slugs.indexOf('beauty')
  if (beauty !== -1) return beauty - 1
  return slugs.length - 1
}

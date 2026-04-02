/**
 * Convert a string (address, name) into a clean URL slug.
 *   "456 Oak Avenue, Unit 3B"  →  "456-oak-avenue-unit-3b"
 *   "123 Main St"              →  "123-main-st"
 */
export function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Check if a string's slug matches a given slug.
 */
export function matchesSlug(str, slug) {
  return slugify(str) === slug
}

// Quebec uses a "pièces" system where apartment sizes are expressed as X½.
// The ½ represents the bathroom. Rooms counted: kitchen + living room + bedrooms.
// Formula: quebec_number = bedrooms + 2.5 (for standard layouts)
//
// This conversion ONLY applies to Quebec (QC) properties.

const QUEBEC_TO_STANDARD = {
  '1.5':  { beds: 0, baths: 1, label: 'Studio' },
  '2.5':  { beds: 0, baths: 1, label: 'Studio' },
  '3.5':  { beds: 1, baths: 1, label: '1BR' },
  '4.5':  { beds: 2, baths: 1, label: '2BR' },
  '5.5':  { beds: 3, baths: 1, label: '3BR' },
  '6.5':  { beds: 4, baths: 1, label: '4BR' },
  '7.5':  { beds: 5, baths: 1, label: '5BR' },
  '8.5':  { beds: 6, baths: 1, label: '6BR' },
}

// Normalize various Quebec notations: "3½", "3 1/2", "3.5", "3,5" → "3.5"
function normalizeQuebecValue(raw) {
  if (raw == null) return null
  const s = String(raw).trim()

  // 3½ or 3 ½
  const halfMatch = s.match(/^(\d+)\s*½$/)
  if (halfMatch) return `${halfMatch[1]}.5`

  // 3 1/2
  const fracMatch = s.match(/^(\d+)\s+1\/2$/)
  if (fracMatch) return `${fracMatch[1]}.5`

  // 3,5 (French decimal)
  const commaMatch = s.match(/^(\d+),5$/)
  if (commaMatch) return `${commaMatch[1]}.5`

  // Already 3.5
  const dotMatch = s.match(/^(\d+)\.5$/)
  if (dotMatch) return s

  return null // Not a Quebec-style value
}

// Check if a unit_type value looks like Quebec notation
export function isQuebecUnitType(unitType) {
  return normalizeQuebecValue(unitType) !== null
}

// Convert a Quebec unit type to standard beds/baths
// Returns { beds, baths, label } or null if not a Quebec value
export function quebecToStandard(unitType) {
  const normalized = normalizeQuebecValue(unitType)
  if (!normalized) return null
  return QUEBEC_TO_STANDARD[normalized] ?? null
}

// Convert standard beds to Quebec notation
export function standardToQuebec(beds) {
  const num = Number(beds)
  if (isNaN(num) || num < 0) return null
  return `${num + 2.5}`
}

// Known Quebec cities/regions for address-based detection
const QUEBEC_INDICATORS = [
  // Province markers
  /\bqu[ée]bec\b/i,
  /\bQC\b/,
  // Major cities
  /\bmontr[ée]al\b/i,
  /\blaval\b/i,
  /\blongueuil\b/i,
  /\bgatineau\b/i,
  /\bsherbrooke\b/i,
  /\bsaguenay\b/i,
  /\bl[ée]vis\b/i,
  /\btrois-rivi[èe]res\b/i,
  /\bterrebonne\b/i,
  /\brepentigny\b/i,
  /\bbrossard\b/i,
  /\bdrummondville\b/i,
  /\bsaint-jean-sur-richelieu\b/i,
  /\bblainville\b/i,
  /\bsaint-j[ée]r[ôo]me\b/i,
  /\bch[âa]teauguay\b/i,
  /\bdollard-des-ormeaux\b/i,
  /\bgranby\b/i,
  /\brimouski\b/i,
  /\bvictoriaville\b/i,
  /\bsaint-hyacinthe\b/i,
  /\brouyn-noranda\b/i,
  /\bval-d'or\b/i,
  /\bsorel-tracy\b/i,
  /\bsalaberry-de-valleyfield\b/i,
  /\bjoliette\b/i,
  /\bbeauharnois\b/i,
  // Quebec postal code pattern: starts with G, H, J
  /\b[GHJ]\d[A-Z]\s?\d[A-Z]\d\b/i,
]

// Detect if a property is in Quebec from address, municipality, or province fields
export function isQuebecProperty({ address, municipality, province } = {}) {
  // Explicit province field is the most reliable
  if (province) {
    const p = province.trim().toUpperCase()
    if (p === 'QC' || p === 'QUEBEC' || p === 'QUÉBEC') return true
    // If province is explicitly something else, it's NOT Quebec
    if (p.length >= 2) return false
  }

  // Check address and municipality against known indicators
  const haystack = [address, municipality].filter(Boolean).join(' ')
  return QUEBEC_INDICATORS.some((re) => re.test(haystack))
}

// Apply Quebec conversion to a single unit object (mutates in place).
// Stores the original Quebec value in unit_type_original, converts unit_type to
// standard label, and populates beds/baths from the mapping.
export function convertQuebecUnit(unit) {
  if (!unit?.unit_type) return false

  const converted = quebecToStandard(unit.unit_type)
  if (!converted) return false

  unit.unit_type_original = unit.unit_type
  unit.unit_type = converted.label
  // Always overwrite beds/baths from our mapping — Claude's values for Quebec
  // notation are unreliable (e.g. it might guess beds=2 for a 3½ which is actually 1BR)
  unit.beds = converted.beds
  unit.baths = converted.baths

  return true
}

// Apply Quebec conversion to all units in an extraction result.
// Only converts if the property is detected as being in Quebec.
export function applyQuebecConversions(extractedData, address) {
  const propertyData = extractedData?.property ?? extractedData ?? {}

  const isQC = isQuebecProperty({
    address: address || propertyData.property_address,
    municipality: propertyData.municipality,
    province: propertyData.province,
  })

  if (!isQC) return { converted: false, count: 0 }

  const units = extractedData?.units ?? []
  let count = 0
  for (const unit of units) {
    if (convertQuebecUnit(unit)) count++
  }

  return { converted: count > 0, count }
}

/**
 * One-time backfill script: converts existing Quebec units in the DB.
 *
 * What it does:
 *   1. Finds all properties that look like they're in Quebec (by address/municipality)
 *   2. For each, finds units with Quebec-style unit_type (e.g. "3½", "4.5")
 *   3. Saves the original value to unit_type_original
 *   4. Converts unit_type to standard label, populates beds/baths
 *   5. Sets province = 'QC' on the property
 *
 * Safe to run multiple times — skips units that already have unit_type_original set.
 *
 * Usage: node scripts/backfill-quebec-units.js
 */

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { isQuebecProperty, quebecToStandard, isQuebecUnitType } from '../utils/quebecUnits.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../../.env') })

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function backfill() {
  console.log('[Backfill] Fetching all properties...')

  const { data: properties, error: propErr } = await supabase
    .from('property')
    .select('id, property_address, municipality, province')

  if (propErr) throw new Error(`Failed to fetch properties: ${propErr.message}`)
  console.log(`[Backfill] Found ${properties.length} properties`)

  let propertiesUpdated = 0
  let unitsConverted = 0

  for (const prop of properties) {
    const isQC = isQuebecProperty({
      address: prop.property_address,
      municipality: prop.municipality,
      province: prop.province,
    })

    if (!isQC) continue

    // Tag property as QC if not already
    if (prop.province !== 'QC') {
      const { error } = await supabase
        .from('property')
        .update({ province: 'QC' })
        .eq('id', prop.id)
      if (error) {
        console.error(`[Backfill] Failed to update province for ${prop.id}: ${error.message}`)
        continue
      }
      propertiesUpdated++
    }

    // Fetch all units for this property — re-fix already-converted ones too
    const { data: units, error: unitErr } = await supabase
      .from('unit')
      .select('id, unit_type, beds, baths, unit_type_original')
      .eq('property_id', prop.id)

    if (unitErr) {
      console.error(`[Backfill] Failed to fetch units for ${prop.id}: ${unitErr.message}`)
      continue
    }

    for (const unit of units) {
      // Use original value if already converted, otherwise check current unit_type
      const rawType = unit.unit_type_original ?? unit.unit_type
      if (!isQuebecUnitType(rawType)) continue

      const converted = quebecToStandard(rawType)
      if (!converted) continue

      const updates = {
        unit_type_original: rawType,
        unit_type: converted.label,
        beds: String(converted.beds),
        baths: String(converted.baths),
      }

      const { error } = await supabase
        .from('unit')
        .update(updates)
        .eq('id', unit.id)

      if (error) {
        console.error(`[Backfill] Failed to update unit ${unit.id}: ${error.message}`)
        continue
      }
      unitsConverted++
    }
  }

  console.log(`[Backfill] Done. Properties tagged QC: ${propertiesUpdated}, Units converted: ${unitsConverted}`)
}

backfill().catch((err) => {
  console.error('[Backfill] Fatal:', err.message)
  process.exit(1)
})

/**
 * One-time backfill: run market research on all properties that don't have it yet.
 * Usage: node backend/scripts/backfill-market-research.js
 */
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { researchProperty } from '../utils/marketResearch.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  console.log('Fetching properties without market research...')

  const { data: properties, error } = await supabase
    .from('property')
    .select('id, property_address')
    .is('market_research_at', null)

  if (error) { console.error('Failed to fetch:', error.message); process.exit(1) }
  if (properties.length === 0) { console.log('All properties already have market research.'); return }

  console.log(`Found ${properties.length} properties to research\n`)

  let succeeded = 0
  let failed = 0

  for (const prop of properties) {
    console.log(`[${succeeded + failed + 1}/${properties.length}] ${prop.property_address}`)

    try {
      const result = await researchProperty(prop.property_address, process.env.ANTHROPIC_API_KEY)

      const { error: updateErr } = await supabase
        .from('property')
        .update({
          ...result,
          market_research_at: new Date().toISOString(),
        })
        .eq('id', prop.id)

      if (updateErr) throw new Error(updateErr.message)

      console.log('  Amenities:', result.building_amenities?.substring(0, 80) + '...')
      console.log('  Utilities:', result.utility_responsibility?.substring(0, 80) + '...')
      console.log('  Incentives:', result.market_incentives?.substring(0, 80) + '...')
      console.log()
      succeeded++
    } catch (err) {
      console.error(`  ERROR: ${err.message}\n`)
      failed++
    }
  }

  console.log(`\nDone! ${succeeded} succeeded, ${failed} failed.`)
}

main()

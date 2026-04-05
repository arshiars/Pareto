/**
 * One-time script: translate all French property fields to English.
 * Usage: node backend/scripts/translate-properties.js
 */
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SKIP_KEYS = new Set(['id', 'property_address', 'source_file', 'uploaded_at', 'province'])

function getTextFields(property) {
  const fields = {}
  for (const [key, val] of Object.entries(property)) {
    if (SKIP_KEYS.has(key)) continue
    if (typeof val === 'string' && val.trim() && isNaN(Number(val))) {
      fields[key] = val
    }
  }
  return fields
}

async function translateFields(textFields) {
  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Below is a JSON object of property fields extracted from a Canadian real estate appraisal. Some values may be in French. Translate any French text to English. Leave English text unchanged. Leave proper nouns (names, addresses) unchanged. Return ONLY a JSON object with the same keys, with translated values. No markdown fences, no commentary.

${JSON.stringify(textFields, null, 2)}`,
    }],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock) throw new Error('No text in response')

  const cleaned = textBlock.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  return JSON.parse(cleaned)
}

async function main() {
  console.log('Fetching all properties...')
  const { data: properties, error } = await supabase.from('property').select('*')
  if (error) { console.error('Failed to fetch properties:', error.message); process.exit(1) }

  console.log(`Found ${properties.length} properties\n`)

  let totalTranslated = 0
  let propertiesUpdated = 0

  for (const property of properties) {
    const textFields = getTextFields(property)
    if (Object.keys(textFields).length === 0) {
      console.log(`[SKIP] ${property.property_address} — no text fields`)
      continue
    }

    console.log(`[CHECK] ${property.property_address} (${Object.keys(textFields).length} text fields)`)

    try {
      const translated = await translateFields(textFields)

      // Only update fields that actually changed
      const updates = {}
      let changed = 0
      for (const [key, val] of Object.entries(translated)) {
        if (val && val !== textFields[key]) {
          updates[key] = val
          changed++
        }
      }

      if (changed === 0) {
        console.log(`  → Already in English\n`)
        continue
      }

      const { error: updateErr } = await supabase.from('property').update(updates).eq('id', property.id)
      if (updateErr) throw new Error(updateErr.message)

      console.log(`  → Translated ${changed} field(s)`)
      for (const [key, val] of Object.entries(updates)) {
        console.log(`    ${key}: "${textFields[key]}" → "${val}"`)
      }
      console.log()

      totalTranslated += changed
      propertiesUpdated++
    } catch (err) {
      console.error(`  → ERROR: ${err.message}\n`)
    }
  }

  console.log(`\nDone! Updated ${propertiesUpdated} properties, ${totalTranslated} total fields translated.`)
}

main()

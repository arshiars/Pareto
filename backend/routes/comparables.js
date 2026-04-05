import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const router = Router()

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function getS3() {
  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  })
}

const BUCKET = () => process.env.AWS_S3_BUCKET

async function signedGetUrl(s3Key) {
  const command = new GetObjectCommand({ Bucket: BUCKET(), Key: s3Key })
  return getSignedUrl(getS3(), command, { expiresIn: 3600 })
}

// GET /api/comparables
// Returns all units joined with their property data, flat for the frontend
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabase()
    const [unitsRes, previewRes] = await Promise.all([
      supabase
        .from('unit')
        .select('*, property:property_id(*)')
        .order('uploaded_at', { ascending: false }),
      supabase
        .from('property_image')
        .select('property_id, s3_key')
        .eq('is_preview', true),
    ])

    if (unitsRes.error) throw new Error(unitsRes.error.message)

    const previewMap = new Map()
    if (previewRes.data) {
      for (const img of previewRes.data) {
        if (!previewMap.has(img.property_id)) {
          previewMap.set(img.property_id, img.s3_key)
        }
      }
    }

    const previewUrls = new Map()
    for (const [propId, s3Key] of previewMap) {
      try {
        previewUrls.set(propId, await signedGetUrl(s3Key))
      } catch { /* skip if signing fails */ }
    }

    const flat = unitsRes.data.map((u) => {
      // Spread all property-level fields, then overlay unit-level fields
      const prop = u.property ?? {}
      return {
        // All property fields (165+)
        ...prop,
        // Unit fields (override any collisions like source_file)
        id: u.id,
        property_id: u.property_id,
        property_address: prop.property_address ?? null,
        preview_image_url: previewUrls.get(u.property_id) ?? null,
        unit_number: u.unit_number,
        unit_type: u.unit_type,
        unit_type_original: u.unit_type_original,
        beds: u.beds,
        baths: u.baths,
        sqft: u.sqft,
        lease_rate: u.lease_rate,
        move_in: u.move_in,
        move_out: u.move_out,
        notes: u.notes,
        source_file: u.source_file,
        uploaded_at: u.uploaded_at,
      }
    })

    res.json(flat)
  } catch (err) {
    console.error('[Comparables] Fetch error:', err.message)
    res.status(500).json({ error: err.message || 'Fetch failed' })
  }
})

// GET /api/comparables/properties
// Returns all properties (no units)
router.get('/properties', async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('property')
      .select('*')
      .order('uploaded_at', { ascending: false })

    if (error) throw new Error(error.message)
    res.json(data)
  } catch (err) {
    console.error('[Comparables] Properties fetch error:', err.message)
    res.status(500).json({ error: err.message || 'Fetch failed' })
  }
})

// GET /api/comparables/property/:id
// Returns a single property with all its units and images
router.get('/property/:id', async (req, res) => {
  try {
    const { id } = req.params
    const supabase = getSupabase()

    const [propRes, unitsRes, imagesRes] = await Promise.all([
      supabase.from('property').select('*').eq('id', id).single(),
      supabase.from('unit').select('*').eq('property_id', id).order('unit_number'),
      supabase.from('property_image').select('*').eq('property_id', id).order('uploaded_at', { ascending: false }),
    ])

    if (propRes.error) throw new Error(propRes.error.message)

    const images = []
    for (const img of (imagesRes.data ?? [])) {
      try {
        images.push({ ...img, url: await signedGetUrl(img.s3_key) })
      } catch {
        images.push({ ...img, url: null })
      }
    }

    res.json({ property: propRes.data, units: unitsRes.data ?? [], images })
  } catch (err) {
    console.error('[Comparables] Property detail error:', err.message)
    res.status(500).json({ error: err.message || 'Fetch failed' })
  }
})

// PATCH /api/comparables/property/:id/address
// Rename property address
router.patch('/property/:id/address', async (req, res) => {
  try {
    const { id } = req.params
    const { address } = req.body
    if (!address?.trim()) return res.status(400).json({ error: 'address is required' })

    const { data, error } = await getSupabase()
      .from('property')
      .update({ property_address: address.trim() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw new Error(error.message)
    console.log(`[Comparables] Renamed property ${id} → "${address.trim()}"`)
    res.json(data)
  } catch (err) {
    console.error('[Comparables] Rename error:', err.message)
    res.status(500).json({ error: err.message || 'Rename failed' })
  }
})

// PATCH /api/comparables/unit/:id
// Update a single unit
router.patch('/unit/:id', async (req, res) => {
  try {
    const { id } = req.params
    const updates = { ...req.body }
    delete updates.id
    delete updates.uploaded_at
    delete updates.property_id

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' })
    }

    const { data, error } = await getSupabase()
      .from('unit')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw new Error(error.message)
    res.json(data)
  } catch (err) {
    console.error('[Comparables] Unit update error:', err.message)
    res.status(500).json({ error: err.message || 'Update failed' })
  }
})

// DELETE /api/comparables/property/:id
// Delete units by IDs
router.delete('/units', async (req, res) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array is required' })

    const { error } = await getSupabase()
      .from('unit')
      .delete()
      .in('id', ids)

    if (error) throw new Error(error.message)
    console.log(`[Comparables] Deleted ${ids.length} unit(s)`)
    res.json({ deleted: ids.length })
  } catch (err) {
    console.error('[Comparables] Unit delete error:', err.message)
    res.status(500).json({ error: err.message || 'Delete failed' })
  }
})

// Delete a property and all its units (cascade)
router.delete('/property/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { error } = await getSupabase()
      .from('property')
      .delete()
      .eq('id', id)

    if (error) throw new Error(error.message)
    console.log(`[Comparables] Deleted property ${id}`)
    res.json({ deleted: true })
  } catch (err) {
    console.error('[Comparables] Delete error:', err.message)
    res.status(500).json({ error: err.message || 'Delete failed' })
  }
})

// ─── Property Images ────────────────────────────────────────────────────────

// POST /api/comparables/property/:id/images/presign
// Returns a presigned PUT URL for uploading an image to S3
router.post('/property/:id/images/presign', async (req, res) => {
  try {
    const { id } = req.params
    const { fileName, contentType } = req.body
    if (!fileName) return res.status(400).json({ error: 'fileName is required' })

    const ext = fileName.split('.').pop().toLowerCase()
    const s3Key = `images/${id}/${Date.now()}_${fileName}`
    const mime = contentType || (
      ext === 'png' ? 'image/png' :
      ext === 'webp' ? 'image/webp' :
      ext === 'gif' ? 'image/gif' : 'image/jpeg'
    )

    const command = new PutObjectCommand({
      Bucket: BUCKET(),
      Key: s3Key,
      ContentType: mime,
    })
    const uploadUrl = await getSignedUrl(getS3(), command, { expiresIn: 600 })

    res.json({ uploadUrl, s3Key, contentType: mime })
  } catch (err) {
    console.error('[Images] Presign error:', err.message)
    res.status(500).json({ error: err.message || 'Presign failed' })
  }
})

// POST /api/comparables/property/:id/images
// Save image record after successful S3 upload
router.post('/property/:id/images', async (req, res) => {
  try {
    const { id } = req.params
    const { s3Key, filename, setAsPreview } = req.body
    if (!s3Key) return res.status(400).json({ error: 's3Key is required' })

    const supabase = getSupabase()

    if (setAsPreview) {
      await supabase
        .from('property_image')
        .update({ is_preview: false })
        .eq('property_id', id)
    }

    const { data, error } = await supabase
      .from('property_image')
      .insert({
        property_id: id,
        s3_key: s3Key,
        filename: filename ?? null,
        is_preview: setAsPreview ?? false,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)

    const url = await signedGetUrl(s3Key)
    res.json({ ...data, url })
  } catch (err) {
    console.error('[Images] Save error:', err.message)
    res.status(500).json({ error: err.message || 'Save failed' })
  }
})

// PATCH /api/comparables/property/:propertyId/images/:imageId/preview
// Set an image as the preview image for a property
router.patch('/property/:propertyId/images/:imageId/preview', async (req, res) => {
  try {
    const { propertyId, imageId } = req.params
    const supabase = getSupabase()

    await supabase
      .from('property_image')
      .update({ is_preview: false })
      .eq('property_id', propertyId)

    const { data, error } = await supabase
      .from('property_image')
      .update({ is_preview: true })
      .eq('id', imageId)
      .select()
      .single()

    if (error) throw new Error(error.message)
    res.json(data)
  } catch (err) {
    console.error('[Images] Set preview error:', err.message)
    res.status(500).json({ error: err.message || 'Set preview failed' })
  }
})

// DELETE /api/comparables/property/:propertyId/images/:imageId
// Delete an image from S3 and the database
router.delete('/property/:propertyId/images/:imageId', async (req, res) => {
  try {
    const { imageId } = req.params
    const supabase = getSupabase()

    const { data: img, error: fetchErr } = await supabase
      .from('property_image')
      .select('s3_key')
      .eq('id', imageId)
      .single()

    if (fetchErr) throw new Error(fetchErr.message)

    try {
      await getS3().send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: img.s3_key }))
    } catch (s3Err) {
      console.warn('[Images] S3 delete warning:', s3Err.message)
    }

    const { error } = await supabase
      .from('property_image')
      .delete()
      .eq('id', imageId)

    if (error) throw new Error(error.message)
    res.json({ deleted: true })
  } catch (err) {
    console.error('[Images] Delete error:', err.message)
    res.status(500).json({ error: err.message || 'Delete failed' })
  }
})

// ─── Translate French fields to English ─────────────────────────────────────

router.post('/property/:id/translate', async (req, res) => {
  try {
    const { id } = req.params
    const supabase = getSupabase()

    const { data: property, error } = await supabase.from('property').select('*').eq('id', id).single()
    if (error || !property) return res.status(404).json({ error: 'Property not found' })

    // Collect all non-null text fields
    const textFields = {}
    const skipKeys = new Set(['id', 'property_address', 'source_file', 'uploaded_at', 'province'])
    for (const [key, val] of Object.entries(property)) {
      if (skipKeys.has(key)) continue
      if (typeof val === 'string' && val.trim() && isNaN(Number(val))) {
        textFields[key] = val
      }
    }

    if (Object.keys(textFields).length === 0) {
      return res.json({ translated: 0, property })
    }

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
    if (!textBlock) return res.status(500).json({ error: 'No translation response' })

    let translated
    try {
      const cleaned = textBlock.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
      translated = JSON.parse(cleaned)
    } catch {
      return res.status(500).json({ error: 'Failed to parse translation response' })
    }

    // Only update fields that actually changed
    const updates = {}
    let count = 0
    for (const [key, val] of Object.entries(translated)) {
      if (val && val !== textFields[key]) {
        updates[key] = val
        count++
      }
    }

    if (count > 0) {
      const { error: updateErr } = await supabase.from('property').update(updates).eq('id', id)
      if (updateErr) throw new Error(updateErr.message)
    }

    // Return updated property
    const { data: updated } = await supabase.from('property').select('*').eq('id', id).single()
    res.json({ translated: count, property: updated })
  } catch (err) {
    console.error('[Comparables] Translate error:', err.message)
    res.status(500).json({ error: err.message || 'Translation failed' })
  }
})

// ─── AI Comp Reasoning ──────────────────────────────────────────────────────

router.post('/ai-rank-comps', async (req, res) => {
  try {
    const { subject, candidates } = req.body
    if (!subject || !candidates?.length) return res.status(400).json({ error: 'subject and candidates required' })

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `You are a senior real estate analyst selecting the best rental comparables for a subject property.

## Subject Property
- Address: ${subject.address}
- Year Built: ${subject.yearBuilt ?? 'Unknown'}
- Units: ${subject.unitCount || 'Unknown'}
- Storeys: ${subject.storeys ?? 'Unknown'}
- Property Type: ${subject.propertyType ?? 'Unknown'}
- Construction: ${subject.constructionFrame ?? 'Unknown'}
${subject.summary ? `- Description: ${subject.summary}` : ''}

## Candidate Properties (${candidates.length} total)
${candidates.map((c, i) => `${i + 1}. "${c.address}" — ${c.unitCount} units, ${c.storeys ?? '?'} storeys, built ${c.yearBuilt ?? '?'}, ${c.propertyType ?? 'unknown type'}, ${c.constructionFrame ?? '?'} frame, avg rent $${c.avgRent ?? '?'}/mo, avg ${c.avgSqft ?? '?'} sqft, ${c.distance} mi away`).join('\n')}

## Your Task
Select the **best 5 comparables** from the candidates above. Consider:
- **Submarket similarity** — are they in the same neighbourhood/market tier?
- **Asset class match** — similar building type, height, age, and quality tier
- **Rent level similarity** — are rents in a comparable range?
- **Size similarity** — similar unit sizes and unit count
- **Proximity** — closer is generally better, but a great match 3mi away beats a poor match 0.5mi away
- **Data recency** — prefer properties with recent lease data

For each pick, explain WHY it's a good comparable in 1-2 sentences. Also flag any weaknesses.

Return a JSON array of exactly 5 objects, ordered from best to worst match:
[
  {
    "address": "exact address string from the candidate list",
    "rank": 1,
    "match_quality": "strong" | "good" | "fair",
    "reason": "1-2 sentence explanation of why this is a good comp",
    "caveat": "optional 1 sentence weakness/caveat, or null"
  }
]

Return ONLY the JSON array. No markdown fences, no commentary outside the array.`,
      }],
    })

    const textBlock = response.content.filter((b) => b.type === 'text').pop()
    if (!textBlock) return res.status(500).json({ error: 'No response from Claude' })

    const cleaned = textBlock.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return res.status(500).json({ error: 'No JSON array in response' })

    const picks = JSON.parse(jsonMatch[0])
    res.json({ picks })
  } catch (err) {
    console.error('[Comparables] AI rank error:', err.message)
    res.status(500).json({ error: err.message || 'AI ranking failed' })
  }
})

// ─── Unit Data Enrichment (appraisal inference + web search fallback) ────────

router.post('/property/:id/enrich-units', async (req, res) => {
  try {
    const { id } = req.params
    const supabase = getSupabase()

    // Fetch property and its units
    const [propRes, unitsRes] = await Promise.all([
      supabase.from('property').select('*').eq('id', id).single(),
      supabase.from('unit').select('*').eq('property_id', id),
    ])

    if (propRes.error || !propRes.data) return res.status(404).json({ error: 'Property not found' })
    if (unitsRes.error) throw new Error(unitsRes.error.message)

    const property = propRes.data
    const units = unitsRes.data ?? []
    const needsEnrichment = units.filter((u) => u.sqft == null || u.baths == null)

    if (needsEnrichment.length === 0) return res.json({ enriched: 0, message: 'All units already have sqft and baths data' })

    // Phase 1: Infer from appraisal data
    const appraisalSqft = property.sqft_per_unit_habitable ? Number(property.sqft_per_unit_habitable) : null
    const appraisalBaths = property.bathrooms_per_unit ? String(property.bathrooms_per_unit) : null
    const totalBuildingSqft = property.sqft_total_building ? Number(property.sqft_total_building) : null
    const totalUnits = property.num_units_total ? Number(property.num_units_total) : null

    // Build a sqft estimate per bed type from units that DO have sqft
    const sqftByBeds = {}
    for (const u of units) {
      if (u.sqft != null && u.beds != null) {
        const key = String(Math.floor(Number(u.beds)))
        if (!sqftByBeds[key]) sqftByBeds[key] = []
        sqftByBeds[key].push(Number(u.sqft))
      }
    }
    const avgSqftByBeds = {}
    for (const [beds, values] of Object.entries(sqftByBeds)) {
      avgSqftByBeds[beds] = Math.round(values.reduce((s, v) => s + v, 0) / values.length)
    }

    // Similarly for baths
    const bathsByBeds = {}
    for (const u of units) {
      if (u.baths != null && u.beds != null) {
        const key = String(Math.floor(Number(u.beds)))
        if (!bathsByBeds[key]) bathsByBeds[key] = []
        bathsByBeds[key].push(String(u.baths))
      }
    }
    const commonBathsByBeds = {}
    for (const [beds, values] of Object.entries(bathsByBeds)) {
      // Most common value
      const counts = {}
      values.forEach((v) => { counts[v] = (counts[v] || 0) + 1 })
      commonBathsByBeds[beds] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    }

    // Apply appraisal inferences
    let enrichedFromAppraisal = 0
    const updates = []

    for (const u of needsEnrichment) {
      const bedKey = u.beds != null ? String(Math.floor(Number(u.beds))) : null
      const fields = {}

      // Sqft inference
      if (u.sqft == null) {
        if (bedKey && avgSqftByBeds[bedKey]) {
          fields.sqft = avgSqftByBeds[bedKey]
        } else if (appraisalSqft) {
          fields.sqft = appraisalSqft
        } else if (totalBuildingSqft && totalUnits && totalUnits > 0) {
          fields.sqft = Math.round(totalBuildingSqft / totalUnits)
        }
      }

      // Baths inference
      if (u.baths == null) {
        if (bedKey && commonBathsByBeds[bedKey]) {
          fields.baths = commonBathsByBeds[bedKey]
        } else if (appraisalBaths) {
          fields.baths = appraisalBaths
        }
      }

      if (Object.keys(fields).length > 0) {
        updates.push({ id: u.id, fields })
        enrichedFromAppraisal++
      }
    }

    // Phase 2: For units still missing data, use Claude web search
    const stillMissing = needsEnrichment.filter((u) => {
      const update = updates.find((up) => up.id === u.id)
      const hasSqft = u.sqft != null || update?.fields.sqft != null
      const hasBaths = u.baths != null || update?.fields.baths != null
      return !hasSqft || !hasBaths
    })

    let enrichedFromWeb = 0
    if (stillMissing.length > 0) {
      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default
        const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

        // Group missing units by bed type for efficient lookup
        const missingBedTypes = [...new Set(stillMissing.map((u) => u.beds != null ? String(Math.floor(Number(u.beds))) : 'unknown'))]

        const response = await claude.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
          messages: [{
            role: 'user',
            content: `I need typical unit sizes and bathroom counts for rental units at this Canadian property:

Address: ${property.property_address}
Property Type: ${property.property_type || 'Multi-residential'}
Year Built: ${property.year_built || 'Unknown'}
Total Units: ${property.num_units_total || units.length}

I need data for these unit types: ${missingBedTypes.map((b) => b === '0' ? 'Studio' : b === 'unknown' ? 'Unknown type' : `${b} Bedroom`).join(', ')}

Search for this property on rental listing sites and return a JSON object mapping bed count to typical sqft and baths:

{
  "0": { "sqft": 450, "baths": "1" },
  "1": { "sqft": 650, "baths": "1" },
  "2": { "sqft": 900, "baths": "1" }
}

If you can't find the specific property, use data from similar buildings in the same neighbourhood. Return ONLY the JSON object.`,
          }],
        })

        const textBlock = response.content.filter((b) => b.type === 'text').pop()
        if (textBlock) {
          const cleaned = textBlock.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const webData = JSON.parse(jsonMatch[0])

            for (const u of stillMissing) {
              const bedKey = u.beds != null ? String(Math.floor(Number(u.beds))) : 'unknown'
              const data = webData[bedKey] || webData[Object.keys(webData)[0]] // fallback to first entry
              if (!data) continue

              const existing = updates.find((up) => up.id === u.id)
              const fields = existing?.fields ?? {}

              if (u.sqft == null && !fields.sqft && data.sqft) {
                fields.sqft = Number(data.sqft)
              }
              if (u.baths == null && !fields.baths && data.baths) {
                fields.baths = String(data.baths)
              }

              if (Object.keys(fields).length > 0) {
                if (existing) {
                  existing.fields = fields
                } else {
                  updates.push({ id: u.id, fields })
                }
                enrichedFromWeb++
              }
            }
          }
        }
      } catch (webErr) {
        console.warn('[Comparables] Web enrichment failed (non-fatal):', webErr.message)
      }
    }

    // Apply all updates to DB
    let dbUpdated = 0
    for (const { id: unitId, fields } of updates) {
      const { error: updateErr } = await supabase.from('unit').update(fields).eq('id', unitId)
      if (!updateErr) dbUpdated++
    }

    // Return updated units
    const { data: refreshed } = await supabase.from('unit').select('*').eq('property_id', id)

    res.json({
      enriched: dbUpdated,
      fromAppraisal: enrichedFromAppraisal,
      fromWeb: enrichedFromWeb,
      units: refreshed ?? [],
    })
  } catch (err) {
    console.error('[Comparables] Enrich error:', err.message)
    res.status(500).json({ error: err.message || 'Enrichment failed' })
  }
})

// ─── Duplicate Address Detection ─────────────────────────────────────────────

router.post('/check-duplicate', async (req, res) => {
  try {
    const { address } = req.body
    if (!address?.trim()) return res.status(400).json({ error: 'address is required' })

    const supabase = getSupabase()
    const normalized = address.trim().toLowerCase().replace(/[.,#]/g, '').replace(/\s+/g, ' ')

    // Fetch all property addresses
    const { data: properties, error } = await supabase
      .from('property')
      .select('id, property_address')

    if (error) throw new Error(error.message)
    if (!properties?.length) return res.json({ duplicates: [] })

    // Simple fuzzy match — check if the normalized address is contained in or contains an existing one
    const duplicates = []
    for (const prop of properties) {
      if (!prop.property_address) continue
      const existing = prop.property_address.toLowerCase().replace(/[.,#]/g, '').replace(/\s+/g, ' ')

      // Exact match
      if (existing === normalized) {
        duplicates.push({ id: prop.id, address: prop.property_address, match: 'exact' })
        continue
      }

      // One contains the other (e.g. "388 Albert Street" matches "388 Albert Street, Ottawa, ON")
      if (existing.includes(normalized) || normalized.includes(existing)) {
        duplicates.push({ id: prop.id, address: prop.property_address, match: 'partial' })
        continue
      }

      // Levenshtein-like: check if first part (street number + name) matches
      const existingParts = existing.split(',')[0].trim()
      const normalizedParts = normalized.split(',')[0].trim()
      if (existingParts === normalizedParts) {
        duplicates.push({ id: prop.id, address: prop.property_address, match: 'street' })
      }
    }

    res.json({ duplicates })
  } catch (err) {
    console.error('[Comparables] Duplicate check error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── Subject Property Research (for auto-suggest scoring) ───────────────────

router.post('/research-subject', async (req, res) => {
  try {
    const { address } = req.body
    if (!address?.trim()) return res.status(400).json({ error: 'address is required' })

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
      messages: [{
        role: 'user',
        content: `I need basic property characteristics for this Canadian rental property address:

${address.trim()}

Search the web for this property and return a JSON object with these fields. Use your best estimate if exact data isn't available but you can infer from the building (e.g. from photos, listings, or municipal records):

{
  "year_built": 1985,
  "num_units": 45,
  "num_storeys": 12,
  "property_type": "Multi-residential",
  "construction_frame": "Concrete",
  "summary": "A 2-3 sentence description of the property for an analyst"
}

- year_built: integer year, or null if not found
- num_units: total residential units, or null
- num_storeys: number of floors/storeys, or null
- property_type: "Multi-residential", "Mixed-use", "Commercial", etc.
- construction_frame: "Wood", "Concrete", "Steel", "Masonry", or null
- summary: brief description of the property

Return ONLY the JSON object. No markdown fences, no commentary.`,
      }],
    })

    const textBlock = response.content.filter((b) => b.type === 'text').pop()
    if (!textBlock) return res.status(500).json({ error: 'No response from Claude' })

    const cleaned = textBlock.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return res.status(500).json({ error: 'No JSON in response' })

    const result = JSON.parse(jsonMatch[0])
    res.json(result)
  } catch (err) {
    console.error('[Comparables] Subject research error:', err.message)
    res.status(500).json({ error: err.message || 'Research failed' })
  }
})

// ─── Market Research (Claude + web search) ──────────────────────────────────

router.post('/property/:id/research', async (req, res) => {
  try {
    const { id } = req.params
    const supabase = getSupabase()

    const { data: property, error } = await supabase.from('property').select('*').eq('id', id).single()
    if (error || !property) {
      console.error('[Comparables] Research lookup failed:', error?.message, 'id:', id)
      return res.status(404).json({ error: 'Property not found' })
    }

    const { researchProperty } = await import('../utils/marketResearch.js')
    const result = await researchProperty(property.property_address, process.env.ANTHROPIC_API_KEY)

    const { error: updateErr } = await supabase
      .from('property')
      .update({
        ...result,
        market_research_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateErr) throw new Error(updateErr.message)

    res.json({ success: true, ...result })
  } catch (err) {
    console.error('[Comparables] Research error:', err.message)
    res.status(500).json({ error: err.message || 'Research failed' })
  }
})

export default router

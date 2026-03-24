import { Router } from 'express'
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { upload } from '../middleware/upload.js'
import { extractRentComparables } from '../services/claude.js'

const router = Router()

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function runUpload(req, res, handler) {
  return new Promise((resolve, reject) => {
    handler(req, res, (err) => (err ? reject(err) : resolve()))
  })
}

// POST /api/comparables/bulk
// Upload a SINGLE file → extract → save immediately (no review step)
// Frontend calls this in a loop for bulk ingestion, tracking progress per file
router.post('/bulk', async (req, res) => {
  try {
    await runUpload(req, res, upload.single('file'))
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const batchId = randomUUID()
    const results = await extractRentComparables([req.file])

    const units = []
    for (const result of results) {
      for (const property of result.properties) {
        for (const unit of property.units ?? []) {
          units.push({
            batch_id: batchId,
            source_file: req.file.originalname,
            property_address: property.property_address ?? null,
            year_built: property.year_built ?? null,
            construction_type: property.construction_type ?? null,
            unit_number: unit.unit_number ?? null,
            unit_type: unit.unit_type ?? null,
            beds: unit.beds ?? null,
            baths: unit.baths ?? null,
            sqft: unit.sqft ?? null,
            lease_rate: unit.lease_rate ?? null,
            move_in: unit.move_in ?? null,
            move_out: unit.move_out ?? null,
            lease_executed: unit.lease_executed ?? null,
            flagged: unit.flagged ?? false,
          })
        }
      }
    }

    if (units.length > 0) {
      const { error } = await getSupabase().from('rent_comparables').insert(units)
      if (error) throw new Error(error.message)
    }

    console.log(`[Comparables/bulk] ${req.file.originalname} → ${units.length} units saved`)
    res.json({ batchId, saved: units.length, source_file: req.file.originalname })
  } catch (err) {
    console.error('[Comparables/bulk] Error:', err.message)
    res.status(500).json({ error: err.message || 'Bulk extraction failed' })
  }
})

// POST /api/comparables/extract
// Upload PDFs → Claude extracts unit data → return for user review (not saved yet)
router.post('/extract', async (req, res) => {
  try {
    await runUpload(req, res, upload.array('files', 20))
    if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' })

    const batchId = randomUUID()
    const results = await extractRentComparables(req.files)

    // Flatten: files → properties → units into a single reviewable list
    const units = []
    for (const result of results) {
      for (const property of result.properties) {
        for (const unit of property.units ?? []) {
          units.push({
            batch_id: batchId,
            source_file: result.sourceFile,
            property_address: property.property_address ?? null,
            year_built: property.year_built ?? null,
            construction_type: property.construction_type ?? null,
            unit_number: unit.unit_number ?? null,
            unit_type: unit.unit_type ?? null,
            beds: unit.beds ?? null,
            baths: unit.baths ?? null,
            sqft: unit.sqft ?? null,
            lease_rate: unit.lease_rate ?? null,
            move_in: unit.move_in ?? null,
            move_out: unit.move_out ?? null,
            lease_executed: unit.lease_executed ?? null,
            flagged: unit.flagged ?? false,
          })
        }
      }
    }

    console.log(`[Comparables] Extracted ${units.length} units across ${req.files.length} file(s)`)
    res.json({ batchId, units, count: units.length })
  } catch (err) {
    console.error('[Comparables] Extraction error:', err.message)
    res.status(500).json({ error: err.message || 'Extraction failed' })
  }
})

// POST /api/comparables/save
// User confirmed review — persist units to Supabase
router.post('/save', async (req, res) => {
  try {
    const { batchId, units } = req.body
    if (!batchId || !Array.isArray(units) || units.length === 0) {
      return res.status(400).json({ error: 'batchId and units are required' })
    }

    const { data, error } = await getSupabase()
      .from('rent_comparables')
      .insert(units)
      .select()

    if (error) throw new Error(error.message)
    console.log(`[Comparables] Saved ${data.length} units for batch ${batchId}`)
    res.json({ saved: data.length })
  } catch (err) {
    console.error('[Comparables] Save error:', err.message)
    res.status(500).json({ error: err.message || 'Save failed' })
  }
})

// GET /api/comparables
// Fetch all historical units, ordered newest first
router.get('/', async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('rent_comparables')
      .select('*')
      .order('uploaded_at', { ascending: false })

    if (error) throw new Error(error.message)
    res.json(data)
  } catch (err) {
    console.error('[Comparables] Fetch error:', err.message)
    res.status(500).json({ error: err.message || 'Fetch failed' })
  }
})

// POST /api/comparables/deduplicate
// Keep newest batch per source_file, delete all older duplicates
router.post('/deduplicate', async (req, res) => {
  try {
    const { data, error } = await getSupabase()
      .from('rent_comparables')
      .select('batch_id, source_file, uploaded_at')
      .order('uploaded_at', { ascending: false })

    if (error) throw new Error(error.message)

    // First occurrence per source_file is the newest (DESC order) — mark the rest for deletion
    const keeper = new Map()
    const toDelete = new Set()
    for (const row of data) {
      if (!keeper.has(row.source_file)) {
        keeper.set(row.source_file, row.batch_id)
      } else if (keeper.get(row.source_file) !== row.batch_id) {
        toDelete.add(row.batch_id)
      }
    }

    if (toDelete.size === 0) return res.json({ removed_batches: 0, removed_units: 0 })

    let removedUnits = 0
    for (const batchId of toDelete) {
      const { count, error: delErr } = await getSupabase()
        .from('rent_comparables')
        .delete({ count: 'exact' })
        .eq('batch_id', batchId)
      if (delErr) throw new Error(delErr.message)
      removedUnits += count ?? 0
    }

    console.log(`[Comparables] Deduplication: removed ${toDelete.size} batches, ${removedUnits} units`)
    res.json({ removed_batches: toDelete.size, removed_units: removedUnits })
  } catch (err) {
    console.error('[Comparables] Deduplicate error:', err.message)
    res.status(500).json({ error: err.message || 'Deduplication failed' })
  }
})

// PATCH /api/comparables/batch/:batchId/address
// Rename property_address for every unit in a batch
router.patch('/batch/:batchId/address', async (req, res) => {
  try {
    const { batchId } = req.params
    const { address } = req.body
    if (!address?.trim()) return res.status(400).json({ error: 'address is required' })

    const { data, error } = await getSupabase()
      .from('rent_comparables')
      .update({ property_address: address.trim() })
      .eq('batch_id', batchId)
      .select()

    if (error) throw new Error(error.message)
    console.log(`[Comparables] Renamed batch ${batchId} → "${address.trim()}" (${data.length} units)`)
    res.json({ updated: data.length })
  } catch (err) {
    console.error('[Comparables] Rename error:', err.message)
    res.status(500).json({ error: err.message || 'Rename failed' })
  }
})

// PATCH /api/comparables/:id
// Update a single unit row
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const allowed = ['property_address', 'year_built', 'construction_type', 'unit_number', 'unit_type', 'beds', 'baths', 'sqft', 'lease_rate', 'move_in', 'move_out', 'lease_executed', 'flagged']
    const updates = {}
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key]
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' })

    const { data, error } = await getSupabase()
      .from('rent_comparables')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw new Error(error.message)
    res.json(data)
  } catch (err) {
    console.error('[Comparables] Update error:', err.message)
    res.status(500).json({ error: err.message || 'Update failed' })
  }
})

// DELETE /api/comparables/batch/:batchId
// Remove all units from a single upload
router.delete('/batch/:batchId', async (req, res) => {
  try {
    const { batchId } = req.params
    const { error, count } = await getSupabase()
      .from('rent_comparables')
      .delete({ count: 'exact' })
      .eq('batch_id', batchId)

    if (error) throw new Error(error.message)
    console.log(`[Comparables] Deleted ${count} units for batch ${batchId}`)
    res.json({ deleted: count })
  } catch (err) {
    console.error('[Comparables] Delete error:', err.message)
    res.status(500).json({ error: err.message || 'Delete failed' })
  }
})

export default router

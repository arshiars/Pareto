import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'

const router = Router()

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// GET /api/comparables
// Returns all units joined with their property data, flat for the frontend
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabase()
    const { data: units, error } = await supabase
      .from('unit')
      .select('*, property:property_id(id, property_address, property_type)')
      .order('uploaded_at', { ascending: false })

    if (error) throw new Error(error.message)

    const flat = units.map((u) => ({
      id: u.id,
      property_id: u.property_id,
      property_address: u.property?.property_address ?? null,
      property_type: u.property?.property_type ?? null,
      unit_number: u.unit_number,
      unit_type: u.unit_type,
      beds: u.beds,
      baths: u.baths,
      sqft: u.sqft,
      lease_rate: u.lease_rate,
      move_in: u.move_in,
      move_out: u.move_out,
      source_file: u.source_file,
      uploaded_at: u.uploaded_at,
    }))

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
// Returns a single property with all its units
router.get('/property/:id', async (req, res) => {
  try {
    const { id } = req.params
    const supabase = getSupabase()

    const [propRes, unitsRes] = await Promise.all([
      supabase.from('property').select('*').eq('id', id).single(),
      supabase.from('unit').select('*').eq('property_id', id).order('unit_number'),
    ])

    if (propRes.error) throw new Error(propRes.error.message)
    res.json({ property: propRes.data, units: unitsRes.data ?? [] })
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

export default router

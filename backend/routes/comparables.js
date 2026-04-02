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
        .select('*, property:property_id(id, property_address, property_type)')
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

    const flat = unitsRes.data.map((u) => ({
      id: u.id,
      property_id: u.property_id,
      property_address: u.property?.property_address ?? null,
      property_type: u.property?.property_type ?? null,
      preview_image_url: previewUrls.get(u.property_id) ?? null,
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

export default router

// Fetches Google Street View photos for the dummy properties, uploads to S3,
// and links them in Supabase. Falls back to the bundled illustrations when
// Street View has no imagery for an address.
// Run: cd backend && node seeds/seed_images.js

import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })
dotenv.config({ path: join(__dirname, '..', '..', 'frontend', '.env') }) // for the Maps key

const GOOGLE_KEY = process.env.GOOGLE_MAPS_KEY || process.env.VITE_GOOGLE_MAPS_KEY

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_S3_BUCKET']
const missing = required.filter((k) => !process.env[k])
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(', ')} — check backend/.env`)
  process.exit(1)
}
if (!GOOGLE_KEY) console.warn('No Google Maps key found — all images will use the bundled illustrations.')

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function streetViewPhoto(address) {
  if (!GOOGLE_KEY) return null
  const loc = encodeURIComponent(address)
  const metaRes = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${loc}&key=${GOOGLE_KEY}`)
  const meta = await metaRes.json()
  if (meta.status === 'REQUEST_DENIED') {
    console.warn(`\nStreet View denied (${meta.error_message || 'key restriction?'}) — enable "Street View Static API" for this key, or unrestrict it.`)
    return null
  }
  if (meta.status !== 'OK') return null
  const imgRes = await fetch(`https://maps.googleapis.com/maps/api/streetview?size=800x600&location=${loc}&fov=75&pitch=5&key=${GOOGLE_KEY}`)
  if (!imgRes.ok) return null
  return Buffer.from(await imgRes.arrayBuffer())
}

const { data: props, error: propErr } = await supabase
  .from('property')
  .select('id, property_address')
  .eq('source_file', 'dummy-seed.sql')
if (propErr) { console.error(propErr.message); process.exit(1) }
console.log(`${props.length} dummy properties found`)

const { error: delError } = await supabase.from('property_image').delete().like('s3_key', 'dummy/%')
if (delError) console.warn(`Cleanup warning: ${delError.message}`)

let street = 0, drawn = 0, failed = 0
for (const p of props) {
  try {
    let body = await streetViewPhoto(p.property_address)
    let src = 'streetview'
    if (!body) {
      const fallback = join(__dirname, 'images', `${p.id}.jpg`)
      if (!existsSync(fallback)) throw new Error('no street view and no fallback image')
      body = readFileSync(fallback)
      src = 'illustration'
    }
    const s3Key = `dummy/${p.id}.jpg`
    await s3.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET, Key: s3Key, Body: body, ContentType: 'image/jpeg',
    }))
    const { error } = await supabase.from('property_image').insert({
      property_id: p.id, s3_key: s3Key, filename: `${p.id}.jpg`, is_preview: true,
    })
    if (error) throw new Error(error.message)
    src === 'streetview' ? street++ : drawn++
    process.stdout.write(src === 'streetview' ? 'S' : 'i')
  } catch (err) {
    failed++
    console.error(`\nFailed for ${p.property_address}: ${err.message}`)
  }
}
console.log(`\nDone: ${street} street view, ${drawn} illustrations, ${failed} failed.`)

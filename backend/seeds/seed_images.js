// Uploads dummy property preview images to S3 and links them in Supabase.
// Prereqs: 1) run dummy_toronto_comparables.sql in Supabase first
//          2) backend/.env exists with your usual backend env vars
// Run:     cd backend && node seeds/seed_images.js

import { readdirSync, readFileSync } from 'fs'
import { dirname, join, basename } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_S3_BUCKET']
const missing = required.filter((k) => !process.env[k])
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(', ')}\nCopy your backend env file to backend/.env and retry.`)
  process.exit(1)
}

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const dir = join(__dirname, 'images')
const files = readdirSync(dir).filter((f) => f.endsWith('.jpg'))
console.log(`${files.length} images to upload`)

// Clear any previous dummy preview rows so reruns are safe
const { error: delError } = await supabase.from('property_image').delete().like('s3_key', 'dummy/%')
if (delError) console.warn(`Cleanup warning: ${delError.message}`)

let ok = 0
for (const f of files) {
  const propertyId = basename(f, '.jpg')
  const s3Key = `dummy/${f}`
  try {
    await s3.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: s3Key,
      Body: readFileSync(join(dir, f)),
      ContentType: 'image/jpeg',
    }))
    const { error } = await supabase.from('property_image').insert({
      property_id: propertyId,
      s3_key: s3Key,
      filename: f,
      is_preview: true,
    })
    if (error) throw new Error(error.message)
    ok++
    process.stdout.write('.')
  } catch (err) {
    console.error(`\nFailed for ${propertyId}: ${err.message}`)
  }
}
console.log(`\nDone: ${ok}/${files.length} images uploaded and linked.`)
if (ok < files.length) console.log('Foreign-key failures usually mean the SQL seed was not run first.')

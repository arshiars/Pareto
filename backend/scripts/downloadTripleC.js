import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../.env') })

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

const BUCKET = process.env.AWS_S3_BUCKET

const list = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'uploads/triple-c/' }))
const files = (list.Contents ?? []).filter(o => o.Key.endsWith('.pdf'))

if (files.length === 0) {
  console.log('No PDFs found under uploads/triple-c/')
  process.exit(1)
}

for (const obj of files) {
  console.log(`Downloading: ${obj.Key}`)
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: obj.Key }))
  const chunks = []
  for await (const chunk of res.Body) chunks.push(chunk)
  const buffer = Buffer.concat(chunks)

  const localName = obj.Key.replace('uploads/triple-c/', '').replace(/^[\d]+_/, '')
  const outPath = join(__dirname, localName)
  writeFileSync(outPath, buffer)
  console.log(`Saved to: ${outPath}`)
}

import { Router } from 'express'
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const router = Router()

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

// POST /api/pipeline/presign-batch
// Body: { address, docType: 'appraisal'|'rentroll', files: [{ fileName }] }
// Returns presigned PUT URLs organized under uploads/{address}/{docType}/{fileName}
router.post('/presign-batch', async (req, res) => {
  try {
    const { address, docType, files } = req.body

    if (!address?.trim()) return res.status(400).json({ error: 'address is required' })
    if (!docType || !['appraisal', 'rentroll'].includes(docType)) {
      return res.status(400).json({ error: 'docType must be "appraisal" or "rentroll"' })
    }
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files array is required' })
    }

    const s3 = getS3()
    const encodedAddress = encodeURIComponent(address.trim())
    const results = []

    for (const { fileName } of files) {
      const key = `uploads/${encodedAddress}/${docType}/${fileName}`
      const command = new PutObjectCommand({
        Bucket: BUCKET(),
        Key: key,
        ContentType: 'application/pdf',
      })
      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 600 })
      results.push({ fileName, uploadUrl, key })
    }

    res.json({ uploads: results })
  } catch (err) {
    console.error('[Pipeline/presign-batch] Error:', err.message)
    res.status(500).json({ error: err.message || 'Failed to generate presigned URLs' })
  }
})

// GET /api/pipeline/status
router.get('/status', async (req, res) => {
  try {
    const s3 = getS3()
    const [uploads, processing] = await Promise.all([
      s3.send(new ListObjectsV2Command({ Bucket: BUCKET(), Prefix: 'uploads/' })),
      s3.send(new ListObjectsV2Command({ Bucket: BUCKET(), Prefix: 'processing/' })),
    ])

    const pending = (uploads.Contents ?? [])
      .filter((obj) => obj.Key.endsWith('.pdf'))
      .map((obj) => ({ key: obj.Key, size: obj.Size, uploaded: obj.LastModified }))

    const inProgress = (processing.Contents ?? [])
      .filter((obj) => obj.Key.endsWith('.pdf') || obj.Key.endsWith('.json') || obj.Key.endsWith('.txt'))
      .map((obj) => ({ key: obj.Key, size: obj.Size, modified: obj.LastModified }))

    res.json({ pending, inProgress })
  } catch (err) {
    console.error('[Pipeline/status] Error:', err.message)
    res.status(500).json({ error: err.message || 'Failed to fetch status' })
  }
})

export default router

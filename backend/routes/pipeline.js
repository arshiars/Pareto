import { Router } from 'express'
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
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
    const [uploads, processing, retries, deadLetters] = await Promise.all([
      s3.send(new ListObjectsV2Command({ Bucket: BUCKET(), Prefix: 'uploads/' })),
      s3.send(new ListObjectsV2Command({ Bucket: BUCKET(), Prefix: 'processing/' })),
      s3.send(new ListObjectsV2Command({ Bucket: BUCKET(), Prefix: 'retries/' })),
      s3.send(new ListObjectsV2Command({ Bucket: BUCKET(), Prefix: 'dead-letter/' })),
    ])

    const pending = (uploads.Contents ?? [])
      .filter((obj) => obj.Key.endsWith('.pdf'))
      .map((obj) => ({ key: obj.Key, size: obj.Size, uploaded: obj.LastModified }))

    const inProgress = (processing.Contents ?? [])
      .filter((obj) => obj.Key.endsWith('.json') && !obj.Key.endsWith('lock.json'))
      .map((obj) => ({ key: obj.Key, size: obj.Size, modified: obj.LastModified }))

    const retrying = (retries.Contents ?? [])
      .filter((obj) => obj.Key.endsWith('.json'))
      .map((obj) => ({ key: obj.Key, size: obj.Size, modified: obj.LastModified }))

    const failed = (deadLetters.Contents ?? [])
      .map((obj) => ({ key: obj.Key, size: obj.Size, modified: obj.LastModified }))

    res.json({ pending, inProgress, retrying, failed })
  } catch (err) {
    console.error('[Pipeline/status] Error:', err.message)
    res.status(500).json({ error: err.message || 'Failed to fetch status' })
  }
})

// GET /api/pipeline/dead-letter/:address
// Returns error reports for a dead-lettered property
router.get('/dead-letter/:address', async (req, res) => {
  try {
    const s3 = getS3()
    const prefix = `dead-letter/${encodeURIComponent(req.params.address)}/`
    const listing = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET(), Prefix: prefix }))
    const reports = []

    for (const obj of (listing.Contents ?? [])) {
      if (!obj.Key.endsWith('_error_report.json')) continue
      const getRes = await s3.send(new GetObjectCommand({ Bucket: BUCKET(), Key: obj.Key }))
      const chunks = []
      for await (const chunk of getRes.Body) chunks.push(chunk)
      reports.push(JSON.parse(Buffer.concat(chunks).toString('utf-8')))
    }

    res.json({ address: req.params.address, reports })
  } catch (err) {
    console.error('[Pipeline/dead-letter] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/pipeline/dead-letter/:address/retry
// Moves a dead-lettered PDF back to uploads/ for reprocessing
// Body: { fileName, docType }
router.post('/dead-letter/:address/retry', async (req, res) => {
  try {
    const { fileName, docType } = req.body
    if (!fileName || !docType) return res.status(400).json({ error: 'fileName and docType required' })

    const s3 = getS3()
    const encodedAddress = encodeURIComponent(req.params.address)
    const deadKey = `dead-letter/${encodedAddress}/${docType}/${fileName}`
    const uploadKey = `uploads/${encodedAddress}/${docType}/${fileName}`

    // Copy PDF back to uploads/
    await s3.send(new CopyObjectCommand({
      Bucket: BUCKET(),
      CopySource: `${BUCKET()}/${deadKey}`,
      Key: uploadKey,
    }))

    // Clean up dead-letter files for this PDF
    const prefix = `dead-letter/${encodedAddress}/${docType}/`
    const listing = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET(), Prefix: prefix }))
    const baseName = fileName.replace('.pdf', '')
    for (const obj of (listing.Contents ?? [])) {
      if (obj.Key.includes(baseName)) {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: obj.Key }))
      }
    }

    res.json({ message: `${fileName} moved back to uploads for reprocessing`, key: uploadKey })
  } catch (err) {
    console.error('[Pipeline/dead-letter/retry] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

export default router

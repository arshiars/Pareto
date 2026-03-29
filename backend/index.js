import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import crypto from 'crypto'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import analysisRouter from './routes/analysis.js'
import ippRouter from './routes/ipp.js'
import comparablesRouter from './routes/comparables.js'
import pipelineRouter from './routes/pipeline.js'
import tripleCRouter from './routes/tripleC.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '.env') })

const app = express()
const PORT = process.env.PORT || 3001
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function signToken(payload) {
  const secret = process.env.GATEWAY_SECRET
  const data = JSON.stringify(payload)
  const signature = crypto.createHmac('sha256', secret).update(data).digest('hex')
  return Buffer.from(JSON.stringify({ data, signature })).toString('base64url')
}

function verifyToken(token) {
  try {
    const secret = process.env.GATEWAY_SECRET
    const { data, signature } = JSON.parse(Buffer.from(token, 'base64url').toString())
    const expected = crypto.createHmac('sha256', secret).update(data).digest('hex')
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
    const payload = JSON.parse(data)
    if (payload.exp && Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

const isProduction = process.env.NODE_ENV === 'production'

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  exposedHeaders: ['X-Population-Report'],
}))
app.use(cookieParser())
app.use(express.json({ limit: '10mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Extract token from cookie OR Authorization header (Bearer token)
function extractToken(req) {
  const authHeader = req.headers['authorization']
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)
  return req.cookies?.gateway_token || null
}

app.get('/api/auth/check', (req, res) => {
  if (!process.env.GATEWAY_PASSWORD) {
    return res.json({ authenticated: true })
  }
  const token = extractToken(req)
  if (token && verifyToken(token)) {
    return res.json({ authenticated: true })
  }
  return res.json({ authenticated: false })
})

app.post('/api/auth/verify', (req, res) => {
  const { password } = req.body
  const gatewayPassword = process.env.GATEWAY_PASSWORD
  if (!gatewayPassword) {
    return res.json({ success: true })
  }
  if (password !== gatewayPassword) {
    return res.status(401).json({ error: 'Invalid password' })
  }
  // Password correct — issue a signed token (7 day expiry)
  const token = signToken({ granted: true, exp: Date.now() + SEVEN_DAYS_MS })
  res.cookie('gateway_token', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: SEVEN_DAYS_MS,
  })
  // Also return token in body so frontend can store in localStorage as fallback
  return res.json({ success: true, token })
})

// Protect all /api/analysis routes — accepts cookie or Authorization header
app.use('/api/analysis', (req, res, next) => {
  if (!process.env.GATEWAY_PASSWORD) return next()

  const token = extractToken(req)
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const payload = verifyToken(token)
  if (!payload || !payload.granted) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  return next()
})

app.use('/api/analysis', analysisRouter)

// Protect /api/ipp routes — accepts cookie or Authorization header
app.use('/api/ipp', (req, res, next) => {
  if (!process.env.GATEWAY_PASSWORD) return next()
  const token = extractToken(req)
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const payload = verifyToken(token)
  if (!payload || !payload.granted) return res.status(401).json({ error: 'Unauthorized' })
  return next()
})
app.use('/api/ipp', ippRouter)

// Protect /api/comparables routes
app.use('/api/comparables', (req, res, next) => {
  if (!process.env.GATEWAY_PASSWORD) return next()
  const token = extractToken(req)
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const payload = verifyToken(token)
  if (!payload || !payload.granted) return res.status(401).json({ error: 'Unauthorized' })
  return next()
})
app.use('/api/comparables', comparablesRouter)

// Protect /api/pipeline routes
app.use('/api/pipeline', (req, res, next) => {
  if (!process.env.GATEWAY_PASSWORD) return next()
  const token = extractToken(req)
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const payload = verifyToken(token)
  if (!payload || !payload.granted) return res.status(401).json({ error: 'Unauthorized' })
  return next()
})
app.use('/api/pipeline', pipelineRouter)

// Protect /api/triple-c routes
app.use('/api/triple-c', (req, res, next) => {
  if (!process.env.GATEWAY_PASSWORD) return next()
  const token = extractToken(req)
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const payload = verifyToken(token)
  if (!payload || !payload.granted) return res.status(401).json({ error: 'Unauthorized' })
  return next()
})
app.use('/api/triple-c', tripleCRouter)

// Global JSON error handler — must be last, must have 4 args
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

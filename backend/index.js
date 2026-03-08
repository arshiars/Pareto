import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import crypto from 'crypto'
import dotenv from 'dotenv'
import analysisRouter from './routes/analysis.js'

dotenv.config()

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
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/auth/check', (req, res) => {
  if (!process.env.GATEWAY_PASSWORD) {
    return res.json({ authenticated: true })
  }
  const token = req.cookies?.gateway_token
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
  return res.json({ success: true })
})

// Protect all /api/analysis routes with signed cookie token
app.use('/api/analysis', (req, res, next) => {
  if (!process.env.GATEWAY_PASSWORD) return next()

  const token = req.cookies?.gateway_token
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const payload = verifyToken(token)
  if (!payload || !payload.granted) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  return next()
})

app.use('/api/analysis', analysisRouter)

// Global JSON error handler — must be last, must have 4 args
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

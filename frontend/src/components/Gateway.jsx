import { useState } from 'react'
import { verifyPassword } from '../services/api.js'
import Button from './ui/Button.jsx'

export default function Gateway({ onAuthenticated }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await verifyPassword(password)
      onAuthenticated()
    } catch {
      setError('Invalid password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="bg-white border border-border rounded-[2px] p-8">
          <div className="mb-6 flex items-center gap-4">
            <img src="/kingsett-logo.png" alt="KingSett Capital" className="h-14 w-auto" />
            <div>
              <h1 className="text-primary text-lg font-bold tracking-tight">Fundus</h1>
              <p className="text-[#777777] text-xs mt-0.5 tracking-wide uppercase">Real Estate Underwriting</p>
            </div>
          </div>
          <form onSubmit={handleSubmit}>
            <label className="block text-xs font-medium text-[#555555] uppercase tracking-widest mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              className="w-full px-3 py-2 text-sm border border-border rounded-[2px] bg-white text-primary placeholder:text-[#999999] focus:outline-none focus:border-primary transition-colors"
            />
            {error && (
              <p className="text-error text-xs mt-2">{error}</p>
            )}
            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full mt-4"
              disabled={loading || !password}
            >
              {loading ? 'Verifying...' : 'Enter'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

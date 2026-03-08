import { useState, useEffect } from 'react'
import Button from './ui/Button.jsx'
import Spinner from './ui/Spinner.jsx'
import { fetchPptSuggestions } from '../services/api.js'

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button
      onClick={handleCopy}
      className="text-[10px] uppercase tracking-widest text-gray-400 hover:text-primary transition-colors cursor-pointer"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function Section({ title, children, copyText }) {
  return (
    <div className="border border-border rounded-[2px] bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface">
        <h4 className="text-xs font-semibold text-primary uppercase tracking-widest">{title}</h4>
        <CopyButton text={copyText} />
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}

function BulletList({ bullets }) {
  return (
    <ul className="space-y-1.5">
      {bullets.map((b, i) => (
        <li key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
          <span className="text-accent mt-0.5 flex-shrink-0">&bull;</span>
          <span>{b}</span>
        </li>
      ))}
    </ul>
  )
}

function bulletsToText(bullets) {
  return bullets.map((b) => `• ${b}`).join('\n')
}

function marketToText(bullets) {
  return bullets
    .map((b) => {
      let text = `• ${b.text}`
      if (b.subBullets?.length) {
        text += '\n' + b.subBullets.map((sb) => `    • ${sb}`).join('\n')
      }
      return text
    })
    .join('\n')
}

function risksToText(items) {
  return items.map((r) => `${r.title}: ${r.description}`).join('\n\n')
}

export default function PptSuggestionsModal({ extractedData, cachedData, onDataLoaded, onClose }) {
  const [data, setData] = useState(cachedData || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchPptSuggestions(extractedData)
      setData(result)
      onDataLoaded(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Auto-fetch only if no cached data
  useEffect(() => {
    if (!cachedData) handleGenerate()
  }, [])

  function handleCopyAll() {
    if (!data) return
    const sections = [
      `OPPORTUNITY\n${bulletsToText(data.opportunity.bullets)}`,
      `PROPERTY DESCRIPTION\n${bulletsToText(data.propertyDescription.bullets)}`,
      `LOCATION\n${data.location.address}\n${data.location.googleMapsUrl}`,
      `SPONSOR / GUARANTEE\n${bulletsToText(data.sponsorGuarantee.bullets)}`,
      `MARKET\n${marketToText(data.market.bullets)}`,
      `KEY RISKS & MITIGANTS\n${risksToText(data.keyRisksAndMitigants.items)}`,
    ]
    navigator.clipboard.writeText(sections.join('\n\n'))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background rounded-[2px] border border-border shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-white flex-shrink-0">
          <div>
            <h3 className="text-lg font-bold text-primary">PowerPoint Suggestions</h3>
            <p className="text-xs text-gray-400 mt-0.5">AI-generated content for your investment memo slides</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-primary transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {loading && (
            <div className="flex flex-col items-center gap-4 py-16">
              <Spinner size="lg" />
              <div className="text-center">
                <p className="font-semibold text-primary">Generating suggestions...</p>
                <p className="text-sm text-gray-500 mt-1">Analyzing property data for slide content.</p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-error/10 border border-error/20 rounded-xl">
              <p className="font-semibold text-error">Generation failed</p>
              <p className="text-sm text-gray-600 mt-0.5">{error}</p>
              <Button variant="primary" size="sm" className="mt-3" onClick={handleGenerate}>
                Retry
              </Button>
            </div>
          )}

          {data && !loading && (
            <>
              <Section title="Opportunity" copyText={bulletsToText(data.opportunity.bullets)}>
                <BulletList bullets={data.opportunity.bullets} />
              </Section>

              <Section title="Property Description" copyText={bulletsToText(data.propertyDescription.bullets)}>
                <BulletList bullets={data.propertyDescription.bullets} />
              </Section>

              <Section
                title="Location"
                copyText={`${data.location.address}\n${data.location.googleMapsUrl}`}
              >
                <a
                  href={data.location.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent underline hover:opacity-80"
                >
                  {data.location.address}
                </a>
              </Section>

              <Section title="Sponsor / Guarantee" copyText={bulletsToText(data.sponsorGuarantee.bullets)}>
                <BulletList bullets={data.sponsorGuarantee.bullets} />
              </Section>

              <Section title="Market" copyText={marketToText(data.market.bullets)}>
                <ul className="space-y-2">
                  {data.market.bullets.map((b, i) => (
                    <li key={i}>
                      <div className="flex gap-2 text-sm text-gray-700 leading-relaxed">
                        <span className="text-accent mt-0.5 flex-shrink-0">&bull;</span>
                        <span>{b.text}</span>
                      </div>
                      {b.subBullets?.length > 0 && (
                        <ul className="ml-6 mt-1 space-y-1">
                          {b.subBullets.map((sb, j) => (
                            <li key={j} className="flex gap-2 text-sm text-gray-500 leading-relaxed">
                              <span className="text-gray-300 mt-0.5 flex-shrink-0">&bull;</span>
                              <span>{sb}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>

              <Section title="Key Risks & Mitigants" copyText={risksToText(data.keyRisksAndMitigants.items)}>
                <div className="space-y-3">
                  {data.keyRisksAndMitigants.items.map((item, i) => (
                    <div key={i} className="text-sm text-gray-700 leading-relaxed">
                      <span className="font-semibold text-primary">{item.title}:</span>{' '}
                      {item.description}
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

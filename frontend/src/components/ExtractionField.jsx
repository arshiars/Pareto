import { useState } from 'react'
import Badge from './ui/Badge.jsx'
import Button from './ui/Button.jsx'
import Input from './ui/Input.jsx'
import Spinner from './ui/Spinner.jsx'

/**
 * Props:
 * - label: string
 * - fieldKey: string (used in userOverrides)
 * - found: boolean
 * - value: number | null (extracted)
 * - source: string
 * - prefix: string (e.g. "$")
 * - suffix: string (e.g. "/yr")
 * - overrideValue: number | null
 * - onOverride: (key, value) => void
 * - onResearch: (fieldKey) => Promise<{estimatedValue, reasoning, source}>
 */
export default function ExtractionField({
  label,
  fieldKey,
  found,
  value,
  source,
  prefix = '$',
  suffix,
  overrideValue,
  onOverride,
  onResearch,
}) {
  const [mode, setMode] = useState(null) // null | 'manual' | 'researching' | 'assumed'
  const [manualInput, setManualInput] = useState('')
  const [assumedResult, setAssumedResult] = useState(null)
  const [researchError, setResearchError] = useState(null)

  const hasOverride = overrideValue != null
  const displayValue = hasOverride ? overrideValue : value

  function handleManualSave() {
    const num = parseFloat(manualInput.replace(/,/g, ''))
    if (!isNaN(num)) {
      onOverride(fieldKey, num)
      setMode(null)
    }
  }

  async function handleResearch() {
    setMode('researching')
    setResearchError(null)
    try {
      const result = await onResearch(fieldKey)
      setAssumedResult(result)
      onOverride(fieldKey, result.estimatedValue)
      setMode('assumed')
    } catch (err) {
      setResearchError(err.message)
      setMode(null)
    }
  }

  function handleReset() {
    onOverride(fieldKey, undefined)
    setMode(null)
    setManualInput('')
    setAssumedResult(null)
  }

  const badge = hasOverride
    ? mode === 'assumed'
      ? 'assumed'
      : 'manual'
    : found
    ? 'found'
    : 'missing'

  return (
    <div className="flex flex-col gap-2 py-3 border-b border-border/50 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-gray-800">{label}</span>
            <Badge variant={badge} />
          </div>
          {source && (
            <p className="text-xs text-gray-400">{hasOverride && assumedResult ? assumedResult.source : source}</p>
          )}
          {assumedResult && mode === 'assumed' && (
            <p className="text-xs text-gray-500 mt-1 italic">"{assumedResult.reasoning}"</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {displayValue != null ? (
            <span className="text-sm font-semibold text-gray-900 tabular-nums">
              {prefix}{Number(displayValue).toLocaleString('en-CA')}{suffix || ''}
            </span>
          ) : (
            <span className="text-sm text-gray-400">—</span>
          )}

          {!hasOverride && !found && mode === null && (
            <div className="flex gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => setMode('manual')}>
                Enter Manually
              </Button>
              <Button variant="ghost" size="sm" onClick={handleResearch}>
                AI Assume
              </Button>
            </div>
          )}

          {hasOverride && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Reset
            </Button>
          )}
        </div>
      </div>

      {mode === 'manual' && (
        <div className="flex items-end gap-2 pl-2">
          <Input
            prefix={prefix}
            suffix={suffix}
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Enter amount"
            className="w-48"
          />
          <Button variant="primary" size="sm" onClick={handleManualSave}>
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
            Cancel
          </Button>
        </div>
      )}

      {mode === 'researching' && (
        <div className="flex items-center gap-2 pl-2 text-sm text-gray-500">
          <Spinner size="sm" />
          <span>AI is estimating...</span>
        </div>
      )}

      {researchError && (
        <p className="text-xs text-error pl-2">{researchError}</p>
      )}
    </div>
  )
}

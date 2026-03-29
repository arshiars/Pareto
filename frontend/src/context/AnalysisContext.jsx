import { createContext, useContext, useReducer, useEffect } from 'react'
import { extractDocuments, researchField } from '../services/api.js'

const AnalysisContext = createContext(null)

const TRANSIENT_STEPS = new Set(['processing', 'completing'])

const initialState = {
  step: 'upload', // upload | processing | completing | review | excel
  files: [],
  extractedData: null,
  userOverrides: {},
  defaults: {
    vacancyRate: 0.03,
    managementFeeRate: 0.0425,
    otherDeductionsRate: 0.01,
    replacementReservePerAppliance: 180,
    capRate: null,
  },
  error: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_FILES':
      return { ...state, files: action.files, error: null }
    case 'SET_STEP':
      return { ...state, step: action.step }
    case 'SET_EXTRACTED': {
      const extractedVacancy = action.data?.propertyInfo?.vacancyRate
      const extractedCapRate = action.data?.analysis?.capRate
      const newDefaults = { ...state.defaults }
      if (extractedVacancy != null) newDefaults.vacancyRate = extractedVacancy
      if (extractedCapRate != null) newDefaults.capRate = extractedCapRate
      return {
        ...state,
        extractedData: action.data,
        step: 'review',
        defaults: newDefaults,
        error: null,
      }
    }
    case 'SET_OVERRIDE':
      return { ...state, userOverrides: { ...state.userOverrides, [action.key]: action.value } }
    case 'SET_DEFAULT':
      return { ...state, defaults: { ...state.defaults, [action.key]: action.value } }
    case 'SET_ERROR':
      return { ...state, error: action.error, step: 'upload' }
    case 'RESET':
      return { ...initialState }
    default:
      return state
  }
}

const CACHE_KEY = 'fundus_analysis_state'

function getHydratedState() {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached)
      // Don't restore transient or error states — fall back to upload
      if (TRANSIENT_STEPS.has(parsed.step) || parsed.error) {
        parsed.step = parsed.extractedData ? 'review' : 'upload'
        parsed.error = null
      }
      return { ...initialState, ...parsed }
    }
  } catch {}
  return initialState
}

export function AnalysisProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, getHydratedState)

  // Persist cacheable state (skip files — File objects aren't serializable)
  useEffect(() => {
    const { files, ...cacheable } = state
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cacheable))
  }, [state])

  async function analyze(files, labels = []) {
    dispatch({ type: 'SET_FILES', files })
    dispatch({ type: 'SET_STEP', step: 'processing' })
    try {
      const data = await extractDocuments(files, labels)
      // Brief 'completing' pause so the stage animation can show all-done before transition
      dispatch({ type: 'SET_STEP', step: 'completing' })
      await new Promise((resolve) => setTimeout(resolve, 900))
      dispatch({ type: 'SET_EXTRACTED', data })
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err.message })
    }
  }

  async function research(fieldName) {
    return researchField(fieldName, {
      propertyInfo: state.extractedData?.propertyInfo,
      unitBreakdown: state.extractedData?.unitBreakdown,
    })
  }

  function setOverride(key, value) { dispatch({ type: 'SET_OVERRIDE', key, value }) }
  function setDefault(key, value)  { dispatch({ type: 'SET_DEFAULT', key, value }) }
  function goToReview()            { dispatch({ type: 'SET_STEP', step: 'review' }) }
  function goToExcel()             { dispatch({ type: 'SET_STEP', step: 'excel' }) }
  function reset()                 { dispatch({ type: 'RESET' }); sessionStorage.removeItem(CACHE_KEY) }

  return (
    <AnalysisContext.Provider
      value={{ state, analyze, research, setOverride, setDefault, goToReview, goToExcel, reset }}
    >
      {children}
    </AnalysisContext.Provider>
  )
}

export function useAnalysis() {
  const ctx = useContext(AnalysisContext)
  if (!ctx) throw new Error('useAnalysis must be used within AnalysisProvider')
  return ctx
}

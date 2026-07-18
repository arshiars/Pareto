import { createContext, useContext, useReducer, useEffect } from 'react'
import { extractIppDocuments } from '../services/ippApi.js'

const IPPContext = createContext(null)

const TRANSIENT_STEPS = new Set(['processing', 'completing'])

const initialState = {
  step: 'upload', // upload | processing | completing | review
  files: [],
  extractedData: null,
  userOverrides: {}, // flat key → value, e.g. { 'propertyInfo.address': '123 Main St' }
  error: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_FILES':
      return { ...state, files: action.files, error: null }
    case 'SET_STEP':
      return { ...state, step: action.step }
    case 'SET_EXTRACTED':
      return { ...state, extractedData: action.data, step: 'review', error: null }
    case 'SET_TENANTS':
      return { ...state, extractedData: { ...state.extractedData, tenants: action.tenants } }
    case 'SET_OVERRIDE':
      return { ...state, userOverrides: { ...state.userOverrides, [action.key]: action.value } }
    case 'SET_ERROR':
      return { ...state, error: action.error, step: 'upload' }
    case 'RESET':
      return { ...initialState }
    default:
      return state
  }
}

const CACHE_KEY = 'pareto_ipp_state'

function getHydratedState() {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached)
      // Don't restore transient or error states
      if (TRANSIENT_STEPS.has(parsed.step) || parsed.error) {
        parsed.step = parsed.extractedData ? 'review' : 'upload'
        parsed.error = null
      }
      return { ...initialState, ...parsed }
    }
  } catch {}
  return initialState
}

export function IPPProvider({ children }) {
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
      const data = await extractIppDocuments(files, labels)
      dispatch({ type: 'SET_STEP', step: 'completing' })
      await new Promise((resolve) => setTimeout(resolve, 900))
      dispatch({ type: 'SET_EXTRACTED', data })
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err.message })
    }
  }

  function setOverride(key, value) { dispatch({ type: 'SET_OVERRIDE', key, value }) }
  function setTenants(tenants)     { dispatch({ type: 'SET_TENANTS', tenants }) }
  function reset()                 { dispatch({ type: 'RESET' }); sessionStorage.removeItem(CACHE_KEY) }

  return (
    <IPPContext.Provider value={{ state, analyze, setOverride, setTenants, reset }}>
      {children}
    </IPPContext.Provider>
  )
}

export function useIPP() {
  const ctx = useContext(IPPContext)
  if (!ctx) throw new Error('useIPP must be used within IPPProvider')
  return ctx
}

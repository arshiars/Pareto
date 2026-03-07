import { createContext, useContext, useReducer } from 'react'
import { extractDocuments, researchField } from '../services/api.js'

const AnalysisContext = createContext(null)

const initialState = {
  step: 'upload', // upload | processing | review | excel
  files: [],
  extractedData: null,
  userOverrides: {},
  defaults: {
    vacancyRate: 0.03,
    managementFeeRate: 0.0425,
    otherDeductionsRate: 0.01,
    replacementReservePerAppliance: 180,
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
      return {
        ...state,
        extractedData: action.data,
        step: 'review',
        defaults: extractedVacancy != null
          ? { ...state.defaults, vacancyRate: extractedVacancy }
          : state.defaults,
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

export function AnalysisProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  async function analyze(files, labels = []) {
    dispatch({ type: 'SET_FILES', files })
    dispatch({ type: 'SET_STEP', step: 'processing' })
    try {
      const data = await extractDocuments(files, labels)
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
  function reset()                 { dispatch({ type: 'RESET' }) }

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

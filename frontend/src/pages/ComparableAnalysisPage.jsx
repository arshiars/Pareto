import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'

export default function ComparableAnalysisPage() {
  const navigate = useNavigate()

  return (
    <Layout subtitle="Comparable Analysis" backTo="/">
      <div className="mb-10">
        <h2 className="text-2xl font-bold text-primary tracking-tight">Comparable Analysis</h2>
        <p className="text-[#777777] mt-1.5 text-sm">Select an analysis type to proceed</p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-2xl">
        <button
          onClick={() => navigate('/comparable-analysis/rent-comparables')}
          className="group flex flex-col items-start p-6 bg-white border border-border rounded-sm hover:border-primary hover:shadow-sm transition-all duration-150 text-left"
        >
          <div className="w-9 h-9 rounded-sm bg-surface flex items-center justify-center mb-4 group-hover:bg-primary/10 transition-colors">
            <svg className="w-4.5 h-4.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <h4 className="text-primary font-bold text-base mb-1.5">Rent Comparables</h4>
          <p className="text-[#777777] text-sm leading-relaxed flex-1">
            Analyze rental market data to establish market-rent benchmarks across comparable properties.
          </p>
          <div className="mt-4 flex items-center gap-1 text-accent text-xs font-semibold uppercase tracking-wider">
            Open
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      </div>
    </Layout>
  )
}

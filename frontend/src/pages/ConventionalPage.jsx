import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'

export default function ConventionalPage() {
  const navigate = useNavigate()

  return (
    <Layout subtitle="Conventional Underwriting" backTo="/">
      <div className="mb-10">
        <h2 className="text-2xl font-bold text-primary tracking-tight">Conventional</h2>
        <p className="text-[#777777] mt-1.5 text-sm">Select the property type to proceed</p>
      </div>

      <div className="grid grid-cols-1 gap-4 w-full max-w-sm">
        <button
          onClick={() => navigate('/conventional/ipp')}
          className="group flex items-center gap-5 p-6 bg-white border border-border rounded-sm hover:border-primary hover:shadow-sm transition-all duration-150 text-left"
        >
          <div className="w-10 h-10 rounded-sm bg-surface flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-primary font-bold text-base">Income Producing Property</h3>
            <p className="text-[#777777] text-xs mt-0.5">Multi-unit residential underwriting with financial data extraction</p>
          </div>
          <svg className="w-4 h-4 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </Layout>
  )
}

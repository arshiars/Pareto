import { useNavigate } from 'react-router-dom'

const categories = [
  {
    label: 'Mortgage Underwriting',
    description: 'End-to-end underwriting workflows',
    tools: [
      {
        id: 'cmhc',
        title: 'CMHC',
        description: 'CMHC-insured mortgage financing for multi-unit residential properties.',
        path: '/cmhc',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        ),
      },
      {
        id: 'conventional',
        title: 'Conventional',
        description: 'Underwriting analysis for conventional commercial real estate acquisitions and refinancing.',
        path: '/conventional',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        ),
      },
    ],
  },
  {
    label: 'Analytics & Research',
    description: 'Market data and benchmarking tools',
    tools: [
      {
        id: 'cmhc-database',
        title: 'CMHC Loan Database',
        description: 'Query and analyze approved CMHC mortgage loan records.',
        path: '/cmhc-database',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7c0 2 1 3 3 3h10c2 0 3-1 3-3M4 7c0-2 1-3 3-3h10c2 0 3 1 3 3" />
        ),
      },
      {
        id: 'comparable-analysis',
        title: 'Comparable Analysis',
        description: 'Analyze rental market comparables to establish benchmarks.',
        path: '/comparable-analysis',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        ),
      },
    ],
  },
  {
    label: 'Deal Tools',
    description: 'Document generation and cost analysis',
    tools: [
      {
        id: 'loi-drafter',
        title: 'LOI Drafter',
        description: 'Draft Letters of Intent for property acquisitions using AI.',
        path: '/loi-drafter',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        ),
      },
      {
        id: 'triple-c',
        title: 'Triple-C',
        description: 'QS report ingestion, cost benchmarking and proforma generation.',
        path: '/triple-c',
        icon: (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
        ),
      },
    ],
  },
]

export default function SelectionPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-white border-b border-border">
        <div className="max-w-5xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-primary text-lg font-bold tracking-tight">Pareto</h1>
              <p className="text-[#777777] text-xs mt-0.5 tracking-wide uppercase">Real Estate Underwriting</p>
            </div>
            <div className="h-6 w-px bg-border" />
            <span className="text-[#555555] text-xs tracking-widest uppercase font-medium">KingSett Capital</span>
          </div>
          <img src="/kingsett-logo.png" alt="KingSett Capital" className="h-14 w-auto" />
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-8 py-12">
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-primary tracking-tight">Select a Tool</h2>
          <p className="text-[#777777] mt-1.5 text-sm">Choose a program or tool to begin</p>
        </div>

        <div className="flex flex-col gap-10">
          {categories.map((category) => (
            <section key={category.label}>
              <div className="flex items-baseline gap-3 mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-[#555555]">
                  {category.label}
                </h3>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {category.tools.map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => navigate(tool.path)}
                    className="group flex flex-col items-start p-6 bg-white border border-border rounded-sm hover:border-primary hover:shadow-sm transition-all duration-150 text-left"
                  >
                    <div className="w-9 h-9 rounded-sm bg-surface flex items-center justify-center mb-4 group-hover:bg-primary/10 transition-colors flex-shrink-0">
                      <svg className="w-4.5 h-4.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
                        {tool.icon}
                      </svg>
                    </div>
                    <h4 className="text-primary font-bold text-base mb-1.5">{tool.title}</h4>
                    <p className="text-[#777777] text-sm leading-relaxed flex-1">{tool.description}</p>
                    <div className="mt-4 flex items-center gap-1 text-accent text-xs font-semibold uppercase tracking-wider">
                      Open
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}

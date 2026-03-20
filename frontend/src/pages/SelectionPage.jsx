export default function SelectionPage({ onSelect }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-white border-b border-border">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-primary text-lg font-bold tracking-tight">Fundus</h1>
              <p className="text-[#777777] text-xs mt-0.5 tracking-wide uppercase">Deal Processor</p>
            </div>
            <div className="h-6 w-px bg-border" />
            <span className="text-[#555555] text-xs tracking-widest uppercase font-medium">KingSett Capital</span>
          </div>
          <img src="/kingsett-logo.png" alt="KingSett Capital" className="h-14 w-auto" />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-8 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-primary tracking-tight">Select Deal Type</h2>
          <p className="text-[#777777] mt-3 text-sm">Choose the underwriting program to proceed</p>
        </div>

        <div className="grid grid-cols-2 gap-6 w-full max-w-2xl">
          <button
            onClick={() => onSelect('cmhc')}
            className="group flex flex-col items-start p-8 bg-white border-2 border-border rounded-sm hover:border-primary hover:shadow-md transition-all duration-150 text-left"
          >
            <div className="w-10 h-10 rounded-sm bg-surface flex items-center justify-center mb-5 group-hover:bg-primary/10 transition-colors">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-primary font-bold text-xl mb-2">CMHC</h3>
            <p className="text-[#777777] text-sm leading-relaxed">
              Canada Mortgage and Housing Corporation insured financing for multi-unit residential properties.
            </p>
            <div className="mt-6 flex items-center gap-1.5 text-accent text-xs font-semibold uppercase tracking-wider">
              Select
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>

          <button
            onClick={() => onSelect('conventional')}
            className="group flex flex-col items-start p-8 bg-white border-2 border-border rounded-sm hover:border-primary hover:shadow-md transition-all duration-150 text-left"
          >
            <div className="w-10 h-10 rounded-sm bg-surface flex items-center justify-center mb-5 group-hover:bg-primary/10 transition-colors">
              <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-primary font-bold text-xl mb-2">Conventional</h3>
            <p className="text-[#777777] text-sm leading-relaxed">
              Conventional financing analysis for commercial real estate acquisitions and refinancing.
            </p>
            <div className="mt-6 flex items-center gap-1.5 text-accent text-xs font-semibold uppercase tracking-wider">
              Select
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>

        <div className="mt-8 w-full max-w-2xl flex flex-col gap-3">
          <button
            onClick={() => onSelect('cmhc-database')}
            className="group w-full flex items-center justify-between px-6 py-4 bg-white border border-border rounded-sm hover:border-primary hover:shadow-sm transition-all duration-150"
          >
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-sm bg-surface flex items-center justify-center group-hover:bg-primary/10 transition-colors flex-shrink-0">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7c0 2 1 3 3 3h10c2 0 3-1 3-3M4 7c0-2 1-3 3-3h10c2 0 3 1 3 3" />
                </svg>
              </div>
              <div className="text-left">
                <span className="text-primary font-semibold text-sm">Approved CMHC Loan Database</span>
                <p className="text-[#777777] text-xs mt-0.5">View and query approved CMHC loan records</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-accent text-xs font-semibold uppercase tracking-wider">
              Open
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>

          <button
            onClick={() => onSelect('comparable-analysis')}
            className="group w-full flex items-center justify-between px-6 py-4 bg-white border border-border rounded-sm hover:border-primary hover:shadow-sm transition-all duration-150"
          >
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-sm bg-surface flex items-center justify-center group-hover:bg-primary/10 transition-colors flex-shrink-0">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="text-left">
                <span className="text-primary font-semibold text-sm">Comparable Analysis</span>
                <p className="text-[#777777] text-xs mt-0.5">Analyze and compare property metrics across deals</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-accent text-xs font-semibold uppercase tracking-wider">
              Open
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>
      </main>
    </div>
  )
}

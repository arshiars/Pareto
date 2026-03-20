export default function ComparableAnalysisPage({ onBack, onSelect }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-white border-b border-border">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-[#777777] hover:text-primary transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <div className="h-6 w-px bg-border" />
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
          <h2 className="text-3xl font-bold text-primary tracking-tight">Comparable Analysis</h2>
          <p className="text-[#777777] mt-3 text-sm">Select an analysis type to proceed</p>
        </div>

        <div className="w-full max-w-2xl">
          <button
            onClick={() => onSelect('rent-comparables')}
            className="group w-full flex items-center justify-between px-6 py-4 bg-white border border-border rounded-sm hover:border-primary hover:shadow-sm transition-all duration-150"
          >
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-sm bg-surface flex items-center justify-center group-hover:bg-primary/10 transition-colors flex-shrink-0">
                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <div className="text-left">
                <span className="text-primary font-semibold text-sm">Rent Comparables</span>
                <p className="text-[#777777] text-xs mt-0.5">Compare rental rates across similar properties</p>
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

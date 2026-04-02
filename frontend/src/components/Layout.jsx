import { useNavigate } from 'react-router-dom'

export default function Layout({ children, subtitle = 'CMHC Underwriting', backTo }) {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-border sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {backTo && (
              <>
                <button
                  onClick={() => navigate(backTo)}
                  className="flex items-center gap-1.5 text-[#777777] hover:text-primary transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
                <div className="h-6 w-px bg-border" />
              </>
            )}
            <div>
              <h1 className="text-primary text-lg font-bold tracking-tight">Fundus</h1>
              <p className="text-[#777777] text-xs mt-0.5 tracking-wide uppercase">{subtitle}</p>
            </div>
            <div className="h-6 w-px bg-border" />
            <span className="text-[#555555] text-xs tracking-widest uppercase font-medium">KingSett Capital</span>
          </div>
          <img src="/kingsett-logo.png" alt="KingSett Capital" className="h-14 w-auto" />
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-8 py-10">{children}</main>
    </div>
  )
}

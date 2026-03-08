export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-border sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-primary text-lg font-bold tracking-tight">Fundus</h1>
              <p className="text-[#777777] text-xs mt-0.5 tracking-wide uppercase">CMHC Underwriting</p>
            </div>
            <div className="h-6 w-px bg-border" />
            <span className="text-[#555555] text-xs tracking-widest uppercase font-medium">Deal Processor</span>
          </div>
          <img src="/kingsett-logo.png" alt="KingSett Capital" className="h-14 w-auto" />
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-8 py-10">{children}</main>
    </div>
  )
}

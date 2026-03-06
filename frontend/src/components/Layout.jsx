export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary shadow-md">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-white text-xl font-bold tracking-tight">Tamberg</h1>
            <p className="text-white/60 text-xs mt-0.5">CMHC Underwriting Tool</p>
          </div>
          <div className="h-8 w-px bg-white/20" />
          <span className="text-accent text-sm font-medium">CMHC Deal Processor</span>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}

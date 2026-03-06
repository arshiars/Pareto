export default function Card({ children, className = '' }) {
  return (
    <div className={`bg-surface rounded-xl border border-border shadow-sm ${className}`}>
      {children}
    </div>
  )
}

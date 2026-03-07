export default function Card({ children, className = '' }) {
  return (
    <div className={`bg-surface border border-border ${className}`}>
      {children}
    </div>
  )
}

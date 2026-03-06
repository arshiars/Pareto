const styles = {
  found: 'bg-success/10 text-success border-success/20',
  missing: 'bg-error/10 text-error border-error/20',
  computed: 'bg-primary/10 text-primary border-primary/20',
  manual: 'bg-accent/15 text-amber-800 border-accent/30',
  assumed: 'bg-warning/10 text-amber-700 border-warning/20',
}

const labels = {
  found: 'Found',
  missing: 'Missing',
  computed: 'Computed',
  manual: 'Manual',
  assumed: 'AI Estimate',
}

export default function Badge({ variant = 'found' }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles[variant]}`}
    >
      {labels[variant]}
    </span>
  )
}

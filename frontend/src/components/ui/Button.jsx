const variants = {
  primary:   'bg-transparent text-primary border border-primary hover:bg-primary hover:text-white disabled:opacity-40 disabled:cursor-not-allowed',
  secondary: 'bg-transparent text-primary border border-border hover:border-primary hover:bg-surface disabled:opacity-40',
  ghost:     'bg-transparent text-primary hover:bg-surface disabled:opacity-40',
  danger:    'bg-error text-white border border-error hover:opacity-90 disabled:opacity-40',
  accent:    'bg-accent text-white border border-accent hover:opacity-90 font-semibold disabled:opacity-40',
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs tracking-wide',
  md: 'px-5 py-2 text-sm tracking-wide',
  lg: 'px-6 py-2.5 text-sm tracking-wide',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  onClick,
  type = 'button',
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-[2px] font-medium transition-all duration-200 ease-in-out cursor-pointer ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  )
}

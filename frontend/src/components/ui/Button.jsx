const variants = {
  primary: 'bg-primary text-white hover:bg-primary-light active:opacity-90 disabled:opacity-50',
  secondary: 'bg-white text-primary border border-border hover:bg-background active:opacity-90 disabled:opacity-50',
  ghost: 'text-primary hover:bg-background active:opacity-80 disabled:opacity-50',
  danger: 'bg-error text-white hover:opacity-90 active:opacity-80 disabled:opacity-50',
  accent: 'bg-accent text-primary font-semibold hover:opacity-90 active:opacity-80 disabled:opacity-50',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-2.5 text-base',
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
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all cursor-pointer ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  )
}

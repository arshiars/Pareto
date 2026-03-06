export default function Input({
  label,
  prefix,
  suffix,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  className = '',
  disabled = false,
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-xs font-medium text-gray-600">{label}</label>
      )}
      <div className="flex items-center border border-border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-all">
        {prefix && (
          <span className="px-3 py-2 bg-background text-gray-500 text-sm border-r border-border select-none">
            {prefix}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 px-3 py-2 text-sm bg-white outline-none disabled:bg-background disabled:text-gray-400"
        />
        {suffix && (
          <span className="px-3 py-2 bg-background text-gray-500 text-sm border-l border-border select-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

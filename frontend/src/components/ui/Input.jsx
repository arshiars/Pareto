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
  ...rest
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-xs font-medium text-[#555555]">{label}</label>
      )}
      <div className="flex items-center border border-border rounded-[2px] overflow-hidden focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-all">
        {prefix && (
          <span className="px-3 py-2 bg-surface text-[#777777] text-sm border-r border-border select-none">
            {prefix}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          {...rest}
          className={`flex-1 min-w-0 px-3 py-2 text-sm bg-white outline-none disabled:bg-surface disabled:text-[#aaaaaa] ${type === 'number' ? '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none' : ''}`}
        />
        {suffix && (
          <span className="px-3 py-2 bg-surface text-[#777777] text-sm border-l border-border select-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

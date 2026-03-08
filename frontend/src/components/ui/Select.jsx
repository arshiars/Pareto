export default function Select({
  label,
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  className = '',
  error = false,
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-xs font-medium text-gray-600">{label}</label>
      )}
      <div className={`flex items-center border rounded-lg overflow-hidden focus-within:ring-2 transition-all ${error ? 'border-red-400 focus-within:ring-red-200 focus-within:border-red-400' : 'border-border focus-within:ring-primary/30 focus-within:border-primary'}`}>
        <select
          value={value}
          onChange={onChange}
          className="flex-1 px-3 py-2 text-sm bg-white outline-none appearance-none cursor-pointer text-gray-800 disabled:bg-background disabled:text-gray-400"
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <span className="px-2 py-2 bg-white text-gray-400 text-xs select-none pointer-events-none pr-3">▾</span>
      </div>
    </div>
  )
}

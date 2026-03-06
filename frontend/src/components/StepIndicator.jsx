const steps = [
  { key: 'upload',     label: 'Upload',   num: 1 },
  { key: 'processing', label: 'Analysis', num: 2 },
  { key: 'review',     label: 'Review',   num: 3 },
  { key: 'summary',    label: 'Summary',  num: 4 },
  { key: 'excel',      label: 'Excel',    num: 5, optional: true },
]

export default function StepIndicator({ currentStep }) {
  const currentIndex = steps.findIndex((s) => s.key === currentStep)

  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((step, i) => {
        const done   = i < currentIndex
        const active = i === currentIndex

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all
                  ${done   ? 'bg-success text-white'
                  : active ? 'bg-primary text-white'
                  : step.optional ? 'bg-border text-gray-400 border-2 border-dashed border-border'
                  : 'bg-border text-gray-400'}`}
              >
                {done ? '✓' : step.num}
              </div>
              <div className="flex flex-col items-center mt-1">
                <span className={`text-xs font-medium ${active ? 'text-primary' : done ? 'text-success' : 'text-gray-400'}`}>
                  {step.label}
                </span>
                {step.optional && (
                  <span className="text-[10px] text-gray-400 leading-tight">optional</span>
                )}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 w-14 mx-2 mb-5 transition-all ${i < currentIndex ? 'bg-success' : 'bg-border'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

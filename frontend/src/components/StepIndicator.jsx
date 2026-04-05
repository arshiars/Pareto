const steps = [
  { key: 'upload',  label: 'Upload Files',    num: 1 },
  { key: 'review',  label: 'Review Output',   num: 2 },
  { key: 'excel',   label: 'Generate Excel',  num: 3 },
]

export default function StepIndicator({ currentStep }) {
  const resolvedStep = currentStep === 'processing' ? 'upload' : currentStep
  const currentIndex = steps.findIndex((s) => s.key === resolvedStep)

  return (
    <div className="flex items-center mb-8">
      {steps.map((step, i) => {
        const done   = i < currentIndex
        const active = i === currentIndex

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                ${done   ? 'bg-primary text-white'
                : active ? 'bg-accent text-white'
                :          'bg-surface text-[#777777] border border-border'}`}
              >
                {done
                  ? <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  : step.num}
              </div>
              <span className={`text-xs font-medium ${active ? 'text-primary' : 'text-[#777777]'}`}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="w-8 h-px bg-border mx-3" />
            )}
          </div>
        )
      })}
    </div>
  )
}

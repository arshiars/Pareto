const steps = [
  { key: 'upload',  label: 'Upload',            num: 1 },
  { key: 'review',  label: 'Review & Summary',  num: 2 },
  { key: 'excel',   label: 'Excel',             num: 3 },
]

export default function StepIndicator({ currentStep }) {
  // 'processing' maps to 'upload' so step 1 stays highlighted during extraction
  const resolvedStep = currentStep === 'processing' ? 'upload' : currentStep
  const currentIndex = steps.findIndex((s) => s.key === resolvedStep)

  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((step, i) => {
        const done   = i < currentIndex
        const active = i === currentIndex

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 flex items-center justify-center text-xs font-semibold transition-all duration-200
                  ${done   ? 'bg-primary text-white'
                  : active ? 'border-2 border-primary text-primary bg-white'
                  : 'border border-border text-[#777777] bg-white'}`}
              >
                {done ? '✓' : step.num}
              </div>
              <div className="flex flex-col items-center mt-1.5">
                <span className={`text-[11px] font-medium tracking-wide uppercase
                  ${active ? 'text-primary' : done ? 'text-primary/60' : 'text-[#777777]'}`}>
                  {step.label}
                </span>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px w-14 mx-2 mb-6 transition-all duration-200 ${i < currentIndex ? 'bg-primary/40' : 'bg-border'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

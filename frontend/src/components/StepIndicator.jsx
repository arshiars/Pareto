const steps = [
  { key: 'upload', label: 'Upload', num: 1 },
  { key: 'processing', label: 'Analysis', num: 2 },
  { key: 'review', label: 'Review', num: 3 },
  { key: 'summary', label: 'Summary', num: 4 },
]

export default function StepIndicator({ currentStep }) {
  const currentIndex = steps.findIndex((s) => s.key === currentStep)

  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((step, i) => {
        const done = i < currentIndex
        const active = i === currentIndex

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                  done
                    ? 'bg-success text-white'
                    : active
                    ? 'bg-primary text-white'
                    : 'bg-border text-gray-400'
                }`}
              >
                {done ? '✓' : step.num}
              </div>
              <span
                className={`text-xs mt-1 font-medium ${
                  active ? 'text-primary' : done ? 'text-success' : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-0.5 w-16 mx-2 mb-4 transition-all ${
                  i < currentIndex ? 'bg-success' : 'bg-border'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

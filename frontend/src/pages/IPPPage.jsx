import { useNavigate } from 'react-router-dom'
import { IPPProvider, useIPP } from '../context/IPPContext.jsx'
import Layout from '../components/Layout.jsx'
import Step1Upload from './ipp/Step1Upload.jsx'
import Step2Review from './ipp/Step2Review.jsx'

const STEPS = [
  { key: 'upload',     label: 'Upload' },
  { key: 'review',     label: 'Review' },
]

function StepBar({ current }) {
  const activeIndex = current === 'processing' || current === 'completing' ? 0 : STEPS.findIndex((s) => s.key === current)
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((step, i) => {
        const done    = i < activeIndex
        const active  = i === activeIndex
        return (
          <div key={step.key} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs font-semibold uppercase tracking-wide transition-colors ${
              active ? 'bg-primary text-white' : done ? 'text-accent' : 'text-[#bbbbbb]'
            }`}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                active ? 'border-white/50 text-white' : done ? 'border-accent text-accent' : 'border-[#cccccc] text-[#cccccc]'
              }`}>
                {done ? '✓' : i + 1}
              </span>
              {step.label}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-px mx-1 ${i < activeIndex ? 'bg-accent' : 'bg-border'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function IPPContent() {
  const navigate = useNavigate()
  const { state } = useIPP()
  const { step } = state

  function handleBack() {
    navigate('/conventional')
  }

  return (
    <Layout subtitle="Conventional — IPP" backTo="/conventional">

      <StepBar current={step} />

      {(step === 'upload' || step === 'processing' || step === 'completing') && <Step1Upload />}
      {step === 'review' && <Step2Review onBack={handleBack} />}
    </Layout>
  )
}

export default function IPPPage() {
  return (
    <IPPProvider>
      <IPPContent />
    </IPPProvider>
  )
}

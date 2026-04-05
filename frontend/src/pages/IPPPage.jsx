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
    <div className="flex items-center mb-8">
      {STEPS.map((step, i) => {
        const done   = i < activeIndex
        const active = i === activeIndex
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
                  : i + 1}
              </div>
              <span className={`text-xs font-medium ${active ? 'text-primary' : 'text-[#777777]'}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-8 h-px bg-border mx-3" />
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

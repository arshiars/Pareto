import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { slugify, matchesSlug } from '../utils/slug.js'
import TripleCDatabasePage from './TripleCDatabasePage.jsx'
import TripleCUploadPage from './TripleCUploadPage.jsx'
import TripleCReviewPage from './TripleCReviewPage.jsx'
import TripleCProjectPage from './TripleCProjectPage.jsx'
import TripleCAnalyticsPage from './TripleCAnalyticsPage.jsx'
import TripleCComparePage from './TripleCComparePage.jsx'
import { fetchTripleCProject, fetchTripleCProjects } from '../services/api.js'

const BASE = '/triple-c'

export default function TripleCApp() {
  const navigate = useNavigate()
  const location = useLocation()

  // Derive view from URL path
  const pathSuffix = location.pathname.replace(BASE, '').replace(/^\//, '')
  const view = pathSuffix === 'upload' ? 'upload'
    : pathSuffix === 'analytics' ? 'analytics'
    : pathSuffix === 'compare' ? 'compare'
    : pathSuffix.startsWith('project/') ? 'project'
    : pathSuffix === 'review' ? 'review'
    : pathSuffix === 'edit' ? 'edit'
    : 'database'

  // Extract project slug from URL for project detail view
  const projectSlug = view === 'project' ? pathSuffix.replace('project/', '') : null

  const [currentData, setCurrentData] = useState(null)  // { extracted, fileName, remaining[] }
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [selectedProjectName, setSelectedProjectName] = useState(null)
  const [editProjectId, setEditProjectId] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [compareIds, setCompareIds] = useState([])

  // Resolve project slug to ID by fetching projects list
  useEffect(() => {
    if (!projectSlug || selectedProjectId) return

    fetchTripleCProjects()
      .then((projects) => {
        const match = projects.find((p) => matchesSlug(p.name, projectSlug))
        if (match) {
          setSelectedProjectId(match.id)
          setSelectedProjectName(match.name)
        } else {
          // No matching project — go back to database
          navigate(BASE, { replace: true })
        }
      })
      .catch(() => {
        navigate(BASE, { replace: true })
      })
  }, [projectSlug])

  function goToUpload() {
    setCurrentData(null)
    navigate(`${BASE}/upload`)
  }

  // Called by UploadPage with { extracted, fileName, remaining }
  function goToReview(data) {
    setCurrentData(data)
    navigate(`${BASE}/review`)
  }

  // Navigate to a project detail page using name slug
  function goToProject(id, name) {
    setSelectedProjectId(id)
    setSelectedProjectName(name)
    navigate(`${BASE}/project/${slugify(name)}`)
  }

  // Open a saved project in edit mode
  async function goToEdit(projectId) {
    setProcessing(true)
    try {
      const { project, divisions, milestones } = await fetchTripleCProject(projectId)
      // Reconstruct extracted shape that TripleCReviewPage expects
      const extracted = {
        project: {
          name: project.name,
          address: project.address,
          city: project.city,
          province: project.province,
          project_type: project.project_type,
          gfa_sqft: project.gfa_sqft,
          units: project.units,
          storeys: project.storeys,
          report_number: project.report_number,
          report_date: project.report_date,
          qs_firm: project.qs_firm,
        },
        top_level_budget: {
          land_cost: project.land_cost,
          construction_cost: project.construction_cost,
          municipal_charges: project.municipal_charges,
          soft_costs: project.soft_costs,
          financing_cost: project.financing_cost,
          development_contingency: project.development_contingency,
          total_budget: project.total_budget,
        },
        fees: {
          construction_mgmt_fee: project.construction_mgmt_fee,
          construction_contingency: project.construction_contingency,
          development_mgmt_fee: project.development_mgmt_fee,
        },
        divisions: divisions.map((d) => ({
          division_number: d.division_number,
          division_name: d.division_name,
          budget_amount: d.budget_amount,
          line_items: (d.qs_line_items ?? []).map((li) => ({
            description: li.description,
            budget_amount: li.budget_amount,
          })),
        })),
        milestones: (milestones ?? []).map((m) => ({
          milestone_name: m.milestone_name,
          previous_date: m.previous_date,
          current_date: m.report_date,
          status: m.status,
        })),
      }
      setCurrentData({ extracted, fileName: project.source_file ?? project.name })
      setEditProjectId(projectId)
      setSelectedProjectName(project.name)
      navigate(`${BASE}/edit`)
    } catch (err) {
      alert(`Failed to load project for editing: ${err.message}`)
    } finally {
      setProcessing(false)
    }
  }

  // After approve or discard in new-file review, check if there are more files in the queue
  async function onReviewDone() {
    const remaining = currentData?.remaining ?? []

    if (remaining.length === 0) {
      setCurrentData(null)
      navigate(BASE)
      return
    }

    // Extract the next file in queue
    setProcessing(true)
    const { extractTripleCFile } = await import('../services/api.js')
    const nextFile = remaining[0]
    try {
      const result = await extractTripleCFile(nextFile)
      setCurrentData({ ...result, remaining: remaining.slice(1) })
      navigate(`${BASE}/review`)
    } catch (err) {
      alert(`Failed to extract "${nextFile.name}": ${err.message}`)
      if (remaining.length > 1) {
        const nextNext = remaining[1]
        try {
          const result2 = await extractTripleCFile(nextNext)
          setCurrentData({ ...result2, remaining: remaining.slice(2) })
          navigate(`${BASE}/review`)
        } catch {
          setCurrentData(null)
          navigate(BASE)
        }
      } else {
        setCurrentData(null)
        navigate(BASE)
      }
    } finally {
      setProcessing(false)
    }
  }

  function onEditDone() {
    setCurrentData(null)
    setEditProjectId(null)
    // Go back to the project detail so user can see updated data
    if (selectedProjectName) {
      navigate(`${BASE}/project/${slugify(selectedProjectName)}`)
    } else {
      navigate(BASE)
    }
  }

  if (processing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <svg className="w-8 h-8 animate-spin text-primary mx-auto mb-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-primary font-semibold text-sm">Loading…</p>
        </div>
      </div>
    )
  }

  if (view === 'analytics') {
    return <TripleCAnalyticsPage onBack={() => navigate(BASE)} />
  }

  if (view === 'compare') {
    return <TripleCComparePage onBack={() => navigate(BASE)} initialIds={compareIds} />
  }

  if (view === 'project' && selectedProjectId) {
    return (
      <TripleCProjectPage
        projectId={selectedProjectId}
        onBack={() => navigate(BASE)}
        onEdit={(id) => goToEdit(id)}
      />
    )
  }

  if (view === 'upload') {
    return <TripleCUploadPage onBack={() => navigate(BASE)} onExtracted={goToReview} />
  }

  if (view === 'review' && currentData) {
    const queueSize = (currentData.remaining?.length ?? 0) + 1
    return (
      <TripleCReviewPage
        data={currentData}
        queuePosition={queueSize > 1 ? { current: 1, total: queueSize } : null}
        onSaved={onReviewDone}
        onDiscard={onReviewDone}
      />
    )
  }

  if (view === 'edit' && currentData && editProjectId) {
    return (
      <TripleCReviewPage
        data={currentData}
        projectId={editProjectId}
        onSaved={onEditDone}
        onDiscard={() => {
          setCurrentData(null)
          setEditProjectId(null)
          if (selectedProjectName) {
            navigate(`${BASE}/project/${slugify(selectedProjectName)}`)
          } else {
            navigate(BASE)
          }
        }}
      />
    )
  }

  return (
    <TripleCDatabasePage
      onBack={() => navigate('/')}
      onAddProject={goToUpload}
      onSelectProject={(id, project) => goToProject(id, project?.name ?? '')}
      onViewAnalytics={() => navigate(`${BASE}/analytics`)}
      onCompare={(ids) => { setCompareIds(ids); navigate(`${BASE}/compare`) }}
    />
  )
}

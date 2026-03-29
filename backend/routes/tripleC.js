import { Router } from 'express'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import multer from 'multer'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { pdfToText, buildCCSPrompt, buildCCRPrompt } from '../utils/qsExtract.js'
import { safeParseJson } from '../services/claude.js'

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

const router = Router()

function getS3() {
  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  })
}

const BUCKET = () => process.env.AWS_S3_BUCKET

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
      cb(null, true)
    } else {
      cb(new Error('Only PDF files are allowed'), false)
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
})

// POST /api/triple-c/upload
// Multipart form — field name: "files" (multiple)
// Uploads PDFs to S3 under uploads/triple-c/{timestamp}_{fileName}
router.post('/upload', uploadMiddleware.array('files'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' })
    }

    const s3 = getS3()
    const results = []

    for (const file of req.files) {
      const key = `uploads/triple-c/${Date.now()}_${file.originalname}`
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET(),
        Key: key,
        Body: file.buffer,
        ContentType: 'application/pdf',
      }))
      results.push({ fileName: file.originalname, key, success: true })
    }

    res.json({ uploads: results })
  } catch (err) {
    console.error('[TripleC/upload] Error:', err.message)
    res.status(500).json({ error: err.message || 'Upload failed' })
  }
})

// POST /api/triple-c/extract
// Multipart form — field name: "file" (single PDF)
// Extracts project data using pdftotext + Claude and returns structured JSON for review
router.post('/extract', uploadMiddleware.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' })

    const fileName = req.file.originalname

    // 1. Extract raw text from PDF
    let fullText
    try {
      fullText = pdfToText(req.file.buffer)
    } catch (err) {
      return res.status(422).json({ error: `pdftotext failed: ${err.message}. Is poppler installed?` })
    }

    // 2. Two parallel Claude calls — both get the full content.
    //    Scanned PDFs get the raw buffer (vision); text PDFs get the extracted text.
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const totalLines = fullText.split('\n').length
    const isScanned = totalLines < 50

    console.log(`[TripleC/extract] ${isScanned ? 'Scanned (vision)' : `Text (${totalLines} lines)`} — ${fileName}`)

    let ccsContent, ccrContent

    if (isScanned) {
      const pdfBlock = {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: req.file.buffer.toString('base64') },
      }
      ccsContent = [pdfBlock, { type: 'text', text: buildCCSPrompt('', fileName) }]
      ccrContent = [pdfBlock, { type: 'text', text: buildCCRPrompt('', fileName) }]
    } else {
      ccsContent = buildCCSPrompt(fullText, fileName)
      ccrContent = buildCCRPrompt(fullText, fileName)
    }

    const createMsg = (content, max_tokens) => isScanned
      ? client.beta.messages.create({ model: 'claude-sonnet-4-6', max_tokens, betas: ['pdfs-2024-09-25'], messages: [{ role: 'user', content }] })
      : client.messages.create({ model: 'claude-sonnet-4-6', max_tokens, messages: [{ role: 'user', content }] })

    const [ccsMsg, ccrMsg] = await Promise.all([
      createMsg(ccsContent, 4096),
      createMsg(ccrContent, 16384),
    ])

    console.log(`[TripleC/extract] CCS: ${ccsMsg.stop_reason} (${ccsMsg.content[0]?.text?.length ?? 0} chars)`)
    console.log(`[TripleC/extract] CCR: ${ccrMsg.stop_reason} (${ccrMsg.content[0]?.text?.length ?? 0} chars)`)

    let ccs, ccr
    try { ccs = safeParseJson(ccsMsg.content[0]?.text ?? '') } catch (e) {
      console.error('[TripleC/extract] CCS parse failed:', ccsMsg.content[0]?.text?.substring(0, 300))
      return res.status(422).json({ error: `CCS extraction failed: ${e.message}` })
    }
    try { ccr = safeParseJson(ccrMsg.content[0]?.text ?? '') } catch (e) {
      console.error('[TripleC/extract] CCR parse failed:', ccrMsg.content[0]?.text?.substring(0, 300))
      return res.status(422).json({ error: `CCR extraction failed: ${e.message}` })
    }

    const extracted = {
      project:          ccs.project,
      top_level_budget: ccs.top_level_budget,
      fees:             ccr.fees      ?? {},
      divisions:        ccr.divisions ?? [],
      milestones:       ccr.milestones ?? [],
    }

    if (!extracted.project) {
      console.error('[TripleC/extract] Missing project. CCS keys:', Object.keys(ccs ?? {}))
      return res.status(422).json({ error: 'Claude could not parse a valid structure from this PDF.' })
    }

    res.json({ extracted, fileName })
  } catch (err) {
    console.error('[TripleC/extract] Error:', err.message)
    res.status(500).json({ error: err.message || 'Extraction failed' })
  }
})

// GET /api/triple-c/projects
// Returns all saved projects with key metrics for the database page
router.get('/projects', async (req, res) => {
  try {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('qs_projects')
      .select(`
        id, name, address, city, province, project_type,
        gfa_sqft, units, storeys,
        report_number, report_date, qs_firm,
        land_cost, construction_cost, municipal_charges,
        soft_costs, financing_cost, development_contingency, total_budget,
        created_at
      `)
      .order('report_date', { ascending: false })

    if (error) throw new Error(error.message)
    res.json({ projects: data })
  } catch (err) {
    console.error('[TripleC/projects] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/triple-c/projects/:id
// Returns full project detail including divisions, line items, and milestones
router.get('/projects/:id', async (req, res) => {
  try {
    const sb = getSupabase()
    const { id } = req.params

    const [{ data: project, error: pErr }, { data: divisions, error: dErr }, { data: milestones, error: mErr }] = await Promise.all([
      sb.from('qs_projects').select('*').eq('id', id).single(),
      sb.from('qs_divisions').select(`*, qs_line_items(*)`).eq('project_id', id).order('division_number'),
      sb.from('qs_milestones').select('*').eq('project_id', id).order('sort_order'),
    ])

    if (pErr) throw new Error(pErr.message)
    if (dErr) throw new Error(dErr.message)
    if (mErr) throw new Error(mErr.message)

    // Sort line items by sort_order within each division
    const divisionsWithSortedItems = (divisions ?? []).map((d) => ({
      ...d,
      qs_line_items: [...(d.qs_line_items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    }))

    res.json({ project, divisions: divisionsWithSortedItems, milestones: milestones ?? [] })
  } catch (err) {
    console.error('[TripleC/projects/:id] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/triple-c/projects/:id
router.delete('/projects/:id', async (req, res) => {
  try {
    const sb = getSupabase()
    const { error } = await sb.from('qs_projects').delete().eq('id', req.params.id)
    if (error) throw new Error(error.message)
    res.json({ success: true })
  } catch (err) {
    console.error('[TripleC/projects DELETE] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/triple-c/projects/:id
// Body: same shape as /save — replaces divisions/milestones wholesale
router.patch('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { project, top_level_budget, fees = {}, divisions = [], milestones = [], fileName } = req.body
    if (!project?.name) return res.status(400).json({ error: 'project.name is required' })

    const sb = getSupabase()

    // 1. Update project row
    const { error: projErr } = await sb.from('qs_projects').update({
      name: project.name,
      address: project.address,
      city: project.city,
      province: project.province,
      project_type: project.project_type,
      gfa_sqft: project.gfa_sqft ?? null,
      units: project.units ?? null,
      storeys: project.storeys ?? null,
      report_number: project.report_number ?? null,
      report_date: project.report_date ?? null,
      qs_firm: project.qs_firm ?? null,
      source_file: fileName ?? null,
      land_cost: top_level_budget.land_cost ?? 0,
      construction_cost: top_level_budget.construction_cost ?? 0,
      municipal_charges: top_level_budget.municipal_charges ?? 0,
      soft_costs: top_level_budget.soft_costs ?? 0,
      financing_cost: top_level_budget.financing_cost ?? 0,
      development_contingency: top_level_budget.development_contingency ?? 0,
      total_budget: top_level_budget.total_budget ?? 0,
      construction_mgmt_fee: fees.construction_mgmt_fee ?? 0,
      construction_contingency: fees.construction_contingency ?? 0,
      development_mgmt_fee: fees.development_mgmt_fee ?? 0,
    }).eq('id', id)
    if (projErr) throw new Error(projErr.message)

    // 2. Delete existing divisions (cascades line items)
    const { error: delDivErr } = await sb.from('qs_divisions').delete().eq('project_id', id)
    if (delDivErr) throw new Error(delDivErr.message)

    // 3. Re-insert divisions + line items
    if (divisions.length > 0) {
      const { data: divRows, error: divErr } = await sb.from('qs_divisions')
        .insert(divisions.map((div) => ({
          project_id: id,
          division_number: div.division_number,
          division_name: div.division_name,
          budget_amount: div.budget_amount ?? 0,
        })))
        .select('id, division_number')
      if (divErr) throw new Error(divErr.message)

      const divIdMap = Object.fromEntries(divRows.map((r) => [r.division_number, r.id]))
      const allLineItems = divisions.flatMap((div) =>
        (div.line_items ?? []).map((li, idx) => ({
          division_id: divIdMap[div.division_number],
          description: li.description,
          budget_amount: li.budget_amount ?? 0,
          sort_order: idx,
        }))
      ).filter((li) => li.division_id)

      if (allLineItems.length > 0) {
        const { error: liErr } = await sb.from('qs_line_items').insert(allLineItems)
        if (liErr) throw new Error(liErr.message)
      }
    }

    // 4. Delete and re-insert milestones
    const { error: delMsErr } = await sb.from('qs_milestones').delete().eq('project_id', id)
    if (delMsErr) throw new Error(delMsErr.message)

    if (milestones.length > 0) {
      const { error: msErr } = await sb.from('qs_milestones').insert(
        milestones.map((m, idx) => ({
          project_id: id,
          milestone_name: m.milestone_name,
          previous_date: m.previous_date ?? null,
          report_date: m.current_date ?? null,
          status: m.status ?? null,
          sort_order: idx,
        }))
      )
      if (msErr) throw new Error(msErr.message)
    }

    res.json({ success: true, projectId: id })
  } catch (err) {
    console.error('[TripleC/projects PATCH] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/triple-c/analytics
// Returns per-division $/sf and $/unit stats aggregated across filtered projects.
// Query params: type, province, dateFrom, dateTo, gfaMin, gfaMax, exclude (comma-separated IDs)
router.get('/analytics', async (req, res) => {
  try {
    const { type, province, dateFrom, dateTo, gfaMin, gfaMax, exclude } = req.query
    const sb = getSupabase()
    const [{ data: projects, error: pErr }, { data: divisions, error: dErr }] = await Promise.all([
      sb.from('qs_projects').select('id, name, gfa_sqft, units, project_type, province, city, report_date'),
      sb.from('qs_divisions').select('project_id, division_number, division_name, budget_amount'),
    ])
    if (pErr) throw new Error(pErr.message)
    if (dErr) throw new Error(dErr.message)

    const excludeSet = exclude ? new Set(exclude.split(',')) : new Set()

    const filtered = (projects ?? []).filter((p) => {
      if (excludeSet.has(p.id)) return false
      if (type && p.project_type !== type) return false
      if (province && p.province !== province) return false
      if (dateFrom && (!p.report_date || p.report_date < dateFrom)) return false
      if (dateTo && (!p.report_date || p.report_date > dateTo)) return false
      if (gfaMin && (!p.gfa_sqft || p.gfa_sqft < Number(gfaMin))) return false
      if (gfaMax && (!p.gfa_sqft || p.gfa_sqft > Number(gfaMax))) return false
      return true
    })

    const projMap = Object.fromEntries(filtered.map((p) => [p.id, p]))

    const divStats = {}
    for (const div of (divisions ?? [])) {
      const proj = projMap[div.project_id]
      if (!proj || div.division_number > 16) continue
      if (!divStats[div.division_number]) {
        divStats[div.division_number] = {
          division_number: div.division_number,
          division_name: div.division_name,
          psf_values: [],
          ppu_values: [],
        }
      }
      const amount = Number(div.budget_amount ?? 0)
      if (amount > 0) {
        if (proj.gfa_sqft > 0) divStats[div.division_number].psf_values.push(amount / proj.gfa_sqft)
        if (proj.units > 0) divStats[div.division_number].ppu_values.push(amount / proj.units)
      }
    }

    const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null
    const median = (arr) => {
      if (!arr.length) return null
      const sorted = [...arr].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    }
    const stats = Object.values(divStats)
      .sort((a, b) => a.division_number - b.division_number)
      .map(({ division_number, division_name, psf_values, ppu_values }) => ({
        division_number,
        division_name,
        count: psf_values.length,
        avg_psf: avg(psf_values),
        median_psf: median(psf_values),
        min_psf: psf_values.length ? Math.min(...psf_values) : null,
        max_psf: psf_values.length ? Math.max(...psf_values) : null,
        avg_ppu: avg(ppu_values),
        median_ppu: median(ppu_values),
        min_ppu: ppu_values.length ? Math.min(...ppu_values) : null,
        max_ppu: ppu_values.length ? Math.max(...ppu_values) : null,
      }))

    const distinctTypes = [...new Set((projects ?? []).map((p) => p.project_type).filter(Boolean))].sort()
    const distinctProvinces = [...new Set((projects ?? []).map((p) => p.province).filter(Boolean))].sort()

    res.json({ stats, projectCount: filtered.length, totalCount: (projects ?? []).length, distinctTypes, distinctProvinces })
  } catch (err) {
    console.error('[TripleC/analytics] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/triple-c/compare?ids=uuid1,uuid2,uuid3
// Returns full division data for up to 5 projects, structured for side-by-side comparison
router.get('/compare', async (req, res) => {
  try {
    const ids = (req.query.ids ?? '').split(',').filter(Boolean)
    if (ids.length < 2) return res.status(400).json({ error: 'Provide at least 2 project IDs' })
    if (ids.length > 5) return res.status(400).json({ error: 'Compare at most 5 projects' })

    const sb = getSupabase()
    const [{ data: projects, error: pErr }, { data: divisions, error: dErr }] = await Promise.all([
      sb.from('qs_projects').select('*').in('id', ids),
      sb.from('qs_divisions').select('project_id, division_number, division_name, budget_amount').in('project_id', ids).order('division_number'),
    ])
    if (pErr) throw new Error(pErr.message)
    if (dErr) throw new Error(dErr.message)

    const projectMap = Object.fromEntries((projects ?? []).map((p) => [p.id, p]))
    const ordered = ids.map((id) => projectMap[id]).filter(Boolean)

    const divByProject = {}
    for (const div of (divisions ?? [])) {
      if (!divByProject[div.project_id]) divByProject[div.project_id] = {}
      divByProject[div.project_id][div.division_number] = div
    }

    const allDivNums = [...new Set((divisions ?? []).filter((d) => d.division_number <= 16).map((d) => d.division_number))].sort((a, b) => a - b)
    const divNames = {}
    for (const div of (divisions ?? [])) {
      if (div.division_number <= 16) divNames[div.division_number] = div.division_name
    }

    const comparison = allDivNums.map((divNum) => ({
      division_number: divNum,
      division_name: divNames[divNum],
      projects: ordered.map((p) => {
        const div = divByProject[p.id]?.[divNum]
        const amount = Number(div?.budget_amount ?? 0)
        return {
          project_id: p.id,
          budget_amount: amount,
          psf: p.gfa_sqft > 0 ? amount / p.gfa_sqft : null,
          ppu: p.units > 0 ? amount / p.units : null,
        }
      }),
    }))

    res.json({
      projects: ordered.map((p) => ({
        id: p.id,
        name: p.name,
        city: p.city,
        province: p.province,
        project_type: p.project_type,
        gfa_sqft: p.gfa_sqft,
        units: p.units,
        storeys: p.storeys,
        report_date: p.report_date,
        total_budget: p.total_budget,
        construction_cost: p.construction_cost,
        construction_mgmt_fee: p.construction_mgmt_fee,
        construction_contingency: p.construction_contingency,
        development_mgmt_fee: p.development_mgmt_fee,
      })),
      comparison,
    })
  } catch (err) {
    console.error('[TripleC/compare] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/triple-c/save
// Body: { project, top_level_budget, fees, divisions, milestones, fileName }
router.post('/save', async (req, res) => {
  try {
    const { project, top_level_budget, fees = {}, divisions = [], milestones = [], fileName } = req.body
    if (!project?.name) return res.status(400).json({ error: 'project.name is required' })

    const sb = getSupabase()

    // Duplicate detection: same name + report_number
    if (project.name && project.report_number != null) {
      const { data: existing } = await sb.from('qs_projects')
        .select('id, name')
        .eq('name', project.name)
        .eq('report_number', Number(project.report_number))
        .maybeSingle()
      if (existing) {
        return res.status(409).json({
          error: `"${existing.name}" Report #${project.report_number} already exists in the database.`,
          existingId: existing.id,
        })
      }
    }

    // 1. Insert project
    const { data: proj, error: projErr } = await sb
      .from('qs_projects')
      .insert({
        name: project.name,
        address: project.address,
        city: project.city,
        province: project.province,
        project_type: project.project_type,
        gfa_sqft: project.gfa_sqft ?? null,
        units: project.units ?? null,
        storeys: project.storeys ?? null,
        report_number: project.report_number ?? null,
        report_date: project.report_date ?? null,
        qs_firm: project.qs_firm ?? null,
        source_file: fileName ?? null,
        land_cost: top_level_budget.land_cost ?? 0,
        construction_cost: top_level_budget.construction_cost ?? 0,
        municipal_charges: top_level_budget.municipal_charges ?? 0,
        soft_costs: top_level_budget.soft_costs ?? 0,
        financing_cost: top_level_budget.financing_cost ?? 0,
        development_contingency: top_level_budget.development_contingency ?? 0,
        total_budget: top_level_budget.total_budget ?? 0,
        construction_mgmt_fee: fees.construction_mgmt_fee ?? 0,
        construction_contingency: fees.construction_contingency ?? 0,
        development_mgmt_fee: fees.development_mgmt_fee ?? 0,
      })
      .select('id')
      .single()

    if (projErr) throw new Error(projErr.message)
    const projectId = proj.id

    // 2. Insert all divisions in one bulk insert, get back all IDs
    const { data: divRows, error: divErr } = await sb
      .from('qs_divisions')
      .insert(divisions.map((div) => ({
        project_id: projectId,
        division_number: div.division_number,
        division_name: div.division_name,
        budget_amount: div.budget_amount ?? 0,
      })))
      .select('id, division_number')

    if (divErr) throw new Error(divErr.message)

    // 3. Build a map of division_number → id, then bulk insert all line items
    const divIdMap = Object.fromEntries(divRows.map((r) => [r.division_number, r.id]))
    const allLineItems = divisions.flatMap((div) =>
      (div.line_items ?? []).map((li, idx) => ({
        division_id: divIdMap[div.division_number],
        description: li.description,
        budget_amount: li.budget_amount ?? 0,
        sort_order: idx,
      }))
    ).filter((li) => li.division_id) // skip any orphans

    if (allLineItems.length > 0) {
      const { error: liErr } = await sb.from('qs_line_items').insert(allLineItems)
      if (liErr) throw new Error(liErr.message)
    }

    // 4. Bulk insert milestones
    if (milestones.length > 0) {
      const { error: msErr } = await sb.from('qs_milestones').insert(
        milestones.map((m, idx) => ({
          project_id: projectId,
          milestone_name: m.milestone_name,
          previous_date: m.previous_date ?? null,
          report_date: m.current_date ?? null,
          status: m.status ?? null,
          sort_order: idx,
        }))
      )
      if (msErr) throw new Error(msErr.message)
    }

    res.json({ success: true, projectId })
  } catch (err) {
    console.error('[TripleC/save] Error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

export default router

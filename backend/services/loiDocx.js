import PizZip from 'pizzip'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = path.join(__dirname, '../templates/LOI Template (IPP) (Oct 2025).docx')

const SDT_MAP = {
  subject:                      1209149268,
  brokerName:                   1809738701,
  recipient:                    1202285649,
  propertyDescription:           941875168,
  borrowerName:                -1055933814,
  guarantors:                  -1763523990,
  loanField:                    -588932550,
  interestRateSpread:           -171343632,
  interestRateFloor:             811910635,
  lendersFee:                    34015318,
  goodFaithDeposit:           -1829887426,
  interestReserveCap:            391009104,
  term:                       -1307623352,
  prepaymentMonths:             -226303167,
  extensionFee:                1771663535,
  permittedEncumbrancesLender: 1186327231,
  permittedEncumbrancesAmount:  -437057313,
  securityAmount:               591823269,
  mortgagePriority:            -649368001,
  availability:                1624956125,
  acceptanceDeadline:         -1390880630,
  originatorName:              -165784079,
  underwriterName:             1506627975,
  borrowerEntity1:              532623504,
  borrowerEntity2:              738137509,
  guarantorEntity:              138234272,
}

const ROW_SDT_MAP = {
  goodFaithDeposit:       [-1829887426],
  interestReserve:        [391009104],
  extensions:             [1771663535],
  permittedEncumbrances:  [1186327231],
  availability:           [1624956125],
}

const ROW_TEXT_MAP = {
  dscConditions:     'Minimum 1.00x',
  partialDischarges: 'Not permitted.',
}

// Tab stops used in the full-width acknowledgement paragraphs
const FULL_TABS = `<w:tabs><w:tab w:val="left" w:pos="0"/><w:tab w:val="left" w:pos="720"/><w:tab w:val="left" w:pos="1440"/><w:tab w:val="left" w:pos="2160"/><w:tab w:val="left" w:pos="2880"/><w:tab w:val="left" w:pos="3420"/><w:tab w:val="left" w:pos="3960"/><w:tab w:val="left" w:pos="4320"/><w:tab w:val="left" w:pos="5040"/><w:tab w:val="left" w:pos="5760"/><w:tab w:val="left" w:pos="6480"/><w:tab w:val="left" w:pos="8100"/><w:tab w:val="right" w:pos="9360"/><w:tab w:val="right" w:pos="10044"/></w:tabs>`
const PPR_FULL = `<w:pPr>${FULL_TABS}<w:suppressAutoHyphens/><w:spacing w:after="0"/><w:jc w:val="both"/></w:pPr>`
const PPR_FULL_BOLD = `<w:pPr>${FULL_TABS}<w:suppressAutoHyphens/><w:spacing w:after="0"/><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:pPr>`
const PPR_BLANK = `<w:pPr><w:spacing w:after="0"/></w:pPr>`
const RUN_ARIAL = (text) => `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`
const RUN_ARIAL_BOLD = (text) => `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`

function makeEntityBlock(entityName, label = null) {
  const labelPart = label ? `${RUN_ARIAL_BOLD(label + ':')} ` : ''
  return [
    // blank spacer
    `<w:p>${PPR_BLANK}</w:p>`,
    // entity name (bold)
    `<w:p>${PPR_FULL_BOLD}${labelPart}${RUN_ARIAL_BOLD(entityName)}</w:p>`,
    // blank
    `<w:p>${PPR_FULL}</w:p>`,
    // PER 1
    `<w:p>${PPR_FULL}${RUN_ARIAL('PER: _______________________________')}</w:p>`,
    // Name, Title 1
    `<w:p>${PPR_FULL}${RUN_ARIAL('Name, Title:')}</w:p>`,
    // PER 2
    `<w:p>${PPR_FULL}${RUN_ARIAL('PER: _______________________________')}</w:p>`,
    // Name, Title 2
    `<w:p>${PPR_FULL}${RUN_ARIAL('Name, Title:')}</w:p>`,
  ].join('')
}

function makeGuarantorBlock(entityName) {
  return [
    `<w:p>${PPR_BLANK}</w:p>`,
    `<w:p>${PPR_FULL_BOLD}${RUN_ARIAL_BOLD(entityName)}</w:p>`,
    `<w:p>${PPR_FULL}</w:p>`,
    `<w:p>${PPR_FULL}${RUN_ARIAL('_________________________________')}</w:p>`,
    `<w:p>${PPR_FULL}${RUN_ARIAL('Name, Title:')}</w:p>`,
  ].join('')
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function replaceSdtById(xml, id, newText) {
  if (newText == null || newText === '') return xml
  const idStr = `w:val="${id}"`
  const idPos = xml.indexOf(idStr)
  if (idPos === -1) return xml
  const nextSdtPos = xml.indexOf('<w:sdt>', idPos + idStr.length)
  const contentStart = xml.indexOf('<w:sdtContent>', idPos)
  if (contentStart === -1) return xml
  if (nextSdtPos !== -1 && contentStart > nextSdtPos) return xml
  const contentEnd = xml.indexOf('</w:sdtContent>', contentStart)
  if (contentEnd === -1) return xml
  const inner = xml.substring(contentStart + 14, contentEnd)
  const rPrMatch = inner.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)
  const rPr = rPrMatch ? `<w:rPr>${rPrMatch[1]}</w:rPr>` : ''
  const escaped = escapeXml(newText)
  const tAttr = newText.includes(' ') ? ' xml:space="preserve"' : ''
  const newContent = `<w:sdtContent><w:r>${rPr}<w:t${tAttr}>${escaped}</w:t></w:r></w:sdtContent>`
  return xml.substring(0, contentStart) + newContent + xml.substring(contentEnd + 15)
}

function findParaStart(xml, idx) {
  const a = xml.lastIndexOf('<w:p ', idx)
  const b = xml.lastIndexOf('<w:p>', idx)
  return Math.max(a, b)
}

function isEmptyParagraph(xml) {
  return xml.replace(/<[^>]+>/g, '').trim() === ''
}

function removeParaWithOptionalSpacer(xml, pStart, pEnd) {
  const after = xml.substring(pEnd)
  const spacer = after.match(/^(<w:p\b[^>]*>(?:<w:pPr>[\s\S]*?<\/w:pPr>)?<\/w:p>)/)
  if (spacer && isEmptyParagraph(spacer[1])) {
    return xml.substring(0, pStart) + xml.substring(pEnd + spacer[1].length)
  }
  return xml.substring(0, pStart) + xml.substring(pEnd)
}

function removeParagraphContainingSdtId(xml, sdtId) {
  const idStr = `w:val="${sdtId}"`
  const idPos = xml.indexOf(idStr)
  if (idPos === -1) return xml
  const pStart = findParaStart(xml, idPos)
  if (pStart === -1) return xml
  const pEnd = xml.indexOf('</w:p>', idPos) + 6
  if (pEnd < 6) return xml
  return removeParaWithOptionalSpacer(xml, pStart, pEnd)
}

function removeParagraphContainingText(xml, searchText) {
  const idx = xml.indexOf(searchText)
  if (idx === -1) return xml
  const pStart = findParaStart(xml, idx)
  if (pStart === -1) return xml
  const pEnd = xml.indexOf('</w:p>', idx) + 6
  if (pEnd < 6) return xml
  return removeParaWithOptionalSpacer(xml, pStart, pEnd)
}

const CONDITION_PPR = `<w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="13"/></w:numPr><w:tabs><w:tab w:val="left" w:pos="1440"/></w:tabs><w:spacing w:after="0"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:pPr>`
const CONDITION_RPR = `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>`

function replaceConditionsPrecedent(xml, conditions) {
  const NUM_ID_MARKER = 'w:numId w:val="13"'
  const paraRegex = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g
  let match
  let firstStart = -1
  let lastEnd = -1
  while ((match = paraRegex.exec(xml)) !== null) {
    if (match[0].includes(NUM_ID_MARKER)) {
      if (firstStart === -1) firstStart = match.index
      lastEnd = match.index + match[0].length
    }
  }
  if (firstStart === -1) return xml

  const newParas = conditions.map((text, i) => {
    const suffix = i < conditions.length - 1 ? ';' : '.'
    return `<w:p>${CONDITION_PPR}<w:r>${CONDITION_RPR}<w:t xml:space="preserve">${escapeXml(text)}${suffix}</w:t></w:r></w:p>`
  }).join('')

  return xml.substring(0, firstStart) + newParas + xml.substring(lastEnd)
}

// Insert extra borrower blocks after the acknowledgement table
function insertExtraBorrowers(xml, extraBorrowers) {
  if (!extraBorrowers.length) return xml
  // The acknowledgement table contains borrowerEntity2 (738137509)
  const entity2Idx = xml.indexOf('738137509')
  if (entity2Idx === -1) return xml
  const tblEnd = xml.indexOf('</w:tbl>', entity2Idx)
  if (tblEnd === -1) return xml
  const insertAt = tblEnd + 8 // after </w:tbl>
  const blocks = extraBorrowers.map(name => makeEntityBlock(name)).join('')
  return xml.substring(0, insertAt) + blocks + xml.substring(insertAt)
}

// Insert extra guarantor blocks after the acknowledgement table
function insertExtraGuarantors(xml, extraGuarantors) {
  if (!extraGuarantors.length) return xml
  const guarantorIdx = xml.indexOf('138234272')
  if (guarantorIdx === -1) return xml
  const tblEnd = xml.indexOf('</w:tbl>', guarantorIdx)
  if (tblEnd === -1) return xml
  const insertAt = tblEnd + 8
  const blocks = extraGuarantors.map(name => makeGuarantorBlock(name)).join('')
  return xml.substring(0, insertAt) + blocks + xml.substring(insertAt)
}

export async function generateLoiDocx(fields, disabledRows = [], conditionsPrecedent = null) {
  const templateBuffer = fs.readFileSync(TEMPLATE_PATH)
  const zip = new PizZip(templateBuffer)
  let xml = zip.file('word/document.xml').asText()

  // Build loan field
  const loanAmount = fields.loanAmount?.toString().trim()
  const interestReserve = fields.interestReserve?.toString().trim()
  let loanFieldText = null
  if (loanAmount) {
    loanFieldText = `${loanAmount} Non-Revolving Demand Loan`
    if (interestReserve && !disabledRows.includes('interestReserve')) {
      loanFieldText += ` [inclusive of $${interestReserve} Interest Reserve]`
    }
  }

  // Resolve borrower/guarantor arrays
  const borrowerEntities = Array.isArray(fields.borrowerEntities) ? fields.borrowerEntities.filter(Boolean) : [fields.borrowerEntity1, fields.borrowerEntity2].filter(Boolean)
  const guarantorEntities = Array.isArray(fields.guarantorEntities) ? fields.guarantorEntities.filter(Boolean) : [fields.guarantorEntity].filter(Boolean)

  const replacements = {
    subject:                     fields.subject,
    brokerName:                  fields.brokerName,
    recipient:                   fields.recipient,
    propertyDescription:         fields.propertyDescription,
    borrowerName:                fields.borrowerName,
    guarantors:                  fields.guarantors,
    loanField:                   loanFieldText,
    interestRateSpread:          fields.interestRateSpread,
    interestRateFloor:           fields.interestRateFloor,
    lendersFee:                  fields.lendersFee,
    goodFaithDeposit:            fields.goodFaithDeposit,
    interestReserveCap:          fields.interestReserveCap,
    term:                        fields.term,
    prepaymentMonths:            fields.prepaymentMonths,
    extensionFee:                fields.extensionFee,
    permittedEncumbrancesLender: fields.permittedEncumbrancesLender,
    permittedEncumbrancesAmount: fields.permittedEncumbrancesAmount,
    securityAmount:              fields.securityAmount,
    mortgagePriority:            fields.mortgagePriority,
    availability:                fields.availability,
    acceptanceDeadline:          fields.acceptanceDeadline,
    originatorName:              fields.originatorName,
    underwriterName:             fields.underwriterName,
    borrowerEntity1:             borrowerEntities[0] || null,
    borrowerEntity2:             borrowerEntities[1] || null,
    guarantorEntity:             guarantorEntities[0] || null,
  }

  for (const [fieldKey, value] of Object.entries(replacements)) {
    if (value && SDT_MAP[fieldKey] !== undefined) {
      xml = replaceSdtById(xml, SDT_MAP[fieldKey], value)
    }
  }

  // Conditions precedent
  if (conditionsPrecedent && conditionsPrecedent.length > 0) {
    xml = replaceConditionsPrecedent(xml, conditionsPrecedent)
  }

  // Disabled rows
  for (const rowKey of disabledRows) {
    if (ROW_SDT_MAP[rowKey]) {
      for (const sdtId of ROW_SDT_MAP[rowKey]) {
        xml = removeParagraphContainingSdtId(xml, sdtId)
      }
    } else if (ROW_TEXT_MAP[rowKey]) {
      xml = removeParagraphContainingText(xml, ROW_TEXT_MAP[rowKey])
    }
  }

  // Clone signature blocks for extra borrowers (3+) and extra guarantors (2+)
  if (borrowerEntities.length > 2) {
    xml = insertExtraBorrowers(xml, borrowerEntities.slice(2))
  }
  if (guarantorEntities.length > 1) {
    xml = insertExtraGuarantors(xml, guarantorEntities.slice(1))
  }

  zip.file('word/document.xml', xml)

  return zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

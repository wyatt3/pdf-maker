import { reactive, watch } from 'vue'
import { PRESETS, round, toPdfPt } from '../utils/units.js'

const STORAGE_KEY = 'pdf-maker:project:v1'

export const PROJECT_FORMAT = 'pdf-maker-project'
export const PROJECT_VERSION = 2

export const DEFAULT_HTML = ''
export const DEFAULT_CSS = ''

function uid() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `page_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  )
}

function createPage(html = DEFAULT_HTML) {
  return { id: uid(), html }
}

function createFieldDefaults() {
  return {
    text: { width: 160, height: 20 },
    checkbox: { size: 14 }
  }
}

function normalizeSize(value, fallback) {
  const size = Number(value)
  return Number.isFinite(size) && size > 0 ? size : fallback
}

function normalizeFieldDefaults(saved) {
  const defaults = createFieldDefaults()
  return {
    text: {
      width: normalizeSize(saved?.text?.width, defaults.text.width),
      height: normalizeSize(saved?.text?.height, defaults.text.height)
    },
    checkbox: {
      size: normalizeSize(saved?.checkbox?.size, defaults.checkbox.size)
    }
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function toFinite(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeFields(
  savedFields,
  pages,
  pageWidthPt,
  pageHeightPt,
  fieldDefaults,
  fieldOrigin
) {
  const fields = []
  const seenIds = new Set()
  const seenNames = new Set()
  const counts = { text: 0, checkbox: 0 }

  for (const saved of savedFields) {
    if (!saved || typeof saved !== 'object') continue

    const type = saved.type === 'checkbox' ? 'checkbox' : saved.type === 'text' ? 'text' : null
    if (!type) continue

    counts[type] += 1

    let pageId = typeof saved.pageId === 'string' ? saved.pageId : ''
    if (!pageId || !pages.some((page) => page.id === pageId)) {
      const index = Number(saved.page)
      pageId =
        pages[Number.isInteger(index) && index >= 0 && index < pages.length ? index : 0].id
    }

    let id = typeof saved.id === 'string' && saved.id ? saved.id : uid()
    if (seenIds.has(id)) id = uid()
    seenIds.add(id)

    const defaultWidth =
      type === 'checkbox' ? fieldDefaults.checkbox.size : fieldDefaults.text.width
    const defaultHeight =
      type === 'checkbox' ? fieldDefaults.checkbox.size : fieldDefaults.text.height
    const w = round(clamp(toFinite(saved.w, defaultWidth), 4, pageWidthPt), 2)
    const h = round(clamp(toFinite(saved.h, defaultHeight), 4, pageHeightPt), 2)
    const x = round(clamp(toFinite(saved.x, 0), 0, Math.max(0, pageWidthPt - w)), 2)
    const rawY = toFinite(saved.y, 0)
    const topY = fieldOrigin === 'bottom-left' ? pageHeightPt - rawY - h : rawY
    const y = round(clamp(topY, 0, Math.max(0, pageHeightPt - h)), 2)

    const baseName =
      typeof saved.name === 'string' && saved.name.trim()
        ? saved.name.trim()
        : `${type}_${counts[type]}`
    let name = baseName
    let suffix = 2
    while (seenNames.has(name)) {
      name = `${baseName}_${suffix}`
      suffix += 1
    }
    seenNames.add(name)

    fields.push({
      id,
      type,
      pageId,
      x,
      y,
      w,
      h,
      name,
      defaultValue: typeof saved.defaultValue === 'string' ? saved.defaultValue : '',
      checked: Boolean(saved.checked),
      required: Boolean(saved.required),
      fontSize: normalizeSize(saved.fontSize, 10),
      multiline: Boolean(saved.multiline),
      border: saved.border === true,
      tooltip: typeof saved.tooltip === 'string' ? saved.tooltip : ''
    })
  }

  return fields
}

function normalizePreset(value, unit, width, height) {
  if (value === 'Custom') return 'Custom'

  if (typeof value === 'string') {
    const preset = PRESETS.find((item) => item.label === value)
    if (
      preset &&
      preset.unit === unit &&
      Number(preset.width) === Number(width) &&
      Number(preset.height) === Number(height)
    ) {
      return preset.label
    }
  }

  const match = PRESETS.find(
    (item) =>
      item.unit === unit &&
      Number(item.width) === Number(width) &&
      Number(item.height) === Number(height)
  )
  return match ? match.label : 'Custom'
}

function createDefaults() {
  const page = createPage()
  return {
    pages: [page],
    css: DEFAULT_CSS,
    unit: 'in',
    width: 8.5,
    height: 11,
    fields: [],
    fieldDefaults: createFieldDefaults(),
    fieldOrigin: 'top-left',
    preset: 'Letter (8.5 × 11 in)',
    activePageId: page.id
  }
}

function extractStyles(html) {
  const blocks = []
  const cleaned = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, body) => {
    blocks.push(body.trim())
    return ''
  })
  return { html: cleaned, css: blocks.join('\n\n').trim() }
}

function normalizePage(page) {
  return {
    id: typeof page?.id === 'string' && page.id ? page.id : uid(),
    html: typeof page?.html === 'string' ? page.html : DEFAULT_HTML
  }
}

function normalizeProject(saved, fieldOriginOverride) {
  const defaults = createDefaults()
  let css = typeof saved?.css === 'string' ? saved.css : null
  let pages

  if (Array.isArray(saved?.pages) && saved.pages.length) {
    pages = saved.pages.map(normalizePage)
  } else {
    let html = typeof saved?.html === 'string' ? saved.html : DEFAULT_HTML
    if (css === null) {
      const migrated = extractStyles(html)
      html = migrated.html
      css = migrated.css || DEFAULT_CSS
    }
    pages = [normalizePage({ html })]
  }

  if (css === null) css = DEFAULT_CSS

  const pageIds = new Set()
  for (const page of pages) {
    if (pageIds.has(page.id)) page.id = uid()
    pageIds.add(page.id)
  }

  const unit = saved?.unit === 'mm' ? 'mm' : defaults.unit
  const width = normalizeSize(saved?.width, defaults.width)
  const height = normalizeSize(saved?.height, defaults.height)
  const fieldDefaults = normalizeFieldDefaults(saved?.fieldDefaults)
  const pageWidthPt = toPdfPt(width, unit)
  const pageHeightPt = toPdfPt(height, unit)
  const fieldOrigin =
    fieldOriginOverride ?? (saved?.fieldOrigin === 'top-left' ? 'top-left' : 'bottom-left')
  const fields = normalizeFields(
    Array.isArray(saved?.fields) ? saved.fields : [],
    pages,
    pageWidthPt,
    pageHeightPt,
    fieldDefaults,
    fieldOrigin
  )

  const activePageId = pages.some((page) => page.id === saved?.activePageId)
    ? saved.activePageId
    : pages[0].id

  return {
    pages,
    css,
    unit,
    width,
    height,
    fields,
    fieldDefaults,
    fieldOrigin: 'top-left',
    preset: normalizePreset(saved?.preset, unit, width, height),
    activePageId
  }
}

function loadProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaults()
    return normalizeProject(JSON.parse(raw))
  } catch (error) {
    console.warn('Could not restore saved project:', error)
    return createDefaults()
  }
}

export const project = reactive(loadProject())

function serializeProject() {
  return {
    pages: project.pages,
    css: project.css,
    unit: project.unit,
    width: project.width,
    height: project.height,
    fields: project.fields,
    fieldDefaults: project.fieldDefaults,
    fieldOrigin: 'top-left',
    preset: project.preset,
    activePageId: project.activePageId
  }
}

function saveProject() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeProject()))
  } catch (error) {
    console.warn('Autosave failed (localStorage may be full):', error)
  }
}

let saveTimer = null
watch(
  project,
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(saveProject, 400)
  },
  { deep: true }
)

export function exportProject() {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    exportedAt: new Date().toISOString(),
    ...JSON.parse(JSON.stringify(serializeProject()))
  }
}

export function importProject(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('That file is not a PDF Maker project.')
  }
  if (data.format !== PROJECT_FORMAT) {
    throw new Error('That file is not a PDF Maker project.')
  }
  if (data.version !== 1 && data.version !== PROJECT_VERSION) {
    throw new Error('That project file uses an unsupported version.')
  }
  if (data.version === PROJECT_VERSION && data.fieldOrigin !== 'top-left') {
    throw new Error('That project file uses an unsupported coordinate system.')
  }
  if (!Array.isArray(data.pages) || data.pages.length === 0) {
    throw new Error('The project file has no pages.')
  }
  if (data.pages.length > 100) {
    throw new Error('The project file has too many pages (maximum is 100).')
  }
  if (data.pages.some((page) => typeof page?.html !== 'string')) {
    throw new Error('The project file contains an invalid page.')
  }
  if (!(Number(data.width) > 0) || !(Number(data.height) > 0)) {
    throw new Error('The project file has invalid page dimensions.')
  }
  if (data.unit !== 'in' && data.unit !== 'mm') {
    throw new Error('The project file has an invalid unit.')
  }
  if (data.fields != null && !Array.isArray(data.fields)) {
    throw new Error('The project file has an invalid field list.')
  }
  if (
    Array.isArray(data.fields) &&
    data.fields.some((field) => field?.type !== 'text' && field?.type !== 'checkbox')
  ) {
    throw new Error('The project file contains an invalid field.')
  }

  const normalized = normalizeProject(data, data.version === 1 ? 'bottom-left' : 'top-left')
  Object.assign(project, normalized)
  clearTimeout(saveTimer)
  saveProject()
  return normalized
}

export function newProject() {
  Object.assign(project, createDefaults())
  clearTimeout(saveTimer)
  localStorage.removeItem(STORAGE_KEY)
}

export function addField(field) {
  project.fields.push(field)
}

export function removeField(id) {
  project.fields = project.fields.filter((field) => field.id !== id)
}

export function removeFields(ids) {
  const selected = new Set(ids)
  project.fields = project.fields.filter((field) => !selected.has(field.id))
}

export function pageIndex(pageId) {
  return project.pages.findIndex((page) => page.id === pageId)
}

export function addPage(html = DEFAULT_HTML) {
  const page = createPage(html)
  project.pages.push(page)
  project.activePageId = page.id
  return page
}

export function duplicatePage(pageId) {
  const index = pageIndex(pageId)
  if (index === -1) return null

  const source = project.pages[index]
  const page = createPage(source.html)
  project.pages.splice(index + 1, 0, page)

  const copies = project.fields
    .filter((field) => field.pageId === source.id)
    .map((field) => ({ ...field, id: uid(), pageId: page.id }))
  project.fields.push(...copies)

  project.activePageId = page.id
  return page
}

export function removePage(pageId) {
  if (project.pages.length <= 1) return false
  const index = pageIndex(pageId)
  if (index === -1) return false

  project.pages.splice(index, 1)
  project.fields = project.fields.filter((field) => field.pageId !== pageId)

  if (project.activePageId === pageId) {
    const next = project.pages[Math.min(index, project.pages.length - 1)]
    project.activePageId = next.id
  }
  return true
}

export function movePage(pageId, direction) {
  const index = pageIndex(pageId)
  if (index === -1) return false
  const target = index + direction
  if (target < 0 || target >= project.pages.length) return false

  const [page] = project.pages.splice(index, 1)
  project.pages.splice(target, 0, page)
  return true
}

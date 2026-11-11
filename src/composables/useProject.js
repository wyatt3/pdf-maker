import { reactive, watch } from 'vue'

const STORAGE_KEY = 'pdf-maker:project:v1'

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

function loadProject() {
  const defaults = createDefaults()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults

    const saved = JSON.parse(raw)
    let css = typeof saved.css === 'string' ? saved.css : null
    let pages

    if (Array.isArray(saved.pages) && saved.pages.length) {
      pages = saved.pages.map(normalizePage)
    } else {
      let html = typeof saved.html === 'string' ? saved.html : DEFAULT_HTML
      if (css === null) {
        const migrated = extractStyles(html)
        html = migrated.html
        css = migrated.css || DEFAULT_CSS
      }
      pages = [normalizePage({ html })]
    }

    if (css === null) css = DEFAULT_CSS

    const savedFields = Array.isArray(saved.fields) ? saved.fields : []
    const fields = savedFields.map((field) => {
      const copy = { ...field }
      if (!copy.pageId || !pages.some((page) => page.id === copy.pageId)) {
        const index = Number(copy.page) || 0
        copy.pageId = pages[index]?.id ?? pages[0].id
      }
      delete copy.page
      return copy
    })

    const activePageId = pages.some((page) => page.id === saved.activePageId)
      ? saved.activePageId
      : pages[0].id

    return {
      pages,
      css,
      unit: saved.unit === 'mm' ? 'mm' : defaults.unit,
      width: Number(saved.width) || defaults.width,
      height: Number(saved.height) || defaults.height,
      fields,
      fieldDefaults: normalizeFieldDefaults(saved.fieldDefaults),
      preset: typeof saved.preset === 'string' ? saved.preset : defaults.preset,
      activePageId
    }
  } catch (error) {
    console.warn('Could not restore saved project:', error)
    return defaults
  }
}

export const project = reactive(loadProject())

let saveTimer = null
watch(
  project,
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            pages: project.pages,
            css: project.css,
            unit: project.unit,
            width: project.width,
            height: project.height,
            fields: project.fields,
            fieldDefaults: project.fieldDefaults,
            preset: project.preset,
            activePageId: project.activePageId
          })
        )
      } catch (error) {
        console.warn('Autosave failed (localStorage may be full):', error)
      }
    }, 400)
  },
  { deep: true }
)

export function newProject() {
  Object.assign(project, createDefaults())
  localStorage.removeItem(STORAGE_KEY)
}

export function addField(field) {
  project.fields.push(field)
}

export function removeField(id) {
  project.fields = project.fields.filter((field) => field.id !== id)
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

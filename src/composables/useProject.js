import { reactive, watch } from 'vue'

const STORAGE_KEY = 'pdf-maker:project:v1'

export const DEFAULT_HTML = ''
export const DEFAULT_CSS = ''

function createDefaults() {
  return {
    html: DEFAULT_HTML,
    css: DEFAULT_CSS,
    unit: 'in',
    width: 8.5,
    height: 11,
    fields: [],
    preset: 'Letter (8.5 × 11 in)'
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

function loadProject() {
  const defaults = createDefaults()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults

    const saved = JSON.parse(raw)
    let html = typeof saved.html === 'string' ? saved.html : defaults.html
    let css = typeof saved.css === 'string' ? saved.css : null

    // Migrate older drafts that stored CSS inside the HTML <style> blocks.
    if (css === null) {
      const migrated = extractStyles(html)
      html = migrated.html
      css = migrated.css || defaults.css
    }

    return {
      ...defaults,
      ...saved,
      html,
      css,
      fields: Array.isArray(saved.fields) ? saved.fields : []
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
            html: project.html,
            css: project.css,
            unit: project.unit,
            width: project.width,
            height: project.height,
            fields: project.fields,
            preset: project.preset
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

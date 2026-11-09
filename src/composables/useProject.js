import { reactive, watch } from 'vue'

const STORAGE_KEY = 'pdf-maker:project:v1'

export const DEFAULT_HTML = `<style>
  * { box-sizing: border-box; }
  body {
    font-family: Helvetica, Arial, sans-serif;
    color: #111827;
    padding: 56px 64px;
  }
  h1 { font-size: 30px; margin: 0 0 6px; letter-spacing: -0.5px; }
  .subtitle { color: #6b7280; margin: 0 0 32px; font-size: 13px; }
  .row { margin-bottom: 26px; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #374151; margin-bottom: 6px; }
  .line { border-bottom: 1px solid #9ca3af; height: 24px; }
  .grid { display: flex; gap: 32px; }
  .grid > .row { flex: 1; }
  .checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .footer { position: absolute; bottom: 40px; left: 64px; right: 64px; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 10px; }
</style>

<h1>Form Title</h1>
<p class="subtitle">Replace this text with your form content.</p>

<div class="grid">
  <div class="row">
    <div class="label">Full name</div>
    <div class="line"></div>
  </div>
  <div class="row">
    <div class="label">Date</div>
    <div class="line"></div>
  </div>
</div>

<div class="row">
  <div class="label">Address</div>
  <div class="line"></div>
</div>

<div class="row">
  <div class="label">Notes</div>
  <div class="line" style="height: 72px;"></div>
</div>

<div class="checkbox-row">
  <span>I certify the information above is accurate.</span>
</div>

<div class="footer">Generated with PDF Form Builder</div>`

function createDefaults() {
  return {
    html: DEFAULT_HTML,
    unit: 'in',
    width: 8.5,
    height: 11,
    fields: [],
    preset: 'Letter (8.5 × 11 in)'
  }
}

function loadProject() {
  const defaults = createDefaults()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const saved = JSON.parse(raw)
    return {
      ...defaults,
      ...saved,
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

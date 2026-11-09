<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import DimensionControls from './DimensionControls.vue'
import {
  project,
  addPage,
  duplicatePage,
  removePage,
  movePage
} from '../composables/useProject.js'
import { toCssPx } from '../utils/units.js'
import { buildPageHtml } from '../../shared/pageHtml.js'

defineProps({ busy: Boolean })
defineEmits(['generate'])

const stageRef = ref(null)
const activeTab = ref('html')
const zoomMode = ref('fit-width')
const manualZoom = ref(1)
const fitWidthScale = ref(1)
const fitPageScale = ref(1)
const PAGE_GAP = 24

const scale = computed(() => {
  if (zoomMode.value === 'manual') return manualZoom.value
  if (zoomMode.value === 'fit-page') return fitPageScale.value
  return fitWidthScale.value
})

const pageWidthPx = computed(() => Math.max(1, Math.round(toCssPx(project.width, project.unit))))
const pageHeightPx = computed(() => Math.max(1, Math.round(toCssPx(project.height, project.unit))))

const activePage = computed(
  () => project.pages.find((page) => page.id === project.activePageId) ?? project.pages[0]
)

const activeIndex = computed(() =>
  project.pages.findIndex((page) => page.id === activePage.value?.id)
)

const previewDocs = computed(() =>
  project.pages.map((page) =>
    buildPageHtml(page.html, {
      css: project.css,
      cssWidth: pageWidthPx.value,
      cssHeight: pageHeightPx.value,
      preview: true
    })
  )
)

const frameStyle = computed(() => ({
  width: `${pageWidthPx.value}px`,
  height: `${pageHeightPx.value}px`,
  transform: `scale(${scale.value})`
}))

const stackStyle = computed(() => ({
  gap: `${PAGE_GAP * scale.value}px`
}))

const pageStyle = computed(() => ({
  width: `${pageWidthPx.value * scale.value}px`,
  height: `${pageHeightPx.value * scale.value}px`
}))

function updateScale() {
  const el = stageRef.value
  if (!el) return
  const padding = 48
  const labelSpace = 28
  const availableWidth = el.clientWidth - padding
  const availableHeight = el.clientHeight - padding - labelSpace
  if (availableWidth <= 0) return

  fitWidthScale.value = Math.min(availableWidth / pageWidthPx.value, 1)
  fitPageScale.value = Math.min(
    availableWidth / pageWidthPx.value,
    availableHeight > 0 ? availableHeight / pageHeightPx.value : 1,
    1
  )
}

function scrollActiveIntoView() {
  nextTick(() => {
    const stage = stageRef.value
    const pageId = activePage.value?.id
    if (!stage || !pageId) return
    const target = stage.querySelector(`[data-page-id="${pageId}"]`)
    if (!target) return
    const stageRect = stage.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    stage.scrollTop += targetRect.top - stageRect.top - 24
  })
}

function clampZoom(value) {
  return Math.min(Math.max(value, 0.1), 3)
}

function stepZoom(delta) {
  manualZoom.value = clampZoom(Math.round((scale.value + delta) * 100) / 100)
  zoomMode.value = 'manual'
  scrollActiveIntoView()
}

function zoomIn() {
  stepZoom(0.1)
}

function zoomOut() {
  stepZoom(-0.1)
}

function fitWidth() {
  zoomMode.value = 'fit-width'
  scrollActiveIntoView()
}

function fitPage() {
  zoomMode.value = 'fit-page'
  scrollActiveIntoView()
}

function actualSize() {
  manualZoom.value = 1
  zoomMode.value = 'manual'
  scrollActiveIntoView()
}

let observer
onMounted(() => {
  updateScale()
  observer = new ResizeObserver(updateScale)
  if (stageRef.value) observer.observe(stageRef.value)
})
onBeforeUnmount(() => observer?.disconnect())

watch([pageWidthPx, pageHeightPx], () => {
  updateScale()
  scrollActiveIntoView()
})

function onEditorKeydown(event) {
  if (event.key !== 'Tab') return
  event.preventDefault()
  const el = event.target
  const start = el.selectionStart
  const end = el.selectionEnd
  const isCss = activeTab.value === 'css'
  const value = isCss ? project.css : activePage.value.html
  const next = value.slice(0, start) + '  ' + value.slice(end)

  if (isCss) project.css = next
  else activePage.value.html = next

  requestAnimationFrame(() => {
    el.selectionStart = el.selectionEnd = start + 2
  })
}

function selectPage(pageId) {
  project.activePageId = pageId
  scrollActiveIntoView()
}

function onAddPage() {
  addPage()
}

function onDuplicatePage() {
  if (activePage.value) duplicatePage(activePage.value.id)
}

function onRemovePage() {
  if (activePage.value) removePage(activePage.value.id)
}

function onMovePage(direction) {
  if (activePage.value) movePage(activePage.value.id, direction)
}
</script>

<template>
  <section class="designer">
    <div class="toolbar">
      <DimensionControls />
    </div>

    <div class="panes">
      <div class="pane editor-pane">
        <div class="page-tabs">
          <div class="page-tab-list">
            <button
              v-for="(page, index) in project.pages"
              :key="page.id"
              class="page-tab"
              :class="{ active: page.id === activePage?.id }"
              @click="selectPage(page.id)"
            >
              Page {{ index + 1 }}
            </button>
          </div>
          <div class="page-actions">
            <button
              class="mini-btn"
              title="Move page left"
              :disabled="activeIndex <= 0"
              @click="onMovePage(-1)"
            >
              ←
            </button>
            <button
              class="mini-btn"
              title="Move page right"
              :disabled="activeIndex >= project.pages.length - 1"
              @click="onMovePage(1)"
            >
              →
            </button>
            <button class="mini-btn" title="Duplicate page" @click="onDuplicatePage">
              Duplicate
            </button>
            <button
              class="mini-btn"
              title="Delete page"
              :disabled="project.pages.length <= 1"
              @click="onRemovePage"
            >
              Delete
            </button>
            <button class="mini-btn add" title="Add page" @click="onAddPage">
              + Add page
            </button>
          </div>
        </div>

        <div class="editor-tabs">
          <button
            class="editor-tab"
            :class="{ active: activeTab === 'html' }"
            @click="activeTab = 'html'"
          >
            HTML
          </button>
          <button
            class="editor-tab"
            :class="{ active: activeTab === 'css' }"
            @click="activeTab = 'css'"
          >
            CSS
          </button>
          <span class="pane-hint tab-hint">
            {{ activeTab === 'css' ? 'CSS applies to all pages' : `Editing page ${activeIndex + 1}` }}
          </span>
        </div>
        <textarea
          v-if="activePage"
          v-show="activeTab === 'html'"
          v-model="activePage.html"
          class="html-editor"
          placeholder="Write your HTML here…"
          spellcheck="false"
          @keydown="onEditorKeydown"
        ></textarea>
        <textarea
          v-show="activeTab === 'css'"
          v-model="project.css"
          class="html-editor"
          placeholder="Write your CSS here…"
          spellcheck="false"
          @keydown="onEditorKeydown"
        ></textarea>
        <div class="editor-actions">
          <span class="pane-hint">
            {{ project.pages.length }} page(s) · Draft autosaves in this browser
          </span>
          <button class="btn btn-primary" :disabled="busy" @click="$emit('generate')">
            <span v-if="busy" class="spinner"></span>
            <span>{{ busy ? 'Generating PDF…' : 'Generate PDF →' }}</span>
          </button>
        </div>
      </div>

      <div class="pane preview-pane">
        <div class="pane-head">
          <span>Live preview</span>
          <div class="zoom-controls">
            <button class="zoom-btn" title="Zoom out" @click="zoomOut">−</button>
            <button class="zoom-level" title="Actual size (100%)" @click="actualSize">
              {{ Math.round(scale * 100) }}%
            </button>
            <button class="zoom-btn" title="Zoom in" @click="zoomIn">+</button>
            <span class="zoom-sep"></span>
            <button
              class="zoom-btn text"
              :class="{ active: zoomMode === 'fit-width' }"
              @click="fitWidth"
            >
              Fit width
            </button>
            <button
              class="zoom-btn text"
              :class="{ active: zoomMode === 'fit-page' }"
              @click="fitPage"
            >
              Fit page
            </button>
          </div>
        </div>
        <div ref="stageRef" class="stage" data-preview-scroll>
          <div class="pages-stack" :style="stackStyle">
            <div
              v-for="(page, index) in project.pages"
              :key="page.id"
              class="page-preview"
              :class="{ active: page.id === activePage?.id }"
              :data-page-id="page.id"
            >
              <button class="preview-label" @click="selectPage(page.id)">
                Page {{ index + 1 }}
              </button>
              <div class="page-frame-wrap" :style="pageStyle">
                <iframe
                  class="frame"
                  :srcdoc="previewDocs[index]"
                  :style="frameStyle"
                  sandbox="allow-scripts allow-same-origin"
                  scrolling="no"
                  :title="`Page ${index + 1} preview`"
                ></iframe>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.designer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.toolbar {
  padding: 14px 22px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

.panes {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(320px, 42%) 1fr;
  gap: 1px;
  background: var(--border);
}

.pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg);
}

.pane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

.pane-hint {
  font-size: 11px;
  font-weight: 400;
  color: var(--muted);
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 3px;
}

.zoom-btn {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.zoom-btn:hover {
  color: var(--text);
  border-color: var(--accent);
}

.zoom-btn.text.active {
  color: var(--accent-hover);
  border-color: var(--accent);
  background: rgba(13, 110, 253, 0.08);
}

.zoom-level {
  min-width: 46px;
  padding: 4px 6px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.zoom-level:hover {
  background: rgba(148, 163, 184, 0.12);
}

.zoom-sep {
  width: 1px;
  height: 16px;
  margin: 0 3px;
  background: var(--border);
}

.page-tabs {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

.page-tab-list {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  min-width: 0;
}

.page-tab {
  flex: none;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}

.page-tab:hover {
  color: var(--text);
  background: rgba(148, 163, 184, 0.12);
}

.page-tab.active {
  color: var(--accent-hover);
  border-color: var(--accent);
  background: rgba(13, 110, 253, 0.08);
}

.page-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  flex: none;
}

.mini-btn {
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
}

.mini-btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--accent);
}

.mini-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.mini-btn.add {
  color: var(--accent-hover);
  border-color: var(--accent);
}

.editor-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 14px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

.editor-tab {
  padding: 11px 14px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.editor-tab:hover {
  color: var(--text);
}

.editor-tab.active {
  color: var(--accent-hover);
  border-bottom-color: var(--accent);
}

.tab-hint {
  margin-left: auto;
}

.html-editor {
  flex: 1;
  min-height: 0;
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  padding: 16px 18px;
  background: #0f172a;
  color: #e2e8f0;
  font-family: 'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
  tab-size: 2;
}

.html-editor::placeholder {
  color: #64748b;
}

.editor-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  background: var(--panel);
  border-top: 1px solid var(--border);
}

.stage {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overflow-anchor: none;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding: 24px;
}

.pages-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: none;
  margin: 0 auto;
}

.page-preview {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  flex: none;
}

.preview-label {
  padding: 2px 6px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
}

.preview-label:hover {
  color: var(--text);
}

.page-preview.active .preview-label {
  color: var(--accent-hover);
}

.page-frame-wrap {
  overflow: hidden;
  background: #fff;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.12), 0 16px 40px rgba(15, 23, 42, 0.12);
}

.page-preview.active .page-frame-wrap {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.frame {
  border: none;
  background: #fff;
  display: block;
  transform-origin: top left;
}

@media (max-width: 900px) {
  .panes {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 1fr;
  }
}
</style>

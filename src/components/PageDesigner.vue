<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import DimensionControls from './DimensionControls.vue'
import { project } from '../composables/useProject.js'
import { toCssPx } from '../utils/units.js'
import { buildPageHtml } from '../../shared/pageHtml.js'

defineProps({ busy: Boolean })
defineEmits(['generate'])

const stageRef = ref(null)
const scale = ref(1)
const activeTab = ref('html')

const pageWidthPx = computed(() => Math.max(1, Math.round(toCssPx(project.width, project.unit))))
const pageHeightPx = computed(() => Math.max(1, Math.round(toCssPx(project.height, project.unit))))

const previewDoc = computed(() =>
  buildPageHtml(project.html, {
    css: project.css,
    cssWidth: pageWidthPx.value,
    cssHeight: pageHeightPx.value
  })
)

const frameStyle = computed(() => ({
  width: `${pageWidthPx.value}px`,
  height: `${pageHeightPx.value}px`
}))

const scalerStyle = computed(() => ({
  width: `${pageWidthPx.value * scale.value}px`,
  height: `${pageHeightPx.value * scale.value}px`,
  transform: `scale(${scale.value})`
}))

function updateScale() {
  const el = stageRef.value
  if (!el) return
  const padding = 48
  const availableWidth = el.clientWidth - padding
  const availableHeight = el.clientHeight - padding
  if (availableWidth <= 0 || availableHeight <= 0) return
  scale.value = Math.min(
    availableWidth / pageWidthPx.value,
    availableHeight / pageHeightPx.value,
    1
  )
}

let observer
onMounted(() => {
  updateScale()
  observer = new ResizeObserver(updateScale)
  if (stageRef.value) observer.observe(stageRef.value)
})
onBeforeUnmount(() => observer?.disconnect())

function onEditorKeydown(event) {
  if (event.key !== 'Tab') return
  event.preventDefault()
  const el = event.target
  const start = el.selectionStart
  const end = el.selectionEnd
  const key = activeTab.value === 'css' ? 'css' : 'html'
  const value = project[key]
  project[key] = value.slice(0, start) + '  ' + value.slice(end)
  requestAnimationFrame(() => {
    el.selectionStart = el.selectionEnd = start + 2
  })
}
</script>

<template>
  <section class="designer">
    <div class="toolbar">
      <DimensionControls />
    </div>

    <div class="panes">
      <div class="pane editor-pane">
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
          <span class="pane-hint tab-hint">Bootstrap 5 loads automatically</span>
        </div>
        <textarea
          v-show="activeTab === 'html'"
          v-model="project.html"
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
          <span class="pane-hint">Draft autosaves in this browser</span>
          <button class="btn btn-primary" :disabled="busy" @click="$emit('generate')">
            <span v-if="busy" class="spinner"></span>
            <span>{{ busy ? 'Generating PDF…' : 'Generate PDF →' }}</span>
          </button>
        </div>
      </div>

      <div class="pane preview-pane">
        <div class="pane-head">
          <span>Live preview</span>
          <span class="pane-hint">{{ Math.round(scale * 100) }}%</span>
        </div>
        <div ref="stageRef" class="stage">
          <div class="scaler" :style="scalerStyle">
            <iframe
              class="frame"
              :srcdoc="previewDoc"
              :style="frameStyle"
              sandbox="allow-scripts allow-same-origin"
              scrolling="no"
              title="Page preview"
            ></iframe>
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
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.scaler {
  transform-origin: top left;
  flex: none;
}

.frame {
  border: none;
  background: #fff;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.12), 0 16px 40px rgba(15, 23, 42, 0.12);
  display: block;
}

@media (max-width: 900px) {
  .panes {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 1fr;
  }
}
</style>

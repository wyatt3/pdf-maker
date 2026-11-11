<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { project, removeFields } from '../composables/useProject.js'
import {
  generatePdf,
  downloadPdf,
  canSaveAs,
  pickSaveFile,
  writeBlobToHandle,
  pdfBlob
} from '../api.js'
import { round } from '../utils/units.js'
import ZoomControls from './ZoomControls.vue'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const props = defineProps({ pdfBytes: { type: Object, default: null } })
const emit = defineEmits(['back', 'regenerate'])

const stageRef = ref(null)
const pageRef = ref(null)
const canvasRef = ref(null)

const pageWidthPt = ref(0)
const pageHeightPt = ref(0)

const zoomMode = ref('fit-page')
const manualZoom = ref(1)
const fitPageScale = ref(1)
const fitWidthScale = ref(1)

const viewScale = computed(() => {
  if (zoomMode.value === 'manual') return manualZoom.value
  if (zoomMode.value === 'fit-width') return fitWidthScale.value
  return fitPageScale.value
})

const currentPageIndex = ref(0)
const numPages = ref(0)

const selectedIds = ref([])
const marquee = ref(null)
const pendingType = ref(null)
const busy = ref(false)
const error = ref('')

let pdfDoc = null
let pdfPage = null
let renderTask = null
let pageLoadToken = 0
let resizeObserver = null
let resizeTimer = null
let marqueeCleanup = null

const displayWidth = computed(() => pageWidthPt.value * viewScale.value)
const displayHeight = computed(() => pageHeightPt.value * viewScale.value)

const pageStyle = computed(() => ({
  width: `${displayWidth.value}px`,
  height: `${displayHeight.value}px`,
  cursor: pendingType.value ? 'crosshair' : 'default'
}))

const currentPage = computed(() => project.pages[currentPageIndex.value] ?? null)

const currentFields = computed(() => {
  const pageId = currentPage.value?.id
  if (!pageId) return []
  return project.fields.filter((field) => field.pageId === pageId)
})

const selectedField = computed(() => {
  if (selectedIds.value.length !== 1) return null
  return currentFields.value.find((field) => field.id === selectedIds.value[0]) ?? null
})

const selectedFields = computed(() =>
  currentFields.value.filter((field) => selectedIds.value.includes(field.id))
)

function isSelected(id) {
  return selectedIds.value.includes(id)
}

function setSelection(ids) {
  selectedIds.value = [...new Set(ids)]
}

function selectOnly(id) {
  setSelection(id ? [id] : [])
}

function toggleSelection(id) {
  if (isSelected(id)) {
    setSelection(selectedIds.value.filter((selected) => selected !== id))
  } else {
    setSelection([...selectedIds.value, id])
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function getMoveBounds(items) {
  return {
    minX: Math.max(...items.map((item) => -item.x)),
    maxX: Math.min(...items.map((item) => pageWidthPt.value - item.w - item.x)),
    minY: Math.max(...items.map((item) => -item.y)),
    maxY: Math.min(...items.map((item) => pageHeightPt.value - item.h - item.y))
  }
}

function clampMove(dx, dy, bounds) {
  return {
    dx: clamp(dx, bounds.minX, bounds.maxX),
    dy: clamp(dy, bounds.minY, bounds.maxY)
  }
}

function fieldStyle(field) {
  const scale = viewScale.value
  return {
    left: `${field.x * scale}px`,
    top: `${field.y * scale}px`,
    width: `${field.w * scale}px`,
    height: `${field.h * scale}px`
  }
}

const marqueeStyle = computed(() => {
  const current = marquee.value
  if (!current) return {}
  const scale = viewScale.value
  return {
    left: `${Math.min(current.startX, current.currentX) * scale}px`,
    top: `${Math.min(current.startY, current.currentY) * scale}px`,
    width: `${Math.abs(current.currentX - current.startX) * scale}px`,
    height: `${Math.abs(current.currentY - current.startY) * scale}px`
  }
})

function computeScale() {
  const el = stageRef.value
  if (!el || !pageWidthPt.value) return
  const padding = 72
  const availableWidth = el.clientWidth - padding
  const availableHeight = el.clientHeight - padding
  if (availableWidth <= 0 || availableHeight <= 0) return

  fitWidthScale.value = Math.min(availableWidth / pageWidthPt.value, 2)
  fitPageScale.value = Math.min(
    availableWidth / pageWidthPt.value,
    availableHeight / pageHeightPt.value,
    2
  )
}

function clampZoom(value) {
  return clamp(value, 0.1, 3)
}

function captureZoomCenter() {
  const stage = stageRef.value
  const page = pageRef.value
  if (!stage || !page) return null
  const stageRect = stage.getBoundingClientRect()
  const pageRect = page.getBoundingClientRect()
  const pageLeft = pageRect.left - stageRect.left + stage.scrollLeft
  const pageTop = pageRect.top - stageRect.top + stage.scrollTop
  return {
    relX: (stage.scrollLeft + stage.clientWidth / 2 - pageLeft) / viewScale.value,
    relY: (stage.scrollTop + stage.clientHeight / 2 - pageTop) / viewScale.value
  }
}

function restoreZoomCenter(center) {
  if (!center) return
  nextTick(() => {
    const stage = stageRef.value
    const page = pageRef.value
    if (!stage || !page) return
    const stageRect = stage.getBoundingClientRect()
    const pageRect = page.getBoundingClientRect()
    const pageLeft = pageRect.left - stageRect.left + stage.scrollLeft
    const pageTop = pageRect.top - stageRect.top + stage.scrollTop
    stage.scrollLeft = pageLeft + center.relX * viewScale.value - stage.clientWidth / 2
    stage.scrollTop = pageTop + center.relY * viewScale.value - stage.clientHeight / 2
  })
}

function stepZoom(delta) {
  const center = captureZoomCenter()
  manualZoom.value = clampZoom(Math.round((viewScale.value + delta) * 100) / 100)
  zoomMode.value = 'manual'
  restoreZoomCenter(center)
}

function zoomIn() {
  stepZoom(0.1)
}

function zoomOut() {
  stepZoom(-0.1)
}

function actualSize() {
  const center = captureZoomCenter()
  manualZoom.value = 1
  zoomMode.value = 'manual'
  restoreZoomCenter(center)
}

function fitWidth() {
  const center = captureZoomCenter()
  zoomMode.value = 'fit-width'
  restoreZoomCenter(center)
}

function fitPage() {
  const center = captureZoomCenter()
  zoomMode.value = 'fit-page'
  restoreZoomCenter(center)
}

async function renderCanvas() {
  if (!pdfPage || !canvasRef.value) return
  if (renderTask) {
    try {
      renderTask.cancel()
    } catch {
      // ignore
    }
    renderTask = null
  }

  const renderScale = Math.min(viewScale.value, 2)
  const viewport = pdfPage.getViewport({ scale: renderScale })
  const canvas = canvasRef.value
  const dpr = window.devicePixelRatio || 1

  canvas.width = Math.floor(viewport.width * dpr)
  canvas.height = Math.floor(viewport.height * dpr)

  const task = pdfPage.render({
    canvasContext: canvas.getContext('2d'),
    viewport,
    transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
  })
  renderTask = task

  try {
    await task.promise
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') {
      console.warn('PDF render failed:', err)
    }
  } finally {
    if (renderTask === task) renderTask = null
  }
}

async function loadPage(index) {
  if (!pdfDoc || !numPages.value) return

  const target = clamp(index, 0, numPages.value - 1)
  const token = ++pageLoadToken
  currentPageIndex.value = target

  try {
    const page = await pdfDoc.getPage(target + 1)
    if (token !== pageLoadToken) return

    pdfPage = page
    const viewport = page.getViewport({ scale: 1 })
    pageWidthPt.value = viewport.width
    pageHeightPt.value = viewport.height
    computeScale()
    await nextTick()
    if (token !== pageLoadToken) return
    await renderCanvas()
  } catch (err) {
    if (token === pageLoadToken) {
      error.value = err?.message || 'Could not load this page'
    }
  }
}

async function loadDocument() {
  if (!props.pdfBytes) return
  error.value = ''
  try {
    pdfDoc = await pdfjsLib.getDocument({ data: props.pdfBytes.slice() }).promise
    numPages.value = pdfDoc.numPages
    const target = clamp(currentPageIndex.value, 0, Math.max(0, numPages.value - 1))
    await loadPage(target)
  } catch (err) {
    error.value = err?.message || 'Could not load the generated PDF'
  }
}

async function goToPage(index) {
  if (index === currentPageIndex.value) return
  marqueeCleanup?.()
  setSelection([])
  pendingType.value = null
  await loadPage(index)
}

function scheduleRerender() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(async () => {
    if (!pdfPage) return
    computeScale()
    await renderCanvas()
  }, 120)
}

onMounted(async () => {
  await nextTick()
  await loadDocument()
  resizeObserver = new ResizeObserver(scheduleRerender)
  if (stageRef.value) resizeObserver.observe(stageRef.value)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  clearTimeout(resizeTimer)
  marqueeCleanup?.()
  window.removeEventListener('keydown', onKeydown)
  if (renderTask) {
    try {
      renderTask.cancel()
    } catch {
      // ignore
    }
  }
})

watch(
  () => props.pdfBytes,
  async () => {
    pageLoadToken++
    pdfDoc = null
    pdfPage = null
    await loadDocument()
  }
)

watch(viewScale, () => {
  scheduleRerender()
})

function togglePending(type) {
  pendingType.value = pendingType.value === type ? null : type
}

function onPagePointerDown(event) {
  if (pendingType.value || event.button !== 0) return
  if (event.target.closest?.('.field-box')) return

  const page = pageRef.value
  if (!page) return

  marqueeCleanup?.()
  event.preventDefault()

  const rect = page.getBoundingClientRect()
  const scale = viewScale.value
  const startX = clamp((event.clientX - rect.left) / scale, 0, pageWidthPt.value)
  const startY = clamp((event.clientY - rect.top) / scale, 0, pageHeightPt.value)
  const additive = event.shiftKey || event.metaKey || event.ctrlKey
  const baseSelection = additive ? selectedIds.value.slice() : []

  if (!additive) setSelection([])

  marquee.value = {
    startX,
    startY,
    currentX: startX,
    currentY: startY,
    startClientX: event.clientX,
    startClientY: event.clientY,
    additive,
    baseSelection
  }

  const onMove = (moveEvent) => {
    const current = marquee.value
    if (!current) return

    const currentRect = page.getBoundingClientRect()
    const currentScale = viewScale.value
    current.currentX = clamp(
      (moveEvent.clientX - currentRect.left) / currentScale,
      0,
      pageWidthPt.value
    )
    current.currentY = clamp(
      (moveEvent.clientY - currentRect.top) / currentScale,
      0,
      pageHeightPt.value
    )

    const distance = Math.hypot(
      moveEvent.clientX - current.startClientX,
      moveEvent.clientY - current.startClientY
    )
    if (distance < 3) return

    const left = Math.min(current.startX, current.currentX)
    const top = Math.min(current.startY, current.currentY)
    const right = Math.max(current.startX, current.currentX)
    const bottom = Math.max(current.startY, current.currentY)
    const hitIds = currentFields.value
      .filter(
        (field) =>
          field.x < right &&
          field.x + field.w > left &&
          field.y < bottom &&
          field.y + field.h > top
      )
      .map((field) => field.id)

    setSelection(current.additive ? [...current.baseSelection, ...hitIds] : hitIds)
  }

  function cleanup() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', cleanup)
    window.removeEventListener('pointercancel', cleanup)
    if (marqueeCleanup === cleanup) marqueeCleanup = null
    marquee.value = null
  }

  marqueeCleanup = cleanup
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', cleanup)
  window.addEventListener('pointercancel', cleanup)
}

function onPageClick(event) {
  if (!pendingType.value) return

  const page = currentPage.value
  if (!page) return

  const rect = pageRef.value.getBoundingClientRect()
  const cssX = event.clientX - rect.left
  const cssY = event.clientY - rect.top
  const scale = viewScale.value

  const isCheckbox = pendingType.value === 'checkbox'
  const defaults = project.fieldDefaults?.[pendingType.value] ?? {}
  const maxCheckboxSize = Math.min(pageWidthPt.value, pageHeightPt.value)
  const width = isCheckbox
    ? round(clamp(Number(defaults.size) || 14, 4, maxCheckboxSize))
    : round(clamp(Number(defaults.width) || 160, 4, pageWidthPt.value))
  const height = isCheckbox
    ? width
    : round(clamp(Number(defaults.height) || 20, 4, pageHeightPt.value))

  const x = clamp(cssX / scale, 0, pageWidthPt.value - width)
  const y = clamp(cssY / scale, 0, pageHeightPt.value - height)

  const count = project.fields.filter((field) => field.type === pendingType.value).length + 1

  const field = {
    id: crypto.randomUUID(),
    type: pendingType.value,
    pageId: page.id,
    x: round(x),
    y: round(y),
    w: width,
    h: height,
    name: `${pendingType.value}_${count}`,
    defaultValue: '',
    checked: false,
    required: false,
    fontSize: 10,
    multiline: false,
    border: false,
    tooltip: ''
  }

  project.fields.push(field)
  selectOnly(field.id)
  pendingType.value = null
}

function clampDefaultSize(type, dimension) {
  const defaults = project.fieldDefaults[type]
  if (!defaults) return

  const max =
    dimension === 'width'
      ? pageWidthPt.value
      : dimension === 'height'
        ? pageHeightPt.value
        : Math.min(pageWidthPt.value, pageHeightPt.value)
  if (!max) return

  const fallback = dimension === 'width' ? 160 : dimension === 'height' ? 20 : 14
  const raw = defaults[dimension]
  const numeric = Number(raw)
  const value = raw === '' || raw == null || !Number.isFinite(numeric) ? fallback : numeric
  defaults[dimension] = round(clamp(value, 4, max))
}

function setFieldDimension(dimension, rawValue) {
  const field = selectedField.value
  if (!field) return

  const isWidth = dimension === 'w'
  const pageSize = isWidth ? pageWidthPt.value : pageHeightPt.value
  if (!pageSize) return

  const position = isWidth ? 'x' : 'y'
  const fallback = field.type === 'checkbox' ? 14 : isWidth ? 160 : 20
  const numeric = Number(rawValue)
  const value = rawValue === '' || rawValue == null || !Number.isFinite(numeric) ? fallback : numeric

  field[position] = round(clamp(field[position], 0, Math.max(0, pageSize - 4)))
  field[dimension] = round(clamp(value, 4, pageSize - field[position]))
}

function onFieldPointerDown(event, field) {
  if (event.button !== 0) return
  event.preventDefault()

  if (event.shiftKey || event.metaKey || event.ctrlKey) {
    toggleSelection(field.id)
    return
  }

  if (!isSelected(field.id)) selectOnly(field.id)

  const fields = selectedFields.value
  if (!fields.length) return

  const startX = event.clientX
  const startY = event.clientY
  const scale = viewScale.value
  const origins = fields.map((item) => ({
    field: item,
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h
  }))
  const bounds = getMoveBounds(origins)

  const onMove = (moveEvent) => {
    const dx = (moveEvent.clientX - startX) / scale
    const dy = (moveEvent.clientY - startY) / scale
    const clamped = clampMove(dx, dy, bounds)
    for (const origin of origins) {
      origin.field.x = round(
        clamp(origin.x + clamped.dx, 0, pageWidthPt.value - origin.w)
      )
      origin.field.y = round(
        clamp(origin.y + clamped.dy, 0, pageHeightPt.value - origin.h)
      )
    }
  }

  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
}

function onFieldClick() {}

function onResizePointerDown(event, field) {
  if (event.button !== 0) return
  event.preventDefault()
  event.stopPropagation()
  selectOnly(field.id)

  const startX = event.clientX
  const startY = event.clientY
  const originW = field.w
  const originH = field.h
  const scale = viewScale.value

  const onMove = (moveEvent) => {
    const dw = (moveEvent.clientX - startX) / scale
    const dh = (moveEvent.clientY - startY) / scale
    field.w = round(clamp(originW + dw, 8, pageWidthPt.value - field.x))
    field.h = round(clamp(originH + dh, 8, pageHeightPt.value - field.y))
  }

  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

const ARROW_DELTAS = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1]
}

function onKeydown(event) {
  const tag = document.activeElement?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

  if (event.key === 'Escape') {
    if (!selectedIds.value.length) return
    event.preventDefault()
    setSelection([])
    return
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (!selectedIds.value.length) return
    event.preventDefault()
    removeSelected()
    return
  }

  const delta = ARROW_DELTAS[event.key]
  if (!delta || !selectedFields.value.length) return
  if (event.metaKey || event.altKey) return

  event.preventDefault()
  const step = event.shiftKey ? 10 : 1

  if (event.ctrlKey) {
    const field = selectedField.value
    if (!field) return
    const maxH = pageHeightPt.value - field.y
    if (delta[0] === 1) {
      field.w = round(clamp(field.w + step, 8, pageWidthPt.value - field.x))
    } else if (delta[0] === -1) {
      field.w = round(clamp(field.w - step, 8, pageWidthPt.value - field.x))
    }
    if (delta[1] === -1) {
      field.h = round(clamp(field.h + step, 8, maxH))
    } else if (delta[1] === 1) {
      field.h = round(clamp(field.h - step, 8, maxH))
    }
    return
  }

  const fields = selectedFields.value
  const bounds = getMoveBounds(fields)
  const clamped = clampMove(delta[0] * step, -delta[1] * step, bounds)
  for (const field of fields) {
    field.x = round(field.x + clamped.dx)
    field.y = round(field.y + clamped.dy)
  }
}

function removeSelected() {
  if (!selectedIds.value.length) return
  removeFields(selectedIds.value)
  setSelection([])
}

async function onExport() {
  error.value = ''
  let handle = null
  let usePicker = canSaveAs()

  if (usePicker) {
    try {
      handle = await pickSaveFile({
        suggestedName: 'form.pdf',
        description: 'PDF document',
        mimeType: 'application/pdf',
        extension: '.pdf'
      })
    } catch {
      usePicker = false
    }
    if (usePicker && !handle) return
  }

  busy.value = true
  try {
    const fields = project.fields.map((field) => {
      const index = project.pages.findIndex((page) => page.id === field.pageId)
      return { ...field, page: index === -1 ? 0 : index }
    })
    const bytes = await generatePdf({
      pages: project.pages.map((page) => ({ html: page.html })),
      css: project.css,
      width: Number(project.width),
      height: Number(project.height),
      unit: project.unit,
      fields
    })
    if (handle) {
      await writeBlobToHandle(handle, pdfBlob(bytes))
    } else {
      downloadPdf(bytes, 'form.pdf')
    }
  } catch (err) {
    error.value = err?.message || 'Export failed'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="form-editor">
    <header class="editor-bar">
      <button class="btn btn-ghost" @click="emit('back')">← Design</button>

      <div class="tool-group">
        <button
          class="btn"
          :class="{ 'is-active': pendingType === 'text' }"
          @click="togglePending('text')"
        >
          + Text field
        </button>
        <button
          class="btn"
          :class="{ 'is-active': pendingType === 'checkbox' }"
          @click="togglePending('checkbox')"
        >
          + Checkbox
        </button>
      </div>

      <div v-if="numPages > 1" class="page-nav">
        <button
          class="btn btn-ghost page-arrow"
          :disabled="currentPageIndex <= 0"
          @click="goToPage(currentPageIndex - 1)"
        >
          ←
        </button>
        <button
          v-for="n in numPages"
          :key="n"
          class="page-pill"
          :class="{ active: n - 1 === currentPageIndex }"
          @click="goToPage(n - 1)"
        >
          {{ n }}
        </button>
        <button
          class="btn btn-ghost page-arrow"
          :disabled="currentPageIndex >= numPages - 1"
          @click="goToPage(currentPageIndex + 1)"
        >
          →
        </button>
      </div>

      <span v-if="pendingType" class="place-hint">
        Click page {{ currentPageIndex + 1 }} to place a
        {{ pendingType === 'checkbox' ? 'checkbox' : 'text field' }}
      </span>
      <span v-else class="place-hint">
        {{ currentFields.length }} field(s) on this page · {{ project.fields.length }} total
        <span v-if="selectedIds.length > 1"> · {{ selectedIds.length }} selected</span>
      </span>

      <div class="spacer"></div>

      <span v-if="error" class="error-text">{{ error }}</span>

      <ZoomControls
        :scale="viewScale"
        :mode="zoomMode"
        @zoom-in="zoomIn"
        @zoom-out="zoomOut"
        @actual-size="actualSize"
        @fit-width="fitWidth"
        @fit-page="fitPage"
      />

      <button class="btn btn-ghost" :disabled="busy" @click="emit('regenerate')">
        Regenerate
      </button>
      <button class="btn btn-primary" :disabled="busy" @click="onExport">
        <span v-if="busy" class="spinner"></span>
        <span>{{ busy ? 'Exporting…' : 'Export PDF…' }}</span>
      </button>
    </header>

    <div class="editor-body">
      <div ref="stageRef" class="stage">
        <div
          ref="pageRef"
          class="page"
          :style="pageStyle"
          @click="onPageClick"
          @pointerdown="onPagePointerDown"
        >
          <canvas ref="canvasRef" class="pdf-canvas"></canvas>
          <div class="overlay">
            <div
              v-for="field in currentFields"
              :key="field.id"
              class="field-box"
              :class="{
                selected: isSelected(field.id),
                'is-checkbox': field.type === 'checkbox'
              }"
              :style="fieldStyle(field)"
              @pointerdown.stop="onFieldPointerDown($event, field)"
              @click.stop="onFieldClick"
            >
              <span class="field-tag">{{ field.name }}</span>
              <span
                v-if="selectedIds.length === 1 && isSelected(field.id)"
                class="resize-handle"
                @pointerdown.stop="onResizePointerDown($event, field)"
              ></span>
            </div>
            <div v-if="marquee" class="marquee" :style="marqueeStyle"></div>
          </div>
        </div>
      </div>

      <aside class="props">
        <div class="props-head">Field settings</div>

        <div v-if="selectedField" class="props-body">
          <div class="prop">
            <span class="field-label">Type</span>
            <span class="type-pill">
              {{ selectedField.type === 'checkbox' ? 'Checkbox' : 'Text field' }}
            </span>
          </div>

          <div class="prop">
            <label class="field-label">Field name</label>
            <input v-model="selectedField.name" class="input" />
          </div>

          <div class="prop-row">
            <div class="prop">
              <label class="field-label">Width (pt)</label>
              <input
                :value="selectedField.w"
                class="input"
                type="number"
                min="4"
                step="any"
                :max="Math.max(4, pageWidthPt - selectedField.x)"
                @change="setFieldDimension('w', $event.target.value)"
              />
            </div>
            <div class="prop">
              <label class="field-label">Height (pt)</label>
              <input
                :value="selectedField.h"
                class="input"
                type="number"
                min="4"
                step="any"
                :max="Math.max(4, pageHeightPt - selectedField.y)"
                @change="setFieldDimension('h', $event.target.value)"
              />
            </div>
          </div>

          <template v-if="selectedField.type === 'text'">
            <div class="prop">
              <label class="field-label">Default value</label>
              <input v-model="selectedField.defaultValue" class="input" />
            </div>

            <div class="prop-row">
              <div class="prop">
                <label class="field-label">Font size</label>
                <input
                  v-model.number="selectedField.fontSize"
                  class="input"
                  type="number"
                  min="4"
                  max="48"
                />
              </div>
              <label class="check">
                <input v-model="selectedField.multiline" type="checkbox" /> Multiline
              </label>
            </div>

            <label class="check">
              <input v-model="selectedField.border" type="checkbox" /> Show border
            </label>
          </template>

          <template v-else>
            <label class="check">
              <input v-model="selectedField.checked" type="checkbox" /> Checked by default
            </label>
          </template>

          <label class="check">
            <input v-model="selectedField.required" type="checkbox" /> Required
          </label>

          <div class="prop">
            <label class="field-label">Tooltip</label>
            <input v-model="selectedField.tooltip" class="input" />
          </div>

          <div class="prop-actions">
            <span class="coords">
              x {{ Math.round(selectedField.x) }} · y {{ Math.round(selectedField.y) }} pt from top-left
            </span>
            <button class="btn btn-danger" @click="removeSelected">Delete field</button>
          </div>
        </div>

        <div v-else-if="selectedIds.length > 1" class="props-body">
          <div class="prop">
            <span class="field-label">Selection</span>
            <span class="type-pill">{{ selectedIds.length }} fields selected</span>
          </div>
          <p class="muted">
            Drag any selected field to move the group. Shift-click or Ctrl/Cmd-click to add or remove fields, or drag a box on the page.
          </p>
          <div class="prop-actions">
            <span class="coords">Fields move together</span>
            <button class="btn btn-danger" @click="removeSelected">Delete selected</button>
          </div>
        </div>

        <div v-else class="props-empty">
          <p>Select a field to edit it, or add one from the toolbar.</p>
          <p class="muted">
            Drag to move, nudge with the arrow keys, Ctrl+arrow to resize (Shift for 10pt), or use the corner handle. Press Delete to remove.
          </p>
          <p class="muted">
            Shift-click or Ctrl/Cmd-click to select multiple fields, or drag a box on the page. Drag any selected field to move the group.
          </p>
        </div>

        <div class="defaults">
          <div class="defaults-head">New field defaults</div>
          <div class="prop-row">
            <div class="prop">
              <label class="field-label">Text width (pt)</label>
              <input
                v-model.number="project.fieldDefaults.text.width"
                class="input"
                type="number"
                min="4"
                :max="pageWidthPt"
                @change="clampDefaultSize('text', 'width')"
              />
            </div>
            <div class="prop">
              <label class="field-label">Text height (pt)</label>
              <input
                v-model.number="project.fieldDefaults.text.height"
                class="input"
                type="number"
                min="4"
                :max="pageHeightPt"
                @change="clampDefaultSize('text', 'height')"
              />
            </div>
          </div>
          <div class="prop-row">
            <div class="prop">
              <label class="field-label">Checkbox size (pt)</label>
              <input
                v-model.number="project.fieldDefaults.checkbox.size"
                class="input"
                type="number"
                min="4"
                :max="Math.min(pageWidthPt, pageHeightPt)"
                @change="clampDefaultSize('checkbox', 'size')"
              />
            </div>
          </div>
          <p class="defaults-hint">Used for newly placed fields.</p>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.form-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.editor-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 22px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.tool-group {
  display: flex;
  gap: 6px;
  padding-left: 10px;
  border-left: 1px solid var(--border);
}

.page-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-left: 10px;
  border-left: 1px solid var(--border);
  overflow-x: auto;
  max-width: 300px;
}

.page-arrow {
  flex: none;
  padding: 4px 8px;
}

.page-pill {
  flex: none;
  min-width: 26px;
  padding: 4px 7px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
}

.page-pill:hover {
  color: var(--text);
  border-color: var(--accent);
}

.page-pill.active {
  color: #fff;
  border-color: var(--accent);
  background: var(--accent);
}

.place-hint {
  font-size: 12px;
  color: var(--muted);
}

.spacer {
  flex: 1;
}

.editor-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 300px;
}

.stage {
  min-height: 0;
  overflow: auto;
  overflow-anchor: none;
  display: flex;
  padding: 36px;
  background: repeating-conic-gradient(#e9eef5 0% 25%, #f1f5f9 0% 50%) 50% / 24px 24px;
}

.page {
  position: relative;
  flex: none;
  margin: auto;
  background: #fff;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.12), 0 18px 44px rgba(15, 23, 42, 0.16);
}

.pdf-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.marquee {
  position: absolute;
  border: 1px dashed var(--accent);
  background: rgba(37, 99, 235, 0.12);
  pointer-events: none;
  z-index: 5;
}

.field-box {
  position: absolute;
  pointer-events: auto;
  border: 1px dashed rgba(37, 99, 235, 0.75);
  background: rgba(37, 99, 235, 0.08);
  border-radius: 2px;
  cursor: move;
  user-select: none;
}

.field-box.is-checkbox {
  border-color: rgba(124, 58, 237, 0.8);
  background: rgba(124, 58, 237, 0.12);
}

.field-box.selected {
  border-style: solid;
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
  background: rgba(37, 99, 235, 0.14);
}

.field-box.is-checkbox.selected {
  border-color: #7c3aed;
  box-shadow: 0 0 0 1px #7c3aed;
}

.field-tag {
  position: absolute;
  top: -17px;
  left: -1px;
  padding: 1px 5px;
  border-radius: 3px 3px 0 0;
  background: var(--accent);
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  transition: opacity 0.12s;
}

.field-box:hover .field-tag,
.field-box.selected .field-tag {
  opacity: 1;
}

.field-box.is-checkbox .field-tag {
  background: #7c3aed;
}

.resize-handle {
  position: absolute;
  right: -5px;
  bottom: -5px;
  width: 10px;
  height: 10px;
  background: #fff;
  border: 1.5px solid var(--accent);
  border-radius: 2px;
  cursor: nwse-resize;
  opacity: 0;
  pointer-events: none;
}

.field-box.selected .resize-handle {
  opacity: 1;
  pointer-events: auto;
}

.props {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--panel);
  border-left: 1px solid var(--border);
}

.props-head {
  padding: 12px 18px;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
}

.props-body {
  flex: 1;
  min-height: 0;
  padding: 16px 18px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.props-empty {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 18px;
  font-size: 13px;
  color: var(--text);
}

.props-empty .muted,
.props-body .muted {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.defaults {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 18px;
  border-top: 1px solid var(--border);
}

.defaults-head {
  font-size: 12px;
  font-weight: 600;
}

.defaults-hint {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
}

.prop {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.prop-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}

.type-pill {
  align-self: flex-start;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent-hover);
  font-size: 12px;
  font-weight: 600;
}

.check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
}

.check input {
  width: 15px;
  height: 15px;
  accent-color: var(--accent);
}

.prop-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 4px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}

.coords {
  font-size: 11px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 900px) {
  .editor-body {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
  }
  .props {
    border-left: none;
    border-top: 1px solid var(--border);
    max-height: 40vh;
  }
}
</style>

<script setup>
import { ref } from 'vue'
import PageDesigner from './components/PageDesigner.vue'
import PdfFormEditor from './components/PdfFormEditor.vue'
import { generatePdf } from './api.js'
import { project, newProject } from './composables/useProject.js'

const step = ref('design')
const pdfBytes = ref(null)
const generating = ref(false)
const error = ref('')
const lastSignature = ref('')

function currentSignature() {
  return JSON.stringify({
    html: project.html,
    css: project.css,
    width: project.width,
    height: project.height,
    unit: project.unit
  })
}

async function handleGenerate() {
  error.value = ''
  generating.value = true
  try {
    pdfBytes.value = await generatePdf({
      html: project.html,
      css: project.css,
      width: Number(project.width),
      height: Number(project.height),
      unit: project.unit
    })
    lastSignature.value = currentSignature()
    step.value = 'fields'
  } catch (e) {
    error.value = e.message
  } finally {
    generating.value = false
  }
}

async function goToFields() {
  if (!pdfBytes.value || currentSignature() !== lastSignature.value) {
    await handleGenerate()
  } else {
    step.value = 'fields'
  }
}

function handleNew() {
  if (!confirm('Start a new project? This clears the saved draft in this browser.')) return
  newProject()
  pdfBytes.value = null
  lastSignature.value = ''
  error.value = ''
  step.value = 'design'
}
</script>

<template>
  <div class="app">
    <header class="app-header">
      <div class="brand">
        <h1>PDF Maker</h1>
      </div>

      <nav class="steps">
        <button
          class="step"
          :class="{ active: step === 'design' }"
          @click="step = 'design'"
        >
          <span class="step-num">1</span> Design page
        </button>
        <span class="step-sep">→</span>
        <button
          class="step"
          :class="{ active: step === 'fields' }"
          @click="goToFields"
        >
          <span class="step-num">2</span> Place fields
        </button>
      </nav>

      <button class="btn btn-ghost" @click="handleNew">New project</button>
    </header>

    <p v-if="error" class="app-error">{{ error }}</p>

    <main class="app-main">
      <PageDesigner
        v-if="step === 'design'"
        :busy="generating"
        @generate="handleGenerate"
      />
      <PdfFormEditor
        v-else-if="pdfBytes"
        :pdf-bytes="pdfBytes"
        @back="step = 'design'"
        @regenerate="handleGenerate"
      />
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.app-header {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 14px 22px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.brand {
  display: flex;
  align-items: center;
  margin-right: auto;
}

.brand h1 {
  font-size: 16px;
  margin: 0;
  line-height: 1.2;
}

.steps {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f8fafc;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 4px;
}

.step {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border: none;
  border-radius: 7px;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
}

.step.active {
  background: var(--panel);
  color: var(--text);
  box-shadow: var(--shadow);
}

.step-num {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #e2e8f0;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  display: grid;
  place-items: center;
}

.step.active .step-num {
  background: var(--accent);
  color: #fff;
}

.step-sep {
  color: var(--muted);
  font-size: 12px;
}

.app-error {
  margin: 0;
  padding: 10px 22px;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
  color: var(--danger);
  font-size: 13px;
}

.app-main {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

@media (max-width: 820px) {
  .app-header {
    gap: 12px;
  }
  .steps {
    order: 3;
    width: 100%;
    justify-content: center;
  }
}
</style>

<script setup>
import { computed } from 'vue'
import { project } from '../composables/useProject.js'
import {
  PRESETS,
  MM_PER_IN,
  toCssPx,
  toPdfPt,
  round
} from '../utils/units.js'

const presetOptions = [...PRESETS, { label: 'Custom', unit: null }]

const cssWidth = computed(() => Math.round(toCssPx(project.width, project.unit)))
const cssHeight = computed(() => Math.round(toCssPx(project.height, project.unit)))
const ptWidth = computed(() => round(toPdfPt(project.width, project.unit), 1))
const ptHeight = computed(() => round(toPdfPt(project.height, project.unit), 1))
const step = computed(() => (project.unit === 'in' ? 0.01 : 1))

function applyPreset(event) {
  const preset = PRESETS.find((item) => item.label === event.target.value)
  if (!preset) {
    project.preset = 'Custom'
    return
  }
  project.preset = preset.label
  project.unit = preset.unit
  project.width = preset.width
  project.height = preset.height
}

function setUnit(unit) {
  if (project.unit === unit) return
  const factor = unit === 'mm' ? MM_PER_IN : 1 / MM_PER_IN
  project.width = round(Number(project.width) * factor, unit === 'mm' ? 1 : 3)
  project.height = round(Number(project.height) * factor, unit === 'mm' ? 1 : 3)
  project.unit = unit
  project.preset = 'Custom'
}

function markCustom() {
  project.preset = 'Custom'
}
</script>

<template>
  <div class="dimensions">
    <div class="dim-group">
      <label class="field-label">Preset</label>
      <select class="select" :value="project.preset" @change="applyPreset">
        <option v-for="preset in presetOptions" :key="preset.label" :value="preset.label">
          {{ preset.label }}
        </option>
      </select>
    </div>

    <div class="dim-group">
      <label class="field-label">Units</label>
      <div class="unit-toggle">
        <button
          class="unit-btn"
          :class="{ active: project.unit === 'in' }"
          @click="setUnit('in')"
        >
          Inches
        </button>
        <button
          class="unit-btn"
          :class="{ active: project.unit === 'mm' }"
          @click="setUnit('mm')"
        >
          mm
        </button>
      </div>
    </div>

    <div class="dim-group narrow">
      <label class="field-label">Width ({{ project.unit }})</label>
      <input
        v-model.number="project.width"
        class="input"
        type="number"
        min="0.1"
        :step="step"
        @input="markCustom"
      />
    </div>

    <div class="dim-group narrow">
      <label class="field-label">Height ({{ project.unit }})</label>
      <input
        v-model.number="project.height"
        class="input"
        type="number"
        min="0.1"
        :step="step"
        @input="markCustom"
      />
    </div>

    <div class="dim-readout">
      <span>{{ cssWidth }} × {{ cssHeight }} px</span>
      <span>{{ ptWidth }} × {{ ptHeight }} pt</span>
    </div>
  </div>
</template>

<style scoped>
.dimensions {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  flex-wrap: wrap;
}

.dim-group {
  min-width: 150px;
}

.dim-group.narrow {
  min-width: 96px;
  width: 96px;
}

.unit-toggle {
  display: flex;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  overflow: hidden;
}

.unit-btn {
  flex: 1;
  padding: 8px 12px;
  border: none;
  background: var(--panel);
  font-size: 13px;
  color: var(--muted);
}

.unit-btn.active {
  background: var(--accent-soft);
  color: var(--accent-hover);
  font-weight: 600;
}

.dim-readout {
  margin-left: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  color: var(--muted);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>

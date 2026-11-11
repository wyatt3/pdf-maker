<script setup>
defineProps({
  scale: { type: Number, required: true },
  mode: { type: String, required: true }
})

defineEmits(['zoom-in', 'zoom-out', 'actual-size', 'fit-width', 'fit-page'])
</script>

<template>
  <div class="zoom-controls">
    <button type="button" class="zoom-btn" title="Zoom out" @click="$emit('zoom-out')">−</button>
    <button
      type="button"
      class="zoom-level"
      title="Actual size (100%)"
      @click="$emit('actual-size')"
    >
      {{ Math.round(scale * 100) }}%
    </button>
    <button type="button" class="zoom-btn" title="Zoom in" @click="$emit('zoom-in')">+</button>
    <span class="zoom-sep"></span>
    <button
      type="button"
      class="zoom-btn text"
      :class="{ active: mode === 'fit-width' }"
      @click="$emit('fit-width')"
    >
      Fit width
    </button>
    <button
      type="button"
      class="zoom-btn text"
      :class="{ active: mode === 'fit-page' }"
      @click="$emit('fit-page')"
    >
      Fit page
    </button>
  </div>
</template>

<style scoped>
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
</style>

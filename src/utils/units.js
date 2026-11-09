export const MM_PER_IN = 25.4
export const CSS_PX_PER_IN = 96
export const PDF_PT_PER_IN = 72

export function toCssPx(value, unit) {
  const n = Number(value) || 0
  return unit === 'in' ? n * CSS_PX_PER_IN : (n * CSS_PX_PER_IN) / MM_PER_IN
}

export function toPdfPt(value, unit) {
  const n = Number(value) || 0
  return unit === 'in' ? n * PDF_PT_PER_IN : (n * PDF_PT_PER_IN) / MM_PER_IN
}

export function round(value, places = 2) {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

export const UNIT_LABELS = {
  in: 'in',
  mm: 'mm'
}

export const PRESETS = [
  { label: 'Letter (8.5 × 11 in)', unit: 'in', width: 8.5, height: 11 },
  { label: 'Legal (8.5 × 14 in)', unit: 'in', width: 8.5, height: 14 },
  { label: 'Tabloid (11 × 17 in)', unit: 'in', width: 11, height: 17 },
  { label: 'A4 (210 × 297 mm)', unit: 'mm', width: 210, height: 297 },
  { label: 'A5 (148 × 210 mm)', unit: 'mm', width: 148, height: 210 }
]

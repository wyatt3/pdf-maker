import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib'

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function sanitizeName(raw, fallback) {
  const base = String(raw ?? '').trim() || fallback
  return base.replace(/[^\w.-]+/g, '_')
}

function markRequired(field) {
  if (typeof field.enableRequired === 'function') field.enableRequired()
  else if (typeof field.setRequired === 'function') field.setRequired(true)
}

function applyTooltip(field, tooltip) {
  if (!tooltip) return
  try {
    field.acroField.dict.set(PDFName.of('TU'), PDFString.of(String(tooltip)))
  } catch {
    // tooltips are best-effort
  }
}

/**
 * Add fillable AcroForm fields to an existing PDF.
 * Field coordinates are in PDF points with the origin at the bottom-left.
 */
export async function addFormFields(pdfBytes, fields) {
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const form = pdfDoc.getForm()
  const pages = pdfDoc.getPages()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const usedNames = new Set()
  const uniqueName = (raw, fallback) => {
    const base = sanitizeName(raw, fallback)
    let name = base
    let i = 2
    while (usedNames.has(name)) name = `${base}_${i++}`
    usedNames.add(name)
    return name
  }

  let textIndex = 0
  let checkboxIndex = 0

  for (const field of fields) {
    const page = pages[Number(field.page) || 0]
    if (!page) continue

    const pageWidth = page.getWidth()
    const pageHeight = page.getHeight()

    const x = clamp(Number(field.x) || 0, 0, pageWidth)
    const y = clamp(Number(field.y) || 0, 0, pageHeight)
    const width = clamp(Number(field.w) || 120, 4, pageWidth - x)
    const height = clamp(Number(field.h) || 18, 4, pageHeight - y)
    const fallback =
      field.type === 'checkbox' ? `checkbox_${++checkboxIndex}` : `text_${++textIndex}`
    const name = uniqueName(field.name, fallback)

    const options = { x, y, width, height }

    if (field.type === 'checkbox') {
      const checkbox = form.createCheckBox(name)
      checkbox.addToPage(page, options)
      const checked =
        field.checked === true || field.defaultValue === true || field.defaultValue === 'true'
      if (checked) checkbox.check()
      if (field.required) markRequired(checkbox)
      applyTooltip(checkbox, field.tooltip)
    } else {
      const text = form.createTextField(name)
      text.addToPage(page, {
        ...options,
        font,
        textColor: rgb(0, 0, 0),
        borderWidth: field.border === false ? 0 : 1,
        borderColor: rgb(0.5, 0.5, 0.5)
      })
      if (field.defaultValue != null) text.setText(String(field.defaultValue))
      if (field.fontSize) text.setFontSize(Number(field.fontSize))
      if (field.multiline) text.enableMultiline()
      if (field.required) markRequired(text)
      applyTooltip(text, field.tooltip)
    }
  }

  try {
    form.updateFieldAppearances(font)
  } catch {
    // Older pdf-lib versions handle appearances automatically.
  }

  return Buffer.from(await pdfDoc.save())
}

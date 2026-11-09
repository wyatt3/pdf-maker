export const CSS_PX_PER_IN = 96
export const MM_PER_IN = 25.4

export function toCssPx(value, unit) {
  const n = Number(value) || 0
  return unit === 'in' ? n * CSS_PX_PER_IN : (n * CSS_PX_PER_IN) / MM_PER_IN
}

/**
 * Wrap user HTML so it renders as exactly one fixed-size page, both in the
 * live preview iframe and in the Puppeteer PDF. Overflow is clipped so the
 * PDF never paginates.
 */
export function buildPageHtml(html, { cssWidth, cssHeight }) {
  const base = `
    <style>
      html, body { margin: 0; padding: 0; }
    </style>`

  const constraints = `
    <style>
      @page { size: ${cssWidth}px ${cssHeight}px; margin: 0; }
      html, body {
        height: ${cssHeight}px !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
      }
    </style>`

  let doc = html
  if (!/<html[\s>]/i.test(doc)) {
    doc = `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`
  }

  if (/<head[^>]*>/i.test(doc)) {
    return doc.replace(/<head([^>]*)>/i, `<head$1>${base}${constraints}`)
  }
  if (/<html[^>]*>/i.test(doc)) {
    return doc.replace(/<html([^>]*)>/i, `<html$1><head>${base}${constraints}</head>`)
  }
  return `<!doctype html><html><head><meta charset="utf-8">${base}${constraints}</head><body>${html}</body></html>`
}

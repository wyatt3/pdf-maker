export const CSS_PX_PER_IN = 96
export const MM_PER_IN = 25.4

export const BOOTSTRAP_VERSION = '5.3.3'

const BOOTSTRAP_CSS = `https://cdn.jsdelivr.net/npm/bootstrap@${BOOTSTRAP_VERSION}/dist/css/bootstrap.min.css`
const BOOTSTRAP_JS = `https://cdn.jsdelivr.net/npm/bootstrap@${BOOTSTRAP_VERSION}/dist/js/bootstrap.bundle.min.js`
const BOOTSTRAP_CSS_INTEGRITY =
  'sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH'
const BOOTSTRAP_JS_INTEGRITY =
  'sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz'

export function toCssPx(value, unit) {
  const n = Number(value) || 0
  return unit === 'in' ? n * CSS_PX_PER_IN : (n * CSS_PX_PER_IN) / MM_PER_IN
}

/**
 * Build a full HTML document for the live preview and the Puppeteer PDF.
 * Bootstrap 5 is always loaded from the CDN in the head, followed by the
 * user's custom CSS, so their styles win. The page is forced to exactly one
 * fixed-size page; overflow is clipped so the PDF never paginates.
 */
export function buildPageHtml(html, { css = '', cssWidth, cssHeight }) {
  const bootstrap = `
    <link rel="stylesheet" href="${BOOTSTRAP_CSS}" integrity="${BOOTSTRAP_CSS_INTEGRITY}" crossorigin="anonymous">
    <script src="${BOOTSTRAP_JS}" integrity="${BOOTSTRAP_JS_INTEGRITY}" crossorigin="anonymous" defer></script>`

  const base = `
    <style>
      html, body { margin: 0; padding: 0; }
    </style>`

  const customCss = css
    ? `
    <style>
${String(css).replace(/<\/style/gi, '<\\/style')}
    </style>`
    : ''

  const constraints = `
    <style>
      @page { size: ${cssWidth}px ${cssHeight}px; margin: 0; }
      html, body {
        height: ${cssHeight}px !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
      }
    </style>`

  const headContent = `${bootstrap}${base}${customCss}${constraints}`

  let doc = html
  if (!/<html[\s>]/i.test(doc)) {
    doc = `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`
  }

  if (/<head[^>]*>/i.test(doc)) {
    return doc.replace(/<head([^>]*)>/i, `<head$1>${headContent}`)
  }
  if (/<html[^>]*>/i.test(doc)) {
    return doc.replace(/<html([^>]*)>/i, `<html$1><head>${headContent}</head>`)
  }
  return `<!doctype html><html><head><meta charset="utf-8">${headContent}</head><body>${html}</body></html>`
}

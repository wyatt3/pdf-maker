import puppeteer from 'puppeteer'
import { buildPageHtml, toCssPx } from '../shared/pageHtml.js'

let browserPromise = null

function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    })
    browserPromise.catch(() => {
      browserPromise = null
    })
  }
  return browserPromise
}

export async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise.catch(() => null)
    browserPromise = null
    if (browser) await browser.close()
  }
}

export async function renderPdf({ html, width, height, unit }) {
  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    // The rendered HTML is authored locally, but scripts are not needed to
    // produce the PDF and disabling them keeps rendering deterministic.
    await page.setJavaScriptEnabled(false)

    // CJIS-friendly default: never reach out to the public internet while
    // rendering. Local and inline assets still work.
    await page.setRequestInterception(true)
    page.on('request', (request) => {
      const url = request.url()
      const allowed =
        url.startsWith('data:') ||
        url.startsWith('about:') ||
        url.startsWith('file:') ||
        url.startsWith('blob:') ||
        url.startsWith('http://localhost') ||
        url.startsWith('http://127.0.0.1')
      if (allowed) request.continue()
      else request.abort()
    })

    const cssWidth = Math.max(1, Math.round(toCssPx(width, unit)))
    const cssHeight = Math.max(1, Math.round(toCssPx(height, unit)))

    await page.setViewport({
      width: cssWidth,
      height: cssHeight,
      deviceScaleFactor: 1
    })

    await page.setContent(buildPageHtml(html, { cssWidth, cssHeight }), {
      waitUntil: 'load',
      timeout: 30000
    })

    await page.evaluate(() => document.fonts?.ready)

    const pdf = await page.pdf({
      width: `${width}${unit}`,
      height: `${height}${unit}`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: false
    })

    return pdf
  } finally {
    await page.close().catch(() => {})
  }
}

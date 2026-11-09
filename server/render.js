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

export async function renderPdf({ html = '', css = '', width, height, unit }) {
  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    // Scripts and external assets are allowed. Wait for the page to settle
    // before capturing so async resources have a chance to load.
    await page.setJavaScriptEnabled(true)

    const cssWidth = Math.max(1, Math.round(toCssPx(width, unit)))
    const cssHeight = Math.max(1, Math.round(toCssPx(height, unit)))

    await page.setViewport({
      width: cssWidth,
      height: cssHeight,
      deviceScaleFactor: 1
    })

    await page.setContent(buildPageHtml(html, { css, cssWidth, cssHeight }), {
      waitUntil: 'load',
      timeout: 30000
    })

    await page.evaluate(() => document.fonts?.ready)

    // Give async scripts a brief moment to finish painting before capture.
    await new Promise((resolve) => setTimeout(resolve, 250))

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

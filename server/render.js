import puppeteer from 'puppeteer'
import { PDFDocument } from 'pdf-lib'
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

async function renderPagePdf(tab, { html, css, width, height, unit, cssWidth, cssHeight }) {
  await tab.setViewport({
    width: cssWidth,
    height: cssHeight,
    deviceScaleFactor: 1
  })

  await tab.setContent(buildPageHtml(html, { css, cssWidth, cssHeight }), {
    waitUntil: 'load',
    timeout: 30000
  })

  await tab.evaluate(() => document.fonts?.ready)

  // Give async scripts a brief moment to finish painting before capture.
  await new Promise((resolve) => setTimeout(resolve, 250))

  return tab.pdf({
    width: `${width}${unit}`,
    height: `${height}${unit}`,
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: false
  })
}

async function mergePdfs(buffers) {
  const merged = await PDFDocument.create()
  for (const buffer of buffers) {
    const source = await PDFDocument.load(buffer)
    const [page] = await merged.copyPages(source, [0])
    merged.addPage(page)
  }
  return Buffer.from(await merged.save())
}

export async function renderPdf({ pages = [], html = '', css = '', width, height, unit }) {
  const pageList =
    Array.isArray(pages) && pages.length > 0
      ? pages.map((page) => ({ html: typeof page?.html === 'string' ? page.html : '' }))
      : [{ html: typeof html === 'string' ? html : '' }]

  const browser = await getBrowser()
  const tab = await browser.newPage()

  try {
    // Scripts and external assets are allowed. Wait for each page to settle
    // before capturing so async resources have a chance to load.
    await tab.setJavaScriptEnabled(true)

    const cssWidth = Math.max(1, Math.round(toCssPx(width, unit)))
    const cssHeight = Math.max(1, Math.round(toCssPx(height, unit)))

    const buffers = []
    for (const page of pageList) {
      buffers.push(
        await renderPagePdf(tab, {
          ...page,
          css,
          width,
          height,
          unit,
          cssWidth,
          cssHeight
        })
      )
    }

    return buffers.length === 1 ? buffers[0] : await mergePdfs(buffers)
  } finally {
    await tab.close().catch(() => {})
  }
}

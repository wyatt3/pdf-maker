import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderPdf, closeBrowser } from './render.js'
import { addFormFields } from './finalize.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = Number(process.env.PORT) || 3000

app.use(express.json({ limit: '50mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/pdf', async (req, res) => {
  try {
    const { pages, html, css, width, height, unit, fields } = req.body ?? {}

    let pageList
    if (pages != null) {
      if (!Array.isArray(pages) || pages.length === 0) {
        return res.status(400).json({ error: 'pages must be a non-empty array' })
      }
      if (pages.length > 100) {
        return res.status(400).json({ error: 'pages must contain at most 100 entries' })
      }
      for (const page of pages) {
        if (page == null || typeof page.html !== 'string') {
          return res.status(400).json({ error: 'each page must have a string html' })
        }
      }
      pageList = pages.map((page) => ({ html: page.html }))
    } else {
      if (html != null && typeof html !== 'string') {
        return res.status(400).json({ error: 'html must be a string' })
      }
      pageList = [{ html: html ?? '' }]
    }

    if (css != null && typeof css !== 'string') {
      return res.status(400).json({ error: 'css must be a string' })
    }

    const w = Number(width)
    const h = Number(height)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      return res.status(400).json({ error: 'width and height must be positive numbers' })
    }
    if (unit !== 'in' && unit !== 'mm') {
      return res.status(400).json({ error: "unit must be 'in' or 'mm'" })
    }

    let pdf = await renderPdf({ pages: pageList, css, width: w, height: h, unit })

    if (Array.isArray(fields) && fields.length > 0) {
      pdf = await addFormFields(pdf, fields)
    }

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'inline; filename="form.pdf"')
    res.setHeader('Content-Length', pdf.length)
    res.end(pdf)
  } catch (error) {
    console.error('PDF generation failed:', error)
    res.status(500).json({ error: error.message || 'PDF generation failed' })
  }
})

if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(__dirname, '../dist')
  app.use(express.static(dist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'))
  })
}

const server = app.listen(PORT, () => {
  console.log(`PDF maker server listening on http://localhost:${PORT}`)
})

async function shutdown() {
  server.close()
  await closeBrowser()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

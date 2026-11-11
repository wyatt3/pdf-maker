export async function generatePdf({ pages, html, css, width, height, unit, fields }) {
  const response = await fetch('/api/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pages, html, css, width, height, unit, fields })
  })

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const data = await response.json()
      if (data?.error) message = data.error
    } catch {
      // response was not JSON
    }
    throw new Error(message)
  }

  return new Uint8Array(await response.arrayBuffer())
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function canSaveAs() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function'
}

export async function pickSaveFile({ suggestedName, description, mimeType, extension }) {
  try {
    return await window.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description,
          accept: {
            [mimeType]: [extension]
          }
        }
      ]
    })
  } catch (error) {
    if (error?.name === 'AbortError') return null
    throw error
  }
}

export async function writeBlobToHandle(handle, blob) {
  const writable = await handle.createWritable()
  try {
    await writable.write(blob)
    await writable.close()
  } catch (error) {
    try {
      await writable.abort()
    } catch {}
    throw error
  }
}

export function pdfBlob(bytes) {
  return new Blob([bytes], { type: 'application/pdf' })
}

export function jsonBlob(data) {
  return new Blob([`${JSON.stringify(data, null, 2)}\n`], {
    type: 'application/json'
  })
}

export function downloadPdf(bytes, filename = 'form.pdf') {
  downloadBlob(pdfBlob(bytes), filename)
}

export function downloadJson(data, filename = 'pdf-maker-project.json') {
  downloadBlob(jsonBlob(data), filename)
}

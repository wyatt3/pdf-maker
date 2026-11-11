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

export function downloadPdf(bytes, filename = 'form.pdf') {
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), filename)
}

export function downloadJson(data, filename = 'pdf-maker-project.json') {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], {
    type: 'application/json'
  })
  downloadBlob(blob, filename)
}

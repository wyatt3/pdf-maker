export async function generatePdf({ html, css, width, height, unit, fields }) {
  const response = await fetch('/api/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, css, width, height, unit, fields })
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

export function downloadPdf(bytes, filename = 'form.pdf') {
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

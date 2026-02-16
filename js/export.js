export async function exportPng(containerId, filename = 'charts.png') {
  const canvas = await renderCanvas(containerId);
  if (!canvas) return;
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}

export async function copyPngToClipboard(containerId) {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard copy is not supported in this browser');
  }
  // Safari requires ClipboardItem to receive a Promise for the blob,
  // not a pre-resolved blob. This keeps the write within the user gesture.
  const item = new ClipboardItem({
    'image/png': renderCanvas(containerId).then(canvas => {
      if (!canvas) throw new Error('Nothing to copy');
      return new Promise((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Failed to prepare image')), 'image/png');
      });
    })
  });
  await navigator.clipboard.write([item]);
}

async function renderCanvas(containerId) {
  const node = document.getElementById(containerId);
  if (!node) return null;

  // Get current background color from computed styles
  const bgColor = window.getComputedStyle(document.body).backgroundColor;

  return html2canvas(node, { backgroundColor: bgColor });
}

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
  const canvas = await renderCanvas(containerId);
  if (!canvas) throw new Error('Nothing to copy');
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Failed to prepare image');
  const item = new ClipboardItem({ 'image/png': blob });
  await navigator.clipboard.write([item]);
}

async function renderCanvas(containerId) {
  const node = document.getElementById(containerId);
  if (!node) return null;

  // Get current background color from computed styles
  const bgColor = window.getComputedStyle(document.body).backgroundColor;

  return html2canvas(node, { backgroundColor: bgColor });
}

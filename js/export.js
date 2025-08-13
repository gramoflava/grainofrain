export async function exportPng(containerId, filename='charts.png') {
  const node = document.getElementById(containerId);
  if (!node) return;
  const canvas = await html2canvas(node);
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}

// Export: per-sheet SVG, print-ready A3 sheets (print CSS), project JSON in/out, axo PNG.
import type { Project } from '../model/types.ts';
import { normaliseProject } from '../model/defaults.ts';

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';

export function download(name: string, data: Blob | string, mime = 'application/octet-stream') {
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportJSON(p: Project) {
  download(`${slug(p.name)}.json`, JSON.stringify(p, null, 2), 'application/json');
}

export async function importJSON(file: File): Promise<Project> {
  const text = await file.text();
  const data = JSON.parse(text) as Project;
  if (data?.version !== 1 || !Array.isArray(data.levels) || !data.site || !data.brief || !data.facade) throw new Error('Not a facade-maker project file');
  return normaliseProject(data);
}

export function exportSVG(name: string, svg: string) {
  download(`${name}.svg`, `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`, 'image/svg+xml');
}

/** fill the print root with one A3 page per sheet (and optional HTML pages) and print */
export function printPages(svgs: string[], html: string[] = []) {
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.appendChild(root);
  }
  root.innerHTML = svgs.map((s) => `<div class="page">${s}</div>`).join('') + html.map((h) => `<div class="page html">${h}</div>`).join('');
  const done = () => { root!.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 50);
}

export function exportPNG(name: string, canvas: HTMLCanvasElement) {
  canvas.toBlob((b) => { if (b) download(`${name}.png`, b, 'image/png'); }, 'image/png');
}

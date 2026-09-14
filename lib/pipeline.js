// Pipeline de um job: fonte → produtos → copy → imagens por preset → vídeos por estilo → projeto salvo.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import { scanFolder, scanUrl, slug } from './scan.js';
import { buildCopy } from './copy.js';
import { renderProductImages } from './image.js';
import { renderProductVideo, compile } from './video.js';
import { IMAGE_PRESETS, VIDEO_STYLES, detectCategory, autoChoice } from './presets.js';

export function projectDirFor(job) {
  const cfg = loadConfig();
  return path.join(cfg.OUTPUT_DIR, job.id);
}

export async function runJob(job, { log, progress, isCancelled }) {
  const cfg = loadConfig();
  const dir = projectDirFor(job);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = { id: job.id, name: job.name, source: job.source, createdAt: new Date().toISOString(), options: job.options, products: [], dir };
  const save = () => fs.writeFileSync(path.join(dir, 'projeto.json'), JSON.stringify(manifest, null, 2));

  // 1. descoberta
  progress(2, 'buscando produtos');
  const isUrl = /^(https?:\/\/|www\.)/i.test(job.source) || (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(job.source) && !fs.existsSync(job.source.replace(/^~/, process.env.HOME)));
  let products = isUrl ? await scanUrl(job.source, log, { downloadDir: path.join(dir, 'originais'), max: job.options.max || 30 }) : await scanFolder(job.source, log);
  if (job.options.max) products = products.slice(0, job.options.max);
  if (job.options.only?.length) products = products.filter(p => job.options.only.includes(p.id));
  manifest.sourceType = isUrl ? 'url' : 'pasta';
  // copia originais de pasta para dentro do projeto (projeto autocontido)
  if (!isUrl) {
    const od = path.join(dir, 'originais'); fs.mkdirSync(od, { recursive: true });
    for (const p of products) p.images = p.images.map((f, i) => { const d = path.join(od, `${p.id}-${i + 1}${path.extname(f).toLowerCase()}`); fs.copyFileSync(f, d); return d; });
  }
  log(`${products.length} produto(s): ${products.map(p => p.name).join(', ')}`);
  save();

  const formats = job.options.formats?.length ? job.options.formats : ['wide', 'tall'];
  const n = products.length;
  const perProduct = 90 / n;
  const compiled = { wide: [], tall: [] };

  for (const [i, p] of products.entries()) {
    if (isCancelled()) throw new Error('cancelado');
    const base = 5 + i * perProduct;
    progress(base, `${p.name}: copy`);
    const copy = await buildCopy(p, log);
    if (p.price) copy.price = p.price;
    const category = copy.category || detectCategory(p);
    const auto = autoChoice(category);
    const preset = job.options.preset && job.options.preset !== 'auto' ? job.options.preset : auto.preset;
    const style = job.options.style && job.options.style !== 'auto' ? job.options.style : auto.style;
    const extraPresets = (job.options.extraPresets || []).filter(x => IMAGE_PRESETS[x] && x !== preset);
    log(`▶ ${p.name} — categoria: ${category} · preset: ${preset} · estilo: ${style}`);
    const entry = { id: p.id, name: p.name, desc: p.desc, price: p.price, category, source: p.source, originals: p.images, copy, preset, style, images: {}, video: null };
    manifest.products.push(entry); save();

    // 2. imagens
    progress(base + perProduct * 0.15, `${p.name}: imagens (${preset})`);
    const mainImages = await renderProductImages({ product: p, preset, copy, outDir: path.join(dir, 'imagens', preset), log });
    entry.images[preset] = { clean: mainImages.clean, post: mainImages.post };
    for (const ep of extraPresets) {
      if (isCancelled()) throw new Error('cancelado');
      const r = await renderProductImages({ product: p, preset: ep, copy, outDir: path.join(dir, 'imagens', ep), log });
      entry.images[ep] = { clean: r.clean, post: r.post };
    }
    save();

    // 3. vídeo
    if (job.options.video !== false) {
      progress(base + perProduct * 0.5, `${p.name}: vídeo (${style})`);
      const v = await renderProductVideo({ product: p, copy, images: mainImages, style, formats, outDir: path.join(dir, 'videos'), workDir: path.join(dir, '_work'), log, brand: job.options.brand ?? cfg.BRAND });
      entry.video = v;
      for (const f of formats) if (v.formats[f]) compiled[f].push(v.formats[f].file);
      save();
    }
    progress(base + perProduct, `${p.name}: ok`);
  }

  // 4. compilação (todos os produtos num vídeo só)
  if (n > 1 && job.options.video !== false) {
    progress(96, 'compilando catálogo em vídeo');
    manifest.compilation = {};
    for (const f of formats) {
      const out = await compile(compiled[f], path.join(dir, 'videos', `_catalogo-${f === 'wide' ? '16x9' : '9x16'}.mp4`));
      if (out) manifest.compilation[f] = out;
    }
  }
  try { fs.rmSync(path.join(dir, '_work'), { recursive: true, force: true }); } catch {}
  manifest.finishedAt = new Date().toISOString();
  save();
  progress(100, 'concluído');
  return manifest;
}

export function newJobFromLine(line) {
  // "fonte | preset | estilo | formatos" — campos após a fonte são opcionais
  const parts = line.split('|').map(s => s.trim()).filter((_, i) => i === 0 || true);
  const source = parts[0];
  if (!source) return null;
  const opt = { preset: 'auto', style: 'auto', formats: ['wide', 'tall'] };
  for (const p of parts.slice(1)) {
    const v = p.toLowerCase();
    if (IMAGE_PRESETS[v]) opt.preset = v;
    else if (VIDEO_STYLES[v]) opt.style = v;
    else if (/^(16:9|wide|horizontal)$/.test(v)) opt.formats = ['wide'];
    else if (/^(9:16|tall|vertical|reels)$/.test(v)) opt.formats = ['tall'];
    else if (/^(ambos|both|todos)$/.test(v)) opt.formats = ['wide', 'tall'];
    else if (/^sem[- ]?video$/.test(v)) opt.video = false;
    else if (/^max=\d+$/.test(v)) opt.max = parseInt(v.slice(4), 10);
    else if (v.startsWith('marca=')) opt.brand = p.slice(6);
  }
  return { source, options: opt };
}

export const nameFor = source => {
  try { if (/^https?:\/\//i.test(source)) { const u = new URL(source); return u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? ' ' + u.pathname.split('/').filter(Boolean).slice(-1)[0] : ''); } } catch {}
  return path.basename(source.replace(/\/$/, '')) || source;
};
export const makeId = source => `${new Date().toISOString().slice(0, 10)}-${slug(nameFor(source)).slice(0, 30)}-${Math.random().toString(36).slice(2, 6)}`;

// Geração das variações de imagem por preset — 100% local (sharp + rembg), IA opcional para cenário.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { loadConfig, ROOT, CACHE_DIR } from './config.js';
import { IMAGE_PRESETS } from './presets.js';

const run = promisify(execFile);
export const FONT = 'Montserrat, Ubuntu, DejaVu Sans, sans-serif';
export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const FORMATS = { square: [1080, 1080], wide: [1920, 1080], tall: [1080, 1920] };

// ---------- recorte de fundo ----------
export async function cutout(src, dst, log = () => {}) {
  if (fs.existsSync(dst)) return dst;
  const cfg = loadConfig();
  const py = fs.existsSync(cfg.PYTHON) ? cfg.PYTHON : 'python3';
  try {
    const { stdout } = await run(py, [path.join(ROOT, 'tools', 'cutout.py'), src, dst], { timeout: 180000 });
    log(`recorte: ${stdout.trim()}`);
  } catch (e) {
    log(`recorte falhou (${e.message.split('\n')[0]}) — usando imagem original`);
    await sharp(src).png().toFile(dst);
  }
  return dst;
}

// ---------- fundos ----------
function gradientSvg(w, h, colors, angle = 135) {
  const stops = colors.map((c, i) => `<stop offset="${(i / (colors.length - 1)) * 100}%" stop-color="${c}"/>`).join('');
  const rad = angle * Math.PI / 180, x2 = 50 + 50 * Math.cos(rad), y2 = 50 + 50 * Math.sin(rad);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="${100 - x2}%" y1="${100 - y2}%" x2="${x2}%" y2="${y2}%">${stops}</linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/></svg>`);
}
function glowSvg(w, h, color, cx = 0.5, cy = 0.55, r = 0.42) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><radialGradient id="r" cx="${cx * 100}%" cy="${cy * 100}%" r="${r * 100}%"><stop offset="0%" stop-color="${color}" stop-opacity="0.55"/><stop offset="60%" stop-color="${color}" stop-opacity="0.12"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#r)"/></svg>`);
}
function vignetteSvg(w, h, strength = 0.55) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><radialGradient id="v" cx="50%" cy="50%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="${strength}"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#v)"/></svg>`);
}
async function grainPng(w, h, amount = 18) {
  const n = w * h; const buf = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) { const v = 128 + Math.round((Math.random() - 0.5) * amount * 2); buf[i * 4] = buf[i * 4 + 1] = buf[i * 4 + 2] = v; buf[i * 4 + 3] = 40; }
  return sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function blurredBackdrop(src, w, h) {
  return sharp(src).resize(w, h, { fit: 'cover' }).blur(28).modulate({ brightness: 0.75, saturation: 1.1 }).png().toBuffer();
}

// ---------- IA: cenário ----------
const aiCache = path.join(CACHE_DIR, 'ai-scenes');
async function aiBackdrop(scenePrompt, w, h, log) {
  const cfg = loadConfig();
  fs.mkdirSync(aiCache, { recursive: true });
  const key = crypto.createHash('md5').update(`${cfg.IMG_PROVIDER}|${scenePrompt}|${w}x${h}`).digest('hex');
  const cached = path.join(aiCache, key + '.png');
  if (fs.existsSync(cached)) return cached;
  const prompt = `${scenePrompt}. Professional product advertising background, empty surface in the center for placing a product, photorealistic, soft studio lighting, shallow depth of field, no people, no text, no logos, 8k`;
  let png = null;
  if (cfg.IMG_PROVIDER === 'inemaimg') {
    const gw = w >= h ? 1280 : 768, gh = w >= h ? Math.round(1280 * h / w / 16) * 16 : 1344;
    const r = await fetch(`${cfg.INEMAIMG_URL}/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: cfg.INEMAIMG_MODEL, prompt, width: gw, height: gh }), signal: AbortSignal.timeout(300000) });
    if (!r.ok) throw new Error(`inemaimg HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json(); png = Buffer.from(String(j.image).replace(/^data:image\/\w+;base64,/, ''), 'base64');
  } else if (cfg.IMG_PROVIDER === 'agnes' || cfg.IMG_PROVIDER === 'openai') {
    const isAgnes = cfg.IMG_PROVIDER === 'agnes';
    const base = (isAgnes ? cfg.AGNES_BASE_URL : cfg.IMG_BASE_URL).replace(/\/$/, '');
    const key2 = isAgnes ? cfg.AGNES_API_KEY : cfg.IMG_API_KEY;
    if (!key2) throw new Error('API key de imagem vazia');
    const ratio = w === h ? '1:1' : w > h ? '16:9' : '9:16';
    const body = isAgnes ? { model: cfg.AGNES_MODEL, prompt, size: '1K', ratio, extra_body: { response_format: 'b64_json' } } : { model: cfg.IMG_MODEL, prompt, size: w === h ? '1024x1024' : w > h ? '1536x1024' : '1024x1536', n: 1 };
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await fetch(`${base}/images/generations`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key2}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
        const j = await r.json(); const d = j.data?.[0] || {};
        if (d.b64_json) png = Buffer.from(d.b64_json, 'base64');
        else if (d.url) png = Buffer.from(await (await fetch(d.url, { signal: AbortSignal.timeout(60000) })).arrayBuffer());
        if (png) break;
        throw new Error('resposta sem imagem');
      } catch (e) { lastErr = e; log(`imagem IA tentativa ${attempt + 1} falhou: ${e.message}`); await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); }
    }
    if (!png) throw lastErr;
  } else throw new Error('provedor de imagem IA desativado');
  await sharp(png).resize(w, h, { fit: 'cover' }).png().toFile(cached);
  return cached;
}

// ---------- composição ----------
async function composeOne({ productPng, original, preset, w, h, copy, withText, aiScene, log }) {
  const P = IMAGE_PRESETS[preset];
  const layers = [];
  let base;
  if (P.ai) {
    try { base = sharp(await aiBackdrop(aiScene || `${copy.category} product on a clean surface`, w, h, log)); }
    catch (e) { log(`cenário IA indisponível (${e.message}) — fundo local`); base = sharp(gradientSvg(w, h, P.bg)); }
  } else if (!P.bg) {
    base = sharp(await blurredBackdrop(original, w, h));
  } else {
    base = sharp(gradientSvg(w, h, P.bg));
  }
  if (P.glow) layers.push({ input: glowSvg(w, h, P.glow), blend: 'screen' });
  if (P.grain) layers.push({ input: await grainPng(w, h), blend: 'overlay' });

  // produto: cabe em ~62% da área (ou 78% no formato quadrado sem texto)
  // limites por formato: o texto fica embaixo, então o produto ocupa o terço superior/central
  const tall = h > w, wide = w > h;
  const maxW = Math.round(w * (tall ? 0.82 : wide ? 0.6 : (withText ? 0.7 : 0.78)));
  const maxH = Math.round(h * (tall ? (withText ? 0.5 : 0.62) : wide ? (withText ? 0.56 : 0.7) : (withText ? 0.56 : 0.78)));
  const src = P.cutout ? await trimmed(productPng) : original;
  const prod = await sharp(src).resize(maxW, maxH, { fit: 'inside', withoutEnlargement: false }).modulate({ brightness: P.grade.brightness, saturation: P.grade.saturation }).png().toBuffer();
  const meta = await sharp(prod).metadata();
  const px = Math.round((w - meta.width) / 2);
  const py = Math.round((withText ? (tall ? h * 0.36 : h * 0.4) : (tall ? h * 0.46 : h * 0.44)) - meta.height / 2);
  if (P.shadow && P.cutout) {
    // sombra: silhueta escura desfocada deslocada para baixo
    const sh = await sharp(prod).ensureAlpha().linear([0, 0, 0, 1], [0, 0, 0, 0]).blur(22).png().toBuffer();
    layers.push({ input: sh, left: px + 6, top: py + Math.round(meta.height * 0.06), blend: 'multiply' });
  } else if (P.cutout) {
    const sh = await sharp(prod).ensureAlpha().linear([0, 0, 0, 0.7], [0, 0, 0, 0]).blur(30).png().toBuffer();
    layers.push({ input: sh, left: px, top: py + Math.round(meta.height * 0.05) });
  }
  layers.push({ input: prod, left: px, top: py });
  if (P.grade.tint) layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${P.grade.tint}" fill-opacity="0.12"/></svg>`), blend: 'overlay' });
  if (!P.bg || P.ai) layers.push({ input: vignetteSvg(w, h, 0.5) });

  if (withText) {
    const tall = h > w;
    const fsH = Math.round((tall ? w : h) * (tall ? 0.075 : 0.07)), fsT = Math.round(fsH * 0.5), fsP = Math.round(fsH * 0.6);
    const cx = w / 2, y0 = tall ? h * 0.74 : h * 0.86;
    const hl = wrapText(copy.headline, tall ? 18 : wide ? 26 : 20); const fsH2 = Math.round(fsH * hl.scale); const yH = y0 - (hl.lines.length - 1) * fsH2 * 1.05;
    const pill = copy.price ? `<rect x="${cx - fsP * 3.2}" y="${y0 + fsT * 2.1}" width="${fsP * 6.4}" height="${fsP * 1.6}" rx="${fsP * 0.8}" fill="${P.accent}"/><text x="${cx}" y="${y0 + fsT * 2.1 + fsP * 1.12}" font-family="${FONT}" font-weight="800" font-size="${fsP}" fill="${P.text === '#ffffff' && P.accent !== '#ffffff' ? '#111' : '#fff'}" text-anchor="middle">${esc(copy.price)}</text>` : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <text font-family="${FONT}" font-weight="800" font-size="${fsH2}" fill="${P.text}" text-anchor="middle" style="paint-order:stroke" stroke="${P.text === '#ffffff' ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.5)'}" stroke-width="${Math.round(fsH * 0.08)}">${tspans(hl.lines, cx, yH, fsH2 * 1.05)}</text>
      <text x="${cx}" y="${y0 + fsT * 1.35}" font-family="${FONT}" font-weight="600" font-size="${fsT}" fill="${P.text}" fill-opacity="0.85" text-anchor="middle">${esc(fitText(copy.tagline, tall ? 34 : 48))}</text>${pill}</svg>`;
    layers.push({ input: Buffer.from(svg) });
  }
  return base.composite(layers).jpeg({ quality: 92, mozjpeg: true });
}

// apara o PNG recortado à caixa do conteúdo (senão o produto fica minúsculo no centro de um canvas transparente)
const trimCache = new Map();
async function trimmed(png) {
  if (trimCache.has(png)) return trimCache.get(png);
  let buf;
  try { buf = await sharp(png).ensureAlpha().trim({ threshold: 8, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(); }
  catch { buf = await sharp(png).png().toBuffer(); }
  trimCache.set(png, buf); return buf;
}

/** Quebra texto em até `lines` linhas de ~max chars; devolve { lines:[...], scale } (scale<1 se ainda for longo) */
export function wrapText(text, max, lines = 2) {
  const words = String(text || '').trim().split(/\s+/); const out = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) out.push(cur);
  if (out.length > lines) { const rest = out.slice(lines - 1).join(' '); out.length = lines - 1; out.push(rest); }
  const longest = Math.max(...out.map(l => l.length));
  return { lines: out, scale: longest > max ? Math.max(0.6, max / longest) : 1 };
}
export const tspans = (lines, x, y, lh) => lines.map((l, i) => `<tspan x="${x}" y="${y + i * lh}">${esc(l)}</tspan>`).join('');

const fitText = (s, max) => { s = String(s || ''); return s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'; };

/** Gera as variações de um produto para um preset. Retorna { clean:{square,wide,tall}, post:{...}, cutouts:[...] } */
export async function renderProductImages({ product, preset, copy, outDir, log = () => {} }) {
  fs.mkdirSync(outDir, { recursive: true });
  const cutDir = path.join(outDir, '..', '_recortes'); fs.mkdirSync(cutDir, { recursive: true });
  const P = IMAGE_PRESETS[preset]; if (!P) throw new Error(`preset desconhecido: ${preset}`);
  const result = { preset, cutouts: [], clean: {}, post: {}, shots: [] };
  for (const [i, img] of product.images.entries()) {
    const cut = path.join(cutDir, `${product.id}-${i + 1}.png`);
    if (P.cutout) await cutout(img, cut, log);
    result.cutouts.push(P.cutout ? cut : img);
  }
  const main = result.cutouts[0], original = product.images[0];
  for (const [fmt, [w, h]] of Object.entries(FORMATS)) {
    for (const withText of [false, true]) {
      const f = path.join(outDir, `${product.id}-${preset}-${fmt}${withText ? '-post' : ''}.jpg`);
      await (await composeOne({ productPng: main, original, preset, w, h, copy, withText, aiScene: copy.scene, log })).toFile(f);
      result[withText ? 'post' : 'clean'][fmt] = f;
    }
  }
  // shots extras (outras fotos do produto) em 16:9 e 9:16 limpos, para o vídeo
  for (const [i, cut] of result.cutouts.entries()) {
    const shots = {};
    for (const fmt of ['wide', 'tall']) {
      const [w, h] = FORMATS[fmt];
      const f = path.join(outDir, `${product.id}-${preset}-shot${i + 1}-${fmt}.jpg`);
      if (i === 0) shots[fmt] = result.clean[fmt];
      else { await (await composeOne({ productPng: cut, original: product.images[i], preset, w, h, copy, withText: false, aiScene: copy.scene, log })).toFile(f); shots[fmt] = f; }
    }
    result.shots.push(shots);
  }
  log(`imagens (${preset}): ${Object.keys(FORMATS).length * 2 + (result.cutouts.length - 1) * 2} arquivos`);
  return result;
}

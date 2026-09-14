// Descoberta de produtos: pasta local ou URL de site.
// Retorna [{ id, name, desc, price, images:[caminho local], source }]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';

const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp', '.tif', '.tiff']);
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 videoprodutos/1.0';

export const slug = s => String(s || 'produto').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'produto';

const titleFromFile = f => path.basename(f, path.extname(f)).replace(/[-_]+/g, ' ').replace(/\d{6,}/g, '').trim()
  .replace(/\b\w/g, c => c.toUpperCase());

function readMeta(dir) {
  const meta = {};
  for (const f of ['produto.json', 'product.json', 'meta.json']) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) { try { Object.assign(meta, JSON.parse(fs.readFileSync(p, 'utf8'))); } catch {} }
  }
  for (const f of ['produto.md', 'produto.txt', 'descricao.txt', 'README.md', 'description.txt']) {
    const p = path.join(dir, f);
    if (fs.existsSync(p) && !meta.desc) {
      const t = fs.readFileSync(p, 'utf8').trim();
      const lines = t.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (!meta.name && lines[0]) meta.name = lines[0].replace(/^#+\s*/, '');
      meta.desc = lines.slice(1).join(' ').slice(0, 600) || t.slice(0, 600);
      const pm = t.match(/R?\$\s?\d+[.,]?\d*/); if (pm && !meta.price) meta.price = pm[0];
    }
  }
  return meta;
}

// ---------- Pasta ----------
export async function scanFolder(dir, log = () => {}) {
  dir = path.resolve(dir.replace(/^~/, process.env.HOME));
  if (!fs.existsSync(dir)) throw new Error(`pasta não existe: ${dir}`);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const subdirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));
  const files = entries.filter(e => e.isFile() && IMG_EXT.has(path.extname(e.name).toLowerCase())).map(e => path.join(dir, e.name));
  const products = [];
  // Contrato 1: subpasta = produto (várias fotos + produto.json/md opcional)
  for (const sd of subdirs) {
    const p = path.join(dir, sd.name);
    const imgs = fs.readdirSync(p).filter(f => IMG_EXT.has(path.extname(f).toLowerCase())).sort().map(f => path.join(p, f));
    if (!imgs.length) continue;
    const meta = readMeta(p);
    products.push({ id: slug(meta.name || sd.name), name: meta.name || titleFromFile(sd.name), desc: meta.desc || '', price: meta.price || '', category: meta.category || '', images: imgs, source: p });
  }
  // Contrato 2: imagens soltas = um produto por imagem (agrupa por prefixo "nome-1.jpg", "nome-2.jpg")
  const groups = new Map();
  for (const f of files) {
    const base = path.basename(f, path.extname(f)).replace(/[-_ ]?(\d{1,2}|hero|closeup|detail|front|back|side)$/i, '');
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(f);
  }
  const rootMeta = subdirs.length ? {} : readMeta(dir);
  for (const [base, imgs] of groups) {
    products.push({ id: slug(base), name: titleFromFile(base), desc: rootMeta.desc || '', price: rootMeta.price || '', category: rootMeta.category || '', images: imgs.sort(), source: dir });
  }
  log(`pasta: ${products.length} produto(s), ${products.reduce((a, p) => a + p.images.length, 0)} imagem(ns)`);
  if (!products.length) throw new Error('nenhuma imagem de produto encontrada na pasta');
  return products;
}

// ---------- URL ----------
async function fetchText(url, opts = {}) {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/json;q=0.9,*/*;q=0.8', 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8' }, redirect: 'follow', signal: AbortSignal.timeout(opts.timeout || 25000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
}

const SYMBOL = { BRL: 'R$', USD: 'US$', EUR: '€', GBP: '£', ARS: 'AR$', MXN: 'MX$', CAD: 'CA$', AUD: 'AU$', JPY: '¥' };
const cleanPrice = (v, cur = 'BRL') => {
  if (v == null || v === '') return '';
  const sym = SYMBOL[cur] || cur || 'R$';
  const fmt = n => sym + ' ' + (cur === 'BRL' || cur === 'EUR' ? n.toFixed(2).replace('.', ',') : n.toFixed(2));
  if (typeof v === 'number') return fmt(v);
  const s = String(v).trim();
  if (/^\d+([.,]\d+)?$/.test(s)) return fmt(Number(s.replace(',', '.')));
  return s.slice(0, 20);
};
async function shopCurrency(base) {
  try { const j = JSON.parse(await fetchText(new URL('/meta.json', base).href, { timeout: 8000 })); if (j.currency) return j.currency; } catch {}
  return /\.br(\/|$)/.test(base) ? 'BRL' : 'USD';
}
const strip = s => cheerio.load(`<div>${s || ''}</div>`)('div').text().replace(/\s+/g, ' ').trim().slice(0, 600);

async function tryShopify(base, log) {
  try {
    const t = await fetchText(new URL('/products.json?limit=50', base).href, { timeout: 15000 });
    const j = JSON.parse(t);
    if (!j.products?.length) return null;
    const cur = await shopCurrency(base);
    log(`Shopify: ${j.products.length} produtos (${cur})`);
    return j.products.map(p => ({ id: slug(p.handle || p.title), name: p.title, desc: strip(p.body_html), price: cleanPrice(p.variants?.[0]?.price, cur), category: p.product_type || '', imageUrls: (p.images || []).map(i => i.src).slice(0, 6), url: new URL('/products/' + p.handle, base).href }));
  } catch { return null; }
}

async function tryWoo(base, log) {
  try {
    const t = await fetchText(new URL('/wp-json/wc/store/v1/products?per_page=50', base).href, { timeout: 15000 });
    const j = JSON.parse(t);
    if (!Array.isArray(j) || !j.length) return null;
    log(`WooCommerce: ${j.length} produtos`);
    return j.map(p => ({ id: slug(p.slug || p.name), name: p.name, desc: strip(p.short_description || p.description), price: p.prices?.price ? cleanPrice(Number(p.prices.price) / Math.pow(10, p.prices.currency_minor_unit ?? 2), p.prices.currency_code || 'BRL') : '', category: p.categories?.[0]?.name || '', imageUrls: (p.images || []).map(i => i.src).slice(0, 6), url: p.permalink }));
  } catch { return null; }
}

function jsonLdProducts($, pageUrl) {
  const out = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    let j; try { j = JSON.parse($(el).contents().text()); } catch { return; }
    const walk = n => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach(walk);
      const t = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
      if (t.includes('Product')) {
        const offers = Array.isArray(n.offers) ? n.offers[0] : n.offers;
        const imgs = [].concat(n.image || []).map(i => typeof i === 'string' ? i : i?.url).filter(Boolean);
        out.push({ id: slug(n.name), name: n.name, desc: strip(n.description), price: cleanPrice(offers?.price || offers?.lowPrice, offers?.priceCurrency || 'BRL'), category: n.category || '', imageUrls: imgs.map(u => new URL(u, pageUrl).href).slice(0, 6), url: n.url || pageUrl });
      }
      for (const k of ['@graph', 'itemListElement', 'item', 'mainEntity']) if (n[k]) walk(n[k]);
    };
    walk(j);
  });
  return out;
}

function ogProduct($, pageUrl) {
  const og = p => $(`meta[property="${p}"]`).attr('content') || $(`meta[name="${p}"]`).attr('content');
  const name = og('og:title') || $('h1').first().text().trim() || $('title').text().trim();
  const imgs = $('meta[property="og:image"]').map((_, e) => $(e).attr('content')).get();
  if (!name || !imgs.length) return null;
  return { id: slug(name), name: name.split(/\s[|–-]\s/)[0].trim(), desc: strip(og('og:description') || og('description')), price: cleanPrice(og('product:price:amount') || og('og:price:amount'), og('product:price:currency') || og('og:price:currency') || 'BRL'), category: '', imageUrls: imgs.map(u => new URL(u, pageUrl).href), url: pageUrl };
}

// Página genérica: pega imagens grandes com alt, agrupa como produtos
function genericImages($, pageUrl, pageTitle) {
  const imgs = [];
  $('img').each((_, el) => {
    const $e = $(el);
    let src = $e.attr('src') || $e.attr('data-src') || $e.attr('data-lazy-src') || ($e.attr('srcset') || $e.attr('data-srcset') || '').split(',').pop()?.trim().split(' ')[0];
    if (!src || src.startsWith('data:')) return;
    const w = parseInt($e.attr('width') || '0', 10), h = parseInt($e.attr('height') || '0', 10);
    if ((w && w < 200) || (h && h < 200)) return;
    if (/logo|icon|sprite|avatar|badge|flag|pixel|banner|payment|selo/i.test(src + ' ' + ($e.attr('class') || ''))) return;
    const alt = ($e.attr('alt') || '').trim();
    try { imgs.push({ src: new URL(src, pageUrl).href, alt }); } catch {}
  });
  const seen = new Set();
  const uniq = imgs.filter(i => !seen.has(i.src) && seen.add(i.src));
  return uniq.slice(0, 12).map((i, n) => ({ id: slug(i.alt || `${pageTitle}-${n + 1}`), name: i.alt || `${pageTitle} ${n + 1}`, desc: '', price: '', category: '', imageUrls: [i.src], url: pageUrl }));
}

function productLinks($, pageUrl) {
  const origin = new URL(pageUrl).origin;
  const links = new Set();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    try {
      const u = new URL(href, pageUrl);
      if (u.origin !== origin) return;
      if (/\/(products?|produtos?|p|item|itens|shop|loja)\/[^/?#]+/i.test(u.pathname) || /\/(dp|gp\/product)\//.test(u.pathname)) links.add(u.origin + u.pathname);
    } catch {}
  });
  return [...links].slice(0, 20);
}

export async function scanUrl(url, log = () => {}, opts = {}) {
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const base = new URL(url).origin;
  let list = null;
  const isRoot = new URL(url).pathname.replace(/\/$/, '') === '' || /\/(collections|colecoes|categoria|category|shop|loja|produtos|products)\/?/i.test(url);
  if (isRoot) list = (await tryShopify(base, log)) || (await tryWoo(base, log));
  if (!list) {
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    const pageTitle = ($('title').text() || 'produto').split(/\s[|–-]\s/)[0].trim();
    list = jsonLdProducts($, url);
    if (list.length) log(`JSON-LD: ${list.length} produto(s)`);
    if (!list.length) {
      const links = productLinks($, url);
      if (links.length > 1 && !opts.noCrawl) {
        log(`listagem: seguindo ${Math.min(links.length, opts.maxLinks || 12)} links de produto`);
        for (const l of links.slice(0, opts.maxLinks || 12)) {
          try {
            const h = await fetchText(l, { timeout: 15000 }); const $$ = cheerio.load(h);
            const ps = jsonLdProducts($$, l); const og = ps.length ? null : ogProduct($$, l);
            for (const p of ps.length ? ps : (og ? [og] : [])) list.push(p);
          } catch (e) { log(`  falhou ${l}: ${e.message}`); }
        }
      }
    }
    if (!list.length) { const og = ogProduct($, url); if (og) { list = [og]; log('OpenGraph: 1 produto'); } }
    if (!list.length) { list = genericImages($, url, pageTitle); log(`genérico: ${list.length} imagem(ns) grandes`); }
  }
  // dedup por id
  const byId = new Map();
  for (const p of list) { if (!p.imageUrls?.length) continue; if (!byId.has(p.id)) byId.set(p.id, p); }
  const products = [...byId.values()].slice(0, opts.max || 30);
  if (!products.length) throw new Error('nenhum produto/imagem encontrado nessa URL');
  // baixa imagens
  const dl = opts.downloadDir;
  fs.mkdirSync(dl, { recursive: true });
  for (const p of products) {
    p.images = [];
    for (const [i, u] of p.imageUrls.entries()) {
      try {
        const r = await fetch(u, { headers: { 'user-agent': UA, referer: url }, signal: AbortSignal.timeout(30000) });
        if (!r.ok) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 4000) continue;
        const ext = (r.headers.get('content-type') || '').includes('png') ? '.png' : (r.headers.get('content-type') || '').includes('webp') ? '.webp' : '.jpg';
        const f = path.join(dl, `${p.id}-${i + 1}${ext}`);
        fs.writeFileSync(f, buf); p.images.push(f);
      } catch (e) { log(`  imagem falhou: ${u.slice(0, 80)} (${e.message})`); }
    }
    p.source = p.url || url; delete p.imageUrls;
  }
  const ok = products.filter(p => p.images.length);
  log(`url: ${ok.length} produto(s) com imagem baixada`);
  if (!ok.length) throw new Error('não consegui baixar nenhuma imagem dos produtos');
  return ok;
}

export const hash = s => crypto.createHash('md5').update(s).digest('hex').slice(0, 8);

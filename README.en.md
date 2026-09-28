# videoprodutos

**🇧🇷 [Português](README.md) · 🇺🇸 [English](README.en.md) · 🇪🇸 [Español](README.es.md)**

Store folder or link → discovered products → images in style presets → automatic promotional video (16:9 and 9:16) → saved project, all through a web page with a **production queue**.
Runs **100% locally and at no cost** (ffmpeg + sharp + rembg). LLM and AI image generation are **optional**.

📖 **User guide (landing page):** https://inematds.github.io/videoprodutos/guia/en/

## What it does

1. **Finds products** in a folder (subfolder = product, or loose photos) or at a URL
   (Shopify `/products.json`, WooCommerce Store API, JSON-LD `Product`, OpenGraph, or large images on the page).
2. **Classifies** the product (technology, fashion, food, home, pets…) and writes the copy
   (title, tagline, 3 benefits, CTA, setting) — using local Ollama, an OpenAI-compatible API, or a template.
3. **Images**: background removal (local rembg) and composition in 9 presets
   (white studio, premium dark, vibrant, minimal, warm/vintage, neon, natural, original, AI-generated setting),
   in 1:1, 16:9, and 9:16, with a clean version and a version with title/price.
4. **Video**: intro → benefits → offer/CTA, with zoom/pan, transitions, color grading by style
   (dynamic, elegant, tech, natural, promotion, cinematic), CC0 music from Freesound (via inemavox)
   or a synthetic soundtrack, optional TTS narration. Outputs 16:9 + 9:16 + a catalog with all products.
5. **Queue** persists (`data/queue.json`): multiple tasks in a series, submitted through a form, a batch of lines, or the CLI.

## Run

```bash
npm install
python3 -m venv .venv && .venv/bin/pip install rembg onnxruntime pillow numpy   # background removal (optional, but recommended)
npm start          # http://localhost:3080
```

CLI:

```bash
node cli.js ~/produtos --preset dark-premium --estilo tech --marca "MINHA LOJA"
node cli.js https://loja.com.br --max 5 --formato 9:16
node cli.js --lote lista.txt      # "fonte | preset | estilo | formato | max=N | marca=X | sem-video"
```

## Folder format

```
produtos/
  fone-x1/              ← one product (multiple photos)
    1.jpg 2.jpg
    produto.json        ← {"name":"Fone X1","price":"R$ 199","desc":"...","category":"tecnologia"}
  caneca-azul/
    foto.png
    produto.md          ← 1st line = name, rest = description
  camiseta.jpg          ← loose photos: one product each
```

## Configuration (optional)

**Settings** screen in the UI or `.env` in the root (see `.env.example`). Defaults: Ollama (`qwen3.8:27b`)
for copy, inemaimg (`flux2-klein`) for AI-generated settings, inemavox for music/TTS. Any can
be disabled (`none`) or switched to an OpenAI-compatible API / Agnes — nothing is required.

## AI video engine (optional, pluggable)

`VIDEO_ENGINE=ffmpeg` (default) does local zoom/pan. `VIDEO_ENGINE=agnes` generates real camera clips
from product images through the Agnes API (`agnes-video-v2.0`, US$ 0, 720p, ~1 min per scene,
limit of 5 req/min) — the first `AI_SCENES` scenes for each product go through AI and the rest stay in
ffmpeg; if the API fails, the scene falls back to ffmpeg on its own. Other engines (kie.ai, etc.) go in
`lib/videoai.js` by implementing `generateClip()`.

## Deploying to a VPS (no GPU)

Tested profile: Ubuntu, 2 vCPU, 4 GB. Copy, setting, and video via Agnes; narration via `edge-tts`;
CPU background removal with rembg; libx264 rendering. HTTP Basic password protection in front (`APP_PASSWORD`).

```bash
ssh root@VPS
git clone https://github.com/inematds/videoprodutos /root/projetos/videoprodutos
cd /root/projetos/videoprodutos && bash deploy/deploy.sh   # deps, venv, fonts, systemd
nano .env                                                  # AGNES_API_KEY and APP_PASSWORD (model: deploy/env.vps.example)
systemctl restart videoprodutos                            # → http://IP:3080
```

Update later: `cd /root/projetos/videoprodutos && bash deploy/deploy.sh`.

## Output

`~/projetos/output/videoprodutos/<id>/` with `projeto.json`, `originais/`, `imagens/<preset>/`, `videos/`.

## Stack

Node 20+, Express, sharp, cheerio, ffmpeg (h264_nvenc or libx264), Python + rembg, edge-tts. No paid services (Agnes is US$ 0).

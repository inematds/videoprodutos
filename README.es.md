# videoprodutos

**🇧🇷 [Português](README.md) · 🇺🇸 [English](README.en.md) · 🇪🇸 [Español](README.es.md)**

Carpeta o enlace de tienda → productos descubiertos → imágenes con presets de estilo → video promocional
automático (16:9 y 9:16) → proyecto guardado, todo desde una página web con **cola de producción**.
Funciona **100% local y sin costo** (ffmpeg + sharp + rembg). Los LLM y las imágenes con IA son **opcionales**.

📖 **Guía de uso (landing):** https://inematds.github.io/videoprodutos/guia/es/

## Qué hace

1. **Busca productos** en una carpeta (subcarpeta = producto, o fotos sueltas) o en una URL
   (`/products.json` de Shopify, Store API de WooCommerce, JSON-LD `Product`, OpenGraph o imágenes grandes de la página).
2. **Clasifica** el producto (tecnología, moda, alimentos, hogar, mascotas…) y redacta el copy
   (título, tagline, 3 beneficios, CTA, escenario), con Ollama local, una API compatible con OpenAI o una plantilla.
3. **Imágenes**: recorte de fondo (rembg local) y recomposición con 9 presets
   (estudio blanco, dark premium, vibrante, minimalista, cálido/vintage, neón, natural, original, escenario por IA),
   en 1:1, 16:9 y 9:16, versión limpia y versión con título/precio.
4. **Video**: intro → beneficios → oferta/CTA, con zoom/pan, transiciones, corrección de color por estilo
   (dinámico, elegante, tech, natural, promoción, cinematográfico), música CC0 de Freesound (vía inemavox)
   o pista sintética, narración TTS opcional. Genera 16:9 + 9:16 + un catálogo con todos los productos.
5. **Cola** persistente (`data/queue.json`): varias tareas en serie, por formulario, lote de líneas o CLI.

## Ejecutar

```bash
npm install
python3 -m venv .venv && .venv/bin/pip install rembg onnxruntime pillow numpy   # recorte de fondo (opcional, pero recomendado)
npm start          # http://localhost:3080
```

CLI:

```bash
node cli.js ~/produtos --preset dark-premium --estilo tech --marca "MINHA LOJA"
node cli.js https://loja.com.br --max 5 --formato 9:16
node cli.js --lote lista.txt      # "fuente | preset | estilo | formato | max=N | marca=X | sem-video"
```

## Formato de la carpeta

```
productos/
  fone-x1/              ← un producto (varias fotos)
    1.jpg 2.jpg
    produto.json        ← {"name":"Fone X1","price":"R$ 199","desc":"...","category":"tecnologia"}
  caneca-azul/
    foto.png
    produto.md          ← 1ª linha = nome, resto = descrição
  camiseta.jpg          ← fotos sueltas: un producto cada una
```

## Configuración (opcional)

Pantalla **Configuración** en la UI o `.env` en la raíz (consulta `.env.example`). Valores predeterminados: Ollama (`qwen3.8:27b`)
para el copy, inemaimg (`flux2-klein`) para escenarios con IA, inemavox para música/TTS. Cualquiera se puede
desactivar (`none`) o cambiar por una API compatible con OpenAI / Agnes; nada es obligatorio.

## Motor de video con IA (opcional, conectable)

`VIDEO_ENGINE=ffmpeg` (predeterminado) hace zoom/pan local. `VIDEO_ENGINE=agnes` genera clips de cámara reales
a partir de las imágenes del producto mediante la API Agnes (`agnes-video-v2.0`, US$ 0, 720p, ~1 min por escena,
límite de 5 req/min): las primeras escenas indicadas por `AI_SCENES` de cada producto se generan con IA y el resto queda en
ffmpeg; si la API falla, la escena pasa automáticamente a ffmpeg. Otros motores (kie.ai, etc.) se incorporan en
`lib/videoai.js` implementando `generateClip()`.

## Despliegue en una VPS (sin GPU)

Perfil probado: Ubuntu, 2 vCPU, 4 GB. Copy, escenarios y video mediante Agnes; narración con `edge-tts`;
recorte con rembg en CPU; render libx264. Contraseña HTTP Basic al frente (`APP_PASSWORD`).

```bash
ssh root@VPS
git clone https://github.com/inematds/videoprodutos /root/projetos/videoprodutos
cd /root/projetos/videoprodutos && bash deploy/deploy.sh   # deps, venv, fuentes, systemd
nano .env                                                  # AGNES_API_KEY e APP_PASSWORD (modelo: deploy/env.vps.example)
systemctl restart videoprodutos                            # → http://IP:3080
```

Actualizar después: `cd /root/projetos/videoprodutos && bash deploy/deploy.sh`.

## Salida

`~/projetos/output/videoprodutos/<id>/` con `projeto.json`, `originais/`, `imagens/<preset>/`, `videos/`.

## Stack

Node 20+, Express, sharp, cheerio, ffmpeg (h264_nvenc o libx264), Python + rembg, edge-tts. Sin servicios pagos (Agnes es US$ 0).

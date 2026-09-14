# videoprodutos

Pasta ou link de loja → produtos descobertos → imagens em presets de estilo → vídeo promocional
automático (16:9 e 9:16) → projeto salvo, tudo por uma página web com **fila de produção**.
Roda **100% local e sem custo** (ffmpeg + sharp + rembg). LLM e imagem por IA são **opcionais**.

📖 **Guia de uso (landing):** https://inematds.github.io/videoprodutos/guia/

## O que faz

1. **Busca produtos** numa pasta (subpasta = produto, ou fotos soltas) ou numa URL
   (Shopify `/products.json`, WooCommerce Store API, JSON-LD `Product`, OpenGraph, ou imagens grandes da página).
2. **Classifica** o produto (tecnologia, moda, alimento, casa, pet…) e escreve o copy
   (título, tagline, 3 benefícios, CTA, cenário) — com Ollama local, API OpenAI-compatível, ou template.
3. **Imagens**: recorte de fundo (rembg local) e recomposição em 9 presets
   (estúdio branco, dark premium, vibrante, minimal, quente/vintage, neon, natural, original, cenário por IA),
   em 1:1, 16:9 e 9:16, versão limpa e versão com título/preço.
4. **Vídeo**: intro → benefícios → oferta/CTA, com zoom/pan, transições, grade de cor por estilo
   (dinâmico, elegante, tech, natural, promoção, cinemático), música CC0 do Freesound (via inemavox)
   ou trilha sintética, narração TTS opcional. Sai 16:9 + 9:16 + um catálogo com todos os produtos.
5. **Fila** persistente (`data/queue.json`): várias tarefas em série, por formulário, lote de linhas ou CLI.

## Rodar

```bash
npm install
python3 -m venv .venv && .venv/bin/pip install rembg onnxruntime pillow numpy   # recorte de fundo (opcional, mas recomendado)
npm start          # http://localhost:3080
```

CLI:

```bash
node cli.js ~/produtos --preset dark-premium --estilo tech --marca "MINHA LOJA"
node cli.js https://loja.com.br --max 5 --formato 9:16
node cli.js --lote lista.txt      # "fonte | preset | estilo | formato | max=N | marca=X | sem-video"
```

## Formato da pasta

```
produtos/
  fone-x1/              ← um produto (várias fotos)
    1.jpg 2.jpg
    produto.json        ← {"name":"Fone X1","price":"R$ 199","desc":"...","category":"tecnologia"}
  caneca-azul/
    foto.png
    produto.md          ← 1ª linha = nome, resto = descrição
  camiseta.jpg          ← fotos soltas: um produto cada
```

## Configuração (opcional)

Tela **Configurações** na UI ou `.env` na raiz (veja `.env.example`). Defaults: Ollama (`qwen3.8:27b`)
para copy, inemaimg (`flux2-klein`) para cenário por IA, inemavox para música/TTS. Qualquer um pode
ser desligado (`none`) ou trocado por uma API OpenAI-compatível / Agnes — nada é obrigatório.

## Saída

`~/projetos/output/videoprodutos/<id>/` com `projeto.json`, `originais/`, `imagens/<preset>/`, `videos/`.

## Stack

Node 20+, Express, sharp, cheerio, ffmpeg (h264_nvenc ou libx264), Python + rembg. Sem serviços pagos.

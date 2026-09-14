# FALHAS — videoprodutos

| data | o que quebrou | menor correção | prompt \| infra |
|---|---|---|---|
| 2026-09-14 | ffmpeg `colorbalance` rejeitou opção `ms` (não existe; é `bm`) | trocar `ms=` por `bm=` na grade `cool` | prompt |
| 2026-09-14 | Freesound sem resultado para query longa com `cc0` → sempre caía na trilha sintética | lista de tentativas (query → genérica por estilo → sem filtro de licença) | prompt |
| 2026-09-14 | produto minúsculo na composição (PNG do rembg mantém canvas inteiro transparente) | `sharp.trim()` no alpha antes de redimensionar | prompt |
| 2026-09-14 | headline truncada com "…" e texto do outro sobrepondo o texto já gravado na imagem "post" | quebra em 2 linhas (`wrapText`) + outro usa imagem limpa com preço no overlay | prompt |
| 2026-09-14 | preset cenario-ia: cache do fundo IA colidia entre formatos (chave base64 cortada em 80 chars perdia o `WxH`) → "Image to composite must have same dimensions" | chave = md5 da string inteira | prompt |
| 2026-09-14 | música do Freesound nunca era usada: inemavox devolve `path` relativo à pasta dele, `fs.existsSync` falhava em silêncio | resolver contra `~/projetos/inemavox` e, se não achar, baixar via `/api/audio/file` | infra |
| 2026-09-14 | LLM gerou headline negativa ("Sofrimento Sonoro Extremo") | regra de tom positivo + lista de palavras proibidas + exemplos no prompt | prompt |
| 2026-09-14 | uma cena falhou no ffmpeg/nvenc sem mensagem (transitório; o mesmo comando passou isolado) | wrapper `run()` com retry e fallback automático para libx264 | infra |
| 2026-09-14 | poll de status da Agnes com `task_id` devolve status vazio para sempre (só `video_id` funciona) | usar `video_id` primeiro (`j.video_id \|\| j.task_id \|\| j.id`) + teto de 12 min no poll | prompt |
| 2026-09-14 | clipe Agnes com prompt "dynamic push-in" exagera o zoom e reinventa o produto (cabeça recortada virou cachorro inteiro) | prompts de câmera suaves ("gentle, small movement, product unchanged") + negative_prompt | prompt |

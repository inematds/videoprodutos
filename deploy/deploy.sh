#!/usr/bin/env bash
# Deploy/atualização do videoprodutos numa VPS (Ubuntu, sem GPU). Idempotente.
# Uso na VPS:  bash deploy/deploy.sh      (faz pull, instala deps, fontes, venv+rembg+edge-tts, serviço systemd)
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
echo "== [1/6] código"
git pull --ff-only 2>/dev/null || true
echo "== [2/6] node deps"
npm ci --omit=dev 2>/dev/null || npm install --omit=dev
echo "== [3/6] python venv (rembg em CPU + edge-tts)"
if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; fi
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q rembg onnxruntime pillow numpy edge-tts
echo "== [4/6] fontes (Montserrat para os textos do vídeo)"
mkdir -p ~/.local/share/fonts && cp -n assets/fonts/*.ttf ~/.local/share/fonts/ && fc-cache -f >/dev/null 2>&1 || true
echo "== [5/6] .env"
if [ ! -f .env ]; then
  cp deploy/env.vps.example .env
  echo "   .env criado a partir de deploy/env.vps.example — PREENCHA AGNES_API_KEY e APP_PASSWORD"
fi
mkdir -p data "$(grep -E '^OUTPUT_DIR=' .env | cut -d= -f2- || echo /root/projetos/output/videoprodutos)"
echo "== [6/6] serviço systemd"
sed "s#/root/projetos/videoprodutos#$DIR#g" deploy/videoprodutos.service > /etc/systemd/system/videoprodutos.service
systemctl daemon-reload
systemctl enable --now videoprodutos >/dev/null
systemctl restart videoprodutos
sleep 2
systemctl --no-pager --lines=3 status videoprodutos | sed -n 1,6p
PORT=$(grep -E '^PORT=' .env | cut -d= -f2- || echo 3080); PORT=${PORT:-3080}
echo "OK → http://$(curl -s -4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}'):$PORT"

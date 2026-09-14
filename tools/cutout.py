#!/usr/bin/env python3
"""Remove o fundo de uma imagem de produto (rembg, local, sem API).
Uso: cutout.py entrada saida.png [--model isnet-general-use]
Fallback (se rembg indisponível): limiar de fundo claro/uniforme."""
import sys
from PIL import Image

def fallback(src, dst):
    im = Image.open(src).convert("RGBA")
    px = im.load(); w, h = im.size
    # cor de fundo = mediana dos cantos
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sorted(c[i] for c in corners)[2] for i in range(3))
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            d = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
            if d < 40: px[x, y] = (r, g, b, 0)
            elif d < 80: px[x, y] = (r, g, b, int(255 * (d - 40) / 40))
    im.save(dst); print("fallback")

def main():
    src, dst = sys.argv[1], sys.argv[2]
    model = sys.argv[sys.argv.index("--model") + 1] if "--model" in sys.argv else "isnet-general-use"
    try:
        from rembg import remove, new_session
        im = Image.open(src).convert("RGB")
        if max(im.size) > 2048:
            im.thumbnail((2048, 2048))
        out = remove(im, session=new_session(model), alpha_matting=False, post_process_mask=True)
        # se a máscara ficou vazia demais, tenta o modelo padrão
        bbox = out.getbbox()
        if not bbox or (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) < 0.02 * im.size[0] * im.size[1]:
            out = remove(im, session=new_session("u2net"))
        out.save(dst); print("rembg:" + model)
    except Exception as e:
        print("rembg falhou: %s" % e, file=sys.stderr)
        fallback(src, dst)

if __name__ == "__main__":
    main()

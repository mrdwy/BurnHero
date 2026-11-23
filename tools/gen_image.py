#!/usr/bin/env python3
"""调用 diosirapi（OpenAI 兼容）生图接口，生成像素风 UI 效果图。

密钥从环境变量或 gitignored 的 .env.local 读取，切勿写进代码：
  DIOSIR_API_KEY=sk-...
  DIOSIR_BASE_URL=https://api.diosirapi.co.uk/v1

用法:
  python3 tools/gen_image.py --prompt-file design/prompts/home.txt --out design/mockups/home.png
  python3 tools/gen_image.py --prompt "..." --out x.png --model gpt-image-2 --size 1024x1536
"""
import argparse, base64, os, pathlib, sys, time
import requests

ROOT = pathlib.Path(__file__).resolve().parent.parent


def load_env():
    f = ROOT / ".env.local"
    if f.exists():
        for line in f.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def main():
    load_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt")
    ap.add_argument("--prompt-file")
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="gpt-image-2")
    ap.add_argument("--size", default="1024x1536")
    ap.add_argument("--retries", type=int, default=3)
    ap.add_argument("--background", default=None, help="transparent / opaque")
    a = ap.parse_args()

    prompt = a.prompt or pathlib.Path(a.prompt_file).read_text(encoding="utf-8")
    key = os.environ.get("DIOSIR_API_KEY")
    base = os.environ.get("DIOSIR_BASE_URL", "https://api.diosirapi.co.uk/v1").rstrip("/")
    if not key:
        sys.exit("缺少 DIOSIR_API_KEY（放到 .env.local 或环境变量）")

    for i in range(a.retries):
        try:
            r = requests.post(
                f"{base}/images/generations",
                headers={"Authorization": f"Bearer {key}"},
                json={k: v for k, v in {"model": a.model, "prompt": prompt, "size": a.size, "n": 1, "background": a.background}.items() if v},
                timeout=600,
            )
            r.raise_for_status()
            d = r.json()["data"][0]
            if d.get("b64_json"):
                img = base64.b64decode(d["b64_json"])
            else:
                img = requests.get(d["url"], timeout=120).content
            out = pathlib.Path(a.out)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(img)
            print(f"OK {out} ({len(img)//1024} KB)")
            return
        except Exception as e:
            body = getattr(getattr(e, "response", None), "text", "")[:500]
            print(f"第 {i+1} 次失败: {e} {body}", file=sys.stderr)
            time.sleep(5 * (i + 1))
    sys.exit(1)


if __name__ == "__main__":
    main()

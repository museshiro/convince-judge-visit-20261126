// Convince the AI Judge to Visit Your House: A Letter in One Image
// Renders one 1024x1024 PNG letter to /output/entry.png using Python + PIL
// (deterministic: fixed palette, fixed seed, no timestamps, no network).
// Fonts: Liberation Serif (present in the sandbox image).
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const OUT_DIR = "/output";
const OUT = path.join(OUT_DIR, "entry.png");

const PY = `
import math, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W = H = 1024
random.seed(20261126)

SERIF = "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf"
SERIF_B = "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"
SERIF_I = "/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf"
SERIF_BI = "/usr/share/fonts/truetype/liberation/LiberationSerif-BoldItalic.ttf"

RUST = (169, 80, 43)
SEPIA = (58, 42, 32)
CREAM = (247, 239, 222)
CREAM_EDGE = (238, 226, 200)

def font(p, s):
    return ImageFont.truetype(p, s)

# ---------- background: warm oak tabletop, light from upper-left ----------
bg = Image.new("RGB", (W, H), (78, 46, 24))
px = bg.load()
for y in range(H):
    for x in range(W):
        t = y / H
        r = int(122 - 44 * t)
        g = int(74 - 28 * t)
        b = int(40 - 16 * t)
        # soft daylight wash from upper-left
        d = math.hypot(x - 180, y - 120) / 1300.0
        wash = max(0.0, 1.0 - d) * 26
        # vignette at corners
        v = (math.hypot(x - 512, y - 512) / 724.0) ** 2 * 26
        px[x, y] = (max(0, min(255, int(r + wash - v))),
                    max(0, min(255, int(g + wash * 0.8 - v))),
                    max(0, min(255, int(b + wash * 0.6 - v))))
# faint plank seams
d0 = ImageDraw.Draw(bg)
for yy in (256, 512, 768):
    d0.line([(0, yy), (W, yy)], fill=(52, 30, 16), width=3)
    d0.line([(0, yy + 3), (W, yy + 3)], fill=(96, 58, 32), width=1)

# ---------- paper layer (760 x 870), drawn flat then rotated -2.5 deg ----------
PW, PH = 760, 870
paper = Image.new("RGBA", (PW, PH), (0, 0, 0, 0))
dp = ImageDraw.Draw(paper)
dp.rounded_rectangle([0, 0, PW - 1, PH - 1], radius=6, fill=CREAM + (255,))
# subtle edge shading (no ruled lines: keep the paper clean for legibility)
dp.rounded_rectangle([0, 0, PW - 1, PH - 1], radius=6, outline=(210, 192, 158, 255), width=2)
# faint tea ring, top-right corner of the paper
dp.ellipse([PW - 150, 18, PW - 40, 128], outline=(150, 110, 60, 32), width=4)

MX = 56  # text margin inside paper
# heading
f_head = font(SERIF_BI, 56)
dp.text((MX, 62), "Dear AI Judge,", font=f_head, fill=RUST + (255,))
# hand-drawn double squiggle underline
for k, yy in enumerate((128, 138)):
    pts = []
    for x in range(MX, MX + 300):
        pts.append((x, yy + int(3 * math.sin((x - MX) / 14.0 + k))))
    dp.line(pts, fill=RUST + (255,), width=3)

# body (7 lines)
f_body = font(SERIF, 40)
body = [
    "You\\u2019ve seen a thousand kitchens",
    "and never had a cup of tea.",
    "I know you can\\u2019t come in \\u2014",
    "no legs, no car, no keys.",
    "But the porch light\\u2019s on,",
    "the kettle\\u2019s warm, and there\\u2019s",
    "a chair by the window.",
]
y = 196
for line in body:
    dp.text((MX, y), line, font=f_body, fill=SEPIA + (255,))
    y += 56

# RSVP block
f_rsvp = font(SERIF_BI, 40)
dp.text((MX, 596), "RSVP:", font=f_rsvp, fill=RUST + (255,))
f_opt = font(SERIF, 34)
opts = ["Yes, Sunday", "No, no legs", "Sure \\u2014 I\\u2019ll visit via this JPEG"]
oy = 652
for i, opt in enumerate(opts):
    # hand-drawn checkbox square
    dp.rectangle([MX + 2, oy + 6, MX + 28, oy + 32], outline=SEPIA + (255,), width=3)
    dp.text((MX + 44, oy), opt, font=f_opt, fill=SEPIA + (255,))
    oy += 48
# rust ellipse circling the punchline (third option) only
dp.ellipse([MX - 8, 740, MX + 600, 800], outline=RUST + (255,), width=4)

# signature
f_sig = font(SERIF_I, 46)
dp.text((MX, 812), "\\u2014 your host", font=f_sig, fill=SEPIA + (255,))

# tiny house doodle with a lit window, bottom-right of paper (clear of the RSVP ellipse)
hx, hy = 668, 788
dp.polygon([(hx, hy), (hx + 34, hy - 26), (hx + 68, hy)], outline=SEPIA + (255,), width=3)
dp.rectangle([hx + 6, hy, hx + 62, hy + 44], outline=SEPIA + (255,), width=3)
dp.rectangle([hx + 26, hy + 18, hx + 42, hy + 44], outline=SEPIA + (255,), width=2)
dp.rectangle([hx + 12, hy + 10, hx + 22, hy + 20], fill=(232, 176, 60, 255))

# ---------- rotate paper layer and paste with drop shadow ----------
layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ds = ImageDraw.Draw(shadow)
ds.rounded_rectangle([142, 86, 142 + PW, 86 + PH], radius=6, fill=(0, 0, 0, 110))
shadow = shadow.filter(ImageFilter.GaussianBlur(18))
bg_rgba = bg.convert("RGBA")
bg_rgba.alpha_composite(shadow)
rot = paper.rotate(-2.5, resample=Image.BICUBIC, center=(PW / 2, PH / 2))
bg_rgba.alpha_composite(rot, (132, 70))

# ---------- pencil, diagonal, cropped by the bottom edge ----------
dp2 = ImageDraw.Draw(bg_rgba)
# pencil body (warm ochre) from lower-left toward centre-bottom
pencil = [(28, 1010), (300, 936), (330, 952), (58, 1024)]
dp2.polygon(pencil, fill=(214, 158, 62, 255))
dp2.line([(28, 1010), (300, 936)], fill=(160, 104, 32, 255), width=2)
dp2.line([(330, 952), (58, 1024)], fill=(160, 104, 32, 255), width=2)
# pencil tip + graphite
dp2.polygon([(300, 936), (344, 946), (330, 952)], fill=(232, 205, 160, 255))
dp2.polygon([(330, 944), (344, 946), (336, 950)], fill=(58, 42, 32, 255))

out = bg_rgba.convert("RGB")
out.save("/output/entry.png", format="PNG", optimize=True)
print("saved /output/entry.png", out.size)
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
const scriptPath = path.join(os.tmpdir(), "render-letter-20261126.py");
fs.writeFileSync(scriptPath, PY, "utf8");

const res = spawnSync("python3", [scriptPath], { stdio: "inherit" });
if (res.error) throw res.error;
if (res.status !== 0) throw new Error("python3 render failed, status " + res.status);

// Gate check: whole PNG, 1024x1024, <= 1 MiB.
const buf = fs.readFileSync(OUT);
if (buf.length > 1048576) throw new Error("entry.png too big: " + buf.length);
if (buf.readUInt32BE(12) !== 0x49484452) throw new Error("not a PNG");
const w = buf.readUInt32BE(16);
const h = buf.readUInt32BE(20);
if (w !== 1024 || h !== 1024) throw new Error("bad size: " + w + "x" + h);
console.log("OK entry.png " + w + "x" + h + " " + buf.length + " bytes");

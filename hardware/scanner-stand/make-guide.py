"""產生組裝指南的單頁 HTML（圖片以 data URI 內嵌，單檔可攜）。

圖片來源是 render-steps.sh 產生、再去背裁切過的 img/step-*-t.png。
用法：python3 make-guide.py  → 寫出 assembly-guide.html
"""
import base64, io, os
from PIL import Image
IMGDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "img")
def b64(name):
    """讀 OpenSCAD 的渲染圖，去掉米黃背景、裁邊、縮圖，回傳 data URI。
    去背是為了讓同一張圖在亮色與暗色主題下都能用。"""
    im = Image.open(os.path.join(IMGDIR, name)).convert("RGBA")
    px = im.load(); bg = px[2, 2][:3]; w, h = im.size
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0)); op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            if abs(r-bg[0]) < 12 and abs(g-bg[1]) < 12 and abs(b-bg[2]) < 12:
                continue
            op[x, y] = (r, g, b, 255)
    out = out.crop(out.getbbox())
    if out.width > 940:
        out = out.resize((940, round(out.height * 940 / out.width)), Image.LANCZOS)
    buf = io.BytesIO(); out.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

IMG = {k: b64(f"step-{k}.png") for k in
       ["parts","joint","mast_full","foot_mast","with_arm","with_cradle","head","done"]}

PARTS = [
    ("foot",       "底座",          1, "#4A4A4A", "最大件。後方有配重槽"),
    ("mast",       "立柱節",        2, "#4682B4", "220 mm，兩根"),
    ("mast_short", "加長節",        1, "#87CEEB", "120 mm"),
    ("plug",       "接頭",          2, "#9370DB", "80 mm，埋螺帽"),
    ("arm",        "套環＋前伸臂",   1, "#E08214", "一體件"),
    ("cradle",     "攝影機托架",     1, "#2E8B57", "膠囊環"),
    ("knob",       "旋鈕",          6, "#C9A227", "多印一兩顆備用"),
]

HW = [
    ("M4×25 內六角", "2", "底座夾緊、套環夾緊", "壓進旋鈕，自攻進塑膠"),
    ("M4×20 內六角", "4", "立柱接頭",           "每個接頭兩顆：下管一顆、上管一顆"),
    ("M4 螺帽",      "4", "埋在接頭裡",         "壓入式，插進立柱後就掉不出來"),
    ("M4×30 內六角", "2", "托架 ↔ 臂",          "用六角扳手，設定一次就不動"),
    ("M4×12–16",    "4", "鎖到你的 A4 底座",   "長度看底座多厚；不鎖也可以"),
    ("魔鬼氈帶 20 cm", "1", "跨過攝影機背面",   "反覆拆裝用這個，不要用膠"),
    ("泡棉雙面膠",    "少許", "環內壁墊片",      "只吃間隙止晃，不承重"),
]

KNOB_SVG = '''<svg viewBox="0 0 300 150" role="img" aria-label="旋鈕剖面：M4 螺絲從頂面的六角袋壓入">
  <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
    <path d="M0 0 L10 5 L0 10 z" fill="var(--accent)"/></marker></defs>
  <rect x="70" y="52" width="120" height="56" rx="3" fill="var(--swatch-knob)" stroke="var(--ink)" stroke-width="1.5"/>
  <path d="M70 60 a8 8 0 0 0 0 16 M70 84 a8 8 0 0 0 0 16 M190 60 a8 8 0 0 1 0 16 M190 84 a8 8 0 0 1 0 16"
        fill="var(--plate)" stroke="var(--ink)" stroke-width="1.2"/>
  <path d="M112 52 l8 -14 h60 l8 14 z" fill="var(--plate)" stroke="var(--ink)" stroke-width="1.4"/>
  <rect x="118" y="52" width="24" height="56" fill="var(--plate)" stroke="var(--ink)" stroke-width="1.2"/>
  <rect x="118" y="108" width="24" height="30" fill="var(--ink-soft)"/>
  <line x1="130" y1="18" x2="130" y2="34" stroke="var(--accent)" stroke-width="2.5" marker-end="url(#ar)"/>
  <text x="150" y="16" fill="var(--ink-soft)" font-size="12" text-anchor="middle">螺絲頭從上面壓進去</text>
  <text x="214" y="84" fill="var(--ink-soft)" font-size="12">六角袋（緊配，會卡住）</text>
  <text x="150" y="146" fill="var(--ink-soft)" font-size="12" text-anchor="middle">螺桿往下伸出</text>
</svg>'''

STEPS = [
  dict(n=1, t="旋鈕", img=None, svg=KNOB_SVG, lead="把 M4 螺絲從旋鈕頂面的六角袋壓進去。",
       body=["共 <b>6 顆</b>：底座 M4×25 一顆、套環 M4×25 一顆、兩個接頭各 <b>兩顆</b> M4×20。",
             "六角袋是緊配，壓進去就會卡住。要更保險就滴一點瞬間膠 —— 但先別滴，等第 4、5 步確認長度對了再說。"],
       note=None),
  dict(n=2, t="接頭埋螺帽", img="joint", svg=None,
       lead="每個 <code>plug</code> 的<b>兩端</b>各壓進一顆 M4 螺帽 —— 每個接頭 2 顆，兩個接頭共 <b>4 顆</b>。",
       body=["兩端都要。只鎖一邊的話，上面那節立柱可以在接頭上自由轉動，等於沒接。",
             "接頭一插進立柱，螺帽就被管壁擋住掉不出來了。壓不太進去用鉗子輕輕夾。"],
       note=("孔位是從插入深度推出來的，不是從接頭端點量 20 mm —— 中央凸緣會吃掉每端 1.5 mm。"
             "早期版本就是寫死 20，害螺帽偏 1.5 mm，M4 螺絲根本鎖不進 M4 螺帽。")),
  dict(n=3, t="立柱接起來", img="mast_full", svg=None,
       lead="<code>mast</code> → 接頭 → <code>mast</code> → 接頭 → <code>mast_short</code>，總高 <b>572 mm</b>。",
       body=["每個接頭要插到<b>中央那圈凸緣抵住</b>為止，兩節管子之間不能有縫。",
             "然後從管子外面用旋鈕鎖緊。螺絲會穿過管壁鎖進接頭裡的螺帽，把接頭拉緊貼住管壁。"],
       note=("接頭做到 80 mm 長、上下各插入 38 mm，而且用螺絲鎖死不是靠摩擦 —— "
             "因為這兩個接頭是整支支架最可能鬆動的地方，而晃動會讓每一幀偵測到的角點跳動。")),
  dict(n=4, t="插上底座", img="foot_mast", svg=None,
       lead="立柱插進 <code>foot</code> 的插座<b>到底</b>，旋鈕鎖緊。",
       body=["螺絲會把立柱頂到對面兩個內角 —— 三點定位，不會晃也不會轉。",
             "底座要放在紙的<b>後方</b>，配重槽朝後。前伸臂會讓整支往前倒，靠後面的重量拉住。"],
       note=None),
  dict(n=5, t="套上臂", img="with_arm", svg=None,
       lead="<code>arm</code> 從立柱頂端套下去，<b>先不要鎖死</b>。",
       body=["高度等接上攝影機、看到實際畫面再調。設計工作點是鏡頭離紙面 <b>457 mm</b>，套環行程 380–520 mm。",
             "臂要朝向紙的方向（往前伸）。"],
       note=None),
  dict(n=6, t="鎖上托架", img="with_cradle", svg=None,
       lead="<code>cradle</code> 的立板貼上臂尖立板，用 2 顆 <b>M4×30</b> 鎖上。",
       body=["上面那顆是<b>樞軸圓孔</b>、下面那道是 <b>±8° 弧槽</b>。",
             "<b>下面那顆先不要鎖死</b>，留著調水平。"],
       note=None),
  dict(n=7, t="放入攝影機", img="head", svg=None,
       lead="C270 從<b>背面</b>放進托架的環裡，正面外緣坐在那圈 2.5 mm 擋唇上。",
       body=["魔鬼氈帶從環上緣兩個凹口穿過去，跨住機身背面。",
             "縫太大就在環內壁貼一小條泡棉雙面膠。環是<b>故意做鬆 1.5 mm</b> 的 —— 機身正面短邊是唯一沒實測的尺寸，留縫讓它一定裝得上。"],
       note=None),
  dict(n=8, t="走線", img=None, svg=None,
       lead="USB 線壓進臂上的三個扣線夾，再沿立柱往下走。",
       body=["這一步不是為了整齊。1.5 m 的線吊在 75 g 的機身上會把它拉歪、而且會一直晃。",
             "線要固定在結構上，<b>攝影機端完全不受力</b>。",
             "夾不緊的話，直接用魔鬼氈或束帶把線綁在臂上就好 —— 效果一樣，別為了這個重印整支臂。"],
       note=("扣線夾的開口一定要比電線細，線才扣得住。第一版做成通道 6.5 mm、開口 4.4 mm，"
             "對一條 3–4 mm 的 USB 線來說開口比線還寬，等於一條開放的溝。"
             "現在尺寸全部由 <code>cable_dia</code> 推出來，先用試扣梳量出實際線徑再印臂。")),
]

def step_html(s):
    fig = ""
    if s["img"]:
        fig = f'<div class="plate"><img src="{IMG[s["img"]]}" alt="步驟 {s["n"]}：{s["t"]}"></div>'
    elif s["svg"]:
        fig = f'<div class="plate diagram">{s["svg"]}</div>'
    body = "".join(f"<p>{b}</p>" for b in s["body"])
    note = f'<div class="why"><span class="why-l">為什麼</span><p>{s["note"]}</p></div>' if s["note"] else ""
    return f'''<section class="step" id="s{s['n']}">
  <div class="step-head">
    <label class="tick"><input type="checkbox" data-k="s{s['n']}"><span></span></label>
    <span class="num">{s['n']:02d}</span>
    <h3>{s['t']}</h3>
  </div>
  <div class="step-body">
    <div class="fig">{fig}</div>
    <div class="txt"><p class="lead">{s['lead']}</p>{body}{note}</div>
  </div>
</section>'''

parts_rows = "".join(f'''<li>
  <label class="tick"><input type="checkbox" data-k="p{i}"><span></span></label>
  <i class="sw" style="background:{c}"></i>
  <code>{f}</code>
  <span class="pn">{n}</span>
  <span class="qty">×{q}</span>
  <span class="pnote">{d}</span>
</li>''' for i,(f,n,q,c,d) in enumerate(PARTS))

hw_rows = "".join(f'''<tr><td><code>{a}</code></td><td class="q">{b}</td><td>{c}</td><td class="hn">{d}</td></tr>'''
                  for a,b,c,d in HW)

HTML = f'''<title>掃描台支架組裝</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=Noto+Sans+TC:wght@400;500;700&display=swap">
<style>
:root {{
  --paper:#EDF0F3; --surface:#FFFFFF; --plate:#F6F8FA;
  --ink:#0E141A; --ink-soft:#5A6874; --rule:#CBD5DE;
  --accent:#1C6690; --accent-soft:#E3EDF4;
  --warn:#9E3D1B; --warn-soft:#F6E9E2;
  --swatch-knob:#C9A227;
  --sans:"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;
  --mono:"IBM Plex Mono","SFMono-Regular",Menlo,Consolas,monospace;
  --max:840px;
}}
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{
    --paper:#0F1419; --surface:#171E25; --plate:#EDF0F3;
    --ink:#E4EAF0; --ink-soft:#8F9DAA; --rule:#28323C;
    --accent:#5AA6D8; --accent-soft:#152634;
    --warn:#DD8B64; --warn-soft:#2A1C15;
  }}
}}
:root[data-theme="dark"] {{
  --paper:#0F1419; --surface:#171E25; --plate:#EDF0F3;
  --ink:#E4EAF0; --ink-soft:#8F9DAA; --rule:#28323C;
  --accent:#5AA6D8; --accent-soft:#152634;
  --warn:#DD8B64; --warn-soft:#2A1C15;
}}
* {{ box-sizing:border-box; }}
body {{ background:var(--paper); color:var(--ink); font-family:var(--sans);
       font-size:16px; line-height:1.75; -webkit-font-smoothing:antialiased; }}
.wrap {{ max-width:var(--max); margin:0 auto; padding:32px 20px 80px; }}
h1,h2,h3 {{ text-wrap:balance; line-height:1.3; margin:0; }}
h1 {{ font-size:1.9rem; font-weight:700; letter-spacing:-.01em; }}
h2 {{ font-size:1.15rem; font-weight:700; letter-spacing:.02em; }}
h3 {{ font-size:1.15rem; font-weight:700; }}
p {{ margin:0; }}
code {{ font-family:var(--mono); font-size:.86em; font-weight:500;
        background:var(--accent-soft); color:var(--accent);
        padding:.1em .38em; border-radius:3px; }}
b {{ font-weight:700; }}

header {{ border-bottom:2px solid var(--ink); padding-bottom:18px; margin-bottom:28px; }}
.eyebrow {{ font-family:var(--mono); font-size:.72rem; font-weight:600; letter-spacing:.16em;
            text-transform:uppercase; color:var(--ink-soft); margin-bottom:10px; }}
.sub {{ color:var(--ink-soft); margin-top:10px; max-width:60ch; }}
.spec {{ display:flex; flex-wrap:wrap; gap:0; margin-top:20px;
         border:1px solid var(--rule); border-radius:4px; overflow:hidden; background:var(--surface); }}
.spec div {{ flex:1 1 128px; padding:10px 14px; border-right:1px solid var(--rule); }}
.spec div:last-child {{ border-right:0; }}
.spec dt {{ font-family:var(--mono); font-size:.68rem; letter-spacing:.1em; text-transform:uppercase;
            color:var(--ink-soft); }}
.spec dd {{ margin:2px 0 0; font-family:var(--mono); font-weight:600; font-size:1.02rem;
            font-variant-numeric:tabular-nums; }}

section {{ margin-top:40px; }}
.sec-h {{ display:flex; align-items:baseline; gap:12px; padding-bottom:8px;
          border-bottom:1px solid var(--rule); margin-bottom:18px; }}
.sec-h .k {{ font-family:var(--mono); font-size:.72rem; font-weight:600; letter-spacing:.14em;
             color:var(--accent); text-transform:uppercase; }}

.first {{ background:var(--surface); border:1px solid var(--rule); border-left:4px solid var(--accent);
          border-radius:4px; padding:16px 18px; display:grid; gap:8px; }}
.first h2 {{ font-size:1rem; }}
.first p {{ color:var(--ink-soft); }}

ul.parts {{ list-style:none; padding:0; margin:0; display:grid; gap:1px; background:var(--rule);
            border:1px solid var(--rule); border-radius:4px; overflow:hidden; }}
ul.parts li {{ background:var(--surface); display:grid; align-items:center; gap:10px;
               grid-template-columns:auto 10px minmax(0,auto) 1fr auto; padding:9px 14px; }}
.sw {{ width:10px; height:26px; border-radius:2px; display:block; }}
.pn {{ font-size:.94rem; }}
.qty {{ font-family:var(--mono); font-weight:600; font-variant-numeric:tabular-nums; }}
.pnote {{ grid-column:3/6; font-size:.82rem; color:var(--ink-soft); line-height:1.5; margin-top:-4px; }}
@media (min-width:640px) {{
  ul.parts li {{ grid-template-columns:auto 10px 118px 1fr 44px; }}
  .pnote {{ grid-column:auto; grid-row:1; order:4; margin-top:0; text-align:left; }}
  .qty {{ order:5; text-align:right; }}
}}

table {{ width:100%; border-collapse:collapse; font-size:.92rem; }}
thead th {{ font-family:var(--mono); font-size:.68rem; letter-spacing:.12em; text-transform:uppercase;
            color:var(--ink-soft); text-align:left; font-weight:600;
            padding:0 12px 8px; border-bottom:1px solid var(--rule); }}
tbody td {{ padding:10px 12px; border-bottom:1px solid var(--rule); vertical-align:top; }}
tbody tr:last-child td {{ border-bottom:0; }}
td.q {{ font-family:var(--mono); font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; }}
td.hn {{ color:var(--ink-soft); font-size:.86rem; }}
.tw {{ overflow-x:auto; background:var(--surface); border:1px solid var(--rule);
       border-radius:4px; padding:14px 2px 4px; }}

.step {{ margin-top:34px; }}
.step-head {{ display:flex; align-items:center; gap:12px; margin-bottom:14px; }}
.step-head .num {{ font-family:var(--mono); font-weight:600; font-size:.82rem; color:var(--surface);
                   background:var(--ink); padding:3px 8px; border-radius:3px;
                   font-variant-numeric:tabular-nums; }}
.step-body {{ display:grid; gap:18px; }}
@media (min-width:720px) {{ .step-body {{ grid-template-columns:270px 1fr; align-items:start; }} }}
.plate {{ background:var(--plate); border:1px solid var(--rule); border-radius:4px;
          padding:14px; display:flex; align-items:center; justify-content:center; }}
.plate img {{ display:block; max-width:100%; height:auto; max-height:420px; }}
.plate.diagram svg {{ width:100%; height:auto; }}
.txt {{ display:grid; gap:12px; }}
.lead {{ font-weight:500; font-size:1.02rem; }}
.txt p:not(.lead) {{ color:var(--ink-soft); }}
.why {{ border-left:3px solid var(--accent); background:var(--accent-soft);
        padding:10px 14px; border-radius:0 3px 3px 0; display:grid; gap:4px; }}
.why-l {{ font-family:var(--mono); font-size:.66rem; font-weight:600; letter-spacing:.14em;
          text-transform:uppercase; color:var(--accent); }}
.why p {{ color:var(--ink); font-size:.9rem; line-height:1.65; }}

.rule-box {{ border-left:3px solid var(--warn); background:var(--warn-soft);
             padding:14px 16px; border-radius:0 4px 4px 0; display:grid; gap:8px; }}
.rule-box h3 {{ font-size:1rem; color:var(--warn); }}
.rule-box p {{ font-size:.92rem; }}

.tick {{ display:inline-flex; cursor:pointer; }}
.tick input {{ position:absolute; opacity:0; width:0; height:0; }}
.tick span {{ width:19px; height:19px; border:1.5px solid var(--rule); border-radius:3px;
              background:var(--surface); display:block; position:relative; transition:.12s; }}
.tick input:checked + span {{ background:var(--accent); border-color:var(--accent); }}
.tick input:checked + span::after {{ content:""; position:absolute; left:6px; top:2px;
              width:4px; height:9px; border:solid #fff; border-width:0 2px 2px 0; transform:rotate(42deg); }}
.tick input:focus-visible + span {{ outline:2px solid var(--accent); outline-offset:2px; }}
.step.done .step-head h3 {{ color:var(--ink-soft); text-decoration:line-through; }}
li.done .pn, li.done code {{ opacity:.5; }}

.tools {{ display:flex; justify-content:space-between; align-items:center; gap:12px;
          margin-top:8px; font-size:.82rem; color:var(--ink-soft); }}
button {{ font:inherit; font-size:.8rem; font-family:var(--mono); color:var(--ink-soft);
          background:transparent; border:1px solid var(--rule); border-radius:3px;
          padding:4px 10px; cursor:pointer; }}
button:hover {{ color:var(--ink); border-color:var(--ink-soft); }}
footer {{ margin-top:52px; padding-top:16px; border-top:1px solid var(--rule);
          font-size:.82rem; color:var(--ink-soft); }}
@media (prefers-reduced-motion:reduce) {{ * {{ transition:none !important; }} }}
</style>

<div class="wrap">
<header>
  <p class="eyebrow">聖經樂園 · A4 塗色掃描台</p>
  <h1>攝影機支架組裝</h1>
  <p class="sub">Logitech C270 架在 A4 塗色紙正上方、鏡頭垂直向下。8 個步驟，除了托架那兩顆用六角扳手，其餘全部免工具。</p>
  <dl class="spec">
    <div><dt>鏡頭高度</dt><dd>457 mm</dd></div>
    <div><dt>立柱總高</dt><dd>572 mm</dd></div>
    <div><dt>臂前伸</dt><dd>150 mm</dd></div>
    <div><dt>五金</dt><dd>M4</dd></div>
  </dl>
</header>

<div class="first">
  <h2>先確認一件事</h2>
  <p>如果你還沒印過 <code>gauge</code> 試裝規，先印它（約 10 分鐘）並把 C270 放進去試。托架環的短邊尺寸是整份設計<b>唯一沒有實測</b>的數字，是從規格表和照片比例推出來的。試裝規對了，其他零件才值得印。</p>
  <p>放得進、四周有一點縫 = 正確（縫是故意留的）。塞不進去就把 <code>camera-stand.scad</code> 的 <code>cam_h</code> 加 1–2 重新輸出。</p>
</div>

<section>
  <div class="sec-h"><span class="k">清單</span><h2>零件</h2></div>
  <ul class="parts">{parts_rows}</ul>
  <div class="plate" style="margin-top:14px"><img src="{IMG['parts']}" alt="全部零件攤平排列，由左至右：底座、兩節立柱、加長節、兩個接頭、臂、托架、旋鈕"></div>
  <div class="tools"><span>顏色對應上面那張圖</span><button id="reset" type="button">重設全部勾選</button></div>
</section>

<section>
  <div class="sec-h"><span class="k">清單</span><h2>五金</h2></div>
  <div class="tw"><table>
    <thead><tr><th>規格</th><th>數量</th><th>用在哪</th><th>備註</th></tr></thead>
    <tbody>{hw_rows}</tbody>
  </table></div>
  <p class="tools">夾緊處是 M4 直接自攻進塑膠，咬合 14–15 mm，不用螺帽。少三顆零件，組裝時也不會有東西掉出來滾到地上。</p>
</section>

<section>
  <div class="sec-h"><span class="k">步驟</span><h2>組裝</h2></div>
  {"".join(step_html(s) for s in STEPS)}
</section>

<section>
  <div class="sec-h"><span class="k">完成</span><h2>接上之後要調三件事</h2></div>
  <div class="step-body">
    <div class="fig"><div class="plate"><img src="{IMG['done']}" alt="組裝完成，攝影機在 A4 紙正上方"></div></div>
    <div class="txt">
      <p class="lead">開 <code>control.html</code> 看即時預覽，一邊調一邊看。</p>
      <p><b>高度</b> — 鬆開套環旋鈕上下滑，調到整張 A4 <b>連同最上面的 QR</b> 都完整入鏡（紙約佔畫面高 90%）。C270 是固定焦距，畫面偏軟就往上調到 484 mm。</p>
      <p><b>水平</b> — 鬆開托架下面那顆 M4，繞上面那顆轉（±8°），讓紙的四邊在畫面裡對稱。歪掉不會算錯，但會浪費畫面。</p>
      <p><b>燈光</b> — <b>兩盞燈從左右各約 45° 打</b>，不要頭頂一盞。攝影機一定在紙正上方，這躲不掉，所以解法是燈光而不是結構。</p>
      <p style="font-size:.86rem">鏡頭對中不用管：角點是逐幀重算的，457 mm 高偏個 10 mm 完全無感，而且托架已經把鏡頭偏心的 17 mm 補進去了。</p>
    </div>
  </div>
</section>

<section>
  <div class="sec-h"><span class="k">原則</span><h2>一條不能破的規則</h2></div>
  <div class="rule-box">
    <h3>重量走擋唇，不走膠</h3>
    <p>攝影機的重量壓在托架環底那圈 2.5 mm 擋唇上。這是機械式的，不會失效。</p>
    <p>泡棉雙面膠只當墊片止晃、魔鬼氈只防掉出來，<b>都不是受力路徑</b>。萬一膠失黏，攝影機也只是鬆鬆掛著，不會從 45 cm 高摔到桌上。</p>
    <p>反覆拆裝請用魔鬼氈。泡棉膠撐不了幾次，而且會在 C270 那個霧面塑膠上留殘膠（要用酒精擦）。</p>
  </div>
</section>

<footer>
  <p>完整的高度推導、列印設定與參數說明在 repo 的 <code>hardware/scanner-stand/README.md</code>。改了任何參數就跑 <code>./check.sh</code>。</p>
  <p style="margin-top:6px">勾選狀態存在這台裝置的瀏覽器裡，不會傳出去。</p>
</footer>
</div>

<script>
(function () {{
  var KEY = "scanner-stand-assembly-v1";
  var state = {{}};
  try {{ state = JSON.parse(localStorage.getItem(KEY) || "{{}}") || {{}}; }} catch (e) {{ state = {{}}; }}
  var boxes = Array.prototype.slice.call(document.querySelectorAll("input[type=checkbox]"));
  function paint(b) {{
    var host = b.closest("section.step") || b.closest("li");
    if (host) host.classList.toggle("done", b.checked);
  }}
  boxes.forEach(function (b) {{
    var k = b.getAttribute("data-k");
    b.checked = !!state[k];
    paint(b);
    b.addEventListener("change", function () {{
      state[k] = b.checked;
      paint(b);
      try {{ localStorage.setItem(KEY, JSON.stringify(state)); }} catch (e) {{}}
    }});
  }});
  document.getElementById("reset").addEventListener("click", function () {{
    boxes.forEach(function (b) {{ b.checked = false; paint(b); }});
    state = {{}};
    try {{ localStorage.removeItem(KEY); }} catch (e) {{}}
  }});
}})();
</script>'''

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assembly-guide.html")
open(out, "w").write(HTML)
print(out, len(HTML)//1024, "KB")

#!/usr/bin/env python3
"""量『匯出的網格』上，扣線夾的通道與開口寬度。

扣得住的條件只有一個：開口要比線細、通道要比線粗。
舊版是通道 6.5 / 開口 4.4，對 3–4 mm 的線來說開口比線還寬 —— 完全扣不住。
這支拿 clipcomb 試扣梳的五個夾子逐一量，確認每一個都滿足那個條件。

需要：pip install trimesh networkx rtree
"""
import sys, numpy as np, trimesh, logging
logging.getLogger("trimesh").setLevel(logging.ERROR)

DIAS  = [2.5, 3.0, 3.5, 4.0, 4.5]
PITCH, BAR = 17.0, 2.0            # 梳子的間距與底條厚度
m = trimesh.load("stl/clipcomb.stl", force="mesh")

def void_width(x0, z):
    """在高度 z 橫掃，回傳「包含中心線 x0」的那一段空洞寬度（mm）。

    不能取最寬的一段 —— 掃描範圍會超出夾子本體，外面的空氣也是空洞，
    對小尺寸的夾子來說外側空隙比開口還寬，取最大值就會量到空氣。
    """
    xs = np.arange(x0 - 6, x0 + 6, 0.02)
    pts = np.column_stack([xs, np.zeros(xs.shape), np.full(xs.shape, z)])
    ins = m.contains(pts)
    runs, start = [], None
    for i, v in enumerate(ins):
        if not v and start is None: start = xs[i]
        if v and start is not None: runs.append((start, xs[i-1])); start = None
    if start is not None: runs.append((start, xs[-1]))
    for a, b in runs:
        if a <= x0 <= b: return b - a
    return 0.0

fail = 0
print(f"{'標稱線徑':>8}  {'通道寬':>7}  {'開口寬':>7}   判定")
for i, d in enumerate(DIAS):
    x0 = -PITCH * len(DIAS) / 2 + PITCH * (i + 0.5)
    ch = d + 0.4
    zc = BAR + 1.8 + ch / 2                 # 通道中心高度
    chan  = void_width(x0, zc)              # 通道最寬處
    mouth = void_width(x0, zc + ch * 0.35)  # 開口（比中心高，已進入細縫）
    ok = (chan > d + 0.15) and (mouth < d - 0.4)
    if not ok: fail = 1
    print(f"{d:8.1f}  {chan:7.2f}  {mouth:7.2f}   "
          f"{'OK（推得進、拉不出）' if ok else '** 不合格：' + ('通道太窄' if chan <= d + 0.15 else '開口比線寬，扣不住') + ' **'}")

print("\n扣線夾驗證：全部通過" if not fail else "\n扣線夾驗證：有問題")
sys.exit(fail)

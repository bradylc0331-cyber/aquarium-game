#!/usr/bin/env python3
"""量『匯出的網格』上，立柱螺絲孔與接頭螺帽袋在組裝後對不對得上。

不看 .scad 的算式（那是套套邏輯：孔位是用同一條式子推出來的），
而是在螺絲軸線上取一排點，用 mesh.contains() 掃出孔洞在 z 上的實際範圍，
再比對兩者的中心。接頭中央凸緣會吃掉插入深度，這支就是為了抓那種偏移。

需要：pip install trimesh networkx
"""
import sys, numpy as np, trimesh, logging
logging.getLogger("trimesh").setLevel(logging.ERROR)

SEG, FLANGE, INSET = 220.0, 3.0, 20.0
INS = (80.0 - FLANGE) / 2                      # 接頭每端插入深度
TOL = 0.25                                     # M4 螺絲進 M4 螺帽的容許偏心

mast = trimesh.load("stl/mast.stl", force="mesh")
plug = trimesh.load("stl/plug.stl", force="mesh")

def void_span(mesh, x, z0, z1):
    """沿 z 掃，回傳 (x, 0, z) 這條線上『不在實體內』的區段中心與長度。"""
    zs = np.arange(z0, z1, 0.05)
    pts = np.column_stack([np.full(zs.shape, x), np.zeros(zs.shape), zs])
    inside = mesh.contains(pts)
    runs, start = [], None
    for i, ins in enumerate(inside):
        if not ins and start is None: start = zs[i]
        if ins and start is not None: runs.append((start, zs[i-1])); start = None
    if start is not None: runs.append((start, zs[-1]))
    runs = [r for r in runs if r[1]-r[0] > 1.0]
    return runs

# 立柱：在管壁中間 (x=16) 掃上端那個螺絲通孔
mast_runs = void_span(mast, 16.0, SEG-40, SEG-1)
# 接頭：在螺帽袋深度中間 (x=12.5) 掃下端那個袋
plug_runs = void_span(plug, 12.5, 5, 40)

fail = 0
print("立柱上端螺絲孔（沿 x=16 量）：", [(round(a,2), round(b,2)) for a,b in mast_runs])
print("接頭下端螺帽袋（沿 x=12.5 量）：", [(round(a,2), round(b,2)) for a,b in plug_runs])
if len(mast_runs) != 1 or len(plug_runs) != 1:
    print("** 掃到的孔數不對，無法比對 **"); sys.exit(1)

mast_c = sum(mast_runs[0]) / 2          # 立柱局部座標
plug_c = sum(plug_runs[0]) / 2          # 接頭局部座標
# 組裝：下管頂緣在 z=SEG，接頭局部 INS 對到 SEG
mast_c_global = mast_c
plug_c_global = SEG - INS + plug_c
err = plug_c_global - mast_c_global
print(f"\n組裝後：立柱孔中心 z={mast_c_global:.2f}，螺帽袋中心 z={plug_c_global:.2f}")
print(f"偏心 {err:+.2f} mm（容許 ±{TOL}）  ", end="")
if abs(err) > TOL:
    print("** 不合格：M4 螺絲鎖不進 M4 螺帽 **"); fail = 1
else:
    print("OK")
sys.exit(fail)

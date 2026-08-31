#!/usr/bin/env python3
"""驗證 make-3mf.py 產出的列印板。

把 .3mf 讀回來（用 trimesh，跟寫出去的是不同的程式碼路徑），檢查：
  1. 每個零件都貼在床上、在成型範圍內
  2. 同一塊板上沒有兩個零件重疊
  3. 網格沒有在轉檔時壞掉（體積要跟來源 STL 一致）
  4. 每個 STL 都有被排進某一塊板，沒有漏掉

需要：pip install trimesh networkx
"""
import glob, os, itertools, sys, logging
import trimesh
logging.getLogger("trimesh").setLevel(logging.ERROR)

BED, MARGIN, EPS = 256.0, 8.0, 0.01

src = {}
for p in sorted(glob.glob("stl/*.stl")):
    m = trimesh.load(p, force="mesh")
    src[os.path.basename(p)[:-4]] = m.volume

fail = 0
placed = set()

for p in sorted(glob.glob("3mf/*.3mf")):
    scene = trimesh.load(p)
    # 3MF 的 object id -> name，trimesh 不會保留，自己從 XML 撈
    import zipfile, re
    xml = zipfile.ZipFile(p).read("3D/3dmodel.model").decode()
    id2name = dict(re.findall(r'<object id="(\d+)" name="([^"]+)"', xml))
    print(f"\n{os.path.basename(p)}")
    boxes = []
    for node in scene.graph.nodes_geometry:
        T, gid = scene.graph[node]
        name = id2name.get(str(gid), str(gid))
        m = scene.geometry[gid].copy(); m.apply_transform(T)
        b = m.bounds
        boxes.append((name, b))
        placed.add(name)
        oob = (b[0][0] < MARGIN - EPS or b[1][0] > BED - MARGIN + EPS or
               b[0][1] < MARGIN - EPS or b[1][1] > BED - MARGIN + EPS)
        offbed = abs(b[0][2]) > EPS
        toohigh = b[1][2] > BED
        if oob or offbed or toohigh: fail = 1
        dv = abs(m.volume - src[name]) / src[name] * 100 if name in src else 999
        if dv > 0.01: fail = 1
        flags = ("出界 " if oob else "") + ("沒貼床 " if offbed else "") + \
                ("太高 " if toohigh else "") + (f"體積差{dv:.3f}% " if dv > 0.01 else "")
        print(f"   {name:12s} X {b[0][0]:6.1f}..{b[1][0]:6.1f}  Y {b[0][1]:6.1f}..{b[1][1]:6.1f}"
              f"  Z 0..{b[1][2]:5.1f}   {'** ' + flags + '**' if flags else 'OK'}")
    for (n1, b1), (n2, b2) in itertools.combinations(boxes, 2):
        if (b1[1][0] > b2[0][0] + EPS and b2[1][0] > b1[0][0] + EPS and
            b1[1][1] > b2[0][1] + EPS and b2[1][1] > b1[0][1] + EPS):
            print(f"   ** {n1} 與 {n2} 在 XY 上重疊 **"); fail = 1

missing = set(src) - placed
if missing:
    print(f"\n** 沒有排進任何板：{sorted(missing)} **"); fail = 1

print("\n列印板驗證：全部通過" if not fail else "\n列印板驗證：有問題")
sys.exit(fail)

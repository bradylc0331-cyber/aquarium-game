#!/usr/bin/env python3
"""把 stl/ 裡的零件排成幾塊列印板，輸出成 Bambu Studio 可以直接開的 .3mf。

只包幾何與擺放位置，不包列印參數 —— 線材與機器設定沿用你 Bambu Studio 自己的
profile，那部分不該由這支腳本猜。

用法：python3 make-3mf.py
產出：3mf/plate1-gauge.3mf 等四個檔。
"""
import os, struct, zipfile, xml.sax.saxutils as sx

BED = 256.0          # A1 成型範圍
MARGIN = 8.0         # 離板邊留白
OUT = "3mf"

# 每塊板：(檔名, 說明, [(零件, 中心 X, 中心 Y), ...])
# 中心座標是零件外框的中心，腳本會換算成 3MF 的位移量。
PLATES = [
    ("plate1-gauge", "試裝規（先印這個）", [
        ("gauge", 128, 128),
    ]),
    ("plate2-foot-knobs", "底座 + 4 顆旋鈕", [
        ("foot",  90, 125),
        ("knob", 193,  73), ("knob", 225,  73),
        ("knob", 193, 105), ("knob", 225, 105),
    ]),
    ("plate3-masts", "立柱 2 節 + 加長節 1 節（記得加 brim）", [
        ("mast",        70, 128),
        ("mast",       128, 128),
        ("mast_short", 186, 128),
    ]),
    ("plate4-arm-cradle-plugs", "臂 + 托架 + 2 個接頭", [
        ("arm",     45, 128),
        ("cradle", 134,  50),
        ("plug",   215,  46), ("plug", 215,  90),
    ]),
]


def read_stl(path):
    """讀 ASCII STL，回傳 (去重後的頂點, 三角形索引, 外框)。"""
    raw = []
    tri = []
    buf = []
    for line in open(path):
        s = line.strip()
        if s.startswith("vertex"):
            _, x, y, z = s.split()
            buf.append((round(float(x), 4), round(float(y), 4), round(float(z), 4)))
            if len(buf) == 3:
                tri.append(tuple(buf)); buf = []
    idx = {}
    verts = []
    faces = []
    for t in tri:
        f = []
        for v in t:
            if v not in idx:
                idx[v] = len(verts); verts.append(v)
            f.append(idx[v])
        if len(set(f)) == 3:          # 丟掉退化三角形，不然某些切片軟體會抱怨
            faces.append(f)
    xs = [v[0] for v in verts]; ys = [v[1] for v in verts]; zs = [v[2] for v in verts]
    bbox = (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))
    return verts, faces, bbox


def write_3mf(path, objects, items):
    """objects: [(id, name, verts, faces)]  items: [(objectid, tx, ty, tz)]"""
    parts = []
    for oid, oname, verts, faces in objects:
        v = "".join(f'<vertex x="{a}" y="{b}" z="{c}"/>' for a, b, c in verts)
        t = "".join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in faces)
        parts.append(f'<object id="{oid}" name="{sx.escape(oname)}" type="model"><mesh>'
                     f'<vertices>{v}</vertices><triangles>{t}</triangles>'
                     f'</mesh></object>')
    build = "".join(
        f'<item objectid="{oid}" transform="1 0 0 0 1 0 0 0 1 {tx} {ty} {tz}"/>'
        for oid, tx, ty, tz in items)
    model = ('<?xml version="1.0" encoding="UTF-8"?>\n'
             '<model unit="millimeter" xml:lang="en-US" '
             'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
             f'<resources>{"".join(parts)}</resources>'
             f'<build>{build}</build></model>')
    ct = ('<?xml version="1.0" encoding="UTF-8"?>\n'
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
          '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
          '</Types>')
    rels = ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Target="/3D/3dmodel.model" Id="rel0" '
            'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
            '</Relationships>')
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct)
        z.writestr("_rels/.rels", rels)
        z.writestr("3D/3dmodel.model", model)


def main():
    os.makedirs(OUT, exist_ok=True)
    cache = {}
    fail = 0
    for fname, desc, layout in PLATES:
        objects, items = [], []
        oid_of = {}
        for part, cx, cy in layout:
            if part not in cache:
                cache[part] = read_stl(f"stl/{part}.stl")
            verts, faces, bb = cache[part]
            if part not in oid_of:
                oid_of[part] = len(objects) + 1
                objects.append((oid_of[part], part, verts, faces))
            # 外框中心移到 (cx, cy)，底面貼到 z = 0
            tx = cx - (bb[0] + bb[1]) / 2
            ty = cy - (bb[2] + bb[3]) / 2
            tz = -bb[4]
            items.append((oid_of[part], round(tx, 4), round(ty, 4), round(tz, 4)))
            # 檢查有沒有超出成型範圍
            x0, x1 = bb[0] + tx, bb[1] + tx
            y0, y1 = bb[2] + ty, bb[3] + ty
            if x0 < MARGIN or x1 > BED - MARGIN or y0 < MARGIN or y1 > BED - MARGIN:
                print(f"  ** {fname}: {part} 超出範圍 X {x0:.1f}..{x1:.1f} Y {y0:.1f}..{y1:.1f}")
                fail = 1
            if bb[5] - bb[4] > BED:
                print(f"  ** {fname}: {part} 太高 {bb[5]-bb[4]:.1f}")
                fail = 1
        path = f"{OUT}/{fname}.3mf"
        write_3mf(path, objects, items)
        n = len(items)
        print(f"  {path:42s} {n} 件  {desc}")
    return fail


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env bash
# 攝影機支架的幾何自檢。改了 camera-stand.scad 的任何參數就重跑這支。
# 需要 openscad（sudo apt-get install openscad）與 python3。
#   用法：./check.sh
set -u
cd "$(dirname "$0")"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
PARTS="foot mast mast_short plug arm cradle knob gauge"
fail=0

echo "== 1. 每個零件都要能乾淨算出來、是單一實體、塞得進 A1 =="
for p in $PARTS; do
  out=$(openscad -D "part=\"$p\"" -o "$TMP/$p.stl" camera-stand.scad 2>&1)
  w=$(echo "$out" | grep -icE 'warning|error')
  [ "$w" -gt 0 ] && { echo "  ** $p 有 $w 條警告/錯誤"; echo "$out" | grep -iE 'warning|error' | sed 's/^/     /'; fail=1; }
done
python3 - "$TMP" <<'PY' || fail=1
import sys, glob, os
BED = 256
def load(p):
    vs=[]; T=[]
    for line in open(p):
        s=line.strip()
        if s.startswith('vertex'):
            _,x,y,z=s.split(); vs.append((round(float(x),3),round(float(y),3),round(float(z),3)))
            if len(vs)==3: T.append(tuple(vs)); vs=[]
    return T
bad=0
for p in sorted(glob.glob(sys.argv[1]+'/*.stl')):
    T=load(p); idx={}; par=[]
    def find(a):
        while par[a]!=a: par[a]=par[par[a]]; a=par[a]
        return a
    def uni(a,b):
        ra,rb=find(a),find(b)
        if ra!=rb: par[ra]=rb
    for t in T:
        ids=[]
        for v in t:
            if v not in idx: idx[v]=len(par); par.append(len(par))
            ids.append(idx[v])
        uni(ids[0],ids[1]); uni(ids[1],ids[2])
    comps=len({find(i) for i in range(len(par))})
    xs=[v[0] for v in idx]; ys=[v[1] for v in idx]; zs=[v[2] for v in idx]
    d=sorted([max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs)])
    name=os.path.basename(p)[:-4]
    ok = comps==1 and d[2]<=BED
    if not ok: bad=1
    print(f"  {name:11s} 殼數 {comps}  外框 {d[0]:6.1f}x{d[1]:6.1f}x{d[2]:6.1f}  {'OK' if ok else '** 不合格 **'}")
sys.exit(bad)
PY

echo
echo "== 2. 干涉檢查（用 CSG 交集算真實碰撞，不是目視）=="
run() { openscad -D "test=\"$1\"" -o "$TMP/i.stl" interference.scad 2>&1 \
        | grep -oE 'Facets: *[0-9]+' | grep -oE '[0-9]+' | head -1; }
chk() { # 名稱 期望(zero|nonzero) 說明
  n=$(run "$1"); n=${n:-0}
  if [ "$2" = zero ]; then ok=$([ "$n" -le 1 ] && echo 1 || echo 0)
  else ok=$([ "$n" != 0 ] && echo 1 || echo 0); fi
  [ "$ok" = 1 ] || fail=1
  printf "  %-15s %6s 面  %-34s %s\n" "$1" "$n" "$3" "$([ "$ok" = 1 ] && echo OK || echo '** 不合格 **')"
}
chk sanity_cam    nonzero "對照組：測試不能是空的"
chk cam_vs_arm    zero    "機身不能撞到臂"
chk cam_vs_mast   zero    "機身不能撞到立柱"
chk cam_seated    zero    "機身在標稱位置是面貼面"
chk lip_catches   nonzero "機身下沉時擋唇要擋得住"
chk cradle_vs_arm zero    "兩片立板只能貼平，不能互相吃進去"
chk arm_vs_foot   zero    "臂不能撞到底座"
chk gap_plus      zero    "往外挪 0.1 要完全分開"
chk gap_minus     nonzero "往內壓 0.5 要咬得到（證明真的有貼合）"

echo
echo "== 3. 立柱接頭孔位（量匯出的網格，不看算式）=="
if python3 -c "import trimesh, rtree" 2>/dev/null; then
  python3 check-joint.py || fail=1
else
  echo "  略過：需要 pip install trimesh networkx rtree"
fi

echo
echo "== 4. 列印板（3mf/）=="
if python3 -c "import trimesh, networkx" 2>/dev/null; then
  python3 check-3mf.py || fail=1
else
  echo "  略過：需要 pip install trimesh networkx"
fi

echo
[ "$fail" = 0 ] && echo "全部通過。" || echo "有項目不合格，見上面。"
exit $fail

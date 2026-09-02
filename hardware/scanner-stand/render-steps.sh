#!/usr/bin/env bash
# 重新產生組裝說明的分步圖。需要 openscad 與 xvfb-run（無頭環境）。
set -eu
cd "$(dirname "$0")"
mkdir -p img
R() { xvfb-run -a openscad -D "step=\"$1\"" --imgsize="$2" --camera="$3" \
      --projection=p -o "img/step-$1.png" assembly-steps.scad 2>/dev/null; echo "  img/step-$1.png"; }
R parts       1500,560  "350,-30,30,72,0,20,1080"
R joint        620,900  "0,0,160,72,0,25,620"
R foot_mast    800,900  "130,-260,140,68,0,25,780"
R mast_full    700,1150 "150,-330,300,70,0,25,1500"
R with_arm     700,1150 "150,-330,300,70,0,25,1500"
R with_cradle  700,1150 "150,-330,300,70,0,25,1500"
R head         900,720  "10,-150,468,70,0,28,430"
R done         800,1150 "160,-360,300,68,0,28,1600"

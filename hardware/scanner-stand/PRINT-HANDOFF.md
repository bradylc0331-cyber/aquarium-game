# 交接：列印補印板，並量出 USB 線徑

> ## 先確認你在對的地方
>
> | | |
> |---|---|
> | **儲存庫** | `bradylc0331-cyber/aquarium-game` |
> | **分支** | `2-5d-character-motion` |
> | **本檔位置** | `hardware/scanner-stand/PRINT-HANDOFF.md` |
> | **專案** | 聖經樂園——兒童塗色紙掃描互動投影 |
>
> ```
> git clone https://github.com/bradylc0331-cyber/aquarium-game.git
> cd aquarium-game && git checkout 2-5d-character-motion
> ```
>
> **如果你現在的資料夾裡沒有這個檔案，你就是在錯的儲存庫，停下來先問使用者。**
> 不要去猜「最接近的檔案」，也不要開始改程式碼。

**寫於：** 2026-09-02，由雲端 session 交出
**印表機：** Bambu Lab A1（在使用者的區網上，雲端 session 碰不到，所以交給你）

---

## 0. 這件事只有一個產出

**印一塊板，然後回報一個數字。**

那個數字是 USB 線的外徑，用板上的「試扣梳」量出來。它是這整組支架目前
**唯一還沒確定的尺寸**，其他都驗過了。

不需要你設計任何東西，也不需要你改幾何。改參數的判斷在第 5 節，但先把數字拿到。

---

## 1. 要印的檔案

```
hardware/scanner-stand/3mf/plate5-rework.3mf
```

一塊板五件，約半小時多：

| 零件 | 數量 | 為什麼要印 |
| --- | --- | --- |
| `plug` 立柱接頭 | 2 | 舊版的螺帽袋偏 1.5 mm，螺絲鎖不進去。**必印** |
| `knob` 旋鈕 | 2 | 先前五金數量算錯，少了 2 顆 |
| `clipcomb` 試扣梳 | 1 | 量線徑用，就是這次的重點 |

---

## 2. 為什麼只印這三樣

使用者已經照舊版印過一輪。**不要叫他全部重印。**

判斷不是看檔案 hash——OpenSCAD 每次輸出的頂點順序會浮動，八個 STL 的 hash
全都不一樣。實際比對幾何（體積、外框、外框內隨機兩萬點的佔用）之後：

| 零件 | 結果 |
| --- | --- |
| `plug` | 螺帽袋位移 1.5 mm（體積不變、76 個取樣點不同）→ **要重印** |
| `arm` | 扣線夾重做（體積差 455 mm³）→ **先不要印**，見第 5 節 |
| `foot` `mast` `mast_short` `cradle` `knob` `gauge` | 幾何完全相同 → **不用重印** |

要自己重跑這個比對：

```python
import trimesh, numpy as np
a = trimesh.load("/tmp/old/plug.stl", force="mesh")   # git show <舊 commit>:... 取出
b = trimesh.load("stl/plug.stl", force="mesh")
pts = np.random.default_rng(7).uniform(a.bounds[0]-1, a.bounds[1]+1, size=(20000,3))
print(abs(a.volume-b.volume), (a.contains(pts) != b.contains(pts)).sum())
```

---

## 3. 列印

### 設定（三件事，其餘沿用使用者自己的 profile）

| 項目 | 設定 |
| --- | --- |
| 牆數 | **4 圈** |
| 支撐 | **關掉**（所有零件都是照免支撐設計的） |
| 自動定向 | **不要按**（3MF 裡已經是正確方向，自動定向會為了減支撐把零件翻掉） |

線材沿用使用者上次印這組用的那捲。層高 0.2。這塊板**不需要 brim**——
兩個接頭 80 mm 高、底面 31×31，比例不到 3:1。

### 怎麼送印

**優先走手動：開 Bambu Studio → 檢查上面三個設定 → 切片 → 列印。**
這塊板只印一次、半小時，為它去接自動化不划算。

如果使用者明確要自動化，有兩條路，但**我沒有驗證過，你要自己在本機確認**：

- **Bambu Studio CLI**：支援 `--slice`、`--load-settings`、`--load-filaments`、
  `--export-3mf`，另有 `--skip-useless-pick` 可跳過縮圖加速。
  macOS 的執行檔在 `.app` bundle 裡（`/Applications/BambuStudio.app/Contents/MacOS/`）。
  [CLI 參考](https://printago.io/blog/bambu-studio-cli-reference)
- **直接送到印表機**：A1 支援 FTPS（port 990，implicit TLS）上傳，以及
  MQTT（port 8883）下指令。帳號都是 `bblp`，密碼是印表機螢幕上的 LAN Access Code。
  [官方 LAN Mode 說明](https://wiki.bambulab.com/en/knowledge-sharing/enable-lan-mode)

  Access Code 在印表機螢幕上，**請使用者自己去看**，不要要求他把密碼貼給你，
  也不要把它寫進 repo 或任何檔案。

---

## 4. 印完之後：量線徑（這才是重點）

試扣梳上有五個夾子，旁邊刻著各自對應的線徑：

```
   2.5    3.0    3.5    4.0    4.5     ← 單位 mm
```

拿 **C270 那條真的 USB 線**（不是別條線，粗細不一樣）一格一格試，找出：

> **推得進去、但拉不出來** 的那一格。

- 推不進去 → 太緊，往大的試
- 推進去但輕輕一拉就掉 → 太鬆，往小的試
- 剛好卡住、要稍微用力才拔得出來 → **就是它**

把那個數字回報給使用者。如果**兩格之間都還可以**，回報比較小的那一格
（卡扣寧可緊一點，鬆了就完全沒用）。

---

## 5. 拿到數字之後

先問使用者**要不要重印臂**。多半答案是不用：

> 走線這步的目的只是讓那條 1.5 m 的線不要吊在攝影機上把它拉歪。
> **用魔鬼氈或束帶把線綁在臂上，效果完全一樣**，而重印臂要 83 g、好幾個小時。

使用者說要重印，才做這件事：

```bash
cd hardware/scanner-stand
# 把量到的數字填進去（例如 3.0）
sed -i '' 's/^cable_dia   = 3.6;/cable_dia   = 3.0;/' camera-stand.scad
openscad -D 'part="arm"' -o stl/arm.stl camera-stand.scad
python3 make-3mf.py
./check.sh          # 一定要跑，不能跳過
```

`check.sh` 裡的 `check-clip.py` 會量匯出的網格，確認每個夾子都
「通道比線粗、開口比線細」。改了 `cable_dia` 沒跑這支，就等於沒驗證。

改完記得 commit 到 `2-5d-character-motion`（**不要開 PR**，除非使用者明講）。

---

## 6. 不要做的事

- **不要叫使用者重印沒變的零件**（第 2 節那六個）。
- **不要開支撐、不要自動定向。**
- **不要為了讓夾子「好推一點」把開口改大。** 開口比線細正是它扣得住的唯一原因；
  舊版就是開口 4.4 mm 配 3–4 mm 的線，比線還寬，等於一條開放的溝，完全扣不住。
- **不要動 `cam_h`、`lens_height`、`arm_reach` 這些。** 它們是從 `src/constants.js`
  和 C270 的規格推出來的，改了會影響取景。背景在 `README.md` 第一節。
- **不要把 LAN Access Code 寫進任何檔案。**

---

## 7. 這份交接沒有涵蓋的

誠實講清楚，不要誤報成完成：

- **整組支架還沒實機驗收過。** 沒有接上攝影機看過實際畫面，457 mm 這個高度
  沒有用真鏡頭確認過。那是另一份文件的事（`HANDOFF.md` 第 7 節）。
- **這些 3MF 沒有在 Bambu Studio 裡被真的開過。** 幾何用 trimesh 讀回來驗過
  （貼床、在成型範圍內、不重疊、體積與 STL 一致），但沒經過 Bambu Studio 本人。
  開不起來就退回用 `stl/` 裡的單檔自己排版，並回報這件事。
- **上面那兩條自動化路線我沒有實測過**，只是查到的規格。走不通就走手動，不要卡在那裡。

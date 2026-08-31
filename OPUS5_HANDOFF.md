# Opus 5 Handoff — 聖經樂園 2.5D 角色與環境動畫

**更新時間：** 2026-08-31（實機驗收前）  
**目前狀態：** Task 1–8 全部完成，第八輪規格審查的發現已全部處理，151 條測試全綠。  
**還沒做的只剩一件事：實機驗收**——真實攝影機、真實列印品、真實光線。那一關要在有硬體
的機器上跑，交接文件是 [`HANDOFF-webcam-acceptance.md`](HANDOFF-webcam-acceptance.md)。

**禁止誤報：** 上面那句「測試全綠」指的是自動測試與合成影像的端對端檢查。**沒有任何一項
是用真的攝影機或真的印表機驗過的**，不要把它寫成「已驗收」。

> 下面第 1 節之後的內容是 Task 1–8 期間的工作交接，保留作為背景與決策紀錄；
> 其中的進度描述已經過時，以上面這段為準。

## 1. 使用者真正要的效果

孩子把 A4 聖經人物塗色紙放到 Webcam 下，系統辨識 QR、校正透視、去除白紙，只把孩子實際上色的人物帶進投影畫面。必須完整保留顏色、留白與筆觸。

已確認的畫面規則：

- 採用 2.5D 紙偶，不做完整 3D 模型。
- 地面角色腳底固定，不再用整張人物上下抖動模擬走路。
- 角色可揮手、舉手等，但角色下方只顯示人物名稱，不顯示動作名稱。
- 河流流動、樹葉受風擺動、羊會走路與吃草。
- 角色可在整個可行走草地自由移動，不能互相碰到，也不能穿過河流／樹木。
- 同一角色可重複出現；每次掃描是獨立作品，保留各自塗色。
- 畫面最多 15 位。第 16 位進場時第 1 位先淡出，第 17 位替換第 2 位，依 FIFO 循環。
- 掃描失敗不得占名額，也不得淘汰場上角色。

正式設計與實作計畫：

- `docs/superpowers/specs/2026-08-30-2-5d-character-environment-animation-design.md`
- `docs/superpowers/plans/2026-08-30-2-5d-character-environment-animation.md`

## 2. 正確工作位置

不要在原始資料夾直接實作。使用目前的 feature worktree：

```text
/Users/brady/Downloads/aquarium-game/.worktrees/2-5d-character-motion
```

Git 狀態：

```text
branch: 2-5d-character-motion
remote main baseline: 0c0a7bb
latest source snapshot on remote branch: 2234c50
current implementation HEAD before this handoff: 46d98a0
```

原始 repository 是由壓縮檔初始化而來：

```text
/Users/brady/Downloads/aquarium-game
```

初始化前備份：

```text
/Users/brady/.agents/_backup_20260830/aquarium-game-pre-git
```

## 3. 已確認完成

### Task 1 — 作品 ID 與訊息驗證

Commits：

```text
9d5d553 feat: add stable scanned artwork identity
485cb12 test: protect scanned artwork submission identity
```

完成內容：

- `src/artworkMessage.js` 建立作品 ID、掃描結果與傳輸訊息。
- 手動與 30–60 秒延遲自動送出都保留同一個 artwork ID。
- 排程作品 A 後即使又掃到 B，A 的 timer 仍送出 A 的 ID、人物與圖片。
- `control.html` 與 `display.html` 已載入模組。

審查結果：規格通過、品質通過。

### Task 2 — 15 位 FIFO 角色管理器

Commits：

```text
86e43c3 feat: enforce fifteen-character FIFO
54ca618 fix: validate character manager configuration
```

完成內容：

- `src/characterManager.js` 維持最多 15 位。
- 第 16、17 位依序替換最早的角色。
- 相同人物、不同 artwork ID 可共存；相同 ID 永久去重。
- 找不到安全入口時 pending 保留，不插入 `null`，也不提前淘汰。
- constructor 對 factory、上限與退場時間 fail-fast。
- 大 `dt`、浮點邊界與零秒退場均有測試。

審查結果：規格通過、品質通過。

## 4. Task 3 目前狀態：未核准

Commits：

```text
3123b6c feat: add safe roaming and collision avoidance
b517a87 fix: recover characters from unsafe positions
46d98a0 fix: keep recovery outputs finite and unblocked
```

`src/movement.js` 現有功能：

- 可行走範圍與河流／樹木障礙。
- 依裁切後可見人物尺寸建立外擴安全橢圓。
- 安全出生點、目標點、柔性避碰與邊界 clamp。
- 初始越界／重疊／位於障礙內時嘗試復位。
- UMD browser export 與完整 validation。

目前 `npm test` 為 **71 passed / 0 failed**，但不能把 Task 3 標為完成，因 fresh-context 規格審查找到未被現有測試涵蓋的反例。

### 未解 blocker

`recoverSafePosition()` 目前只搜尋：

- 朝 target 的一條方向；
- 水平、垂直與四條 45° 對角線。

這不是完整的 2D 搜尋。已驗證存在以下情況：

- self 從障礙內 `(500, 400)` 開始；
- 周圍牆面留有斜向開口；
- `(750, 330)` 是安全點，且直線復位路徑不撞任何非初始障礙；
- 現行固定射線仍找不到，錯誤回傳原本不安全位置與 `blocked: true`。

規格要求 `blocked` 只能在確實找不到可達安全點時出現，因此目前不合格。

### 已失敗的修法，請勿重做

1. **固定八方向、最多 64 rings 的 radial search**：會漏掉非 0°／45° 的斜向出口。
2. **只補 clamp、有限速度與 stale blocked 清除**：修正了越界、Infinity 與狀態殘留，但沒有解決搜尋不完備的根因。

同類補丁已失敗兩輪，依制度不得進行第三次固定射線補丁。

## 5. 建議 Opus 5 的第一步

先讀：

```text
src/movement.js
test/movement.test.js
```

把 `recoverSafePosition()` 的固定射線換成**有明確解析度與上限的 2D grid BFS／A\***，不要再增加更多角度硬湊。

建議行為定義：

1. 將 clamp 後的 anchor 映射到有限網格。
2. 網格步長由人物安全橢圓短半徑決定，並設合理上下限。
3. 使用 8-neighbor BFS/A*；每條邊都用 `recoveryPathIsClear()` 驗證，避免穿過非初始障礙。
4. 可允許從「起始時已重疊」的 blocker 向外離開，但不能穿過其他角色／障礙。
5. 找到第一個 `isSafe()` 節點時回傳該位置，`vx=vy=0`、`blocked=false`。
6. 只有把定義好的有限搜尋空間完整探索後仍無安全節點，才能 `blocked=true`。
7. 先加一個非 0°／45° 斜向開口的 failing regression test，再寫實作。
8. 加 performance bound，避免大畫面或極小角色造成同步 Canvas frame 卡住。

注意：連續空間中「絕對證明不存在安全點」很難。若採有限解析度搜尋，應把規格與測試明確定義成「此解析度下無可達安全節點」，不要宣稱數學上的連續完備性。這是設計語意調整；開始前最好向使用者確認。上一個 session 已提出 BFS 重寫授權問題，使用者沒有回答 yes/no，而是要求交接給 Opus 5。

完成 Task 3 修正後必須依序：

1. 原實作者或新 implementer 執行 TDD、commit。
2. fresh-context spec reviewer 重新審查 Task 3。
3. 規格通過後再做 code-quality review。
4. 所有 Critical／Important 問題修完才可開始 Task 4。

## 6. 尚未開始的工作

- Task 4：`src/creature.js`、`src/species.js` — 腳底固定的 2.5D 紙偶、招呼／偶發動作、角色名稱。
- Task 5：`src/scene.js` — 河流、樹冠微風／陣風、羊走路與吃草。
- Task 6：`display.html` — CharacterManager、Movement、深度排序與 15 位整合。
- Task 7：`src/extract.js`、`control.html` — 空白、過小與白紙背景掃描品質攔截。
- Task 8：瀏覽器容量模擬、10 分鐘動作觀察、實際 A4 列印／Webcam、16 位替換與 30 分鐘穩定性測試。
- 最終全域 code review、finishing-development-branch／合併處理。

## 7. 目前檔案狀態

| 檔案 | 狀態 | 說明 |
| --- | --- | --- |
| `src/artworkMessage.js` | PASS 完成 | Task 1 已雙審通過 |
| `test/artworkMessage.test.js` | PASS 完成 | 含 A/B 延遲送出 regression |
| `control.html` | 部分完成 | Task 1 已整合；Task 7 未做 |
| `display.html` | 部分完成 | 只載入 ArtworkMessage；Task 6 未做 |
| `src/characterManager.js` | PASS 完成 | Task 2 已雙審通過 |
| `test/characterManager.test.js` | PASS 完成 | 12 個 manager tests |
| `src/movement.js` | FAIL 未核准 | 71 tests 綠，但 off-axis recovery 漏解 |
| `test/movement.test.js` | 進行中 | 缺斜向出口 regression |
| `src/creature.js` | 未開始本次改造 | 仍是舊走路／上下位移邏輯 |
| `src/scene.js` | 未開始本次改造 | 仍是現有背景效果 |
| `src/extract.js` | 未開始 Task 7 | 現有基本遮罩與裁切 |

## 8. 驗證與啟動命令

```bash
cd /Users/brady/Downloads/aquarium-game/.worktrees/2-5d-character-motion
git status --short --branch
git log --oneline --decorate --max-count=12
npm test
npm run serve
```

本地頁面：

```text
http://localhost:8933/display.html
http://localhost:8933/control.html
http://localhost:8933/templates/print.html
```

不要假設舊 server process 仍在執行，接手後自行啟動並確認 HTTP 回應。

## 9. 工作流程要求

使用者選擇 **Subagent-Driven Development**：

- 每個 Task 使用 fresh implementer。
- 每個 Task 先做 spec compliance review。
- spec 通過後才做 code-quality review。
- 審查有問題時由 implementer 修正，再重新審查。
- 不可跳過 Task 3 blocker 直接進 Task 4。
- 不可直接在 `main` 或原始資料夾實作。

## 10. 完成判定

只有在 Task 1–8 全部完成、所有自動測試通過、瀏覽器畫面驗收通過，以及實際印表機／Webcam 測試完成後，才能向使用者說整體完成。

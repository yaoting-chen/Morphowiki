---
name: review-word
description: 啟動本地網頁(Node Express + 靜態前端,port 5173)讓使用者複習今日到期的單字卡,評分後回寫 SM-2 進度。觸發:「/review-word」或要求複習單字。
---

# Review-word Skill

當使用者請求 `/review-word`(或要求「複習單字」、「開複習網頁」、「打開單字卡」)時,依以下步驟執行。本 skill 會在本機 spawn 一個 Node Express server(port 5173),提供翻卡 UI 與 SM-2 評分回寫。

## 適用情境
- 使用者輸入 `/review-word`
- 使用者說「我要複習單字」、「打開單字卡網頁」、「開始今日複習」
- 使用者要求「跑複習 server」

## 不適用情境
- 使用者要 ingest 新字 → 改用 `ingest` skill
- 使用者要加 stopword → 改用 `stopword` skill
- 使用者要直接看某張卡內容而不啟動 server → 直接讀 `dictionary/words/<word>.md`

---

## Step 1 — 檢查 review 子專案存在

依序確認下列檔案存在,任何一個缺失就停下來,並告知使用者「請先跑 `/setup`」:

1. `review/package.json`
2. `review/flashcards.json`(若這個缺失,實際上是要先用 flashcard 流程建立第一張卡,告知使用者用 `/flashcard <word>`)
3. `review/server.js`
4. `review/web/index.html`
5. `review/web/app.js`
6. `review/web/style.css`

**絕對不要動態生成 server.js 或 web/ 內任何檔案**。它們由 `/setup` 從 `.claude/skills/setup/templates/review/` 複製過來,是 source of truth。第一版曾經把生成工作留到這裡,結果首次 `/review-word` 要等 LLM 寫 ~900 行 code,體驗極差 — 這條規則就是用來防止那種情況重演。

## Step 2 — 安裝相依套件(必要時)

1. 檢查 `review/node_modules/` 是否存在。
2. **若已存在** → 直接進 Step 3(`/setup` 已經預裝過,這條多半會走這分支)
3. **若不存在**,用 Bash tool 從**專案根目錄**執行(不要 `run_in_background`,要等完成):

   ```
   npm install --prefix review
   ```

   **不要**寫成 `cd review && npm install` —— Bash tool 的 cwd 會在 tool call 之間延續,先用 `cd review` 切進去之後,下次同樣的指令會踩到「`cd: review: No such file or directory`」(因為已經在 review/ 裡)。`--prefix` 寫法不依賴 cwd,可重複呼叫安全。

   失敗 → 把錯誤回給使用者並停止。

## Step 3 — 在背景啟動 server

用 Bash tool 啟動 server,**必須 `run_in_background: true`**:

```
node review/server.js
```

`server.js` 內用 `__dirname` 解析 `flashcards.json`、`dictionary/words/`、`web/` 路徑,**不依賴 cwd**,所以從專案根跑就行,**不要** `cd review`。

記下 Bash tool 回傳的 background shell id(後面關閉 server 會用到)。啟動後 server listen 在 `127.0.0.1:5173`。

## Step 4 — 驗證 server 已就緒

啟動為 async,建議用 Bash 跑一次 `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5173/api/cards`(或讀 background 輸出檔)確認回 200 後再引導使用者。若回非 200 / 連線失敗 → 讀 background 輸出檔回報原因。

## Step 5 — 引導使用者開啟瀏覽器

回報以下訊息給使用者(繁體中文):

- 複習網頁已啟動,請在瀏覽器打開 http://localhost:5173
- 翻卡後選擇 Again / Hard / Good / Easy 評分,進度會自動寫回 `review/flashcards.json`
- 關閉方式:
  - 在這個對話中說「停止複習 server」,我會用記下來的 background shell id 結束它
  - 或者直接在終端機按 Ctrl+C
- server 端點(如需手動測試):
  - `GET /api/cards` — 回今日到期的卡片(含字典解析後的 IPA、中文釋義、拆解、詞源、記憶法)
  - `POST /api/review` body `{ "word": "<word>", "grade": 0..5 }` — 套用 SM-2 並回新卡狀態
  - `GET /api/cards/all` — 回所有卡片摘要(含未到期)

## Step 6 — 後續關閉

當使用者要求停止 server 時,用記下的 background shell id 呼叫 KillShell 終止該 process。若忘了記 id,告知使用者請自行 Ctrl+C 或關閉終端機。

---

## 卡片 UI 現況(`review/web/`)

server 提供的靜態檔案在 `review/web/`,**已實作於 `.claude/skills/setup/templates/review/web/`**(setup 時複製到 `review/web/`)。本節僅描述當前現況,**不是給 LLM 重新生成的規格**:

- 卡片正面:只顯示單字本身 + 「翻牌」按鈕
- 卡片背面:
  - IPA / 詞性 / 中文釋義 — 一律展開
  - **拆解** — 一律展開(列表;支援多個字首 / 字尾,連字號自動補上)
  - **詞源** — 手風琴(預設折疊),原生 `<details class="section accordion">`
  - **記憶法** — 手風琴(預設折疊),同上
  - 評分按鈕 Again / Hard / Good / Easy

如需修改 UI / 拆解格式,**改 `.claude/skills/setup/templates/review/web/`(source of truth)後,同步覆寫 `review/web/` 或叫使用者重跑 `/setup`**。直接改 `review/web/` 的話,下次 `/setup` 不會覆蓋它(`cp -n`),但 source of truth 會 drift。

---

## 重要約束

1. **不要前景執行 `node review/server.js`** — 否則對話會卡住。一定要 `run_in_background: true`。
2. **不要主動執行 `npm install`** — 只有在 `review/node_modules/` 不存在時才裝;且要用 `npm install --prefix review`,不要 `cd review`。
3. **絕對不要用 `cd review && <cmd>`** 形式 — Bash tool 的 cwd 會黏滯,第二次呼叫會失敗。用 `--prefix` 或 `node review/server.js` 這類不依賴 cwd 的寫法。
4. **不要動態生成 `server.js` / `web/*.{html,js,css}`** — 缺檔請使用者跑 `/setup`。
4. 不要動 `review/flashcards.json` 的內容(server 自己會寫)。
5. 不要動 `dictionary/` 內容。
6. 不要建立 `.claude/commands/` 任何檔案。
7. 預設 port 是 5173,綁定 `127.0.0.1`,不對外開放。

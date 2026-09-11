---
name: setup
description: 初始化 morphowiki 專案結構。檢查 Node.js 是否安裝、巢狀建立 dictionary/{prefix,root,suffix,words} 與 review/{server.js,web/*}、預設生成 ~150 個英文功能字寫入 stopwords.md 的 ## default section、預先 npm install。觸發時機:使用者輸入「/setup」、「初始化專案」、「第一次設定 morphowiki」、或在空資料夾要求設定 morphowiki。注意:不要與 Claude Code 內建的 /init(生成 CLAUDE.md)混淆。
---

# Setup Skill

當使用者請求 `/setup`(或「初始化專案」、「第一次設定」、「幫我把資料夾結構建好」)時,依以下步驟執行。本 skill 把 morphowiki 的目錄結構與必要檔案一次到位。

---

## Step 1 — 環境檢查:Node.js

用 Bash tool 跑:

```
node --version
```

- 若回傳 `v18.x.x` 或更高 → 通過,進 Step 2
- 若回傳低於 v18(例如 v16) → 提示使用者升級,**但仍可繼續**(只有 `/review-word` 會用到 node)
- 若 `node` 找不到 / 指令錯誤 → 提示安裝建議,**並讓使用者選**「先繼續(之後再裝)」或「中止」:
  - Windows:`winget install OpenJS.NodeJS.LTS` 或下載 https://nodejs.org
  - macOS:`brew install node`
  - Linux:用各自包管理(`apt install nodejs npm` / `dnf install nodejs` …)
- 同時跑 `npm --version` 確認 npm 可用

**回報格式**:單行寫出偵測到的版本(或缺失)。

---

## Step 2 — 巢狀建立資料夾

用 Bash tool 建立(用 `mkdir -p` 等效,Windows PowerShell 用 `New-Item -ItemType Directory -Force`)。**已存在的不要動**:

```
dictionary/
dictionary/words/
dictionary/prefix/
dictionary/root/
dictionary/suffix/
review/
review/web/
.claude/skills/
```

對每個目錄回報「created / already exists」。

---

## Step 3 — 建立必要檔案(若不存在)

### 3a. inline-content 檔案

下列檔案內容簡短,**用 Write tool 直接寫**(若已存在則跳過,不覆寫):

| 檔案 | 初始內容 |
|------|----------|
| `dictionary/index.md` | `# Dictionary Index\n\n_自動維護的目錄。新單字、字首、字根、字尾會被 ingest skill 加進對應 section。_\n\n## Words\n\n## Prefix\n\n## Root\n\n## Suffix\n` |
| `dictionary/log.md` | `# Log\n\n_Append-only 操作紀錄,格式: - YYYY-MM-DD &lt;action&gt; &lt;target&gt;_\n` |
| `review/flashcards.json` | `{\n  "version": 1,\n  "cards": []\n}\n` |
| `review/package.json` | 若已存在則跳過。若無,寫入最小版:`{ "name": "morphowiki-review", "version": "0.1.0", "private": true, "scripts": { "start": "node server.js" }, "dependencies": { "express": "^4.19.2" } }` |

UTF-8 無 BOM、LF 換行。

### 3b. 從模板複製大型檔案

下列檔案的內容較大(stopwords 清單、server / 前端程式碼),**權威版本放在 `.claude/skills/setup/templates/`,絕對不要動態生成**。用 Bash tool 從**專案根目錄**執行(不要 `cd`):

```
mkdir -p review/web && cp -n .claude/skills/setup/templates/dictionary/stopwords.md dictionary/stopwords.md && cp -n .claude/skills/setup/templates/review/server.js review/server.js && cp -n .claude/skills/setup/templates/review/web/index.html review/web/index.html && cp -n .claude/skills/setup/templates/review/web/app.js review/web/app.js && cp -n .claude/skills/setup/templates/review/web/style.css review/web/style.css
```

- `cp -n` 表「已存在就不覆寫」,可重複呼叫安全
- 對每個檔案回報 created / already exists(可比對複製前後 mtime 判斷)
- 若 templates 目錄不存在(例如使用者只 clone 部分檔案)→ 提示使用者並停止
- 模板已內含 ~150 個英文功能字(`## default` section),不需要 LLM 動態整理

複製完 stopwords 後,在 `dictionary/log.md` append(僅當這次是 created 而非 already exists):`- <YYYY-MM-DD> setup seeded default stopwords from template`(日期用當天 ISO)。

---

## Step 4 — 預先安裝 review 相依套件

**目的**:把首次 `/review-word` 的等待時間挪到 setup 階段。Step 1 偵測 Node.js 失敗時跳過本步驟。

1. 檢查 `review/node_modules/` 是否已存在。
   - 已存在 → 跳過(回報「review deps already installed」)
2. 用 Bash tool 從**專案根目錄**跑(**不要 cd**,避免 cwd 黏滯造成下次命令失敗):
   ```
   npm install --prefix review
   ```
   - `--prefix` 讓 npm 在指定目錄安裝,不依賴 cwd,可重複呼叫不會踩到「`cd review` 已在 review/」之類錯誤
   - **不要** 用 `run_in_background: true`(要等它完成)
3. 失敗 → 把 npm 錯誤完整貼給使用者,但**不中止 setup**(已建好的目錄/檔案仍然有效,使用者可手動補裝);收尾報告標明 deps 未裝
4. 成功 → 在 `dictionary/log.md` append `- <YYYY-MM-DD> setup npm install (review)`

---

## Step 5 — 收尾報告

對使用者回報:

1. ✅ 已建目錄 / 跳過已存在的目錄(列出)
2. ✅ inline 檔案建立 / 跳過(列出)
3. ✅ 模板複製結果(stopwords.md、server.js、web/index.html、web/app.js、web/style.css 各為 created / already exists)
4. Node.js 偵測結果
5. review 相依套件:已安裝 / 已存在 / 失敗(若失敗附原因)
6. **下一步建議**:
   - `/ingest <英文單字>` 收第一個字
   - `/flashcard <word>` 加入複習
   - `/review-word` 打開複習網頁(server.js / web 檔與 deps 均已就緒,直接啟動)

---

## 邊界 / 禁令

- 不要動 `llm-wiki-prompt.md`、`README.md`、`manual.md`、`CLAUDE.md`(它們不是 init 該管的)
- 不要建立 `.claude/commands/`
- 若使用者明確說「重做」或「reset」 → 仍然不要刪檔,只追加 / 修補;真要清空請使用者自己刪
- 若任何步驟失敗,**停下來回報**,不要靜默跳過

---

## cwd 黏滯陷阱(必讀)

Bash tool 的工作目錄會在多個 tool call 之間延續(shell state 不會,但 cwd 會),所以**不要**用 `cd <dir> && <cmd>` 來執行需要在 `<dir>` 下跑的指令 —— 第一次成功但第二次就會踩到「`cd: <dir>: No such file or directory」(因為已經身在 <dir> 裡)。

正確做法:
- npm:`npm install --prefix review`(從專案根)
- node 啟動 server:`node review/server.js`(server.js 內用 `__dirname` 解析路徑,不依賴 cwd)
- 其他 npm 子指令:`npm --prefix review run <script>`

任何新增的相依檢查 / 安裝指令,都要遵守這條規則。

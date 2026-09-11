# CLAUDE.md

This file provides system guidance and instructions for Antigravity and AI Agents working within the **Morphowiki** repository.

**Morphowiki**: Karpathy-style local-first English morphology wiki + SM-2 local spaced-repetition web app, maintained by 7 Agent Skills, all data kept locally.

## 必知地雷與核心準則 (Critical Rules)
- **初始化指令**：初始化請使用 `/setup`（非 `/init`）。
- **Skill 結構**：所有 Agent Skill 位於 `.claude/skills/<name>/SKILL.md`。
- **雙向 wiki-link**：
  - `dictionary/words/<w>.md` 引用語素時使用 `[[../prefix/un]]`、`[[../root/nat]]`、`[[../suffix/al]]`。
  - 對應的語素頁 `prefix/root/suffix/<m>.md` 下的 `## Words containing this` 必須同步回填 `[[../words/<w>]]`，兩端必須保持一致。
- **資料分權**：`review/flashcards.json` 的 `history` 欄位**只由** `review/server.js` 寫入，其餘任何 skill 或腳本不要修改。
- **Stopwords 機制**：分成 `## default`（`/setup` 產生）與 `## custom`（`/stopword` 維護）；`/ingest` 遇到 stopwords 立即拒絕收錄。
- **語言與時間格式**：日期一律使用 ISO `YYYY-MM-DD` 格式；中文一律使用正體中文 `zh-TW`；程式碼註解使用英文。
- **路徑防呆 (cwd 黏滯陷阱)**：執行指令時一律從專案根目錄出發，避免 `cd` 造成的工作目錄狀態混亂。
- **大批次 Ingest 調度規則 (Batch Subagent Dispatch)**：
  - 當 Ingest 單字數量**超過 20 個**時，必須指派 Subagent 分批執行，**每個 Subagent 一次最多處理 20 個單字**。
  - 每個批次完成後必須**立即關閉（Kill）該 Subagent**，下一批次必須**重新派發新的 Subagent**，以確保 Context 乾淨、維持詞源分析品質並徹底減少模型幻覺。

## Commands & Runtime
無 build / lint / test pipeline。唯一 Runtime:
```bash
npm install --prefix review    # 一次性安裝相依套件，/setup 或 /review-word 會自動執行
node review/server.js          # 本地複習伺服器，運行於 http://127.0.0.1:5173
```

## 關鍵耦合 (Key Coupling)
- `review/server.js` 每次接收 `GET /api/cards` 時，都會即時以正規表達式解析 `dictionary/words/<w>.md` 的 YAML frontmatter 與 `## 拆解 / ## 詞源 / ## 記憶法`。
- 若更動 Markdown section 標題或拆解格式，必須同步更新 `server.js` 內的 `splitSections` 與 `parseBreakdownLine`。
- 複習完成後的 `POST /api/review {word, grade}` 會套用 SM-2 演算法並透過 `tmp+rename` 原子寫回 `flashcards.json`。

## Agent Skills 指南
| Skill | 觸發語意與說明 |
|---|---|
| `setup` | `/setup`、初始化專案目錄與基礎樣板檔 |
| `ingest` | `/ingest <word>`、分析單字進行詞源學語素拆解並建立雙向關聯字典頁 |
| `new-word` | `/new-word [N]`、從現有語素池組合生成 N 個真實未收錄英文單字 |
| `stopword` | `/stopword <word>`、加入 stopwords 白名單跳過收錄 |
| `flashcard` | `/flashcard`、`/flashcard <word>`、`/flashcard remove <word>` 維護複習卡清單 |
| `review-word` | `/review-word`、啟動本地 Node.js 複習伺服器 (port 5173) 進行 SM-2 複習 |
| `lint` | `/lint` (全庫結構檢查) 或 `/lint <word>` (單字語意與詞源深度檢查) |

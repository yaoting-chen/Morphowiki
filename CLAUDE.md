# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**morphowiki**:Karpathy 風英文單字 wiki + SM-2 本地複習網頁,由五個 Claude Code skill 維護,資料全留本機。

## 必知地雷
- **`/init` 是 Claude Code 內建 skill**(生成 CLAUDE.md)。本專案初始化用 **`/setup`**
- 功能一律寫 `.claude/skills/<name>/SKILL.md`,**不要**建 `.claude/commands/`
- **雙向 wiki-link**:`dictionary/words/<w>.md` 用 `[[../prefix/un]]` 連語素;對應 `prefix/root/suffix/<m>.md` 的 `## Words containing this` 必須同步回填 `[[../words/<w>]]`,兩端一起改
- `review/flashcards.json` 的 `history` 欄位**只**由 `review/server.js` 寫,其他 skill 別碰
- stopwords 分 `## default`(`/setup` 生)+ `## custom`(`/stopword` 維護);ingest 命中即拒
- 日期一律 ISO `YYYY-MM-DD`,字串比較;中文用 zh-TW;程式碼註解用英文

## Commands
無 build / lint / test。唯一 runtime:

```
cd review && npm install      # 一次性,/review-word 會自動做
node review/server.js          # http://127.0.0.1:5173
```

## 關鍵耦合
`server.js` 每次 `GET /api/cards` 都**即時 regex 解析** `dictionary/words/<w>.md` 的 frontmatter + `## 拆解 / ## 詞源 / ## 記憶法`。改 section 名或拆解格式 → 必須同步 `splitSections` / `parseBreakdownLine`。`POST /api/review {word, grade}` 套 SM-2 後以 `tmp+rename` 原子寫回 `flashcards.json`。

## Skill 觸發
| Skill | 觸發語意 |
|---|---|
| `setup` | /setup、初始化專案(**非** /init) |
| `ingest` | /ingest \<word\>、分析單字 |
| `new-word` | /new-word \[N\]、用現有 morpheme 池嚴格組合生成 N 個新單字並寫入 dictionary(不遞回中間單字;N 預設 1) |
| `stopword` | /stopword \<word\>、加白名單 |
| `flashcard` | /flashcard …、加進複習庫 |
| `review-word` | /review-word、開複習網頁 |

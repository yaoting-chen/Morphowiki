---
name: stopword
description: 把過於簡單(或不想複習)的英文單字加入 stopwords 白名單,避免它被 ingest 進字典。觸發時機:使用者輸入「/stopword <word>」、要求把某字加入 stopwords、或說「這字太簡單跳過」。維護 dictionary/stopwords.md 的 ## custom section。
---

# Stopword Skill

當使用者請求 `/stopword <word>`(或要求把某個英文單字加入 stopwords 白名單)時,依以下步驟執行。

## 適用情境
- 使用者輸入 `/stopword <word>` 或 `/stopword <word1> <word2> …`
- 使用者說「把 <word> 加進 stopwords」、「<word> 太簡單跳過」、「忽略 <word>」
- 在 ingest 流程中使用者主動表示「這字不需要收」

## 不適用情境
- 使用者要 ingest 某字 → 改用 `ingest` skill
- 使用者要從 stopwords 移除某字 → 目前未支援,告知使用者並停止

---

## Step 1 — 正規化輸入

1. 把 `<word>` 轉成小寫、去除前後空白。
2. 若包含空白或非英文字母字元,告知使用者只支援單一英文單字並停止。

## Step 2 — 讀 `dictionary/stopwords.md`

1. 若檔案不存在,先建立骨架:

   ```markdown
   # StopWords

   ## default

   ## custom
   ```

2. 解析 `## default` 與 `## custom` 兩個 section 內所有單字(每行可能是 `- word` 或裸字)。

## Step 3 — 去重檢查

- 若 `<word>` **已存在於 `## default`**:回報「<word> 已在 stopwords (default)」,**不做任何修改**,停止。
- 若 `<word>` **已存在於 `## custom`**:回報「<word> 已在 stopwords (custom)」,**不做任何修改**,停止。
- 若不存在,繼續。

## Step 4 — 加入 `## custom` section

1. 解析既有 `## custom` 的單字清單。
2. 加入 `<word>`,以字母順序重新排序。
3. 寫回檔案。
4. 格式:每行 `- <word>`,section 標題與其他 section 之間保留一行空行。**不要動 `## default` section**。

範例(加入 `apple` 後):

```markdown
# StopWords

## default

## custom

- apple
```

如已有 `banana`、`cherry`,加入 `apple` 後變成:

```markdown
# StopWords

## default

## custom

- apple
- banana
- cherry
```

## Step 5 — Append `dictionary/log.md`

1. 若檔案不存在,建立骨架(同 ingest skill Step 8)。
2. 追加:

   ```
   - <YYYY-MM-DD> stopword add <word>
   ```

## Step 6 — 回報

告訴使用者:
- `<word>` 已加入 `## custom` section
- 提醒:之後 `/ingest <word>` 會被拒絕

---

## 重要約束

1. **絕對不要更動 `## default` section**。
2. `## custom` 內維持字母排序、去重。
3. 若使用者一次給多個字,**逐一**檢查與加入(每個字都跑一遍 Step 1–4),最後一起 log 與回報。
4. 不要建立或修改 `dictionary/words/`、`dictionary/prefix/` 等其他資料夾 — 這個 skill 只動 `stopwords.md` 與 `log.md`。
5. 不要建立 `.claude/commands/` 任何檔案。

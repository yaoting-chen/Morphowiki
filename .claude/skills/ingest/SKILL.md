---
name: ingest
description: 分析英文單字並建立雙向關聯的字典頁。支援「現代形態派生模式 (Modern Base Stem)」與「嚴格古典詞源學模式 (Classical Etymology)」，並完整保留專有名詞大小寫 (如 Copenhagenism)。觸發時機:使用者輸入「/ingest <word>」、要求 ingest 某個英文單字、或請求把某個英文單字加入字典 / 字根字首字尾庫。
---

# Ingest Skill

當使用者請求 `/ingest <word>`(或要求分析、收錄某個英文單字)時，依照以下步驟執行。**所有檔案路徑都使用相對於專案根的 `dictionary/` 子樹**。

## 適用情境
- 使用者輸入 `/ingest <word>`(單字)、`/ingest <word1> <word2> …`(多單字)、或 `/ingest <整段句子>`(整句，系統自動分詞 + 過濾 stopwords)
- 支援學派模式指定：`/ingest --mode=modern <word>` (現代形態派生/基底詞模式，預設與 Benchmark/Gold 對齊) 或 `/ingest --mode=classical <word>` (嚴格古典詞源學模式)
- 使用者說「幫我 ingest <word>」、「把 <word> 加入字典」、「分析這個單字 / 這段話」
- 支援 `--dry-run` 模式：僅在輸出中進行拆解評估與回報，不實際寫入硬碟

## 不適用情境
- 使用者要查既有的單字 → 直接讀 `dictionary/words/<word>.md`
- 使用者要把字加入 stopwords → 改用 `stopword` skill
- 使用者要 ingest 中文詞或片語 → 不處理，詢問使用者

---

## Step 1 — 輸入分詞與過濾

支援三種輸入形式，**統一以分詞流程處理**:
- 單字:`/ingest Copenhagenism`、`/ingest international`
- 多單字(空白分隔):`/ingest Copenhagenism international cooperation success`
- 整句(含標點與虛詞):`/ingest The Copenhagenism movement was a success.`

### Step 1a — 分詞與大小寫保留 (Case Preservation)

1. **大小寫保留原則 (Case Preservation)**:
   - **不強制全轉小寫**。必須保留原始單字的大小寫資訊（尤其是專有名詞與專有衍生詞，如 `Copenhagenism`、`Mosleyan`、`Bourbonism`、`Shaun`）。
2. 以**空白與標點符號**(半 / 全形 `.`、`,`、`;`、`:`、`!`、`?`、`"`、`'`、`(`、`)`、`[`、`]`、`{`、`}`、`—`、`–`、以及對應全形 `、`、`。`、`,`、`;`、`:`、`!`、`?`、`「`、`」` 等)為界，切成 token list。
3. 過濾 token:
   - 只保留**純英文字母**(全部由 `A`–`Z`、`a`–`z` 組成、長度 ≥ 1)的 token。
   - 丟棄純數字、純標點、空字串、含其他字元(如連字符 `t-shirt`、撇號 `don't`、混合 `5g` / `3d` 等)，列為「跳過 非純英文字母」。
4. 去重(以不區分大小寫為準去重，但保留最規範的大小寫拼寫)。
5. **Slug 計算**: 檔案名稱、URL 與內部檢索鍵一律採用小寫 slug (例如 `dictionary/words/copenhagenism.md`)，以避免 macOS / Windows / Linux 跨平台檔案系統大小寫敏感度衝突；但單字本體、YAML frontmatter `word:`、Markdown H1 與拆解標籤**完整保留原始大小寫** (如 `Copenhagenism`、`Copenhagen`)。

### Step 1b — Stopwords + 已存在過濾

對 Step 1a 通過的每個 token，依序檢驗:

1. **stopwords 檢查**:讀 `dictionary/stopwords.md`，解析 `## default` + `## custom`。比對時不區分大小寫(Case-insensitive)，若在任一 section → 列為「跳過 stopword」，不進入 ingest 流程。
2. **已存在檢查**:若 `dictionary/words/<token_slug>.md` 已存在 → 列為「跳過 已存在」，不覆蓋。
3. 其餘 token 進入**待處理清單**。

### Step 1c — Dispatch

- **待處理清單為空** → 回報「所有 token 都被過濾，無新單字可 ingest」(列出跳過原因)，結束。
- **單字模式**(清單剛好 1 個 token) → 對該 token 從 Step 4 起執行。
- **批次模式**(清單 ≥ 2 個 token) → **按輸入順序**對每個 token 從 Step 4 起執行整套流程。
  - **大批次調度限制**：若待處理單字清單**超過 20 個**，必須派發 Subagent 分批執行（**每個 Subagent 一次最多處理 20 個單字**）。每批處理完後必須立即關閉（Kill）該 Subagent，下一批次重新派發全新的 Subagent 處理，以重置 Context 並徹底杜絕模型幻覺。

---

## Step 4 — 語素拆解規範 (支援兩種學派模式)

拆解模式可由使用者參數 `--mode=modern` (預設/現代形態派生模式) 或 `--mode=classical` (嚴格古典詞源學模式) 指定。若未顯式指定，**預設採用現代形態派生模式 (Modern Base Stem Mode)**，確保與現代語言學 Gold Benchmark 基準對齊。

### 語素中文釋義強制要求 (Mandatory Morpheme Meanings)
無論何種模式，拆解出的每個語素（前綴、基底詞/字根、後綴）**皆必須提供準確的正體中文釋義**，嚴格禁止遺漏釋義或僅填寫英文名稱。

---

### Step 4a — 外來語/單語素借詞判定 (Loanword & Monomorphemic)

在拆解前，先判定 `<word>` 是否為**不可分的外來語借詞或單純單語素詞 (monomorphemic word)**。判定準則（三條同時滿足才算）：

1. **不屬英語活躍構詞體系**：來源語為非印歐語（日、漢、阿、韓、梵等）或羅曼語整字借詞且在英語中未發生形態分析（如 `sushi`、`tsunami`、`schiavone`、`pellagra`、`manzai`）。
2. **在英語中不參與派生構詞**：整字借入後無活躍衍生詞。
3. **單一不可分 morpheme**：在現代英語層次無附加字首/字尾。

**判定結果**：若判定為 Loanword / Monomorphemic，標記為整字借詞，不切分語素，直接建立單字頁，不建 root 頁。

---

### Step 4b — Mode A: 現代形態派生模式 (Modern Base Stem Mode，預設)

**核心原則：以現代英語中可獨立存在的「規範基底詞 (Canonical Base Word / Stem)」與活躍詞綴為核心，不穿透到底層拉丁/希臘原始詞素。**

1. **基底詞還原 (Canonical Stem/Lemma Normalization)**：
   - 詞根處採用現代英語的標準獨立詞形或詞基（Base Word），而非古典詞源根。
   - 必須提取該基底詞之現代中文釋義。
   - 範例：
     - `decelerative` $\to$ base `decelerate` (減速) + suffix `-ive` (形容詞字尾，具有...性質的)
     - `assailant` $\to$ base `assail` (攻擊、襲擊) + suffix `-ant` (名詞字尾，表...的人)
     - `undiscordant` $\to$ prefix `un-` (不、非) + base `discord` (不和、紛爭) + suffix `-ant` (形容詞字尾，具有...性質的)
     - `unamiability` $\to$ prefix `un-` (不、非) + base `amiable` (和藹可親的) + suffix `-ity` (名詞字尾，表狀態或性質)
     - `complimentariness` $\to$ base `compliment` (讚美、恭維) + suffix `-ary` (形容詞字尾) + suffix `-ness` (名詞字尾，表特質)
     - `ordinarily` $\to$ base `ordinary` (普通的、平常的) + suffix `-ly` (副詞字尾)
     - `semitonically` $\to$ prefix `semi-` (半) + base `tone` (音調、全音) + suffix `-ic` (形容詞字尾) + suffix `-ally` (副詞字尾)
2. **專有名詞大小寫保留 (Proper Noun Casing)**：
   - 專有名詞及其派生基底必須保持首字母大寫。
   - 範例：
     - `Copenhagenism` $\to$ base `Copenhagen` (大寫，哥本哈根) + suffix `-ism` (主義、學說)
     - `Mosleyan` $\to$ base `Mosley` (大寫，莫斯利) + suffix `-an` (表...的或...的人)
     - `Bourbonism` $\to$ base `Bourbon` (大寫，波旁家族/保守主義) + suffix `-ism` (主義、政策)
3. **字綴標準化與釋義 (Canonical Affixes & Meanings)**：
   - 採用現代英語活躍構詞綴，並給予明確之詞性與語義說明（如 `-ant` 表「...的人」或「...的」、`-ness` 表「名詞性質/狀態」、`un-` 表「否定/相反」）。

4. **同化前綴規範化 (Assimilated Prefix Normalization)**：
   - 同化變體的前綴一律還原為**規範形式**，與現代語言學 Gold Benchmark 的標註慣例一致。
   - `im-` / `il-` / `ir-` $\to$ `in-`；`col-` / `cor-` / `com-` $\to$ `con-`；`ef-` $\to$ `ex-`。
   - 中文釋義依規範形式給出，但需在 Morpheme Details 註明表層變體。
   - 範例：
     - `irreplaceable` $\to$ prefix `in-` (不、非，表層作 ir-) + prefix `re-` (再次) + base `place` (放置) + suffix `-able` (可...的)
     - `illegalization` $\to$ prefix `in-` (不、非，表層作 il-) + base `legal` (合法的) + suffix `-ize` (動詞字尾) + suffix `-ation` (名詞字尾)
5. **無現代基底詞之退回規則 (Bound-Root Fallback)**：
   - 若該字在現代英語中**不存在可獨立成詞的基底**，不得強行不拆，改以**慣用黏著詞根**作為基底，並標記 `bound_root`。
   - 此為 Mode A 的例外條款，僅在第 1 點無法適用時啟用；仍**不**遞迴拆解該黏著詞根。
   - 範例：
     - `inspect` $\to$ prefix `in-` (向內) + bound root `spect` (看，拉丁 specere)
     - `prospect` $\to$ prefix `pro-` (向前) + bound root `spect` (看)
   - 判定順序：Step 4a 借詞判定 $\to$ 第 1 點現代基底詞 $\to$ 第 5 點黏著詞根退回。

---

### Step 4c — Mode B: 嚴格古典詞源學模式 (Strict Classical Etymology Mode)

**核心原則：遞迴拆解到「無法再分離出有意義的底層古典詞源學 morpheme」為止。**

1. 強制拆出拉丁/希臘原始詞根與其古典詞源釋義（如 `nat` ← *nasci* 出生、`act` ← *agere* 行動/驅動、`form` ← *forma* 形狀、`celer` ← *celerare* 快速、`pli` ← *plicare* 折疊）。
2. 複合字尾拆到最小原子（如 `-ation` 拆為 `-at` + `-ion`、`-ization` 拆為 `-ize` + `-at` + `-ion`）。
3. 範例：
   - `international` $\to$ prefix `inter-` (在...之間、相互) + root `nat` (出生，拉丁 nasci) + suffix `-ion` (名詞字尾) + suffix `-al` (形容詞字尾)
   - `formation` $\to$ root `form` (形狀、形成) + suffix `-at` (動詞字尾素) + suffix `-ion` (名詞字尾)
   - `complimentariness` $\to$ prefix `con-` (共同、加強) + root `pli` (折疊/填滿) + suffix `-ment` + suffix `-ary` + suffix `-ness`

---

## Step 5 — 寫 `dictionary/words/<slug>.md`

格式範例（以 `assailant` 與 `Copenhagenism` 為例）：

```markdown
---
word: assailant
pos: n.
ipa: /əˈseɪ.lənt/
added: 2026-08-31
---

# assailant

**詞性**: n.
**IPA**: /əˈseɪ.lənt/
**中文釋義**: 攻擊者；襲擊者

## 拆解
- 字根: [[../words/assail]] `assail` — 攻擊、襲擊（動詞基底詞）
- 字尾: [[../suffix/-ant]] `-ant` — 表「...的人、執行動作的主體」（名詞字尾）

## 詞源
源自動詞 assail（攻擊），結合名詞字尾 -ant，指進行攻擊或襲擊行為的人。

## 記憶法
assail (襲擊) + -ant (人)，聯想為發動襲擊的人。

## 筆記區
```

### 拆解行規範 (Breakdown Format Rules)
1. 每一行開頭標籤必須為 `- 字首:`、`- 字根:` 或 `- 字尾:`（**嚴禁使用非標準標籤如 `- 基底詞/字根:`**，以確保與 `review/server.js` 解析器完全相容）。
2. 必須包含 Wiki-link：
   - 前綴：`[[../prefix/<p>-]]`
   - 基底詞/詞根：若為基底單字，指向 `[[../words/<base_slug>]]`；若為古典詞根，指向 `[[../root/<root>]]`
   - 後綴：`[[../suffix/-<s>]]`
3. 必須在 Wiki-link 與 inline code 之後，使用破折號附帶正體中文釋義：`— <正體中文釋義>`。
4. 檔名一律使用小寫 slug：`dictionary/words/<slug>.md`。
5. YAML frontmatter `word:` 與 `#` 標題完整保留真實大小寫（如 `Copenhagenism`）。
6. **`## 筆記區` 為空 section**，供使用者自填。

---

## Step 6 — 建立 / 更新語素頁與反向連結

對拆出的每個語素更新或建立對應的 `dictionary/prefix/`、`dictionary/root/`、`dictionary/suffix/` 頁面（專有名詞/獨立單字之 Base Word 則確保其詞彙關聯），並維持雙向 wiki-link 一致。

### 語素頁標準模板 (Morpheme Page Template)

語素檔名一律帶連字號識別：前綴為 `<p>-.md`、後綴為 `-<s>.md`、詞根為 `<r>.md`。

```markdown
---
morpheme: ant
type: suffix
meaning: ...的人/物（名詞字尾）；...的、具有...性質的（形容詞字尾）
---

# -ant

**類型**: suffix
**意義**: ...的人/物（名詞字尾）；...的、具有...性質的（形容詞字尾）

## Words containing this
- [[../words/assailant|assailant]]
```

> [!IMPORTANT]
> **嚴禁在 `meaning:` 與 `**意義**:` 欄位填入英文 token（如 `meaning: ant` 或 `meaning: able`）**。新建語素頁時必須填入準確之正體中文意義。若語素頁已存在，則在 `## Words containing this` 下補齊反向連結。

---

## Step 7 & 8 — 更新 Index 與 Log

- `dictionary/index.md`：在 `## Words` 新增 `- [[words/<slug>|Word]] — <釋義>`。
- `dictionary/log.md`：記錄操作日誌。

---

## Step 9 — 回報與 Benchmark 格式

回報本次拆解結果。若在評測/測試情境下，支援輸出 Benchmark 標準格式：

`Word | Mode | Segmentation | Morpheme Details`

### Segmentation 欄位規範（計分依據，務必嚴格遵守）

1. **必須使用規範形式 (canonical form)，不得使用表層字形**，且必須與 Morpheme Details 欄位完全一致。
   - `ability` $\to$ `able @@ity`（**不是** `abil@@ity`）
   - `irreplaceable` $\to$ `in @@re @@place @@able`（**不是** `ir@@re@@place@@able`）
   - `creature` $\to$ `create @@ure`
2. **分隔格式**：第一個語素不加標記；其後每個語素前綴 `@@`，語素之間以**一個半形空格**分隔。
   - 正確：`inter @@nation @@al`
   - 錯誤：`inter@@nation@@al`、`inter @@ nation @@ al`
3. **不寫連字號**：`in`、`al`、`ity`（不是 `in-`、`-al`、`-ity`）。連字號只出現在 Morpheme Details 與字典頁的語素 key。
4. **單語素/借詞**：Segmentation 欄僅寫該字本身，Morpheme Details 標 `monomorphemic` 或 `loanword`。
5. Mode B 同樣適用上述格式；差異只在拆解深度，不在輸出格式。

### 範例

```
international | modern | inter @@nation @@al | prefixes=['inter-'](在...之間), base=['nation'](國家), suffixes=['-al'](形容詞字尾)
ability | modern | able @@ity | base=['able'](能夠的), suffixes=['-ity'](名詞字尾，表狀態或性質)
irreplaceable | modern | in @@re @@place @@able | prefixes=['in-'](不、非，表層作 ir-), ['re-'](再次), base=['place'](放置), suffixes=['-able'](可...的)
inspect | modern | in @@spect | prefixes=['in-'](向內), bound_root=['spect'](看，拉丁 specere)
success | modern | success | monomorphemic
international | classical | inter @@nat @@ion @@al | prefixes=['inter-'](在...之間), root=['nat'](出生，拉丁 nasci), suffixes=['-ion'](名詞字尾), ['-al'](形容詞字尾)
```

### 評測情境的執行範圍限制

在 Benchmark 情境下（呼叫端明示 BENCHMARK MODE），**只執行 Step 1、Step 4 與 Step 9**：
不寫任何檔案、不建目錄、不產生 wiki-link、不更新 index/log。Step 5–8 整段跳過。

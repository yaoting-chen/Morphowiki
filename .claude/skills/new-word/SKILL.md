---
name: new-word
description: 從現有 dictionary 的 prefix / root / suffix 池嚴格組合,生成 N 個未收錄、非 stopword 的真實英文單字,並走類似 ingest 的流程把這些單字寫進 dictionary(不遞回中間單字)。觸發時機:使用者輸入「/new-word」或「/new-word <N>」、要求「自動造 N 個單字」、「用現有字根組幾個字」。N 預設 1。
---

# New-word Skill

當使用者請求 `/new-word <N>`(或「自動生成 N 個單字」、「用現有 morpheme 組幾個字」)時,依以下步驟執行。本 skill 目的是**省去手動 ingest**:從 dictionary 已有的 prefix / root / suffix 嚴格組合出新單字,再把這些單字按 ingest 風格寫進 dictionary。

## 適用情境
- 使用者輸入 `/new-word`、`/new-word 5`
- 使用者說「幫我用現有字根組 3 個字」、「自動造幾個單字」
- 使用者想擴張 dictionary 但不想一個個 `/ingest`

## 不適用情境
- 使用者指定特定單字 → 改用 `ingest` skill
- 使用者想加 stopword → 改用 `stopword` skill
- dictionary 還沒有任何 morpheme(prefix / root / suffix 都空) → 告知使用者請先用 `/ingest` 收幾個字累積 morpheme,再回來用 `/new-word`

---

## Step 1 — 解析參數

1. 從使用者輸入抓 N:
   - `/new-word 5` → N = 5
   - `/new-word` → N = 1(預設)
   - `/new-word -3` 或非整數 → 告知格式錯誤並停止
2. 上限:N ≤ 20。超過就告知「一次最多 20 個,請分批」並停止。
3. N ≥ 1。

## Step 2 — 掃描 morpheme 池

讀 `dictionary/prefix/*.md`、`dictionary/root/*.md`、`dictionary/suffix/*.md` 內所有檔案。對每個檔案:

1. 用 Read tool 讀檔。
2. 解析 frontmatter,取:
   - `morpheme:` — **stem(不含連字號)**,這是組合用的核心拼寫
   - `meaning:` — zh-TW 釋義(供生成時參考語意)
3. 把它依 type 分類放進池子。

組出資料結構(在 LLM 內部記憶,不需寫檔):

```
prefixes: [{ stem: "inter", meaning: "在…之間;相互" }, ...]
roots:    [{ stem: "nat",   meaning: "出生;誕生" }, ...]
suffixes: [{ stem: "al",    meaning: "形容詞字尾,表…的" }, { stem: "ion", meaning: "名詞字尾" }, ...]
```

**注意**:檔名可能是新規則(`inter-.md`、`-al.md`)或舊規則(`inter.md`、`al.md`),**一律以 frontmatter 的 `morpheme:` 為 stem**,不靠檔名推測。

若三個池**任一**為空(完全沒檔案)→ 告知使用者並提出建議(先 ingest 幾個字累積)。

## Step 2.5 — Morpheme 池防呆過濾(防 loanword 污染)

避免**手動建立**或**歷史遺留**的不合理 morpheme 條目(例如有人手動把 `sushi`、`karaoke`、`tsunami` 等 loanword 放進 `dictionary/root/`)被 new-word 拿來組合出虛構派生詞(如 `sushify`、`unsushi`、`tsunamic`)。

**設計原則**:可組合性的元資料**不放在 `dictionary/` 內任何 md**(避免技術欄位污染字典,老師讀不懂)。固化在 skill 自家領域:**`.claude/skills/new-word/morpheme-flags.md`**。

### 1. 讀 morpheme-flags.md

讀 `.claude/skills/new-word/morpheme-flags.md`,解析以下 section(每行 `- <stem>` 或裸字,stem 全小寫不含連字號):
- `## blocked roots`、`## blocked prefixes`、`## blocked suffixes` — 永久排除清單
- `## allowed roots`、`## allowed prefixes`、`## allowed suffixes` — 強制保留清單(self-check 想排除也保留)

若檔案不存在,視為全空(不在這步建檔;Step 7 自動 append 時會 lazy 建檔)。

### 2. 過濾優先序

對 Step 2 池內每個條目,依下列**優先序**判定:

| 條件 | 行為 |
|---|---|
| 出現在 `## blocked <type>s` | **排除**(信任明確標記) |
| 出現在 `## allowed <type>s` | **保留**(信任明確標記,跳過 self-check) |
| 未提及 + type = `prefix` 或 `suffix` | **保留**(這兩類池內條目少且穩定,風險低) |
| 未提及 + type = `root` | 做 **root productivity self-check**(見下) |

### 3. Root productivity self-check

對每個未在 morpheme-flags.md 提及的 root,LLM 自問**兩條**:

1. 這個 root 是否屬於**印歐語系構詞體系**(英語原生 / 拉丁 / 希臘根)?
2. 在現代英語中,這個 root 是否能與其他 prefix / suffix **組合產生真實派生詞**?(LLM 須能舉出至少 1 個真實派生詞為證)

- **兩條皆 yes** → 進候選池(視為可組合)。
- **任一 no** → 排除,記入「跳過清單」;Step 7 會**自動 append 到 morpheme-flags.md 的 `## blocked <type>s`**,下次直接信任不再重判。

典型應排除:`sushi`、`karaoke`、`tsunami`、`taco`、`yoga`、`kimono`、`zen`、`ninja`、`samurai` 等整字 loanword。

典型應保留:
- `nat` → nation、native、prenatal、innate
- `form` → formation、reform、formal、deform
- `believe` → believable、unbelievable、disbelief
- `happy` → happily、unhappy、happiness

**排除的條目不會被刪檔**(不動 dictionary 任何內容),只是 (a) 當次 /new-word 不採用、(b) Step 7 自動加入 morpheme-flags.md 永久固化。

### 4. 過濾後池為空的處理

若 Step 2.5 過濾後 **root 池為空** → 告知 user 並停止,提示:「現有 root 全被判定不可組合。請 (a) `/ingest <字>` 累積構詞性 root,或 (b) 編輯 `.claude/skills/new-word/morpheme-flags.md` 把某些 stem 從 `## blocked roots` 移到 `## allowed roots` 強制保留」。

## Step 3 — 讀黑名單

1. 讀 `dictionary/stopwords.md`,解析 `## default` 與 `## custom`,組成 stopword set。
2. 讀 `dictionary/words/*.md` 的檔名(去掉 `.md`),組成 already-ingested set。

主單字若落在這兩個 set 內,不能被生成。

## Step 4 — LLM 嚴格組合 N 個候選字

**核心規則(嚴格策略)**:

> 每個生成的單字,經過**嚴格詞源學拆解**(同 ingest skill Step 4)後,**所有 prefix / root / suffix 的 stem 都必須出現在 Step 2 的池中**。換句話說,**不允許引入新 morpheme**。

LLM 的工作:

1. 給定 prefixes / roots / suffixes 三池,嘗試組合出**真實存在的英文單字**:
   - 機械上 `<prefix?> + <root> + <suffix?>` 樣式
   - 可有 0..N 個 prefix、必有 1 個 root、0..N 個 suffix
   - 形變允許(`believe + able` → `believable`,刪掉 root 結尾 `e`;`nat + ion` → `nation`,加母音)
   - **必須是現代英語確實存在的字**(LLM 用語言知識判斷,不能瞎拼)
2. 過濾:
   - 不在 stopword set
   - 不在 already-ingested set
   - 拆解後所有 morpheme stem **嚴格** 都在池中(這是嚴格策略的關鍵 — 寧可少給也不能違反)
3. 收集到 N 個 → 進 Step 5;若試過合理組合後**仍少於 N 個** → 收多少算多少,Step 7 回報實際數量。

### 範例

假設池為:
- prefixes: `inter`, `un`, `re`
- roots: `nat`, `build`, `believe`
- suffixes: `al`, `ion`, `able`

合法生成候選:
- `national` = root `nat` + suffix `-ion` + suffix `-al`
- `international` = prefix `inter-` + root `nat` + suffix `-ion` + suffix `-al`
- `unbelievable` = prefix `un-` + root `believe` + suffix `-able`
- `rebuild` = prefix `re-` + root `build`
- `rebuildable` = prefix `re-` + root `build` + suffix `-able`(若真是英文字)

**非法**(會被嚴格策略擋掉):
- `building` — 雖然是英文字,但 `-ing` 不在 suffix 池
- `unhappy` — `happy` 不在 root 池
- 隨機亂湊但不是真實英文字的拼合,如 `interbuild`、`naton`

### 反例(教學示意):複合字尾陷阱

說明嚴格策略最常見的失守模式 — LLM 為了湊「真實英文字」而引入池外 morpheme。以下示意:

假設某 pool 不含 `dict` 也不含 `-ation`(suffix 池可能僅有 `-al`、`-ion` 等)。若 LLM 因為「dictation 是真實英文字」就選用它,並拆 `dict + -ation`,違規點如下:

- `dict` 不在 root 池 → 違反嚴格策略。
- `-ation` 不在 suffix 池 → 違反嚴格策略。
- **即便語言學上 `-ation = -ate + -ion`,只要池中沒有 `-ation` 這個字面條目,就不可使用**;且即使 pool 同時有 `-ate` 與 `-ion`,也不能動態組裝出 `-ation`(morpheme stem 是字面比對)。

正確處理:跳過 dictation,改試其他真的能用池內 morpheme 字面組合出的字;若所有候選都不行,寧可回報生成 0 個也不可違反嚴格策略。要新增 `-ation` 等複合字尾請走 `/ingest <某帶該字尾的字>` 讓字尾自然進池(且 ingest 偏好拆到最小單位,複合字尾通常不會直接進池)。

### 強制驗證 checklist

對每個候選 `<w>`,寫進 dictionary 前 LLM 必須能逐一回答:
1. `<w>` 是真實存在的現代英語單字嗎?(是)
2. `<w>` 不在 stopwords?(是)
3. `<w>` 不在 dictionary/words/?(是)
4. 嚴格詞源學拆解 `<w>` 後,**所有** prefix stem、root stem、suffix stem 都在 Step 2 的池中?(是)
5. 拆解後所有 morpheme 都在 **Step 2.5 過濾後的可組合池**內(沒踩到 morpheme-flags.md 的 `## blocked` 清單、且未被 root productivity self-check 排除)?(是)

任一不符就丟掉,換下一個。

## Step 5 — 對每個生成字執行 ingest 風格的寫入流程

對 Step 4 通過的每個 `<word>`,依序執行下列子步驟(**這是 ingest skill 的精簡版,跳過遞回中間單字**):

### 5a. 嚴格詞源學拆解
同 `ingest` skill Step 4 的拆解規則,**輸出 morpheme key**(prefix 是 `<stem>-`、suffix 是 `-<stem>`、root 是 `<stem>`)。

### 5b. 寫 `dictionary/words/<word>.md`
同 `ingest` skill Step 5 的完整模板(frontmatter `word/pos/ipa/added`、正文「詞性/IPA/中文釋義」、`## 拆解`、`## 詞源`、`## 記憶法`、`## 筆記區`)。**`## 筆記區` 保留為空 section**(只有標題行),供 user 自行填寫,不要自作主張寫入內容。
- 詞性用縮寫(`n. v. vt. vi. adj. adv. prep. conj. pron. det. art. interj. aux. num.`)。
- 拆解行用新規則:`- 字首: [[../prefix/<key>]] \`<key>\` — <meaning>` 之類(`<key>` 帶連字號);**舊檔(無連字號)優先**沿用舊路徑,規則見 ingest skill Step 4「向後相容」一節。

### 5c. 更新對應 morpheme 頁的 `## Words containing this`
因為「嚴格策略」要求所有 morpheme 都已在池中,**這裡 100% 是更新既有 morpheme 頁**,不會新建。逐一打開對應檔案,在 `## Words containing this` section 加入 `- [[../words/<word>]]`,維持字母排序、去重。

### 5d. **跳過 ingest Step 6.5(遞回中間單字)**
即使生成的字含中間單字(如 `international` 含 `nation`、`national`),**不要遞回 ingest**。這是 /new-word 與 /ingest 的關鍵差異 — 使用者已選擇精準控制數量。

### 5e. 更新 `dictionary/index.md`
在 `## Words` section 加入 `- [[words/<word>]] — <一句 zh-TW 說明>`,維持字母排序、去重。

morpheme 池都是既有的,所以 `## Prefix` / `## Root` / `## Suffix` section **不需要追加**。

### 5f. Append `dictionary/log.md`
追加一行:

```
- <YYYY-MM-DD> new-word <word> (prefix=<m1>,<m2>, root=<m3>, suffix=<m4>,<m5>)
```

- 日期用當天 ISO。
- 多個 prefix / suffix 以逗號分隔。
- 動詞用 **`new-word`** 而非 `ingest`,以便日後在 log 區分來源。
- 缺少的語素類別整段欄位省略。

## Step 6 — 雙向 link 完整性檢查

完成 Step 5 所有單字後,快速掃一次:
- 每個新建的 `dictionary/words/<word>.md` 內的拆解 wiki-link,在對應 morpheme 頁有沒有反向 link?(理論上 5c 已做,這裡是保險)

若發現遺漏,補上。

## Step 7 — 回報

對使用者回報:

1. **要求 N**:`<N>`
2. **實際生成**:`<M>` 個(若 M < N,說明原因 — 池太小、組合都試過、找不到更多合法真實英文字等)
3. 列表(每個一行):
   ```
   <word> — <一句 zh-TW 釋義> [prefix=<m1>,<m2>, root=<m3>, suffix=<m4>,<m5>]
   ```
4. **Morpheme 池過濾結果**(若 Step 2.5 有透過 self-check 跳過任何條目):
   - 列出被排除的 morpheme(僅本次 self-check 新排除的,已在 `## blocked` 內的條目不重複報告),例:`已跳過 root sushi (疑似 loanword,無真實英語派生詞)`。
   - **skill 自動 append 到 `.claude/skills/new-word/morpheme-flags.md`** 對應 `## blocked <type>s` section(若檔案不存在則先依本 skill base 模板建檔)。下次 /new-word 直接信任、不再 self-check。
   - 告知 user:「若不認同某項排除,請編輯 `.claude/skills/new-word/morpheme-flags.md`,把該 stem 從 `## blocked <type>s` 移到 `## allowed <type>s`(強制保留)」。
   - **dictionary/ 內任何 md 都不會被新增技術欄位**(這是有意的設計,維持字典對老師可讀)。
5. 下一步建議:`/flashcard <word>` 把這些字加進複習庫,或 `/review-word` 開始複習。

---

## 重要約束

1. **嚴格策略不可妥協** — 拆解後所有 morpheme stem 都必須在 Step 2 的池中。寧可少生成也不能違反。
2. **不要遞回中間單字** — 即使生成的字內含可拆出的中間英文單字,只 ingest 主單字。
3. **生成的單字必須是真實英文字**,不可機械拼接出虛構詞。
4. **檢查 stopwords + dictionary/words**,主單字不可在這兩個 set 內。
5. **池為空 / morpheme 太少時**,告知使用者並停止,不要強求。
6. 中文一律 zh-TW;詞性用縮寫。
7. **以 frontmatter 的 `morpheme:` 為 stem** — 不要從檔名推測(新舊規則檔名可能不一致)。
8. 不要建立 `.claude/commands/`、不要動 stopwords.md。
9. **morpheme stem 是字面比對,不可動態組裝複合字尾**。即使語言學上 `-ation = -ate + -ion`、`-tional = -tion + -al`、`-ically = -ic + -al + -ly`,若池中沒有 `-ation` 字面條目就不可使用 `-ation`。要新增複合字尾請走 `/ingest <字>`,讓該字尾自然進池(且 ingest 偏好拆到最小單位,複合字尾通常不會直接進池)。
10. **Loanword / 非構詞性 morpheme 防呆**:Step 2.5 對手動建立或歷史遺留的可疑 morpheme(尤其 root)做 productivity self-check 並排除,避免組出 `sushify`、`unsushi`、`tsunamic` 等虛構詞。排除結果由 Step 7 **自動 append** 到 `.claude/skills/new-word/morpheme-flags.md`(skill 自家領域)。判定準則:**不屬印歐構詞體系 + 無真實英語派生詞** → 排除。**`dictionary/` 下任何 md 都不會被加入技術欄位** — 字典保持對老師可讀。詳見 Step 2.5。

---
name: ingest
description: 分析英文單字並建立雙向關聯的字典頁。支援現代形態派生模式 (Modern Base Stem Mode) 與嚴格古典詞源學模式 (Strict Classical Etymology Mode)。觸發時機:使用者輸入「/ingest <word>」、要求 ingest 某個英文單字、或請求把某個英文單字加入字典 / 字根字首字尾庫。對單字進行語素拆解、產生 zh-TW 釋義並維護 wiki-link 雙向反向連結。
---

# Ingest Skill

當使用者請求 `/ingest <word>`(或要求分析、收錄某個英文單字)時,依照以下步驟執行。**所有檔案路徑都使用相對於專案根的 `dictionary/` 子樹**。

## 適用情境
- 使用者輸入 `/ingest <word>`(單字)、`/ingest <word1> <word2> …`(多單字)、或 `/ingest <整段句子>`(整句,系統自動分詞 + 過濾 stopwords)
- 使用者說「幫我 ingest <word>」、「把 <word> 加入字典」、「分析這個單字 / 這段話」
- 使用者貼出一個英文單字或一段含多個生詞的句子並要求收錄

## 不適用情境
- 使用者要查既有的單字 → 直接讀 `dictionary/words/<word>.md`
- 使用者要把字加入 stopwords → 改用 `stopword` skill
- 使用者要 ingest 中文詞或片語 → 不處理,詢問使用者

---

## Step 1 — 輸入分詞與過濾

支援三種輸入形式,**統一以分詞流程處理**:
- 單字:`/ingest international`
- 多單字(空白分隔):`/ingest international cooperation success`
- 整句(含標點與虛詞):`/ingest The international cooperation project was a success.`

### Step 1a — 分詞

1. 把整段 `<input>` 轉小寫。
2. 以**空白與標點符號**(半 / 全形 `.`、`,`、`;`、`:`、`!`、`?`、`"`、`'`、`(`、`)`、`[`、`]`、`{`、`}`、`—`、`–`、以及對應全形 `、`、`。`、`,`、`;`、`:`、`!`、`?`、`「`、`」` 等)為界,切成 token list。
3. 過濾 token:
   - 只保留**純英文字母**(全部由 `a`–`z` 組成、長度 ≥ 1)的 token。
   - 丟棄純數字、純標點、空字串、含其他字元(如連字符 `t-shirt`、撇號 `don't`、混合 `5g` / `3d` 等),列為「跳過 非純英文字母」。
4. 去重(同段輸入內重複的 token 只處理一次)。

### Step 1b — Stopwords + 已存在過濾(取代單字模式原 Step 2 / Step 3)

對 Step 1a 通過的每個 token,依序檢:

1. **stopwords 檢查**:讀 `dictionary/stopwords.md`,解析 `## default` + `## custom`。token 在任一 section → 列為「跳過 stopword」,不進入 ingest 流程。
2. **已存在檢查**:若 `dictionary/words/<token>.md` 已存在 → 列為「跳過 已存在」,不覆蓋。
3. 其餘 token 進入**待處理清單**。

### Step 1c — Dispatch

- **待處理清單為空** → 回報「所有 token 都被過濾,無新單字可 ingest」(列出跳過原因),結束。
- **單字模式**(清單剛好 1 個 token) → 對該 token 從 Step 4 起執行(可跳過 Step 2、Step 3,因為 Step 1b 已做)。
- **批次模式**(清單 ≥ 2 個 token) → **按輸入順序**對每個 token 從 Step 4 起執行整套流程(含 Step 6 反向 link、Step 6.5 遞回中間單字、Step 7 更新 index、Step 8 append log)。
  - **每個 token 進入 Step 4 之前,必須再做一次 Step 3 已存在檢查** — 因為前一 token 的 Step 6.5 遞回 ingest 可能已建檔(例如 batch 中先處理 `international` 時遞回建了 `national`、`nation`,後面若還有 `national` 在清單裡就會被跳過)。
  - 各 token 的 Step 9 個別回報**合併**為一次彙整(見 Step 9 批次回報段),避免噪音。

## Step 2 — 檢查 stopwords(**單字模式必做;批次模式已在 Step 1b 做過,可跳過**)

1. 讀 `dictionary/stopwords.md`。
2. 解析 `## default` 與 `## custom` 兩個 section 內的所有單字(每行一個,可能是 `- word` 列表或裸字)。
3. **若 `<word>` 出現在任一 section**:
   - **拒絕 ingest**,輸出:`「<word>」已在 stopwords (<section>),不會建立字典頁。如要強制 ingest,請先用 /stopword 將其移除(目前未支援)。`
   - 停止後續步驟。
4. 若不在 stopwords,繼續。

## Step 3 — 檢查是否已存在

1. 若 `dictionary/words/<word>.md` 已存在,告知使用者該字已收錄,並詢問是否要覆蓋。若使用者未要求覆蓋就停止。

> **批次模式注意**:Step 1b 已做過一次初檢;**每個 token 在進入 Step 4 前還要再做一次本檢查**(可能被前一 token 的遞回 ingest 建檔),已存在 → 靜默跳過(不再問是否覆蓋,直接列入「跳過 已存在」清單)。

## Step 4 — 語素拆解與模式選擇

### Step 4 — 模式選擇

支援兩種拆解模式:
- `/ingest --mode=modern <word>`：現代形態派生模式 (Modern Base Stem Mode)。
- `/ingest --mode=classical <word>`：嚴格古典詞源學模式 (Strict Classical Etymology Mode)。
- **未指定 `--mode` 時，預設使用 `classical`（嚴格古典詞源學模式）。**

無論模式為何，所有 prefix、base/root 與 suffix 都必須提供準確的正體中文釋義；詞序必須符合單字由左至右的實際拼寫。

### Step 4a — Loanword 判定(優先,做拆解前先做)

在 morpheme 拆解之前,先判定 `<word>` 是否為**單純的外來語整字借詞**(monomorphemic loanword)。判定準則(**三條同時滿足才算**):

1. **不屬印歐語系構詞體系**:來源語為日文、漢語、韓文、阿拉伯文、梵文、太平洋諸島語、美洲原住民語等非印歐語系。羅曼語族(西班牙、義大利、葡萄牙)借詞**通常仍可拆**,因共享拉丁根。
2. **在英語中不參與構詞**:無真實派生詞(沒人說 sushify、karaokeize、tsunamic、tacoal、yogaic)。整字進英語後不長新枝。
3. **單一不可分 morpheme**:英語層級拆不出 prefix / suffix。

典型 loanword:`sushi`、`karaoke`、`tsunami`、`karma`、`yoga`、`kimono`、`taco`、`kowtow`、`ninja`、`samurai`、`zen`、`feng-shui`、`tofu`、`origami`。

**若判定為 loanword**:不做拆解,**標記為 loanword**,直接跳到 Step 5(Step 5 / 6 / 7 / 8 均有 loanword 分支)。**Step 6 整段跳過**(不建 root 頁、不進 morpheme 池)。

**反例**(這些字看似外來但**不**是 loanword):
- `television`:混希臘 `tele-` + 拉丁 `vis`,兩部分都是英語構詞活躍 morpheme → 正常拆。
- `happy`:英語原生自由詞素,**有衍生力**(unhappy、happily、happiness、happier) → 正常進 root 池,不算 loanword。
- `restaurant`:來自法語,但 `-ant` 是活躍 suffix → 拆 `restaur` + `-ant`。

### Step 4b — 現代形態派生模式 (Modern Base Stem Mode)

僅在未判定為 loanword，且使用者指定 `--mode=modern` 時使用。核心原則是以現代英語中可獨立存在的 canonical base word/stem 為核心，不穿透到底層拉丁或希臘詞源。

- 優先使用現代英語可獨立成詞的基底，例如 `decelerative` → `decelerate` + `-ive`、`assailant` → `assail` + `-ant`、`unamiability` → `un-` + `amiable` + `-ity`。
- 專有名詞及其派生基底保留大小寫，例如 `Copenhagenism` → `Copenhagen` + `-ism`、`Mosleyan` → `Mosley` + `-an`。
- 使用活躍的現代詞綴，並為每個詞綴提供中文釋義。複合字尾可依現代構詞邊界拆解，例如 `-ization` → `-ize` + `-ation`。
- 同化前綴使用規範形式：`im-` / `il-` / `ir-` → `in-`；`col-` / `cor-` / `com-` → `con-`；`ef-` → `ex-`，並在釋義中註明表層變體。
- 若沒有可獨立存在的現代基底，使用 bound root 作為退回方案，例如 `inspect` → `in-` + `spect`；不得再遞迴拆解 bound root。

現代模式的代表結果:

| 單字 | 拆解結果 |
|---|---|
| `ability` | base `able`、suffix `-ity` |
| `irreplaceable` | prefix `in-`(表層作 `ir-`)、prefix `re-`、base `place`、suffix `-able` |
| `inspect` | prefix `in-`、bound root `spect` |

### Step 4c — 嚴格古典詞源學模式 (Strict Classical Etymology Mode)

**核心原則:遞迴拆解到「無法再分離出有意義的詞源學 morpheme」為止。**「教學字根」(teaching root,如 nation、action、formation)**不算最底層 root**,要繼續拆。

判定 root 是否還能再拆的判準:
- root 是否仍含有可辨識的衍生型字尾(`-ion`、`-tion`、`-ation`、`-al`、`-ic`、`-ity`、`-or`、`-er`、`-ment`、`-ous`、`-ive`…)? 若是,繼續拆。
- root 是否能對應到拉丁/希臘原始詞根(如 `nat` ← natio/nasci「to be born」、`act` ← agere、`form` ← forma)? 若是,以原始詞根作為 root。
- 拆到不再能識別出附加詞素的最小自由詞素或拉丁/希臘根為止。

### 範例

| 單字 | 拆解結果 |
|---|---|
| `unbelievable` | prefix `un-`、root `believe`、suffix `-able` |
| `rebuild` | prefix `re-`、root `build` |
| `international` | prefix `inter-`、root `nat`、suffix `-ion`、suffix `-al` |
| `national` | root `nat`、suffix `-ion`、suffix `-al` |
| `nation` | root `nat`、suffix `-ion` |
| `action` | root `act`、suffix `-ion` |
| `formation` | root `form`、suffix `-at`、suffix `-ion`(拆到最小單位,不寫 `-ation`) |
| `happy` | root `happy`(英語原生自由詞素,有衍生力 unhappy/happily) |
| `sushi` | **(loanword)** 不拆,只進 words,不建 root 頁 |
| `tsunami` | **(loanword)** 不拆,只進 words,不建 root 頁 |

> 注意:`nation`、`national` 等「教學字根」雖然在許多英文教材中被當 root,但本專案採嚴格詞源學派,必須繼續拆。若有疑問請朝詞源學派(拆到最底層)選擇。

> **複合字尾偏好拆到最小單位**:語言學上的複合字尾(`-ation = -ate + -ion`、`-tional = -tion + -al`、`-ically = -ic + -al + -ly`、`-ization = -ize + -ation`)在本專案**一律拆到最小**,不以複合形式進池。原因:`new-word` 走嚴格字面比對,池中若有複合字尾會誘發混淆與非法組裝。例外:若某複合字尾在現代英語已無法清楚分離成有意義的兩塊(視為單一不可分原子),才以複合形式列入,並在拆解時明文標注。

### 輸出資料結構

對每個語素準備:
- **stem**:全小寫拼寫核心,不含連字號(`inter`、`nat`、`al`、`ion`、`un`、`able`)
- **key**:檔名與 wiki-link 路徑用的形式,**依 type 加連字號**:
  - prefix → `<stem>-`(例:`inter-`、`un-`、`re-`)
  - root → `<stem>`(例:`nat`、`believe`、`build`)
  - suffix → `-<stem>`(例:`-al`、`-ion`、`-able`)
- type(prefix / root / suffix)
- 簡短 zh-TW 意義說明

一個單字可有 **0..N 個 prefix**、**1 個 root**(必須)、**0..N 個 suffix**。

### 向後相容:舊 morpheme 檔(無連字號)

第一版 ingest 出來的 morpheme 檔案沒帶連字號(`dictionary/prefix/un.md`、`dictionary/suffix/able.md`、`dictionary/root/believe.md` …)。**這些舊檔仍合法,不要刪也不要 rename**。新規則只適用**新建**檔案。

引用 morpheme 時,**先檢查舊檔是否存在**:

1. 計算「新 key 路徑」:`dictionary/prefix/<stem>-.md` / `dictionary/suffix/-<stem>.md` / `dictionary/root/<stem>.md`
2. 計算「舊 key 路徑」:`dictionary/prefix/<stem>.md` / `dictionary/suffix/<stem>.md`(root 同新)
3. **若舊 key 路徑檔案存在** → 用舊 key(wiki-link 寫 `[[../prefix/un]]`、`[[../suffix/able]]`),不建立 `un-.md` / `-able.md`
4. **否則** → 用新 key 建立(wiki-link 寫 `[[../prefix/inter-]]`、`[[../suffix/-al]]`)

root 規則前後一致,沒有相容性問題。

## Step 5 — 寫 `dictionary/words/<word>.md`

格式(嚴格依此模板):

```markdown
---
word: <word>
pos: <part-of-speech 縮寫,多義以分號分隔>
ipa: <IPA>
added: <YYYY-MM-DD>
---

# <word>

**詞性**: <part-of-speech 縮寫>
**IPA**: <IPA>
**中文釋義**: <zh-TW gloss,可多義以分號分隔>

## 拆解
- 字首: [[../prefix/<prefix1-key>]] `<prefix1-key>` — <zh-TW meaning>
- 字首: [[../prefix/<prefix2-key>]] `<prefix2-key>` — <zh-TW meaning>
- 字根: [[../root/<root-key>]] `<root-key>` — <zh-TW meaning>
- 字尾: [[../suffix/<suffix1-key>]] `<suffix1-key>` — <zh-TW meaning>
- 字尾: [[../suffix/<suffix2-key>]] `<suffix2-key>` — <zh-TW meaning>

## 詞源
<2–4 句 etymology,可提及來源語言、原意演變>

## 記憶法
<1–3 句中文記憶法,結合語素或意象>

## 筆記區
```

### 具體範例:international

```markdown
---
word: international
pos: adj.
ipa: /ˌɪn.təˈnæʃ.ən.əl/
added: 2026-05-14
---

# international

**詞性**: adj.
**IPA**: /ˌɪn.təˈnæʃ.ən.əl/
**中文釋義**: 國際的;跨國的

## 拆解
- 字首: [[../prefix/inter-]] `inter-` — 在…之間、相互
- 字根: [[../root/nat]] `nat` — 出生(拉丁文 nasci「to be born」)
- 字尾: [[../suffix/-ion]] `-ion` — 名詞字尾,表動作 / 結果
- 字尾: [[../suffix/-al]] `-al` — 形容詞字尾,表「與…有關的」

## 詞源
…

## 記憶法
…

## 筆記區
```

### 規則
- **拆解行的順序**必須符合單字實際拼寫(由左到右):`international` 寫成 `inter- + nat + -ion + -al`,不可亂序。
- 若某類語素不存在,**該行(們)整行省略**(不要寫「無」)。
- root 一定要有一行(**loanword 除外**,見下面「Loanword 變體模板」)。
- prefix / suffix 可以 0 行或多行,每多一個就多一行。
- **wiki-link 路徑用 morpheme key(帶連字號)**:`[[../prefix/inter-]]`、`[[../suffix/-al]]`、`[[../root/nat]]`。**除非舊檔已存在**(見上面「向後相容」),否則一律用 key。
- **link 後 inline code 顯示 key 本身**(`` `inter-` ``、`` `-al` ``、`` `nat` ``),內容與 wiki-link 結尾一致。
- IPA 用標準 IPA(Cambridge/Merriam-Webster 風格皆可),用 `/…/` 包起來。
- 中文用繁體中文(zh-TW)。
- `added` 用當天日期,格式 `YYYY-MM-DD`。
- wiki-link 一律使用相對路徑 `[[../prefix/<key>]]`、`[[../root/<key>]]`、`[[../suffix/<key>]]`,不加 `.md`。
- **`## 筆記區` 是 user 個人筆記區**:模板留空 section(只有標題行,內容空),供 user 自行填寫。**ingest / new-word 一律不寫入內容,只建立空 section**。即使 LLM 心癢想加例句也禁止 — 這是 user 的領域。

### Loanword 變體模板

對 Step 4a 判定為 loanword 的字,**word md 的 `## 拆解` section 改寫成單一說明行**,其餘 section 與 frontmatter 格式一如平常:

```markdown
## 拆解
- 整字借詞: 源自<語言> <原字>,無英語構詞拆解
```

例(sushi):

```markdown
## 拆解
- 整字借詞: 源自日文 寿司(sushi),無英語構詞拆解
```

- **不要**寫 `字根: [[../root/sushi]]` 之類的 wiki-link(因為 root 頁不該存在)。
- `## 詞源` 段可說明借入英語的時間、原意演變,但不寫拉丁 / 希臘 morpheme 推演。
- `## 記憶法` / `## 筆記區` 一如平常。

### 詞性縮寫對照表

frontmatter 的 `pos` 與正文 `**詞性**:` 必須用以下縮寫(有句點),**不要寫全稱**:

| 縮寫 | 全稱 | 中文 |
|---|---|---|
| `n.` | noun | 名詞 |
| `v.` | verb | 動詞(及物/不及物未明示) |
| `vt.` | transitive verb | 及物動詞 |
| `vi.` | intransitive verb | 不及物動詞 |
| `adj.` | adjective | 形容詞 |
| `adv.` | adverb | 副詞 |
| `prep.` | preposition | 介系詞 |
| `conj.` | conjunction | 連接詞 |
| `pron.` | pronoun | 代名詞 |
| `det.` | determiner | 限定詞 |
| `art.` | article | 冠詞 |
| `interj.` | interjection | 感嘆詞 |
| `aux.` | auxiliary verb | 助動詞 |
| `num.` | numeral | 數詞 |

多詞性以 `; ` 分隔:`n.; v.`、`adj.; adv.`。若一個動詞既及物又不及物,可寫 `vt.; vi.` 或統一寫 `v.`。

## Step 6 — 建立 / 更新語素頁(**雙向 link 的反向端**)

> **若 Step 4a 判定為 loanword,整個 Step 6 跳過** — 不建 root / prefix / suffix 頁,不更新任何 morpheme 頁的反向 link。直接進 Step 7。

對 Step 4 拆出的每個語素,依「向後相容」一節決定要用新 key 還是舊 key 引用,並操作對應檔案:

| type | 檔案路徑(新規則) | 舊規則(若舊檔存在優先) |
|---|---|---|
| prefix | `dictionary/prefix/<stem>-.md` | `dictionary/prefix/<stem>.md` |
| root   | `dictionary/root/<stem>.md`    | (同新) |
| suffix | `dictionary/suffix/-<stem>.md` | `dictionary/suffix/<stem>.md` |

### 若檔案不存在 — 建立(用新規則)

```markdown
---
morpheme: <stem>
type: <prefix|root|suffix>
meaning: <zh-TW meaning>
---

# <key>

**類型**: <prefix|root|suffix>
**意義**: <zh-TW meaning>

## Words containing this
- [[../words/<word>]]
```

- frontmatter 的 `morpheme` 仍寫 **stem(不含連字號)**,讓檔案內容可以反查純拼寫。
- **標題**寫 **key(帶連字號)**:`# inter-` / `# -al` / `# nat`(root 無連字號)。
- 檔名以 `-` 開頭的 suffix(如 `-al.md`、`-ion.md`、`-able.md`):Write tool 直接寫沒問題;**用 Bash 時要加 `--` 或 `./` 前綴避免被當 flag**(例如 `cp -- dictionary/suffix/-al.md dest/`、`ls ./dictionary/suffix/`)。

### 若檔案已存在 — 更新

1. 讀檔。
2. 找 `## Words containing this` section。若不存在,在檔尾追加。
3. 加入新的一行 `- [[../words/<word>]]`,**維持字母排序、去重**。
4. 不要動 frontmatter 或其他既有內容。

**雙向同步原則**:words MD 內的每個 morpheme link 必須在對應的 prefix/root/suffix MD 內有反向 link。**兩端必須同次操作中一起更新。**

## Step 6.5 — 遞回 ingest 中間英文單字

嚴格詞源學拆解會經過一些「中間單字」(intermediate words),例如:
- `international` 經過 → `national`、`nation`
- `formation` 經過 → `form`(若 `form` 本身為英文單字)

對每個拆解過程中產生的「中間單字」<w'>,判定是否要遞回 ingest:

1. **判定 <w'> 是否為現代英語的獨立單字**(以 LLM 自身語言知識判斷;像 `nat`、`believ` 之類顯然不是 — 它們只是 morpheme,不是字)。
2. 若不是字 → 跳過。
3. 若是字,依序檢查:
   - 在 stopwords(任一 section)→ 跳過。
   - `dictionary/words/<w'>.md` 已存在 → 跳過(不覆蓋)。
   - 在「本次 ingest session 已處理 set」內 → 跳過(避免無限遞迴)。
4. 否則,把 <w'> 加入本次 session set,**對 <w'> 從 Step 4 起整套執行一次**(嚴格詞源學拆解、寫 word md、建立/更新 morpheme md、更新 index、append log)。
5. 中間單字的 ingest 完成後,回到原 <word> 繼續往下做 Step 7。

### 重要約束
- session set 只在當前一次 `/ingest` 呼叫內有效,不持久化。
- 多個中間單字的順序:**先 ingest 較深層(較短)的單字**(例如 `international` → 先 `nation` → 再 `national` → 最後 `international`),這樣最後一層的 morpheme 頁 `## Words containing this` 會包含所有版本。
- 若使用者 ingest `international` 時 `nation` 已存在,只跳過 `nation` 自己,**仍要更新 nation 對應的 morpheme(`nat`、`ion`)的 `## Words containing this`**(已在 Step 6 做)。

## Step 7 — 更新 `dictionary/index.md`

1. 若檔案不存在,建立骨架:

   ```markdown
   # Dictionary Index

   字典所有頁面總覽。每行一個 page + 一句說明。

   ## Words

   ## Prefix

   ## Root

   ## Suffix
   ```

2. 在 `## Words` section 加入 `- [[words/<word>]] — <一句 zh-TW 說明>`,維持字母排序、去重。**對 Step 6.5 遞回 ingest 的每個中間單字,同樣加入。**
3. 對 Step 6 中**新建**的語素頁,也分別在 `## Prefix` / `## Root` / `## Suffix` 加入 `- [[<type>/<key>]] — <一句 zh-TW 說明>`(`<key>` 帶連字號)。**僅新建時加,既有頁面不重複加。**
4. **Loanword 例外**:若主單字為 loanword,仍要在 `## Words` 加入它(它確實是 word),但**不要**在 `## Root` / `## Prefix` / `## Suffix` 加入任何條目(因為 Step 6 整段跳過,沒新建語素頁)。

## Step 8 — Append `dictionary/log.md`

1. 若檔案不存在,建立:

   ```markdown
   # Log

   Append-only 操作紀錄。
   ```

2. 對主單字以及每個遞回 ingest 的中間單字,各追加一行:

   ```
   - <YYYY-MM-DD> ingest <word> (prefix=<m1>,<m2>, root=<m3>, suffix=<m4>,<m5>)
   ```

   - 多個 prefix / suffix 以逗號分隔。
   - 缺少的語素類別整段欄位省略(例:無 prefix 就不寫 `prefix=` 欄位)。
   - **Loanword 變體**:格式改為 `- <YYYY-MM-DD> ingest <word> (loanword, no morpheme)`。

## Step 9 — 回報

### 單字模式回報

告訴使用者:
- 本次主單字拆解結果(列出所有 prefix / root / suffix)。
- 哪些中間單字被遞回 ingest(列出單字名)。
- 建立了哪些新檔案。
- 更新了哪些既有檔案(尤其是反向 link 與 index)。

### 批次模式回報(若 Step 1c 走批次)

**統一彙整一次**,不要逐 token 列完整詳情(會炸 context):

- **輸入分詞**:原始 token 數 N(去重後)
- **跳過 非純英文字母**:`[don't, t-shirt, 5g, ...]`(J 個)
- **跳過 stopword**:`[the, was, a, project, ...]`(M 個,標明 default / custom)
- **跳過 已存在**:`[<word1>, <word2>, ...]`(K 個,**含 batch 中因前一 token 遞回 ingest 而成為「已存在」的**)
- **實際 ingest**:每個一行,簡短拆解 + 中間單字:
  ```
  <word> — prefix=<m1>,<m2>, root=<m3>, suffix=<m4>,<m5> [中間單字: <w1>, <w2>]
  ```
- **建檔統計**:words md X 個、morpheme md Y 個、index/log 更新 ✓

---

## 重要約束

1. **先查 stopwords,任何字在 stopwords 內一律拒絕 ingest**(主單字與中間單字皆同)。
2. **嚴格詞源學拆解,root 一定要拆到最底層**(`nation`、`action` 之類「教學字根」不算,要繼續拆)。
3. **雙向 link 必須同時更新兩端** — words 內 link 到 morpheme,morpheme 必須 link 回 words。
4. **中間單字遞回 ingest**:拆解過程中經過的「也是英文單字」的中間形,自動建檔(防無限遞迴 + 尊重 stopwords)。
5. **連字號規則(新)**:
   - **檔名與 wiki-link 路徑帶連字號**(prefix → `<stem>-`、suffix → `-<stem>`、root → `<stem>`)。例:`dictionary/prefix/inter-.md`、`dictionary/suffix/-al.md`、wiki-link `[[../prefix/inter-]]`、`[[../suffix/-al]]`。
   - 拆解清單行的 inline code 也顯示帶連字號的 key(`` `inter-` ``、`` `-al` ``、`` `nat` ``)。
   - morpheme 頁的標題同樣帶連字號(`# inter-`、`# -al`、`# nat`)。
   - **舊檔(無連字號,如 `prefix/un.md`、`suffix/able.md`)仍合法**,引用前先檢查舊路徑是否存在,存在就指向舊路徑(見 Step 4「向後相容」)。
6. **詞性用縮寫**(`adj.`、`n.`、`vt.` 等),不寫全稱。
7. 中文一律 zh-TW。
8. 不要建立 `.claude/commands/` 任何檔案 — 全部走 skill 路線。
9. 不要更動 `dictionary/stopwords.md`(那是 stopword skill 的職責)。
10. 不要刪除既有檔案的內容,只能追加或在指定 section 內插入。
11. **Loanword 不進 morpheme 池**:單純的外來語整字借詞(`sushi`、`karaoke`、`tsunami`、`taco`、`yoga` 等)只進 `dictionary/words/`,**絕不建立 `dictionary/root/`、`dictionary/prefix/`、`dictionary/suffix/` 頁**。避免 `new-word` skill 從中組出虛構派生詞(如 sushify、unsushi、tsunamic)。判定準則見 Step 4a。
12. **批次 / 整句 ingest 支援**:Step 1 自動分詞 + Step 1b 過濾(stopwords / 已存在 / 非純英文字母),Step 1c dispatch 為單字模式或批次模式。批次模式按輸入順序逐字 ingest,中間單字的反向 link 與遞回 ingest 自動由 Step 6.5 處理,結束後 Step 9 統一彙整回報。連字符字(`t-shirt`、`e-mail`)、撇號縮寫(`don't`)、含數字 token(`5g`、`3d`)在 Step 1a 全被丟棄 — 目前不支援,屬已知 edge case。

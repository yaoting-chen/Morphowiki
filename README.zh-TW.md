[English](./README.md) | **繁體中文**

# Morphowiki

受 Andrej Karpathy 的 LLM Wiki 啟發,**私有化、本地化**的英文單字學習工具。每位學生用 Claude Code 維護自己的單字庫與複習庫,所有資料留在本機檔案系統。

## 七個 Skill(全部走 Claude Code Skills,不用 Slash Commands)

| Skill                             | 用途                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/setup`                          | 檢查 Node.js、巢狀建立資料夾、直接生成 ~155 個 default stopwords,並從模板複製 `review/server.js` 與前端三檔(**不要與內建 `/init` 混淆** — 內建 `/init` 是生成 CLAUDE.md)                                                                                                                                                                                                                                                                                                  |
| `/ingest <word \| words \| 整句>` | 依詞源學嚴格遞迴拆解(0..N 個 prefix + 1 個 root + 0..N 個 suffix,例:`international` → `inter-` + `nat` + `-ion` + `-al`),產生 zh-TW 釋義、詞性縮寫、IPA、記憶法、空 `## 筆記區`,寫入 `dictionary/words/<word>.md`,維護**雙向 wiki-link**,並遞回 ingest 中間英文單字(如 `national`、`nation`)。整句輸入會自動分詞、過濾標點 / stopwords / 已存在;**Loanword 整字借詞**(`taco`、`sushi`、`karaoke` 等)走 Step 4a 分支:只進 `words/`,不建 morpheme 頁、不污染 `/new-word` 池 |
| `/new-word [N]`                   | 從現有 prefix/root/suffix 池**嚴格組合**生成 N 個(預設 1,上限 20)未收錄的真實英文單字,各自走 ingest 風格寫入流程,但**不**遞回中間單字。**morpheme stem 字面比對**,不可動態組裝複合字尾(如 `-ation`)。Step 2.5 **morpheme 池防呆過濾**:讀 `.claude/skills/new-word/morpheme-flags.md` 的 `## blocked` 永久封鎖清單,再對未提及的 root 跑 self-check 排除 loanword,結果自動 append 回 morpheme-flags.md                                                                      |
| `/stopword <word>`                | 把太簡單的字加入 `dictionary/stopwords.md` 的 `## custom`,之後 ingest 會擋                                                                                                                                                                                                                                                                                                                                                                                                |
| `/flashcard <word>`               | 加進 `review/flashcards.json`(SM-2 間隔重複);亦可 `remove`、列表                                                                                                                                                                                                                                                                                                                                                                                                          |
| `/review-word`                    | 啟動本地 Node Express 網頁(port 5173)翻卡、評分、回寫進度;缺檔請先跑 `/setup`                                                                                                                                                                                                                                                                                                                                                                                             |
| `/lint [word]`                    | 字典結構檢查。無參數=全庫純結構檢查(無 LLM、僅報不修);帶 word=結構檢查 + LLM 語意檢查(拆解 / 釋義 / 詞源-拆解 consistency / 詞性 / IPA),列出建議後問你套用哪幾條                                                                                                                                                                                                                                                                                                          |

## 快速開始

1. 用 Claude Code 開啟此資料夾,六個 skill 自動載入
2. `/setup` — 第一次使用先跑;之後可省略
3. `/ingest unbelievable` — 看 `dictionary/` 自動長出單字頁與反向關聯
4. `/flashcard unbelievable` — 加進複習庫
5. `/review-word` — 瀏覽器打開 http://localhost:5173 複習
6. `/new-word 3` — 用現有字根快速擴庫,一次生 3 個字

## 一次處理多個字(空白分隔 / 整句)

`/ingest`、`/stopword`、`/flashcard` 都支援一次給多個字,以空白分隔,各自獨立執行(中途失敗的會被略過、其他照常)。`/ingest` 進一步支援**整句**輸入 — 自動分詞、過濾標點、stopwords、已存在單字,以及含連字號 / 撇號 / 數字的非純字母 token(`t-shirt`、`don't`、`5g` 等不收):

```
/ingest enable defender                            # 收 enable、defender 兩個字
/ingest The international project was a success.   # 整句:自動跳過 the/was/a;只收 international、project、success
/stopword cat ball                                  # 把 cat、ball 加進 custom stopwords
/flashcard enable defender                          # 把這兩個字加進複習庫
```

需要 Node.js ≥ 18(只給 `review-word` 用)。

## Q&A
### Q1: 為什麼這套 SM-2 實作只有 4 個按鈕？

[原始 SM-2](https://super-memory.com/english/ol/sm2.htm) 雖定義了 0–5 共 6 個評級，但依據其 Rule 6，**評分 < 3 處理結果完全等價**（連續次數歸零、間隔重設為 1 天、且不改變 Ease）。為減少使用者的「抉擇疲勞」，我們將忘記的狀態合併為單一的 `Again` 按鈕。

只有在成功回想時，系統才會調整長期難度：`Hard` (-0.14) / `Good` (不變) / `Easy` (+0.10)。更重要的是，本作的 `Again` 嚴格遵守「**不扣除 Ease**」（僅防呆保底 1.3）的原始設計，這能有效防止使用者因一時的恍神，讓卡片掉入無法翻身的「Ease Hell（易忘地獄）」。
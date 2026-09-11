---
name: flashcard
description: 維護 SM-2 間隔重複的複習卡清單(review/flashcards.json)。觸發:使用者輸入「/flashcard」、「/flashcard <word>」、「/flashcard remove <word>」。
---

# flashcard skill

本 skill 負責維護使用者的英文單字複習清單,儲存在 `review/flashcards.json`,
搭配 **SM-2(SuperMemo-2)** 間隔重複演算法,讓 `review-word` skill 之後能依排程做複習。

本 skill **只負責 CRUD**(新增、列出、移除),**不負責執行複習**——複習由 `review-word` skill 處理。

---

## 一、觸發條件

當使用者訊息符合下列任一形式,啟動本 skill:

| 形式 | 意圖 |
|---|---|
| `/flashcard` | 列出所有複習卡 |
| `/flashcard <word>` | 把單字加入複習清單 |
| `/flashcard <word1> <word2> ...` | 一次加入多個字(空白分隔) |
| `/flashcard remove <word>` | 從複習清單移除某張卡 |

**注意**:
- 字一律轉成 **小寫** 處理(`Apple` → `apple`),避免大小寫造成重複卡。
- `remove` 為保留字,不能當作要新增的單字。

---

## 二、檔案位置

- 卡片資料庫:`review/flashcards.json`(專案根目錄的 `review/` 之下)
- 單字頁:`dictionary/words/<word>.md`(由 `/ingest` 建立)
- 停用詞白名單:`dictionary/stopwords.md`(`## default` 與 `## custom` 兩個 section)

### JSON 結構(根)

```json
{
  "version": 1,
  "cards": [ /* Card 物件陣列,按 word 字母升冪排序 */ ]
}
```

### Card 物件欄位

| 欄位 | 型別 | 初始值 | 語意 |
|---|---|---|---|
| `word` | string | (使用者輸入,轉小寫) | 單字本身 |
| `added` | string (ISO `YYYY-MM-DD`) | today | 加入清單的日期 |
| `ease` | number | `2.5` | SM-2 的 easiness factor,最小 `1.3` |
| `interval` | number | `0` | 下次複習與上次的天數間隔 |
| `repetition` | number | `0` | 連續答對(grade ≥ 3)次數 |
| `due` | string (ISO `YYYY-MM-DD`) | `added` | 下次到期日;new card 立即到期 |
| `lastReview` | string \| null | `null` | 最後一次複習日期 |
| `history` | array | `[]` | review 紀錄(由 `review-word` skill 寫入,本 skill 不動) |

---

## 三、操作流程

### A. 列出所有卡片 (`/flashcard`,無參數)

1. 讀取 `review/flashcards.json`。若檔案不存在,先初始化為 `{ "version": 1, "cards": [] }`。
2. 若 `cards` 為空,回覆「目前沒有任何複習卡,可用 `/flashcard <word>` 加入」。
3. 否則以表格方式列出每張卡的 `word`、`due`、`ease`、`repetition`,並標註今日是否到期(`due <= today`)。
4. 順便回報總卡數與已到期張數。

### B. 新增卡片 (`/flashcard <word>` 或多個字)

對每個輸入的單字,**依序**做下列檢查(任何一步失敗都跳過該字並回報原因,但繼續處理其他字):

1. **格式檢查**:單字應為英文字母組成。轉小寫後使用。
2. **已 ingest 檢查**:確認 `dictionary/words/<word>.md` 存在。
   - 不存在 → 回覆:「`<word>` 尚未建立單字頁,請先執行 `/ingest <word>`」並跳過。
3. **stopword 檢查**:讀取 `dictionary/stopwords.md`,解析 `## default` 與 `## custom` 兩個 section 列出的字。
   - 若 `<word>` 在白名單(任一 section)→ 回覆:「`<word>` 在 stopwords 白名單,不需複習」並跳過。
4. **重複檢查**:讀取 `review/flashcards.json`,若 `cards` 已有相同 `word` → 回覆:「`<word>` 已在複習清單(due: <due>)」並跳過。
5. **新增**:建立 Card 物件(欄位初始值見前述表格,`added`/`due` 都用 today),append 進 `cards`。

全部處理完後:
- 依 `word` 字母升冪排序 `cards`。
- 寫回 `review/flashcards.json`,**UTF-8 無 BOM,LF 換行**,使用 2 空白縮排。
- 摘要回報:成功加入幾張、跳過幾張、各自原因。

### C. 移除卡片 (`/flashcard remove <word>`)

1. 將 `<word>` 轉小寫。
2. 讀取 `review/flashcards.json`。
3. 若找不到該卡 → 回覆:「`<word>` 不在複習清單」。
4. 找到 → 從 `cards` 移除,寫回檔案(同樣 UTF-8 無 BOM,LF,2 空白縮排),回覆移除成功並顯示被移除卡片的當下狀態(`ease`、`repetition`、`history` 長度)以便使用者知道遺失了什麼進度。

---

## 四、stopwords.md 解析規則

`dictionary/stopwords.md` 範例結構:

```markdown
# StopWords

## default
a
an
the

## custom
hello
world
```

解析步驟:
- 找 `## default` 與 `## custom` 兩個 heading。
- 各 section 下方一行一個字,忽略空行、忽略以 `#` 或 `-` 開頭的行(預留給未來標記用)。
- 比對時雙方都轉小寫。
- 若檔案缺少其中一個 section,視為該 section 為空,不視為錯誤。

---

## 五、SM-2 演算法(給 review-word skill 參考)

本 skill **不執行** SM-2 更新,但欄位語意已預留給 `review-word`。下面是更新規則摘要,供 review-word skill 的作者依此實作:

### 輸入

- 使用者對某張卡的回答品質 `grade`,範圍 `0–5`(0=完全不會;5=立刻回想起來且很簡單)。
- `today`(ISO 日期)。

### 更新邏輯

```
if grade < 3:
    repetition = 0
    interval   = 1
    # ease 不變(也可選擇懲罰,但標準 SM-2 在這裡不動 ease)
else:
    if repetition == 0:
        interval = 1
    elif repetition == 1:
        interval = 6
    else:
        interval = round(interval * ease)
    repetition = repetition + 1
    ease = ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
    if ease < 1.3:
        ease = 1.3

lastReview = today
due        = today + interval days
history.append({ "date": today, "grade": grade })
```

### 注意

- `ease` 不得低於 `1.3`(SM-2 標準下限)。
- `interval` 一律為整數天數(`round`)。
- `due` 計算用日期加法(不是 timestamp),保持 ISO `YYYY-MM-DD`。
- `history` 為 append-only,每次複習多加一筆 `{ date, grade }`,本 skill 不要清空。

---

## 六、回覆風格

- 用繁體中文回覆。
- 訊息簡短,逐字回報每個輸入單字的處理結果。
- 列表時用表格或清楚的條列式呈現。
- 若使用者輸入多字且其中部分失敗,**不要中止**,失敗的列為「跳過」,成功的照常加入。
- 不要在沒有指示時主動執行 `/ingest` 或 `/stopword`;只給出建議。

---

## 七、邊界與禁止事項

- **不要**修改 `dictionary/` 下任何檔案。
- **不要**動 `cards[*].history`(那是 `review-word` 的職責)。
- **不要**建立 `.claude/commands/`——本專案統一用 skill 觸發。
- **不要**在本 skill 內啟動任何 server 或前後端(那是 `review-word` 的職責)。
- 若 `review/flashcards.json` 解析失敗(壞掉的 JSON),停止操作並回報錯誤路徑與行號,讓使用者手動修復;**不要**靜默覆蓋。

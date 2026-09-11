# Morpheme Combinability Flags

new-word skill 的內部資料,記錄哪些 morpheme stem 在 `/new-word` 時要永久排除或保留。

**設計目的**:把可組合性的元資料留在 skill 自家領域,讓 `dictionary/` 下的 md 保持乾淨(無技術欄位、老師看得懂)。

**維護方式**:

- `/new-word` 跑 Step 2.5 排除某 root 時,會**自動 append** 到對應的 `## blocked <type>s` section。
- user 也可手動編輯本檔,把條目從 `## blocked` 移到 `## allowed` 強制保留(例如 self-check 誤殺的罕用拉丁根)。

**stem 寫法**:全小寫、不含連字號(與 morpheme md frontmatter 的 `morpheme:` 欄位一致)。每行一個,格式 `- <stem>` 或裸字皆可。

---

## blocked roots

## blocked prefixes

## blocked suffixes

## allowed roots

## allowed prefixes

## allowed suffixes

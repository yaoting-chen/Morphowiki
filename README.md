**English** | [繁體中文](./README.zh-TW.md)

# Morphowiki

![morphowiki-overview](https://morphowiki.pages.dev/morphowiki-overview.png)

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.20537896.svg)](https://doi.org/10.5281/zenodo.20537896)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-43853d.svg?logo=node.js&logoColor=white)](https://nodejs.org/)

Inspired by Andrej Karpathy's LLM Wiki — a **private, local-first** English morphology knowledge base. Each student maintains their own vocabulary and review deck with Claude Code, and all data stays on the local filesystem.

Manual: [manual link](https://morphowiki.pages.dev/?lang=en)

---

## Why Morphowiki

Large language models (LLMs) can decompose English morphology (prefix / root / suffix) on the fly, but their output stays trapped in one-off conversations: it cannot be version-controlled, cannot accumulate, and carries no topological relationships between morphemes. Anki and SuperMemo, on the other hand, have mature spaced-repetition (SRS) scheduling but center on isolated cards with no morpheme graph; Obsidian offers bidirectional links and high portability but no LLM morphological automation; and commercial platforms such as Quizlet and Membean are data-closed and non-reproducible. For ESL learners, as well as for educational-technology and applied-linguistics researchers, no open tool covers all of these needs at once.

Morphowiki packages "LLM recursive morphological decomposition → Markdown bidirectional-link graph → SM-2 scheduling" into seven repeatable Claude Code Agent Skills. All data lives locally as plain text (Markdown / JSON): inspectable, version-controllable, and portable.

The table below compares representative, widely used tools from each category; it is not an exhaustive survey of every product on the market.

| Tool                | LLM Integration | Morphological Decomposition | SRS Scheduling | Bidirectional Links | Data Portability | Active Curation |
| ------------------- | :-------------: | :-------------------------: | :------------: | :-----------------: | :--------------: | :-------------: |
| Anki                | ✗               | ✗                           | ✓              | ✗                   | ✓ ᵃ              | ✗               |
| Quizlet             | △               | ✗                           | △ ᶠ              | ✗                   | △                | ✗               |
| Membean             | ✗               | △ ᵇ                         | △ ᶜ            | ✗                   | ✗                | ✗               |
| Obsidian + Anki ᵈ   | ✗               | ✗                           | ✓              | ✓                   | ✓                | △               |
| **Morphowiki**      | **✓**           | **✓**                       | **✓**          | **✓**               | **✓**            | **✓**           |

> **Symbols**: ✓ = native and complete support (out of the box); △ = partial support (a native but paywalled feature, or a secondary official feature); ✗ = not supported (including functionality achievable only by fully relying on third-party community plugins). **Basis**: each tool is rated on its native core functionality; anything achievable only via community plugins is recorded as ✗.
> **Active curation**: the system separates "automatic verification" from "data writing," changing the lexicon only under explicit user authorization (e.g., `/lint` only flags issues and does not modify files automatically), rather than letting an algorithm or platform decide the learning content on the user's behalf.
> ᵃ Anki's data portability refers to native plain-text and `.apkg` / `.colpkg` export-then-import, not API-level interoperability.
> ᵇ "Morphological decomposition" means automatically and recursively decomposing any input word into prefix / root / suffix and generating a navigable morpheme graph; Membean natively offers morpheme-level root instruction and a root tree, but only for words already in its lexicon rather than as a general-purpose decomposer, and is therefore recorded as △.
> ᶜ Membean natively provides an adaptive spaced-repetition mechanism, but only within its paid subscription tiers; it is therefore recorded as △.
> ᵈ "+" denotes a workflow combining two tools (not a single product); LLM integration is judged by native core design, and although Obsidian can connect to an LLM via community plugins, it is still recorded as ✗.
> ᶠ Quizlet's "Learn" mode applies a spaced-repetition-style adaptive schedule, but full scheduling control is restricted to paid tiers; it is therefore recorded as △.

---

## Key features

- **Strict etymological recursive decomposition**: decomposes words with a 0..N prefix + 1 root + 0..N suffix model (e.g. `international` → `inter-` + `nat` + `-ion` + `-al`), and recursively ingests intermediate English words (`national`, `nation`).
- **Bidirectional wiki-link morpheme graph**: word pages and morpheme pages (prefix/root/suffix) backfill links to each other, weaving isolated words into a browsable, navigable morphological network.
- **Sentence / batch ingestion with auto-filtering**: `/ingest` accepts multiple words or a whole sentence, auto-tokenizes, and filters out punctuation, stopwords, already-collected words, and tokens containing hyphens / apostrophes / digits.
- **Automatic word generation from the existing morpheme pool**: `/new-word [N]` strictly combines existing prefixes/roots/suffixes to generate N uncollected, real English words, each going through the ingest-style write flow.
- **Local SM-2 review web app**: `/review-word` launches a local Node Express site (port 5173); after flipping and grading a card, it writes review progress back via the SM-2 algorithm, with all data staying local.
- **Structural + semantic consistency checks**: `/lint` runs a whole-library structure-only check; `/lint <word>` additionally runs an LLM semantic check on a word (etymological plausibility of the decomposition, gloss, POS, IPA).
- **Loanword branch**: loanwords (`taco`, `sushi`, `karaoke`, etc.) create only a `words/` page with no morpheme pages, and never pollute the `/new-word` generation pool.
- **Plain-text, version-controllable**: all dictionary and review data are local Markdown/JSON — Git-trackable, inspectable, and portable.

---

## System architecture

Morphowiki uses a three-layer architecture with clearly separated responsibilities, decoupled through the file system:

1. **Generation Layer**: seven Claude Code Agent Skills, loaded only when you issue a command, responsible for morpheme decomposition, bidirectional-link maintenance, and quality checks.
2. **Data Layer**: the Markdown word and morpheme files under `dictionary/`, forming a morpheme graph via bidirectional wiki-links.
3. **Review Layer**: a Node.js + vanilla-JS local HTTP server (`server.js`, port 5173), a pure-frontend SPA (`web/`), and the SM-2 card store (`review/flashcards.json`).

![Workflow of the seven commands](docs/img/workflow.png)

> Workflow of the seven core commands — after `/setup` initializes, the main line is `/ingest` → `/flashcard` → `/review-word`, with the side branches `/stopword`, `/new-word`, and `/lint` maintaining the lexicon.

```txt
morphowiki/
├── .claude/skills/             # Generation Layer: 7 Agent Skills
│   ├── setup/  ingest/  new-word/  stopword/
│   └── flashcard/  review-word/  lint/
├── dictionary/                 # Data Layer: Markdown lexicon
│   ├── stopwords.md
│   ├── prefix/   # e.g. inter-.md
│   ├── root/     # e.g. nat.md
│   ├── suffix/   # e.g. -al.md, -ion.md
│   └── words/    # e.g. international.md
└── review/                     # Review Layer: local server
    ├── flashcards.json         # SM-2 progress
    ├── server.js               # Node.js HTTP server (port 5173)
    └── web/                    # SPA frontend (index.html, app.js, style.css)
```

---

## Seven Skills (all delivered as Claude Code Skills, not Slash Commands)

| Skill                                | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/setup`                             | Checks Node.js, creates the nested folder layout, generates ~155 default stopwords, and copies `review/server.js` plus the three frontend files from templates (**do not confuse with the built-in `/init`** — that one generates CLAUDE.md)                                                                                                                                                                                                                                                                                     |
| `/ingest <word \| words \| sentence>` | Strict etymological recursive decomposition (0..N prefixes + 1 root + 0..N suffixes, e.g. `international` → `inter-` + `nat` + `-ion` + `-al`), produces zh-TW gloss, POS abbreviation, IPA, mnemonic, and an empty `## 筆記區`, writes to `dictionary/words/<word>.md`, maintains **bidirectional wiki-links**, and recursively ingests intermediate English words (e.g. `national`, `nation`). Whole-sentence input is auto-tokenized and filtered against punctuation / stopwords / existing entries; **loanwords** (`taco`, `sushi`, `karaoke`, etc.) take the Step 4a branch — they live in `words/` only, no morpheme pages, and never pollute the `/new-word` pool |
| `/new-word [N]`                      | **Strictly combines** existing prefix/root/suffix pools to generate N real, uncollected English words (default 1, max 20), each going through an ingest-style write flow but **without** recursing into intermediate words. **Morpheme stems are matched literally** — no dynamic assembly of compound suffixes like `-ation`. Step 2.5 **morpheme-pool safety filter**: reads the `## blocked` permanent block list in `.claude/skills/new-word/morpheme-flags.md`, then runs a self-check on unflagged roots to exclude loanwords, appending results back to morpheme-flags.md |
| `/stopword <word>`                   | Adds overly common words to the `## custom` section of `dictionary/stopwords.md`; subsequent ingests will block them                                                                                                                                                                                                                                                                                                                                                                                                             |
| `/flashcard <word>`                  | Adds to `review/flashcards.json` (SM-2 spaced repetition); also supports `remove` and listing                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `/review-word`                       | Launches the local Node Express site (port 5173) for flipping cards, grading, and writing progress back; if files are missing, run `/setup` first                                                                                                                                                                                                                                                                                                                                                                                |
| `/lint [word]`                       | Dictionary structure check. No argument = whole-library structure-only check (no LLM, reports without modifying); with a word = structure check + LLM semantic check (decomposition / gloss / etymology-decomposition consistency / POS / IPA), listing suggestions and asking which ones to apply                                                                                                                                                                                                                               |

---

## AI agent compatibility

The seven skills follow the open Agent Skills standard, so **Claude Code**, **Google Antigravity**, and **GitHub Copilot** use them directly from `.claude/skills/` with no setup. **Codex** is the only exception: on first use it asks whether to load the skills — allow it, and Codex converts them into its own skills folder.

---

## Prerequisites

| Requirement | Version | Purpose |
|---|---|---|
| Claude Code | CLI / desktop / IDE plugin | Triggers the 7 skills + LLM morpheme analysis |
| Node.js | ≥ 18 | Only used by `/review-word`'s local server |
| Browser | any modern browser | Open http://localhost:5173 to review |

## Quick start

```bash
git clone https://github.com/yaoting-chen/Morphowiki.git
cd Morphowiki
```

After opening this folder in Claude Code, the seven skills load automatically:

1. `/setup` — run on first use; skip afterwards
2. `/ingest unbelievable` — watch `dictionary/` grow word pages and backlinks
3. `/flashcard unbelievable` — add it to the review deck
4. `/review-word` — open http://localhost:5173 in the browser to review
5. `/new-word 3` — quickly expand the pool from existing morphemes, three at a time

---

## Batch input (whitespace-separated / full sentence)

`/ingest`, `/stopword`, and `/flashcard` all accept multiple words separated by whitespace and process them independently (a failure mid-list is skipped, the rest proceed). `/ingest` further accepts **whole sentences** — it auto-tokenizes and filters punctuation, stopwords, existing entries, and non-pure-alpha tokens with hyphens / apostrophes / digits (`t-shirt`, `don't`, `5g`, etc., are not collected):

```
/ingest enable defender                            # collects enable and defender
/ingest The international project was a success.   # sentence: auto-skips the/was/a; only collects international, project, success
/stopword cat ball                                  # adds cat and ball to custom stopwords
/flashcard enable defender                          # adds both to the review deck
```

---

## Example: what `/ingest international` produces

When you run `/ingest international`, Morphowiki recursively decomposes and builds `nation` → `national` → `international` in order, writes the complete word page to `dictionary/words/international.md`, and backfills `[[../words/international]]` into each morpheme page, forming bidirectional wiki-links.

The actual artifact `dictionary/words/international.md`:

````markdown
---
word: international
pos: adj.
ipa: /ˌɪn.təˈnæʃ.ən.əl/
added: 2026-05-21
---
# international

**詞性**: adj.
**IPA**: /ˌɪn.təˈnæʃ.ən.əl/
**中文釋義**: 國際的; 跨國的

## 拆解
- 字首: [[../prefix/inter-]] `inter-` — 在…之間、相互
- 字根: [[../root/nat]] `nat` — 出生(拉丁 nasci「to be born」)
- 字尾: [[../suffix/-ion]] `-ion` — 名詞字尾
- 字尾: [[../suffix/-al]] `-al` — 形容詞字尾

## 詞源
...

## 記憶法
...

## 筆記區
````

At the same time, the `## Words containing this` section of `dictionary/prefix/inter-.md` is automatically appended with `[[../words/international]]` (bidirectional).

---

## Review UI screenshot

![Review web interface](docs/img/review-ui.png)

The back of a card shows IPA, POS, the Chinese gloss, and the morpheme decomposition; etymology and mnemonic are collapsed in an accordion. The four SM-2 grading buttons at the bottom (**Again / Hard / Good / Easy**) write spaced-repetition progress back on grading.

---

## Reproducibility

- **Non-determinism note**: morphological decomposition is produced by an LLM, so for the same input the etymological narrative may vary slightly across model versions; the structural side (frontmatter, sections, bidirectional links, decomposition format) is deterministic and verified by `/lint`.
- **Environment**: Node.js ≥ 18; LLM = Claude (model version used in the paper: `Opus 4.7`).
- **Portable state**: all lexicon state is plain Markdown under `dictionary/` plus `review/flashcards.json`, fully version-controllable; cloning the repo reproduces the complete lexicon state.
- **Reproducing the paper's example**: run `/setup`, then `/ingest international`, and compare the generated `dictionary/words/{nation,national,international}.md` against paper §3.2.

## Validation

This project has no build step or unit tests; structural integrity is verified by the skills:

- **`/lint`** — whole-library structure check: bidirectional wiki-link symmetry, required frontmatter fields, presence of the four sections, whether the decomposition format is in sync with `server.js`'s parsing rules, stopword conflicts, `flashcards.json` consistency, and morpheme-reference completeness. No LLM call, read-only, reports without modifying.
- **`/lint <word>`** — beyond the structure check, additionally runs an LLM semantic check on a single word: etymological plausibility of the decomposition, gloss accuracy, etymology-decomposition consistency, POS, and IPA.

---

## Known limitations

- **Token cost grows with the lexicon**: `/new-word` and semantic `/lint <word>` become more expensive on a large lexicon; indexing, caching, or retrieval mechanisms are not yet introduced.
- **Model dependence and hallucination risk**: decomposition quality depends on the LLM and can produce mis-segmentations; `/lint`, the word-existence check, and human-in-the-loop reduce but cannot fully eliminate the risk.
- **Target-language specific**: the skills are designed for English morphology; porting to another language requires redesigning the decomposition rules, morpheme taxonomy, and verification prompts.

---

## License

This project is licensed under the MIT License; see [LICENSE](./LICENSE).

## Contributing & support

Questions and PRs are welcome via this repo's [Issues](https://github.com/yaoting-chen/Morphowiki/issues).
Contact: yaoting.chen.academic@gmail.com

---

## Q&A

### Q1: Why does this SM-2 implementation only have 4 buttons?

Although the [original SM-2 algorithm](https://super-memory.com/english/ol/sm2.htm) defined 6 grading options (0–5), according to its Rule 6, **any grade < 3 yields mathematically identical results** (repetition count resets to 0, interval drops to 1 day, and Ease remains unchanged). To reduce user "decision fatigue," we merged these failure states into a single `Again` button.

The system only adjusts the long-term difficulty factor upon a successful recall: `Hard` (-0.14) / `Good` (no change) / `Easy` (+0.10). Most importantly, our `Again` button strictly adheres to the original design of **"never deducting Ease"** (only enforcing the 1.3 floor). This effectively prevents users from plunging cards into an inescapable "Ease Hell" just because of a momentary lapse in concentration.

**English** | [繁體中文](./README.zh-TW.md)

# Morphowiki

Inspired by Andrej Karpathy's LLM Wiki — a **private, local-first** English vocabulary learning tool. Each student maintains their own dictionary and review deck through Claude Code, and all data stays on the local filesystem.

## Seven Skills (all delivered as Claude Code Skills, not Slash Commands)

| Skill                                | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/setup`                             | Checks Node.js, creates the nested folder layout, generates ~155 default stopwords, and copies `review/server.js` plus the three frontend files from templates (**do not confuse with the built-in `/init`** — that one generates CLAUDE.md)                                                                                                                                                                                                                                                                                     |
| `/ingest <word \| words \| sentence>` | Strict etymological recursive decomposition (0..N prefixes + 1 root + 0..N suffixes, e.g. `international` → `inter-` + `nat` + `-ion` + `-al`), produces zh-TW gloss, POS abbreviation, IPA, mnemonic, and an empty `## 筆記區`, writes to `dictionary/words/<word>.md`, maintains **bidirectional wiki-links**, and recursively ingests intermediate English words (e.g. `national`, `nation`). Whole-sentence input is auto-tokenized and filtered against punctuation / stopwords / existing entries; **loanwords** (`taco`, `sushi`, `karaoke`, etc.) take the Step 4a branch — they live in `words/` only, no morpheme pages, and never pollute the `/new-word` pool |
| `/new-word [N]`                      | **Strictly combines** existing prefix/root/suffix pools to generate N real, uncollected English words (default 1, max 20), each going through an ingest-style write flow but **without** recursing into intermediate words. **Morpheme stems are matched literally** — no dynamic assembly of compound suffixes like `-ation`. Step 2.5 **morpheme-pool safety filter**: reads the `## blocked` permanent block list in `.claude/skills/new-word/morpheme-flags.md`, then runs a self-check on unflagged roots to exclude loanwords, appending results back to morpheme-flags.md |
| `/stopword <word>`                   | Adds overly common words to the `## custom` section of `dictionary/stopwords.md`; subsequent ingests will block them                                                                                                                                                                                                                                                                                                                                                                                                             |
| `/flashcard <word>`                  | Adds to `review/flashcards.json` (SM-2 spaced repetition); also supports `remove` and listing                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `/review-word`                       | Launches the local Node Express site (port 5173) for flipping cards, grading, and writing progress back; if files are missing, run `/setup` first                                                                                                                                                                                                                                                                                                                                                                                |
| `/lint [word]`                       | Dictionary structure check. No argument = whole-library structure-only check (no LLM, reports without modifying); with a word = structure check + LLM semantic check (decomposition / gloss / etymology-decomposition consistency / POS / IPA), listing suggestions and asking which ones to apply                                                                                                                                                                                                                               |

## Quick start

1. Open this folder in Claude Code — the seven skills load automatically
2. `/setup` — run on first use; skip afterwards
3. `/ingest unbelievable` — watch `dictionary/` grow word pages and backlinks
4. `/flashcard unbelievable` — add it to the review deck
5. `/review-word` — open http://localhost:5173 in the browser to review
6. `/new-word 3` — quickly expand the pool from existing morphemes, three at a time

## Batch input (whitespace-separated / full sentence)

`/ingest`, `/stopword`, and `/flashcard` all accept multiple words separated by whitespace and process them independently (a failure mid-list is skipped, the rest proceed). `/ingest` further accepts **whole sentences** — it auto-tokenizes and filters punctuation, stopwords, existing entries, and non-pure-alpha tokens with hyphens / apostrophes / digits (`t-shirt`, `don't`, `5g`, etc., are not collected):

```
/ingest enable defender                            # collects enable and defender
/ingest The international project was a success.   # sentence: auto-skips the/was/a; only collects international, project, success
/stopword cat ball                                  # adds cat and ball to custom stopwords
/flashcard enable defender                          # adds both to the review deck
```

Requires Node.js ≥ 18 (only used by `/review-word`).

## Q&A
### Q1: Why does this SM-2 implementation only have 4 buttons?

Although the [original SM-2 algorithm](https://super-memory.com/english/ol/sm2.htm) defined 6 grading options (0–5), according to its Rule 6, **any grade < 3 yields mathematically identical results** (repetition count resets to 0, interval drops to 1 day, and Ease remains unchanged). To reduce user "decision fatigue," we merged these failure states into a single `Again` button.

The system only adjusts the long-term difficulty factor upon a successful recall: `Hard` (-0.14) / `Good` (no change) / `Easy` (+0.10). Most importantly, our `Again` button strictly adheres to the original design of **"never deducting Ease"** (only enforcing the 1.3 floor). This effectively prevents users from plunging cards into an inescapable "Ease Hell" just because of a momentary lapse in concentration.
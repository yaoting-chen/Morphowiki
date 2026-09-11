// Express server for SM-2 flashcard review.
// CommonJS, no build step. Listens on 127.0.0.1:5173.

const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = 5173;
const HOST = '127.0.0.1';

// __dirname is review/. flashcards.json sits next to this file;
// dictionary/words lives one level up.
const FLASHCARDS_PATH = path.resolve(__dirname, 'flashcards.json');
const WORDS_DIR = path.resolve(__dirname, '..', 'dictionary', 'words');
const WEB_DIR = path.resolve(__dirname, 'web');

const app = express();
app.use(express.json());
app.use(express.static(WEB_DIR));

// -------- Utilities --------

function todayISO() {
  // Local-date ISO (YYYY-MM-DD). Matches how cards were created.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function readFlashcards() {
  if (!fs.existsSync(FLASHCARDS_PATH)) {
    const err = new Error('flashcards.json not found');
    err.status = 404;
    throw err;
  }
  let raw;
  try {
    raw = fs.readFileSync(FLASHCARDS_PATH, 'utf8');
  } catch (e) {
    const err = new Error('failed to read flashcards.json: ' + e.message);
    err.status = 500;
    throw err;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    const err = new Error('flashcards.json is not valid JSON: ' + e.message);
    err.status = 500;
    throw err;
  }
  if (!data || !Array.isArray(data.cards)) {
    const err = new Error('flashcards.json has no `cards` array');
    err.status = 500;
    throw err;
  }
  return data;
}

function writeFlashcardsAtomic(data) {
  // Write tmp file then rename for an atomic replace.
  const tmp = FLASHCARDS_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, FLASHCARDS_PATH);
}

// -------- Dictionary markdown parser --------
//
// Word markdown layout (see dictionary/words/<word>.md):
//
//   ---
//   word: ...
//   pos: ...
//   ipa: ...
//   added: ...
//   ---
//
//   # <word>
//
//   **詞性**: <pos>
//   **IPA**: <ipa>
//   **中文釋義**: <gloss>
//
//   ## 拆解
//   - 字首: [[../prefix/<x>]] `<x>-` — <meaning>     (可重複多行)
//   - 字根: [[../root/<x>]] `<x>` — <meaning>
//   - 字尾: [[../suffix/<x>]] `-<x>` — <meaning>     (可重複多行)
//
//   ## 詞源
//   <paragraph>
//
//   ## 記憶法
//   <paragraph>
//
// Any morpheme line may be absent. Parsing is regex-based (no markdown lib).

function stripFrontmatter(md) {
  // Strip a leading YAML frontmatter block, if present, and return both.
  if (!md.startsWith('---')) return { frontmatter: '', body: md };
  const end = md.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: '', body: md };
  const fm = md.slice(3, end).replace(/^\r?\n/, '');
  const body = md.slice(end + 4).replace(/^\r?\n/, '');
  return { frontmatter: fm, body };
}

function parseFrontmatter(fm) {
  // Minimal `key: value` parser. Values are returned as plain strings.
  const out = {};
  for (const line of fm.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function splitSections(body) {
  // Split markdown body into sections keyed by `## <heading>`.
  // Anything before the first `##` is stored under `__intro__`.
  const sections = { __intro__: '' };
  const lines = body.split(/\r?\n/);
  let current = '__intro__';
  let buf = [];
  for (const line of lines) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      sections[current] = buf.join('\n').trim();
      current = h[1].trim();
      buf = [];
    } else {
      buf.push(line);
    }
  }
  sections[current] = buf.join('\n').trim();
  return sections;
}

function extractFieldFromIntro(intro, label) {
  // intro lines look like: `**IPA**: /…/`
  const re = new RegExp(
    '\\*\\*' + label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\*\\*\\s*[::]\\s*(.+)',
  );
  const m = intro.match(re);
  return m ? m[1].trim() : '';
}

function parseBreakdownLine(line, labelZh) {
  // Match: `- <labelZh>: [[../<type>/<m>]] [optional `display` token] — <meaning>`
  // Tolerate em-dash, en-dash, hyphen, full-width colon, missing wiki-link, and
  // an optional inline-code display token (e.g. `un-`, `-al`, `nat`) between
  // the link and the dash.
  const labelEsc = labelZh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    '^-\\s*' + labelEsc + '\\s*[::]\\s*' +
    '(?:\\[\\[([^\\]]+)\\]\\]\\s*)?' +
    '(?:`[^`]*`\\s*)?' +
    '(?:[—–-]\\s*(.+))?$',
  );
  const m = line.match(re);
  if (!m) return null;
  const link = m[1] ? m[1].trim() : '';
  const meaning = m[2] ? m[2].trim() : '';
  // From `../prefix/un` keep the trailing morpheme `un`.
  let morpheme = '';
  if (link) {
    const parts = link.split('/');
    morpheme = parts[parts.length - 1].replace(/\.md$/, '').trim();
  }
  return { morpheme, meaning };
}

function parseBreakdown(section) {
  // Returns { prefixes: [], root: null, suffixes: [] }.
  // prefixes/suffixes preserve the order they appear in the markdown
  // (which should match the word's left-to-right spelling).
  const out = { prefixes: [], root: null, suffixes: [] };
  if (!section) return out;
  for (const rawLine of section.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('-')) continue;
    const tryPrefix = parseBreakdownLine(line, '字首');
    if (tryPrefix && tryPrefix.morpheme) { out.prefixes.push(tryPrefix); continue; }
    const tryRoot = parseBreakdownLine(line, '字根');
    if (tryRoot && tryRoot.morpheme) { out.root = tryRoot; continue; }
    const trySuffix = parseBreakdownLine(line, '字尾');
    if (trySuffix && trySuffix.morpheme) { out.suffixes.push(trySuffix); continue; }
  }
  return out;
}

function parseWordMarkdown(word) {
  const filePath = path.join(WORDS_DIR, word + '.md');
  if (!fs.existsSync(filePath)) {
    return {
      ipa: '',
      posChinese: '',
      gloss: '',
      etymology: '',
      mnemonic: '',
      breakdown: { prefixes: [], root: null, suffixes: [] },
      missing: true,
    };
  }
  const md = fs.readFileSync(filePath, 'utf8');
  const { frontmatter, body } = stripFrontmatter(md);
  const fm = parseFrontmatter(frontmatter);
  const sections = splitSections(body);
  const intro = sections.__intro__ || '';

  const ipa = extractFieldFromIntro(intro, 'IPA') || fm.ipa || '';
  const posChinese = extractFieldFromIntro(intro, '詞性') || fm.pos || '';
  const gloss = extractFieldFromIntro(intro, '中文釋義') || '';

  return {
    ipa,
    posChinese,
    gloss,
    etymology: sections['詞源'] || '',
    mnemonic: sections['記憶法'] || '',
    breakdown: parseBreakdown(sections['拆解']),
    missing: false,
  };
}

// -------- SM-2 --------

function applySm2(card, grade) {
  // grade: 0..5. <3 = lapse, >=3 = recall.
  // Mutates `card` and returns it.
  const today = todayISO();
  let ease = typeof card.ease === 'number' ? card.ease : 2.5;
  let repetition = typeof card.repetition === 'number' ? card.repetition : 0;
  let interval = typeof card.interval === 'number' ? card.interval : 0;

  if (grade < 3) {
    repetition = 0;
    interval = 1;
    // ease unchanged on lapse, but enforce floor.
    if (ease < 1.3) ease = 1.3;
  } else {
    repetition += 1;
    if (repetition === 1) {
      interval = 1;
    } else if (repetition === 2) {
      interval = 6;
    } else {
      interval = Math.round(interval * ease);
    }
    const delta = 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02);
    ease = Math.max(1.3, ease + delta);
  }

  card.ease = ease;
  card.repetition = repetition;
  card.interval = interval;
  card.due = addDaysISO(today, interval);
  card.lastReview = today;
  if (!Array.isArray(card.history)) card.history = [];
  card.history.push({ date: today, grade });
  return card;
}

// -------- Routes --------

app.get('/api/cards', (req, res) => {
  let data;
  try {
    data = readFlashcards();
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
  const today = todayISO();
  const due = data.cards.filter((c) => typeof c.due === 'string' && c.due <= today);
  const enriched = due.map((c) => {
    const parsed = parseWordMarkdown(c.word);
    return {
      word: c.word,
      ipa: parsed.ipa,
      posChinese: parsed.posChinese,
      gloss: parsed.gloss,
      etymology: parsed.etymology,
      mnemonic: parsed.mnemonic,
      breakdown: parsed.breakdown,
      missingMarkdown: parsed.missing,
      ease: c.ease,
      interval: c.interval,
      repetition: c.repetition,
      due: c.due,
    };
  });
  res.json({ today, cards: enriched });
});

app.get('/api/cards/all', (req, res) => {
  let data;
  try {
    data = readFlashcards();
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
  const summary = data.cards.map((c) => ({
    word: c.word,
    due: c.due,
    ease: c.ease,
    repetition: c.repetition,
    interval: c.interval,
  }));
  res.json({ cards: summary });
});

app.post('/api/review', (req, res) => {
  const body = req.body || {};
  const word = typeof body.word === 'string' ? body.word.trim() : '';
  const grade = Number(body.grade);
  if (!word) return res.status(400).json({ error: 'missing `word`' });
  if (!Number.isFinite(grade) || grade < 0 || grade > 5) {
    return res.status(400).json({ error: '`grade` must be a number in 0..5' });
  }

  let data;
  try {
    data = readFlashcards();
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }

  const card = data.cards.find((c) => c.word === word);
  if (!card) return res.status(404).json({ error: `word not found in flashcards: ${word}` });

  applySm2(card, grade);

  try {
    writeFlashcardsAtomic(data);
  } catch (e) {
    return res.status(500).json({ error: 'failed to write flashcards.json: ' + e.message });
  }

  res.json({
    word: card.word,
    ease: card.ease,
    interval: card.interval,
    repetition: card.repetition,
    due: card.due,
    lastReview: card.lastReview,
  });
});

app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`review server listening at http://${HOST}:${PORT}`);
});

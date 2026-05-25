// Minimal flashcard SPA. Vanilla JS, no build tool.
// Fetches /api/cards once on load, walks through the queue,
// POSTs each grade back to /api/review.

(function () {
  'use strict';

  const DARK_MODE = true;
  document.documentElement.classList.toggle('light', !DARK_MODE);

  const els = {
    loading: document.getElementById('loading'),
    empty: document.getElementById('empty'),
    error: document.getElementById('error'),
    errorMessage: document.getElementById('error-message'),
    card: document.getElementById('card'),
    word: document.getElementById('card-word'),
    front: document.getElementById('front-actions'),
    flipBtn: document.getElementById('flip-btn'),
    back: document.getElementById('back'),
    ipa: document.getElementById('card-ipa'),
    pos: document.getElementById('card-pos'),
    gloss: document.getElementById('card-gloss'),
    breakdown: document.getElementById('card-breakdown'),
    etymology: document.getElementById('card-etymology'),
    mnemonic: document.getElementById('card-mnemonic'),
    etymologyDetails: document.getElementById('etymology-details'),
    mnemonicDetails: document.getElementById('mnemonic-details'),
    progress: document.getElementById('progress'),
  };

  let queue = [];
  let index = 0;
  let busy = false;

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function showError(msg) {
    hide(els.loading);
    hide(els.card);
    hide(els.empty);
    els.errorMessage.textContent = msg;
    show(els.error);
  }

  function renderProgress() {
    if (queue.length === 0) {
      els.progress.textContent = '';
      return;
    }
    const done = Math.min(index, queue.length);
    els.progress.textContent = `${done} / ${queue.length}`;
  }

  function renderBreakdown(card) {
    els.breakdown.innerHTML = '';
    const bd = card.breakdown || {};
    const prefixes = Array.isArray(bd.prefixes) ? bd.prefixes : (bd.prefix ? [bd.prefix] : []);
    const root = bd.root || null;
    const suffixes = Array.isArray(bd.suffixes) ? bd.suffixes : (bd.suffix ? [bd.suffix] : []);

    function displayKey(type, morpheme) {
      // morpheme may already include the hyphen (new format: `inter-`, `-al`)
      // or not (legacy files: `un`, `able`). Don't double-add.
      if (!morpheme) return '';
      if (morpheme.indexOf('-') !== -1) return morpheme;
      if (type === '字首') return morpheme + '-';
      if (type === '字尾') return '-' + morpheme;
      return morpheme;
    }

    const entries = [];
    for (const p of prefixes) entries.push(['字首', p, displayKey('字首', p.morpheme)]);
    if (root) entries.push(['字根', root, displayKey('字根', root.morpheme)]);
    for (const s of suffixes) entries.push(['字尾', s, displayKey('字尾', s.morpheme)]);

    let any = false;
    for (const [type, b, display] of entries) {
      if (!b || !b.morpheme) continue;
      any = true;
      const li = document.createElement('li');
      const tSpan = document.createElement('span');
      tSpan.className = 'b-type';
      tSpan.textContent = type;
      const mSpan = document.createElement('span');
      mSpan.className = 'b-morph';
      mSpan.textContent = display;
      li.appendChild(tSpan);
      li.appendChild(document.createTextNode(' '));
      li.appendChild(mSpan);
      if (b.meaning) {
        const sep = document.createTextNode(' — ');
        const meaningSpan = document.createElement('span');
        meaningSpan.className = 'b-meaning';
        meaningSpan.textContent = b.meaning;
        li.appendChild(sep);
        li.appendChild(meaningSpan);
      }
      els.breakdown.appendChild(li);
    }
    if (!any) {
      const li = document.createElement('li');
      li.className = 'b-meaning';
      li.textContent = '(無拆解資料)';
      els.breakdown.appendChild(li);
    }
  }

  function renderCard() {
    const card = queue[index];
    if (!card) {
      hide(els.card);
      hide(els.loading);
      show(els.empty);
      renderProgress();
      return;
    }
    els.word.textContent = card.word;
    els.ipa.textContent = card.ipa || '(無)';
    els.pos.textContent = card.posChinese || '(無)';
    els.gloss.textContent = card.gloss || '(無)';
    els.etymology.textContent = card.etymology || '(無)';
    els.mnemonic.textContent = card.mnemonic || '(無)';
    renderBreakdown(card);

    // Reset to front; collapse accordions so each card starts with etymology/mnemonic hidden.
    hide(els.back);
    show(els.front);
    els.flipBtn.disabled = false;
    els.etymologyDetails.open = false;
    els.mnemonicDetails.open = false;

    hide(els.loading);
    hide(els.empty);
    hide(els.error);
    show(els.card);
    renderProgress();
  }

  function flip() {
    hide(els.front);
    show(els.back);
  }

  async function submitGrade(grade) {
    if (busy) return;
    const card = queue[index];
    if (!card) return;
    busy = true;
    // Disable all grade buttons while in flight.
    const buttons = document.querySelectorAll('.grade');
    buttons.forEach((b) => (b.disabled = true));

    try {
      const r = await fetch('/api/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ word: card.word, grade }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`POST /api/review ${r.status}: ${t}`);
      }
      await r.json();
      index += 1;
      renderCard();
    } catch (e) {
      showError(String(e && e.message ? e.message : e));
    } finally {
      buttons.forEach((b) => (b.disabled = false));
      busy = false;
    }
  }

  async function load() {
    try {
      const r = await fetch('/api/cards');
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`GET /api/cards ${r.status}: ${t}`);
      }
      const data = await r.json();
      queue = Array.isArray(data.cards) ? data.cards : [];
      index = 0;
      if (queue.length === 0) {
        hide(els.loading);
        hide(els.card);
        show(els.empty);
        renderProgress();
        return;
      }
      renderCard();
    } catch (e) {
      showError(String(e && e.message ? e.message : e));
    }
  }

  els.flipBtn.addEventListener('click', flip);
  document.querySelectorAll('.grade').forEach((btn) => {
    btn.addEventListener('click', () => {
      const g = Number(btn.getAttribute('data-grade'));
      submitGrade(g);
    });
  });

  load();
})();

(() => {
  'use strict';

  // ---------- Costanti ----------
  const TAU = Math.PI * 2;
  const DEFAULT_ENTRIES = ['Marco', 'Luca', 'Andrea', 'Matteo'];
  const DEFAULT_WEIGHT = 10;
  const MAX_WEIGHT = 1000;
  const WEIGHT_STEP = 5;
  const MAX_ENTRIES = 50;
  const MAX_LABEL_LENGTH = 40;
  const STORAGE_KEY = 'ruota-della-sfortuna-v1';
  const SECRET_PHRASE = 'rig it';
  const SECRET_TIMEOUT_MS = 2500;
  const IDLE_RESULT = '—';

  const PALETTE = [
    { bg: '#4c6ef5', fg: '#ffffff' },
    { bg: '#12b886', fg: '#ffffff' },
    { bg: '#fab005', fg: '#1f2430' },
    { bg: '#fa5252', fg: '#ffffff' },
    { bg: '#be4bdb', fg: '#ffffff' },
    { bg: '#15aabf', fg: '#ffffff' },
    { bg: '#fd7e14', fg: '#ffffff' },
    { bg: '#82c91e', fg: '#1f2430' }
  ];

  // ---------- Stato ----------
  const state = {
    entries: [],      // { id, label, weight }
    nextId: 1,
    rotation: 0,      // angolo corrente della ruota (radianti)
    spinning: false,
    editingId: null
  };

  let rigDraft = null;          // Map id -> peso, copia di lavoro del pannello segreto
  const rigRefs = new Map();    // id -> { input, percent }

  // ---------- Elementi DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $('wheel');
  const ctx = canvas.getContext('2d');
  const spinBtn = $('spin-btn');
  const resultValue = $('result-value');
  const addForm = $('add-form');
  const addInput = $('entry-input');
  const addBtn = $('add-btn');
  const formMessage = $('form-message');
  const entryList = $('entry-list');
  const emptyMessage = $('empty-message');
  const clearBtn = $('clear-btn');
  const resetBtn = $('reset-btn');
  const rigDialog = $('rig-dialog');
  const rigList = $('rig-list');
  const rigEmpty = $('rig-empty');
  const rigError = $('rig-error');
  const rigResetBtn = $('rig-reset');
  const rigOkBtn = $('rig-ok');

  // ---------- Utilità ----------
  const mod = (n, m) => ((n % m) + m) % m;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  function sanitizeWeight(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return DEFAULT_WEIGHT;
    return Math.min(Math.round(n), MAX_WEIGHT);
  }

  function createEntry(label, weight = DEFAULT_WEIGHT) {
    return { id: state.nextId++, label, weight };
  }

  function getSliceColor(index, total) {
    let colorIndex = index % PALETTE.length;
    // Evita che l'ultima fetta abbia lo stesso colore della prima
    if (total > 1 && index === total - 1 && colorIndex === 0) colorIndex = 3;
    return PALETTE[colorIndex];
  }

  // ---------- Salvataggio ----------
  function saveState() {
    try {
      const data = state.entries.map(({ label, weight }) => ({ label, weight }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* localStorage non disponibile: si continua senza salvare */ }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return null;
      return data
        .filter((e) => e && typeof e.label === 'string' && e.label.trim() !== '')
        .slice(0, MAX_ENTRIES)
        .map((e) => createEntry(e.label.trim().slice(0, MAX_LABEL_LENGTH), sanitizeWeight(e.weight)));
    } catch (e) {
      return null;
    }
  }

  function clearSavedState() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignora */ }
  }

  function loadDefaultEntries() {
    state.entries = DEFAULT_ENTRIES.map((label) => createEntry(label));
  }

  // ---------- Algoritmo di selezione ----------
  // Sceglie un indice in base ai pesi (normalizzati implicitamente dalla somma).
  function pickWeightedIndex(entries) {
    const total = entries.reduce((sum, e) => sum + e.weight, 0);
    if (total <= 0) return Math.floor(Math.random() * entries.length);

    let r = Math.random() * total;
    for (let i = 0; i < entries.length; i++) {
      r -= entries[i].weight;
      if (r < 0 && entries[i].weight > 0) return i;
    }
    // Rete di sicurezza per errori di arrotondamento
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].weight > 0) return i;
    }
    return 0;
  }

  // Indice della fetta attualmente sotto il puntatore (in alto)
  function getIndexAtPointer(rotation, total) {
    const arc = TAU / total;
    const angle = mod(-rotation, TAU);
    return Math.min(total - 1, Math.floor(angle / arc));
  }

  // ---------- Disegno della ruota ----------
  function fitText(text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    const chars = Array.from(text);
    while (chars.length > 1) {
      chars.pop();
      const candidate = chars.join('').trimEnd() + '…';
      if (ctx.measureText(candidate).width <= maxWidth) return candidate;
    }
    return '…';
  }

  function drawWheel() {
    const size = canvas.clientWidth;
    if (size === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const pixels = Math.round(size * dpr);
    if (canvas.width !== pixels) {
      canvas.width = pixels;
      canvas.height = pixels;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const center = size / 2;
    const radius = center - 4;
    const total = state.entries.length;

    if (total === 0) {
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, TAU);
      ctx.fillStyle = '#e9ecf5';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#d0d5e2';
      ctx.stroke();
      ctx.fillStyle = '#6b7280';
      ctx.font = '600 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Aggiungi delle voci', center, center);
      return;
    }

    const arc = TAU / total;
    const fontSize = clamp(radius * 0.7 * arc * 0.4, 10, 22);

    state.entries.forEach((entry, i) => {
      const start = state.rotation + i * arc - Math.PI / 2;
      const color = getSliceColor(i, total);

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, start, start + arc);
      ctx.closePath();
      ctx.fillStyle = color.bg;
      ctx.fill();
      if (total > 1) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }

      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(start + arc / 2);
      ctx.fillStyle = color.fg;
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(fitText(entry.label, radius * 0.6), radius - 14, 0);
      ctx.restore();
    });

    // Bordo esterno
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, TAU);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#d0d5e2';
    ctx.stroke();

    // Perno centrale
    ctx.beginPath();
    ctx.arc(center, center, Math.max(10, radius * 0.07), 0, TAU);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#1f2430';
    ctx.stroke();
  }

  // ---------- Rotazione ----------
  function startSpin() {
    const total = state.entries.length;
    if (state.spinning || total === 0) return;

    state.spinning = true;
    state.editingId = null;
    setResult(null);
    render();

    const winnerIndex = pickWeightedIndex(state.entries);
    const arc = TAU / total;
    const offsetInSlice = 0.12 + Math.random() * 0.76; // evita i bordi della fetta
    const desired = mod(-(winnerIndex + offsetInSlice) * arc, TAU);
    const current = mod(state.rotation, TAU);
    const extraTurns = 5 + Math.floor(Math.random() * 4);
    const delta = mod(desired - current, TAU) + extraTurns * TAU;
    const from = state.rotation;
    const duration = 4000 + Math.random() * 3500;
    let startTime = null;

    function frame(now) {
      if (startTime === null) startTime = now;
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      state.rotation = from + delta * eased;
      drawWheel();

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        finishSpin();
      }
    }
    requestAnimationFrame(frame);
  }

  function finishSpin() {
    state.rotation = mod(state.rotation, TAU);
    state.spinning = false;
    // Il risultato viene letto dalla posizione reale della ruota
    const index = getIndexAtPointer(state.rotation, state.entries.length);
    setResult(state.entries[index].label);
    render();
  }

  function setResult(text) {
    resultValue.textContent = text === null ? '…' : text;
  }

  // ---------- Elenco voci ----------
  function makeButton(text, className, onClick, disabled) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = text;
    btn.disabled = Boolean(disabled);
    btn.addEventListener('click', onClick);
    return btn;
  }

  function renderList() {
    entryList.replaceChildren();
    let editInput = null;

    state.entries.forEach((entry, i) => {
      const li = document.createElement('li');
      li.className = 'entry-item';

      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = getSliceColor(i, state.entries.length).bg;
      li.appendChild(swatch);

      if (entry.id === state.editingId) {
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = MAX_LABEL_LENGTH;
        input.value = entry.label;
        input.setAttribute('aria-label', 'Modifica voce');
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); commitEdit(entry.id, input.value); }
          if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
        });
        li.appendChild(input);
        li.appendChild(makeButton('Salva', 'btn btn-primary btn-small', () => commitEdit(entry.id, input.value)));
        li.appendChild(makeButton('Annulla', 'btn btn-secondary btn-small', cancelEdit));
        editInput = input;
      } else {
        const label = document.createElement('span');
        label.className = 'entry-label';
        label.textContent = entry.label;
        li.appendChild(label);
        li.appendChild(makeButton('Modifica', 'btn btn-secondary btn-small', () => startEdit(entry.id), state.spinning));
        li.appendChild(makeButton('Rimuovi', 'btn btn-secondary btn-small btn-danger', () => removeEntry(entry.id), state.spinning));
      }
      entryList.appendChild(li);
    });

    emptyMessage.hidden = state.entries.length > 0;
    if (editInput) {
      editInput.focus();
      editInput.select();
    }
  }

  function renderControls() {
    const empty = state.entries.length === 0;
    spinBtn.disabled = state.spinning || empty;
    spinBtn.textContent = state.spinning ? 'Sto girando…' : 'Gira la ruota';
    addInput.disabled = state.spinning;
    addBtn.disabled = state.spinning;
    clearBtn.disabled = state.spinning || empty;
    resetBtn.disabled = state.spinning;
  }

  function render() {
    renderList();
    renderControls();
    drawWheel();
  }

  let messageTimer = null;
  function showMessage(text) {
    formMessage.textContent = text;
    clearTimeout(messageTimer);
    if (text) messageTimer = setTimeout(() => { formMessage.textContent = ''; }, 3500);
  }

  function addEntry(rawLabel) {
    const label = rawLabel.trim();
    if (!label) { showMessage('Scrivi qualcosa prima di aggiungere una voce.'); return false; }
    if (state.entries.length >= MAX_ENTRIES) {
      showMessage(`Puoi inserire al massimo ${MAX_ENTRIES} voci.`);
      return false;
    }
    state.entries.push(createEntry(label.slice(0, MAX_LABEL_LENGTH)));
    saveState();
    setResult(IDLE_RESULT);
    render();
    return true;
  }

  function removeEntry(id) {
    if (state.spinning) return;
    state.entries = state.entries.filter((e) => e.id !== id);
    if (state.editingId === id) state.editingId = null;
    saveState();
    setResult(IDLE_RESULT);
    render();
  }

  function startEdit(id) {
    if (state.spinning) return;
    state.editingId = id;
    renderList();
  }

  function cancelEdit() {
    state.editingId = null;
    showMessage('');
    renderList();
  }

  function commitEdit(id, rawLabel) {
    const label = rawLabel.trim();
    if (!label) { showMessage('La voce non può essere vuota.'); return; }
    const entry = state.entries.find((e) => e.id === id);
    if (entry) entry.label = label.slice(0, MAX_LABEL_LENGTH);
    state.editingId = null;
    showMessage('');
    saveState();
    setResult(IDLE_RESULT);
    render();
  }

  function clearAllEntries() {
    if (state.spinning || state.entries.length === 0) return;
    if (!window.confirm('Vuoi davvero eliminare tutte le voci?')) return;
    state.entries = [];
    state.editingId = null;
    saveState();
    setResult(IDLE_RESULT);
    render();
  }

  function resetApplication() {
    if (state.spinning) return;
    if (!window.confirm("Vuoi ripristinare l'applicazione allo stato iniziale? Tutte le modifiche andranno perse.")) return;
    clearSavedState();
    loadDefaultEntries();
    state.editingId = null;
    state.rotation = 0;
    showMessage('');
    setResult(IDLE_RESULT);
    render();
  }

  // ---------- Pannello segreto ----------
  function getDraftTotal() {
    let total = 0;
    rigDraft.forEach((w) => { total += w; });
    return total;
  }

  function updateRigPercentages() {
    const total = getDraftTotal();
    rigRefs.forEach((refs, id) => {
      refs.percent.textContent = total > 0
        ? `${((rigDraft.get(id) / total) * 100).toFixed(1)}%`
        : '—';
    });
  }

  function setDraftWeight(id, value, syncInput) {
    const weight = clamp(Math.round(value), 0, MAX_WEIGHT);
    rigDraft.set(id, weight);
    if (syncInput) rigRefs.get(id).input.value = weight;
    rigError.textContent = '';
    updateRigPercentages();
  }

  function renderRigList() {
    rigList.replaceChildren();
    rigRefs.clear();
    rigEmpty.hidden = state.entries.length > 0;

    state.entries.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'rig-row';

      const name = document.createElement('span');
      name.className = 'rig-name';
      name.textContent = entry.label;

      const minus = makeButton('−', 'btn btn-secondary btn-small', () =>
        setDraftWeight(entry.id, rigDraft.get(entry.id) - WEIGHT_STEP, true));
      minus.setAttribute('aria-label', `Diminuisci ${entry.label}`);

      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = String(MAX_WEIGHT);
      input.step = '1';
      input.inputMode = 'numeric';
      input.value = rigDraft.get(entry.id);
      input.setAttribute('aria-label', `Valore per ${entry.label}`);
      input.addEventListener('input', () => {
        const parsed = parseInt(input.value, 10);
        setDraftWeight(entry.id, Number.isNaN(parsed) ? 0 : parsed, false);
      });
      input.addEventListener('change', () => { input.value = rigDraft.get(entry.id); });

      const plus = makeButton('+', 'btn btn-secondary btn-small', () =>
        setDraftWeight(entry.id, rigDraft.get(entry.id) + WEIGHT_STEP, true));
      plus.setAttribute('aria-label', `Aumenta ${entry.label}`);

      const percent = document.createElement('span');
      percent.className = 'rig-percent';

      row.append(name, minus, input, plus, percent);
      rigList.appendChild(row);
      rigRefs.set(entry.id, { input, percent });
    });

    updateRigPercentages();
  }

  function openRigDialog() {
    if (state.spinning || rigDialog.open) return;
    rigDraft = new Map(state.entries.map((e) => [e.id, e.weight]));
    rigError.textContent = '';
    renderRigList();
    rigDialog.showModal();
  }

  function applyRigChanges() {
    if (state.entries.length > 0 && getDraftTotal() <= 0) {
      rigError.textContent = 'Almeno una voce deve avere un valore maggiore di zero.';
      return;
    }
    state.entries.forEach((entry) => {
      if (rigDraft.has(entry.id)) entry.weight = rigDraft.get(entry.id);
    });
    saveState();
    rigDialog.close();
  }

  function resetRigDraft() {
    if (!window.confirm('Ripristinare le impostazioni predefinite (tutte le voci con lo stesso valore)?')) return;
    rigDraft = new Map(state.entries.map((e) => [e.id, DEFAULT_WEIGHT]));
    rigError.textContent = '';
    renderRigList();
  }

    // ---------- Scorciatoia segreta ----------
  let keyBuffer = '';
  let keyBufferTimer = null;
  let swallowSpaceKeyup = false;

  // Campi in cui la frase non deve mai attivarsi (modifica voce, pannello segreto).
  // Il campo "nuova voce" è escluso da questo elenco: lì la frase funziona.
  function isBlockedTarget(el) {
    if (!el || el === addInput) return false;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
           el.tagName === 'SELECT' || el.isContentEditable;
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (isBlockedTarget(e.target) || rigDialog.open || state.spinning) {
      keyBuffer = '';
      return;
    }
    if (e.key.length !== 1) return; // ignora Shift, frecce, ecc.

    const ch = e.key.toLowerCase();
    keyBuffer = (keyBuffer + ch).slice(-SECRET_PHRASE.length);
    clearTimeout(keyBufferTimer);
    keyBufferTimer = setTimeout(() => { keyBuffer = ''; }, SECRET_TIMEOUT_MS);

    // Se un pulsante ha il focus, lo spazio della frase non deve "premerlo"
    if (ch === ' ' && keyBuffer.endsWith('rig ') && e.target !== addInput) {
      e.preventDefault();
      swallowSpaceKeyup = true;
    }

    if (keyBuffer === SECRET_PHRASE) {
      keyBuffer = '';
      e.preventDefault();
      // Se si stava scrivendo nel campo "nuova voce", toglie "rig i" già digitato
      if (e.target === addInput && addInput.value.toLowerCase().endsWith('rig i')) {
        addInput.value = addInput.value.slice(0, -5);
      }
      openRigDialog();
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === ' ' && swallowSpaceKeyup) {
      e.preventDefault();
      swallowSpaceKeyup = false;
    }
  });

  // ---------- Eventi ----------
  addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (state.spinning) return;
    if (addEntry(addInput.value)) {
      addInput.value = '';
      showMessage('');
    }
    addInput.focus();
  });

  spinBtn.addEventListener('click', startSpin);
  clearBtn.addEventListener('click', clearAllEntries);
  resetBtn.addEventListener('click', resetApplication);
  rigOkBtn.addEventListener('click', applyRigChanges);
  rigResetBtn.addEventListener('click', resetRigDraft);
  rigDialog.addEventListener('close', () => {
    rigDraft = null;
    rigRefs.clear();
    rigError.textContent = '';
  });
  window.addEventListener('resize', drawWheel);

  // ---------- Avvio ----------
  const saved = loadState();
  if (saved === null) loadDefaultEntries();
  else state.entries = saved;
  setResult(IDLE_RESULT);
  render();
})();

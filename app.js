const POLLINATIONS_AUTH = 'https://enter.pollinations.ai/authorize';
const IMAGE_API         = 'https://gen.pollinations.ai/image';
const LS_KEY            = 'pollinations_api_key';
const MAX_HISTORY       = 10;

// ── State ────────────────────────────────────────────────────────
let apiKey      = null;
let currentModel  = 'flux';
let currentW    = 512;
let currentH    = 512;
let currentStyle  = 'photorealistic portrait';
let activeChips   = {};   // { setting: val, lighting: val, mood: val }
let history     = [];     // array of blob URLs

// ── DOM refs ─────────────────────────────────────────────────────
const authWall        = document.getElementById('authWall');
const app             = document.getElementById('app');
const authArea        = document.getElementById('authArea');
const connectBtn      = document.getElementById('connectBtn');
const connectBtnMain  = document.getElementById('connectBtnMain');
const generateBtn     = document.getElementById('generateBtn');
const promptInput     = document.getElementById('promptInput');
const negativeInput   = document.getElementById('negativeInput');
const seedInput       = document.getElementById('seedInput');
const randomSeedBtn   = document.getElementById('randomSeedBtn');
const enhanceToggle   = document.getElementById('enhanceToggle');
const resultArea      = document.getElementById('resultArea');
const genLoader       = document.getElementById('genLoader');
const loaderText      = document.getElementById('loaderText');
const genError        = document.getElementById('genError');
const resultImageWrap = document.getElementById('resultImageWrap');
const resultImage     = document.getElementById('resultImage');
const downloadBtn     = document.getElementById('downloadBtn');
const rerollBtn       = document.getElementById('rerollBtn');
const historySection  = document.getElementById('historySection');
const historyGrid     = document.getElementById('historyGrid');

// ── Auth ─────────────────────────────────────────────────────────
function goToAuth() {
  const params = new URLSearchParams({ redirect_url: location.href });
  window.location.href = `${POLLINATIONS_AUTH}?${params}`;
}

function saveKey(key) {
  apiKey = key;
  localStorage.setItem(LS_KEY, key);
}

function loadKey() {
  // Check URL fragment first (after redirect)
  const hash = new URLSearchParams(location.hash.slice(1));
  const keyFromUrl = hash.get('api_key');
  if (keyFromUrl) {
    saveKey(keyFromUrl);
    // Clean the fragment from URL without reload (may fail on file:// protocol)
    try { history.replaceState(null, '', location.pathname + location.search); } catch {}
    return keyFromUrl;
  }
  // Fall back to localStorage
  return localStorage.getItem(LS_KEY);
}

function disconnect() {
  apiKey = null;
  localStorage.removeItem(LS_KEY);
  showAuthWall();
}

function showAuthWall() {
  authWall.hidden = false;
  app.hidden = true;
  authArea.innerHTML = '<button class="connect-btn" id="connectBtn">🌸 Connect with Pollinations</button>';
  document.getElementById('connectBtn').addEventListener('click', goToAuth);
}

function showApp() {
  authWall.hidden = true;
  app.hidden = false;
  authArea.innerHTML = '<button class="disconnect-btn" id="disconnectBtn">Disconnect</button>';
  document.getElementById('disconnectBtn').addEventListener('click', disconnect);
}

// ── Generate ─────────────────────────────────────────────────────
function buildPrompt() {
  const parts = [currentStyle];
  const desc = promptInput.value.trim();
  if (desc) parts.push(desc);
  Object.values(activeChips).forEach(v => { if (v) parts.push(v); });
  return parts.join(', ');
}

function setGenerating(on) {
  generateBtn.disabled = on;
  genLoader.hidden = !on;
}

function showGenError(msg) { genError.textContent = msg; genError.hidden = false; }
function clearGenError()   { genError.hidden = true; }

async function generate() {
  if (!apiKey) return;
  clearGenError();
  resultImageWrap.hidden = true;
  resultArea.hidden = false;
  setGenerating(true);

  const prompt      = buildPrompt();
  const negative    = negativeInput.value.trim();
  const seed        = parseInt(seedInput.value, 10);
  const enhance     = enhanceToggle.checked;

  const messages = [
    `Model: ${currentModel}`,
    `Size: ${currentW}×${currentH}`,
    enhance ? 'Enhanced' : ''
  ].filter(Boolean).join(' · ');
  loaderText.textContent = `Generating… ${messages}`;

  try {
    const url = new URL(`${IMAGE_API}/${encodeURIComponent(prompt)}`);
    url.searchParams.set('model', currentModel);
    url.searchParams.set('width', currentW);
    url.searchParams.set('height', currentH);
    url.searchParams.set('enhance', enhance);
    if (seed !== -1) url.searchParams.set('seed', seed);
    if (negative && (currentModel === 'flux' || currentModel === 'zimage')) {
      url.searchParams.set('negative_prompt', negative);
    }

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (res.status === 401) throw new Error('Session expired. Please reconnect.');
    if (res.status === 402) throw new Error('Pollen balance exhausted. Top up at pollinations.ai.');
    if (res.status === 429) throw new Error('Too many requests — wait a moment and try again.');
    if (!res.ok) throw new Error(`Generation failed (${res.status}). Please try again.`);

    const blob    = await res.blob();
    const blobUrl = URL.createObjectURL(blob);

    resultImage.src       = blobUrl;
    downloadBtn.href      = blobUrl;
    downloadBtn.download  = `avatar-${Date.now()}.png`;
    resultImageWrap.hidden = false;

    addToHistory(blobUrl);

    // Auto-update seed display if it was random
    if (seed === -1) {
      const newSeed = Math.floor(Math.random() * 2147483647);
      seedInput.value = newSeed;
    }

  } catch (err) {
    showGenError(err.message || 'Something went wrong. Please try again.');
    if (err.message?.includes('reconnect')) {
      localStorage.removeItem(LS_KEY);
    }
  } finally {
    setGenerating(false);
  }
}

// ── History ──────────────────────────────────────────────────────
function addToHistory(blobUrl) {
  history.unshift(blobUrl);
  if (history.length > MAX_HISTORY) {
    URL.revokeObjectURL(history.pop());
  }
  renderHistory();
}

function renderHistory() {
  if (!history.length) { historySection.hidden = true; return; }
  historySection.hidden = false;
  historyGrid.innerHTML = '';
  history.forEach(url => {
    const img = document.createElement('img');
    img.className = 'history-thumb';
    img.src = url;
    img.alt = 'Previous generation';
    img.addEventListener('click', () => {
      resultImage.src = url;
      downloadBtn.href = url;
      resultImageWrap.hidden = false;
      resultArea.hidden = false;
      resultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    historyGrid.appendChild(img);
  });
}

// ── Presets ───────────────────────────────────────────────────────
document.querySelectorAll('.preset').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentStyle = btn.dataset.style;
  });
});

// ── Chips (single-select per group) ──────────────────────────────
['settingChips', 'lightingChips', 'moodChips'].forEach(id => {
  const groupKey = id.replace('Chips', '');
  document.getElementById(id).querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const siblings = document.getElementById(id).querySelectorAll('.chip');
      const wasActive = chip.classList.contains('active');
      siblings.forEach(c => c.classList.remove('active'));
      if (!wasActive) {
        chip.classList.add('active');
        activeChips[groupKey] = chip.dataset.val;
      } else {
        delete activeChips[groupKey];
      }
    });
  });
});

// ── Model tabs ────────────────────────────────────────────────────
document.querySelectorAll('.model-tab:not(.size-tab)').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.model-tab:not(.size-tab)').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentModel = btn.dataset.model;
  });
});

// ── Size tabs ─────────────────────────────────────────────────────
document.querySelectorAll('.size-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentW = parseInt(btn.dataset.w, 10);
    currentH = parseInt(btn.dataset.h, 10);
  });
});

// ── Seed ─────────────────────────────────────────────────────────
randomSeedBtn.addEventListener('click', () => {
  seedInput.value = Math.floor(Math.random() * 2147483647);
});

// ── Re-roll ───────────────────────────────────────────────────────
rerollBtn.addEventListener('click', () => {
  seedInput.value = Math.floor(Math.random() * 2147483647);
  generate();
});

// ── Generate ─────────────────────────────────────────────────────
generateBtn.addEventListener('click', generate);
connectBtn.addEventListener('click', goToAuth);
connectBtnMain.addEventListener('click', goToAuth);

// ── Init ─────────────────────────────────────────────────────────
apiKey = loadKey();
if (apiKey) {
  showApp();
} else {
  showAuthWall();
}

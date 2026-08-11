'use strict';

const $ = (id) => document.getElementById(id);

const screens = {
  today: $('screen-today'),
  reader: $('screen-reader'),
  quiz: $('screen-quiz'),
  results: $('screen-results'),
  empty: $('screen-empty'),
};

function show(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
}

/* ---------- stored state ---------- */

// Everything lives on the device. There are no accounts and no server.
const store = {
  read(key, fallback) {
    try {
      const raw = localStorage.getItem(`zephyr.${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(`zephyr.${key}`, JSON.stringify(value));
    } catch {
      // A full or blocked store costs the streak, not the reading.
    }
  },
};

const START_WPM = 110;
const MIN_WPM = 80;
const MAX_WPM = 300;


function profile() {
  return store.read('profile', null);
}

function history() {
  const h = store.read('history', []);
  return Array.isArray(h) ? h : [];
}

function entryFor(date) {
  return history().find((e) => e.date === date) ?? null;
}

function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function shiftDay(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return dayKey(date);
}

// Comprehension decides tomorrow's pace, so speed never runs ahead of
// understanding. Holding steady in the middle keeps it from oscillating.
function nextWpm(current, score, total) {
  if (!total) return current;
  const share = score / total;
  let next = current;
  if (share >= 0.8) next = current * 1.05;
  else if (share < 0.6) next = current * 0.95;
  return Math.min(MAX_WPM, Math.max(MIN_WPM, Math.round(next / 5) * 5));
}

function bumpStreak(date) {
  const streak = store.read('streak', { count: 0, lastDate: null });
  if (streak.lastDate === date) return streak;
  streak.count = streak.lastDate === shiftDay(date, -1) ? streak.count + 1 : 1;
  streak.lastDate = date;
  store.write('streak', streak);
  return streak;
}

// A streak only stands if yesterday or today was the last completed day.
function liveStreak() {
  const streak = store.read('streak', { count: 0, lastDate: null });
  if (!streak.lastDate) return 0;
  const today = dayKey();
  if (streak.lastDate === today || streak.lastDate === shiftDay(today, -1)) return streak.count;
  return 0;
}

/* ---------- keeping the record ---------- */

// Browsers are allowed to clear a site's storage when space runs short, and
// Safari discards it for sites left untouched for a week. Asking marks the
// data as worth keeping. Permission is granted on engagement, so it tends to
// be refused on a first visit and granted once the app is used regularly or
// added to the home screen. Nothing depends on the answer.
async function requestDurableStorage() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    // An older browser without the API loses nothing it had before.
  }
}

const BACKUP_KEYS = ['profile', 'history', 'streak', 'stepMode', 'theme'];

// A backup is a block of text rather than an account. Nothing is uploaded and
// there is nothing to sign in to. Copy it somewhere safe, paste it into a new
// phone, and the streak carries over.
function exportProgress() {
  const data = {};
  for (const key of BACKUP_KEYS) {
    const value = localStorage.getItem(`zephyr.${key}`);
    if (value !== null) data[key] = value;
  }
  const json = JSON.stringify({ v: 1, saved: dayKey(), data });
  return btoa(unescape(encodeURIComponent(json)));
}

function importProgress(text) {
  let parsed;
  try {
    parsed = JSON.parse(decodeURIComponent(escape(atob(text.trim()))));
  } catch {
    return { ok: false, message: 'That does not look like a Zephyr backup.' };
  }
  if (!parsed || parsed.v !== 1 || typeof parsed.data !== 'object') {
    return { ok: false, message: 'That backup is from a version this app does not understand.' };
  }
  for (const [key, value] of Object.entries(parsed.data)) {
    if (BACKUP_KEYS.includes(key)) localStorage.setItem(`zephyr.${key}`, value);
  }
  const days = JSON.parse(parsed.data.history || '[]').length;
  return { ok: true, message: `Restored ${days} day${days === 1 ? '' : 's'} of reading.` };
}

/* ---------- theme ---------- */

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function activeTheme() {
  return document.documentElement.dataset.theme || (darkQuery.matches ? 'dark' : 'light');
}

function paintThemeButton() {
  const btn = $('themeBtn');
  const dark = activeTheme() === 'dark';
  btn.classList.toggle('is-dark', dark);
  btn.classList.toggle('is-light', !dark);
  btn.title = dark ? 'Switch to light' : 'Switch to dark';
}

function toggleTheme() {
  const next = activeTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('zephyr.theme', next);
  paintThemeButton();
}

darkQuery.addEventListener('change', () => {
  if (!document.documentElement.dataset.theme) paintThemeButton();
});

/* ---------- session state ---------- */

const state = {
  article: null,
  words: 0,
  wpm: profile()?.currentWpm ?? START_WPM,
  calibrating: profile() === null,
  stepMode: localStorage.getItem('zephyr.stepMode') === '1',
  y: 0,
  playing: false,
  rafId: null,
  stepTimer: null,
  last: null,
  runStart: null,
  elapsed: 0,
  quiz: null,
  answered: false,
  lastResult: null,
};

/* ---------- loading ---------- */

async function tryFetch(path) {
  try {
    const res = await fetch(path, { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function countWords(text) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

// Rule 4: an article without provenance does not ship, so the app refuses to
// render one rather than quietly dropping the credit.
function hasSource(article) {
  const s = article?.source;
  return Boolean(s && s.origin && s.author && s.license);
}

async function init() {
  paintThemeButton();
  paintStepButton();
  setupShareControls();
  requestDurableStorage();
  $('dayLabel').textContent = dayKey();

  const today = dayKey();
  let article = await tryFetch(`content/articles/${today}.json`);
  let isSample = false;
  if (!article) {
    article = await tryFetch('content/articles/sample.json');
    isSample = Boolean(article);
  }

  if (!article) {
    show('empty');
    return;
  }

  if (!hasSource(article) || !Array.isArray(article.body) || article.body.length === 0) {
    console.warn('Zephyr: refusing to render an article without a source block or body.', article);
    $('emptyTitle').textContent = 'This article is missing its source';
    $('emptyHint').textContent = 'Every article needs an author, an origin and a licence before it can be read.';
    show('empty');
    return;
  }

  state.article = article;
  state.words = countWords(article.body.join(' '));

  // One article a day. Coming back after finishing shows that day's result.
  const done = entryFor(today);
  if (done) {
    state.lastResult = done;
    state.answered = true;
    renderResults(done);
    show('results');
    return;
  }

  renderTodayCard(article, isSample);
  show('today');
}

function renderTodayCard(article, isSample) {
  $('sampleNote').hidden = !isSample;

  const streak = liveStreak();
  const line = $('todayStreak');
  line.hidden = streak === 0;
  line.textContent = streak === 1 ? 'Day 1' : `${streak} day streak`;

  $('cardTitle').textContent = article.title;
  updateCardMeta();

  const preview = $('previewWords');
  preview.innerHTML = '';
  (article.previewWords ?? []).forEach(({ word, gloss }) => {
    const row = document.createElement('div');
    row.className = 'preview-word';
    const b = document.createElement('b');
    b.textContent = word;
    const span = document.createElement('span');
    span.textContent = gloss;
    row.append(b, span);
    preview.append(row);
  });

  $('startHint').textContent = state.calibrating
    ? 'Adjust the speed while you read. Where you settle becomes your starting pace.'
    : 'The text scrolls by itself. Keep up, because you cannot scroll back.';
}

function updateCardMeta() {
  const secs = Math.round((state.words / state.wpm) * 60);
  $('cardMeta').textContent = `${state.words} words · about ${secs}s at ${state.wpm} wpm`;
}

/* ---------- scroll engine ---------- */

const reader = $('reader');
const track = $('track');

function renderTrack(article) {
  track.innerHTML = '';
  const heading = document.createElement('h2');
  heading.textContent = article.title;
  track.append(heading);
  article.body.forEach((para) => {
    const p = document.createElement('p');
    p.textContent = para;
    track.append(p);
  });
}

function padTrack() {
  const pad = Math.round(reader.clientHeight * 0.42);
  track.style.paddingTop = `${pad}px`;
  track.style.paddingBottom = `${pad}px`;
}

function maxY() {
  return Math.max(1, track.scrollHeight - reader.clientHeight);
}

// Constant reading rate: the whole track passes at wpm words per minute.
function pxPerSec() {
  return (state.wpm / 60) * (track.scrollHeight / state.words);
}

function renderScroll() {
  track.style.transform = `translateY(${-state.y}px)`;
  $('bar').style.width = `${Math.min(100, (state.y / maxY()) * 100)}%`;
}

function frame(t) {
  if (state.last === null) state.last = t;
  const dt = (t - state.last) / 1000;
  state.last = t;
  state.y += pxPerSec() * dt;
  if (state.y >= maxY()) {
    state.y = maxY();
    renderScroll();
    finish();
    return;
  }
  renderScroll();
  state.rafId = requestAnimationFrame(frame);
}

/* ---------- paragraph steps, for reduced motion ---------- */

// An alternative for anyone who cannot read text that slides. Rather than
// jumping a whole paragraph and then sitting still, which looks like the app
// has frozen, it moves one line at a time on the same overall schedule. The
// screen changes every few seconds, so progress stays visible.
function lineHeightPx() {
  const size = parseFloat(getComputedStyle(track).fontSize) || 19;
  const lh = parseFloat(getComputedStyle(track).lineHeight);
  return Number.isFinite(lh) ? lh : size * 1.8;
}

function runSteps() {
  const line = lineHeightPx();
  const limit = maxY();
  if (state.y >= limit) {
    state.y = limit;
    renderScroll();
    finish();
    return;
  }
  state.y = Math.min(limit, state.y + line);
  renderScroll();
  // One line holds for as long as that line would have taken to scroll past.
  const hold = (line / pxPerSec()) * 1000;
  state.stepTimer = setTimeout(runSteps, hold);
}

// Time is measured off the clock in both modes, so the speed reported at the
// end reflects what actually happened rather than what was scheduled.
function play() {
  if (state.playing) return;
  state.playing = true;
  state.last = null;
  state.runStart = performance.now();
  $('playBtn').textContent = '⏸';
  if (state.stepMode) runSteps();
  else state.rafId = requestAnimationFrame(frame);
}

// Smooth scrolling is the default for everyone. The operating system's
// reduced-motion setting is not used to decide this: on Windows it is often
// switched on to make the interface feel faster, and those readers still want
// the scroll, which is the entire product. Anyone who needs the stepped
// version can turn it on here, and the choice is remembered.
function toggleStepMode() {
  state.stepMode = !state.stepMode;
  localStorage.setItem('zephyr.stepMode', state.stepMode ? '1' : '0');
  paintStepButton();
  if (state.playing) {
    pause();
    play();
  }
}

function paintStepButton() {
  const btn = $('stepBtn');
  btn.classList.toggle('on', state.stepMode);
  btn.setAttribute('aria-pressed', String(state.stepMode));
  btn.title = state.stepMode ? 'Switch to smooth scrolling' : 'Switch to line by line';
}

function bankElapsed() {
  if (state.runStart !== null) {
    state.elapsed += (performance.now() - state.runStart) / 1000;
    state.runStart = null;
  }
}

function pause() {
  bankElapsed();
  state.playing = false;
  $('playBtn').textContent = '▶';
  if (state.rafId) cancelAnimationFrame(state.rafId);
  if (state.stepTimer) clearTimeout(state.stepTimer);
  state.rafId = null;
  state.stepTimer = null;
}

function toggle() {
  if (state.playing) pause();
  else play();
}

function setWpm(delta) {
  state.wpm = Math.min(MAX_WPM, Math.max(60, state.wpm + delta));
  $('wpmVal').textContent = state.wpm;
}

/* ---------- flow ---------- */

function startReading() {
  show('reader');
  renderTrack(state.article);
  padTrack();
  state.y = 0;
  state.elapsed = 0;
  state.last = null;
  state.runStart = null;
  renderScroll();
  $('wpmVal').textContent = state.wpm;
  countdown(3);
}

function countdown(n) {
  const el = $('countdown');
  if (n === 0) {
    el.hidden = true;
    play();
    return;
  }
  el.hidden = false;
  el.textContent = n;
  setTimeout(() => countdown(n - 1), 800);
}

function measuredWpm() {
  const mins = state.elapsed / 60;
  return mins > 0 ? Math.round(state.words / mins) : state.wpm;
}

function finish() {
  pause();

  // The first read exists to find a baseline, so the pace the reader settles
  // on becomes their starting speed.
  if (state.calibrating) {
    store.write('profile', { currentWpm: state.wpm });
    state.calibrating = false;
  }

  const questions = state.article.quiz ?? [];
  if (state.answered || questions.length === 0) {
    completeDay(null, 0);
    return;
  }
  startQuiz(questions);
}

/* ---------- quiz ---------- */

function startQuiz(questions) {
  state.quiz = { questions, index: 0, correct: 0 };
  show('quiz');
  renderQuestion();
}

function renderQuestion() {
  const { questions, index } = state.quiz;
  const question = questions[index];

  $('quizCounter').textContent = `${index + 1} / ${questions.length}`;
  $('quizQuestion').textContent = question.q;

  const list = $('quizOptions');
  list.innerHTML = '';

  question.options.forEach((label, i) => {
    const btn = document.createElement('button');
    btn.className = 'option';
    btn.type = 'button';
    btn.textContent = label;
    // The answer index stays in this closure. Writing it into the markup
    // would put the answer key one devtools panel away.
    btn.addEventListener('click', () => answer(i, question.answer, list), { once: true });
    list.append(btn);
  });
}

function answer(picked, correct, list) {
  const buttons = [...list.children];
  buttons.forEach((b) => { b.disabled = true; });
  buttons[correct]?.classList.add('right');
  if (picked !== correct) buttons[picked]?.classList.add('wrong');
  if (picked === correct) state.quiz.correct += 1;

  setTimeout(() => {
    state.quiz.index += 1;
    if (state.quiz.index < state.quiz.questions.length) renderQuestion();
    else completeDay(state.quiz.correct, state.quiz.questions.length);
  }, 700);
}

/* ---------- results ---------- */

function completeDay(score, total) {
  const date = dayKey();
  const wpm = measuredWpm();
  state.answered = true;

  let entry = entryFor(date);
  if (!entry) {
    const streak = bumpStreak(date);
    const log = history();
    entry = {
      date,
      wpm,
      words: state.words,
      score: score ?? undefined,
      total: total || undefined,
      streak: streak.count,
      day: log.length + 1,
      nextWpm: nextWpm(profile()?.currentWpm ?? state.wpm, score ?? 0, total),
    };
    log.push(entry);
    store.write('history', log);
    store.write('profile', { currentWpm: entry.nextWpm });
  }

  state.lastResult = entry;
  renderResults(entry);
  show('results');
}

function renderResults(entry) {
  $('heroWpm').textContent = entry.wpm;

  const streakLine = $('resultStreak');
  streakLine.hidden = !entry.streak;
  streakLine.textContent = entry.streak === 1 ? 'Day 1' : `${entry.streak} day streak`;

  $('resultScore').textContent =
    entry.total ? `${entry.score} of ${entry.total} correct` : `${entry.words} words`;

  $('tomorrowLine').textContent = entry.nextWpm
    ? `Tomorrow starts at ${entry.nextWpm} wpm.`
    : 'See you tomorrow.';

  const src = state.article?.source;
  $('attribution').textContent = src ? `${src.origin}, ${src.author} (${src.license})` : '';
}

/* ---------- sharing ---------- */

function siteUrl() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

function buildShareText() {
  const r = state.lastResult;
  if (!r) return '';
  const stats = [`${r.wpm} wpm`];
  if (r.score != null && r.total != null) stats.push(`${r.score}/${r.total} correct`);
  if (r.streak) stats.push(`streak ${r.streak}`);
  return [`ZEPHYR · ${r.day ? `Day ${r.day}` : r.date}`, stats.join(' · '), siteUrl()].join('\n');
}

function openWhatsApp() {
  window.open(`https://wa.me/?text=${encodeURIComponent(buildShareText())}`, '_blank', 'noopener');
}

async function shareResult() {
  try {
    await navigator.share({ text: buildShareText() });
  } catch (err) {
    // Dismissing the sheet is not a failure worth reacting to.
    if (err.name !== 'AbortError') openWhatsApp();
  }
}

async function copyResult() {
  const text = buildShareText();
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    // clipboard needs a secure context; fall back to a selection copy.
    const scratch = document.createElement('textarea');
    scratch.value = text;
    scratch.setAttribute('readonly', '');
    scratch.style.cssText = 'position:fixed;top:-9999px;opacity:0';
    document.body.append(scratch);
    scratch.select();
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    scratch.remove();
  }
  const btn = $('copyBtn');
  btn.textContent = copied ? 'Copied' : 'Press Ctrl+C';
  setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
}

function setupShareControls() {
  const native = typeof navigator.share === 'function';
  $('shareBtn').hidden = !native;
  $('shareFallback').hidden = native;
}

/* ---------- events ---------- */

$('themeBtn').addEventListener('click', toggleTheme);

$('backupBtn').addEventListener('click', () => {
  const days = history().length;
  const streak = liveStreak();
  $('backupSummary').textContent = days
    ? `${days} day${days === 1 ? '' : 's'} read, ${streak} day streak`
    : 'Nothing recorded yet.';
  $('backupText').value = exportProgress();
  $('backupStatus').hidden = true;
  $('backupDialog').showModal();
});
$('closeBackupBtn').addEventListener('click', () => $('backupDialog').close());
$('copyBackupBtn').addEventListener('click', async () => {
  const field = $('backupText');
  field.select();
  let copied = false;
  try {
    await navigator.clipboard.writeText(field.value);
    copied = true;
  } catch {
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
  }
  const status = $('backupStatus');
  status.hidden = false;
  status.textContent = copied ? 'Copied. Keep it somewhere you will find it again.' : 'Press Ctrl+C to copy.';
});
$('restoreBtn').addEventListener('click', () => {
  const result = importProgress($('backupText').value);
  const status = $('backupStatus');
  status.hidden = false;
  status.textContent = result.message;
  if (result.ok) setTimeout(() => location.reload(), 900);
});
$('stepBtn').addEventListener('click', toggleStepMode);
$('shareBtn').addEventListener('click', shareResult);
$('waBtn').addEventListener('click', openWhatsApp);
$('copyBtn').addEventListener('click', copyResult);
$('startBtn').addEventListener('click', startReading);
$('againBtn').addEventListener('click', startReading);
$('playBtn').addEventListener('click', toggle);
$('slower').addEventListener('click', () => setWpm(-10));
$('faster').addEventListener('click', () => setWpm(10));
reader.addEventListener('click', toggle);
reader.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') setWpm(10);
  if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') setWpm(-10);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.playing) pause();
});
window.addEventListener('resize', () => {
  if (screens.reader.classList.contains('active')) padTrack();
});

// Registration needs a secure context, so it is skipped over plain http
// during local development and simply does nothing there.
if ('serviceWorker' in navigator && window.isSecureContext) {
  // A replacement worker taking over means the page is still showing code
  // from the previous one. Reload once so a fix reaches the reader on this
  // visit instead of the next. The flag stops the reload repeating.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => reg.update())
      .catch((err) => {
        console.warn('Zephyr: service worker registration failed.', err);
      });
  });
}

init();

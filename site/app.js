'use strict';

const $ = (id) => document.getElementById(id);

const screens = {
  today: $('screen-today'),
  reader: $('screen-reader'),
  done: $('screen-done'),
  empty: $('screen-empty'),
};

function show(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
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

// Follow the system while nothing is pinned.
darkQuery.addEventListener('change', () => {
  if (!document.documentElement.dataset.theme) paintThemeButton();
});

function todayKey() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const state = {
  article: null,
  words: 0,
  wpm: Number(localStorage.getItem('zephyr.wpm')) || 130,
  y: 0,
  playing: false,
  rafId: null,
  last: null,
  elapsed: 0,
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

async function init() {
  paintThemeButton();
  setupShareControls();
  $('dayLabel').textContent = todayKey();
  let article = await tryFetch(`content/articles/${todayKey()}.json`);
  let isSample = false;
  if (!article) {
    article = await tryFetch('content/articles/sample.json');
    isSample = true;
  }
  if (!article) {
    show('empty');
    return;
  }
  state.article = article;
  state.words = article.body.join(' ').trim().split(/\s+/).length;
  renderTodayCard(article, isSample);
}

function renderTodayCard(article, isSample) {
  $('sampleNote').hidden = !isSample;
  $('cardTitle').textContent = article.title;
  updateCardMeta();
  const preview = $('previewWords');
  preview.innerHTML = '';
  (article.previewWords || []).forEach(({ word, gloss }) => {
    const div = document.createElement('div');
    div.className = 'preview-word';
    const b = document.createElement('b');
    b.textContent = word;
    const span = document.createElement('span');
    span.textContent = gloss;
    div.append(b, span);
    preview.append(div);
  });
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
  const h = document.createElement('h2');
  h.textContent = article.title;
  track.append(h);
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
  $('bar').style.width = `${(state.y / maxY()) * 100}%`;
}

function frame(t) {
  if (state.last === null) state.last = t;
  const dt = (t - state.last) / 1000;
  state.last = t;
  state.elapsed += dt;
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

function play() {
  if (state.playing) return;
  state.playing = true;
  state.last = null;
  $('playBtn').textContent = '⏸';
  state.rafId = requestAnimationFrame(frame);
}

function pause() {
  state.playing = false;
  $('playBtn').textContent = '▶';
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = null;
}

function toggle() {
  state.playing ? pause() : play();
}

function setWpm(delta) {
  state.wpm = Math.min(300, Math.max(60, state.wpm + delta));
  $('wpmVal').textContent = state.wpm;
  localStorage.setItem('zephyr.wpm', state.wpm);
}

/* ---------- flow ---------- */

function startReading() {
  show('reader');
  renderTrack(state.article);
  padTrack();
  state.y = 0;
  state.elapsed = 0;
  state.last = null;
  renderScroll();
  $('wpmVal').textContent = state.wpm;
  countdown(3);
}

function countdown(n) {
  const el = $('countdown');
  el.hidden = false;
  el.textContent = n;
  if (n === 0) {
    el.hidden = true;
    play();
    return;
  }
  setTimeout(() => countdown(n - 1), 800);
}

function finish() {
  pause();
  const mins = state.elapsed / 60;
  const actualWpm = mins > 0 ? Math.round(state.words / mins) : state.wpm;

  // WP3 adds score and total here, WP4 adds day and streak.
  state.lastResult = { date: todayKey(), wpm: actualWpm, words: state.words };

  $('doneStats').textContent = `${state.words} words · ${Math.round(state.elapsed)}s · ${actualWpm} wpm`;
  const src = state.article.source;
  $('attribution').textContent = src ? `${src.origin}, ${src.author} (${src.license})` : '';
  show('done');
}

/* ---------- sharing ---------- */

// The deployed address, whatever it turns out to be.
function siteUrl() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

// Fields appear as later packages produce them: WP3 adds the score, WP4 the
// day number and the streak. Missing ones are left out rather than shown empty.
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
  const text = buildShareText();
  try {
    await navigator.share({ text });
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

// One native share button where the browser supports it, two explicit ones
// where it does not.
function setupShareControls() {
  const native = typeof navigator.share === 'function';
  $('shareBtn').hidden = !native;
  $('shareFallback').hidden = native;
}

/* ---------- events ---------- */

$('themeBtn').addEventListener('click', toggleTheme);
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

init();

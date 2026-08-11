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
  $('doneStats').textContent = `${state.words} words · ${Math.round(state.elapsed)}s · ${actualWpm} wpm`;
  const src = state.article.source;
  $('attribution').textContent = src ? `${src.origin}, ${src.author} (${src.license})` : '';
  show('done');
}

/* ---------- events ---------- */

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

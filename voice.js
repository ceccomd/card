(function () {
  'use strict';

  const synth = window.speechSynthesis;
  const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!synth && !!Recog;

  let voice = null;
  let recognition = null;
  let running = false;
  let listening = false;
  let currentKey = '';
  const state = { correct: 0, total: 0, streak: 0 };

  const $ = (id) => document.getElementById(id);

  function pickVoice() {
    if (!synth) return;
    const voices = synth.getVoices() || [];
    voice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('it')) || voices[0] || null;
  }
  if (synth) {
    pickVoice();
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', pickVoice);
    }
  }

  function speak(text, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      if (!synth) return resolve();
      try { synth.cancel(); } catch (_) {}
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'it-IT';
      if (voice) u.voice = voice;
      u.rate = opts.rate || 0.95;
      u.pitch = opts.pitch || 1;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.speak(u);
    });
  }

  function normalize(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const FILLERS = new Set([
    'il','lo','la','i','gli','le','un','uno','una',
    'del','dello','della','dei','degli','delle','e','è','di','da','a','in'
  ]);
  function contentWords(s) {
    return normalize(s).split(' ').filter(w => w && !FILLERS.has(w));
  }
  function matches(userText, correctText) {
    const cWords = contentWords(correctText);
    const uWords = contentWords(userText);
    if (!cWords.length || !uWords.length) return false;
    const uSet = new Set(uWords);
    // Tutte le parole "contenuto" del valore corretto devono comparire nella risposta.
    return cWords.every(w => uSet.has(w));
  }

  function pickKey() {
    const keys = Object.keys(mapping);
    return keys[Math.floor(Math.random() * keys.length)];
  }

  function spokenNumber(k) {
    // "00".."09" devono essere letti come bigrammi: "zero tre" non "tre"
    if (k.length === 2 && k[0] === '0') return 'zero ' + k[1];
    return k;
  }

  function updateStatsUI() {
    $('voiceCorrect').textContent = state.correct;
    $('voiceTotal').textContent = state.total;
    $('voiceStreak').textContent = state.streak;
    const chip = $('voiceStreakChip');
    if (chip) chip.classList.toggle('active', state.streak > 0);
  }

  function setStatus(msg) {
    const el = $('voiceStatus');
    if (el) el.textContent = msg;
  }
  function setHeard(msg) {
    const el = $('voiceHeard');
    if (el) el.textContent = msg ? '« ' + msg + ' »' : '';
  }
  function setFeedback(ok, msg) {
    const fb = $('voiceFeedback');
    if (!fb) return;
    fb.textContent = msg || '';
    fb.className = 'feedback ' + (msg ? (ok ? 'correct' : 'error') : '');
  }

  function flashState(ok) {
    const card = $('voiceFlashcard');
    if (!card) return;
    card.classList.remove('win', 'lose', 'flip');
    void card.offsetWidth;
    card.classList.add(ok ? 'win' : 'lose');
  }

  function startRecog() {
    if (!Recog || !running || listening) return;
    try {
      recognition = new Recog();
      recognition.lang = 'it-IT';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 3;

      recognition.onstart = () => {
        listening = true;
        setStatus('Ti ascolto...');
      };
      recognition.onresult = (e) => {
        const alts = [];
        const result = e.results[0];
        for (let i = 0; i < result.length; i++) alts.push(result[i].transcript);
        handleAnswer(alts);
      };
      recognition.onerror = (e) => {
        listening = false;
        if (!running) return;
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          setStatus('Permesso microfono negato. Abilita il microfono nelle impostazioni del browser.');
          stopVoiceMode();
          return;
        }
        if (e.error === 'no-speech' || e.error === 'audio-capture') {
          setStatus('Non ho sentito. Ripeto il numero.');
          setTimeout(() => { if (running) askCurrent(); }, 400);
          return;
        }
        setStatus('Errore: ' + e.error);
      };
      recognition.onend = () => { listening = false; };
      recognition.start();
    } catch (err) {
      listening = false;
      setStatus('Errore microfono');
    }
  }

  async function handleAnswer(alternatives) {
    const correctWord = mapping[currentKey];
    const ok = alternatives.some(a => matches(a, correctWord));
    setHeard(alternatives[0] || '');
    state.total++;
    if (ok) { state.correct++; state.streak++; }
    else    { state.streak = 0; }
    updateStatsUI();
    setFeedback(ok, ok ? 'Corretto' : 'Era: ' + correctWord);
    flashState(ok);

    await speak(ok ? 'corretto' : 'era ' + correctWord, { rate: 1 });
    if (running) nextRound();
  }

  async function askCurrent() {
    if (!running) return;
    setHeard('');
    setFeedback(true, '');
    const card = $('voiceFlashcard');
    if (card) card.classList.remove('win', 'lose');
    setStatus('Parlo...');
    await speak(spokenNumber(currentKey));
    if (!running) return;
    startRecog();
  }

  function nextRound() {
    currentKey = pickKey();
    const card = $('voiceFlashcard');
    if (card) card.textContent = currentKey;
    askCurrent();
  }

  window.initVoiceMode = function () {
    if (!supported) {
      const u = $('voiceUnsupported');
      if (u) u.classList.remove('hidden');
      const t = $('voiceToggleBtn');
      if (t) t.disabled = true;
      const r = $('voiceRepeatBtn');
      if (r) r.disabled = true;
      return;
    }
    state.correct = state.total = state.streak = 0;
    currentKey = '';
    updateStatsUI();
    setStatus('Premi Avvia. Servono cuffia e mic.');
    setHeard('');
    setFeedback(true, '');
    const card = $('voiceFlashcard');
    if (card) { card.textContent = '—'; card.classList.remove('win', 'lose'); }
    $('voiceToggleBtn').textContent = 'Avvia';
    $('voiceRepeatBtn').disabled = true;
  };

  window.startVoiceMode = function () {
    if (!supported || running) return;
    running = true;
    $('voiceToggleBtn').textContent = 'Pausa';
    $('voiceRepeatBtn').disabled = false;
    nextRound();
  };

  window.stopVoiceMode = function () {
    running = false;
    if (recognition) { try { recognition.stop(); } catch (_) {} }
    if (synth)       { try { synth.cancel(); } catch (_) {} }
    listening = false;
    setStatus('In pausa. Premi Avvia per riprendere.');
    $('voiceToggleBtn').textContent = 'Avvia';
    $('voiceRepeatBtn').disabled = !currentKey;
  };

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = $('voiceToggleBtn');
    const repeat = $('voiceRepeatBtn');
    if (!toggle) return;
    toggle.addEventListener('click', () => {
      if (running) stopVoiceMode();
      else startVoiceMode();
    });
    repeat.addEventListener('click', () => {
      if (!currentKey) return;
      if (!running) {
        running = true;
        toggle.textContent = 'Pausa';
      }
      askCurrent();
    });
  });
})();

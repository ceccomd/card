// Funzioni condivise per la modalità vocale (riconoscimento + sintesi)
// usate da Gioco Classico, Gioco Range e Calcolatrice.
(function (global) {
  'use strict';

  const synth = global.speechSynthesis;
  const Recog = global.SpeechRecognition || global.webkitSpeechRecognition;
  const supported = !!synth && !!Recog;

  let voice = null;

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
    'del','dello','della','dei','degli','delle','e','e','di','da','a','in'
  ]);
  function contentWords(s) {
    return normalize(s).split(' ').filter(w => w && !FILLERS.has(w));
  }
  function matches(userText, correctText) {
    const cWords = contentWords(correctText);
    const uWords = contentWords(userText);
    if (!cWords.length || !uWords.length) return false;
    const uSet = new Set(uWords);
    return cWords.every(w => uSet.has(w));
  }

  function spokenNumber(k) {
    if (k.length === 2 && k[0] === '0') return 'zero ' + k[1];
    return k;
  }

  // ---- Riconoscimento numeri detti in italiano (per la calcolatrice) ----

  const NUM_0_99 = buildNumberMap0to99();

  function buildNumberMap0to99() {
    const u  = ['zero','uno','due','tre','quattro','cinque','sei','sette','otto','nove'];
    const t  = ['dieci','undici','dodici','tredici','quattordici','quindici','sedici','diciassette','diciotto','diciannove'];
    const ts = ['venti','trenta','quaranta','cinquanta','sessanta','settanta','ottanta','novanta'];
    const map = {};
    for (let i = 0; i < 10; i++) map[u[i]] = i;
    map['un'] = 1; map['una'] = 1;
    for (let i = 10; i < 20; i++) map[t[i - 10]] = i;
    for (let d = 2; d <= 9; d++) {
      const base = ts[d - 2];
      map[base] = d * 10;
      for (let j = 1; j < 10; j++) {
        let word;
        if (j === 1)      word = base.slice(0, -1) + 'uno';   // ventuno
        else if (j === 8) word = base.slice(0, -1) + 'otto';  // ventotto
        else if (j === 3) word = base + 'tre';                 // ventitre (accenti rimossi)
        else              word = base + u[j];
        map[word] = d * 10 + j;
      }
    }
    return map;
  }

  const HUNDREDS = {
    cento: 100, duecento: 200, trecento: 300, quattrocento: 400,
    cinquecento: 500, seicento: 600, settecento: 700, ottocento: 800, novecento: 900
  };
  const THOUSANDS = {
    mille: 1000, duemila: 2000, tremila: 3000, quattromila: 4000,
    cinquemila: 5000, seimila: 6000, settemila: 7000, ottomila: 8000, novemila: 9000
  };

  // Prova a interpretare una stringa (senza spazi) come numero italiano 0..9999.
  function parseItalianNumber(s) {
    if (!s) return null;
    if (s in NUM_0_99) return NUM_0_99[s];

    let total = 0;
    let rest = s;

    // Migliaia
    let consumed = false;
    for (const w of Object.keys(THOUSANDS).sort((a,b) => b.length - a.length)) {
      if (rest.startsWith(w)) { total += THOUSANDS[w]; rest = rest.slice(w.length); consumed = true; break; }
    }
    // "tremilacentoventi" gestito sopra; "duemilauno" → rest = "uno"
    if (rest === '' && consumed) return total;

    // Centinaia
    for (const w of Object.keys(HUNDREDS).sort((a,b) => b.length - a.length)) {
      if (rest.startsWith(w)) { total += HUNDREDS[w]; rest = rest.slice(w.length); consumed = true; break; }
    }
    if (rest === '' && consumed) return total;

    // Eventuale "e" di congiunzione: "centoeventi"
    if (rest.startsWith('e') && (rest.slice(1) in NUM_0_99)) {
      return total + NUM_0_99[rest.slice(1)];
    }
    if (rest in NUM_0_99) return total + NUM_0_99[rest];

    return consumed ? null : null;
  }

  // Converti un testo dettato in stringa di cifre. Strategia:
  // 1. Cifre arabe → prese così come sono.
  // 2. Tutti token sono cifre singole (zero..nove) → concatena ogni cifra.
  // 3. Altrimenti prova a interpretare l'intera frase come numero italiano composto.
  function speechToDigits(text) {
    const norm = normalize(text);
    if (!norm) return '';

    // Caso veloce: "1124" già numerico
    const allDigits = norm.replace(/\s+/g, '');
    if (/^\d+$/.test(allDigits)) return allDigits;

    // Per il parsing numerico NON filtriamo i FILLERS: "uno", "una", "un", "e"
    // sono qui significativi ("uno uno due quattro" → 1124; "cento e venti" → 120).
    const tokens = norm.split(' ').filter(t => t && t.length > 0);
    if (tokens.length === 0) return '';

    const DIGITS = { zero:0, uno:1, un:1, una:1, due:2, tre:3, quattro:4, cinque:5, sei:6, sette:7, otto:8, nove:9 };
    const allSingleDigits = tokens.every(t => t in DIGITS || /^\d$/.test(t));
    if (allSingleDigits) {
      return tokens.map(t => /^\d$/.test(t) ? t : String(DIGITS[t])).join('');
    }

    // Numero italiano composto (es. "millecentoventiquattro" o "mille cento ventiquattro")
    const joined = tokens.join('');
    const parsed = parseItalianNumber(joined);
    if (parsed !== null) return String(parsed);

    // Ultimo tentativo: somma pezzo per pezzo (utile per numeri molto lunghi spezzati male)
    let sum = 0; let any = false;
    for (const tk of tokens) {
      const v = parseItalianNumber(tk);
      if (v !== null) { sum += v; any = true; }
    }
    return any ? String(sum) : '';
  }

  // ---- Factory del riconoscitore vocale ----
  // Crea un controller con start/stop. handlers: { onResult, onNoSpeech, onError }
  function createRecognizer(handlers) {
    if (!Recog) return null;
    handlers = handlers || {};
    let recognition = null;
    let listening = false;
    let timeoutId = null;

    function clearT() { if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; } }

    function start() {
      if (listening) return;
      try {
        recognition = new Recog();
        recognition.lang = 'it-IT';
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.maxAlternatives = 3;

        let handled = false;
        recognition.onstart = () => {
          listening = true;
          if (handlers.onStart) handlers.onStart();
          clearT();
          timeoutId = setTimeout(() => {
            try { recognition.stop(); } catch (_) {}
          }, 8000);
        };
        recognition.onresult = (e) => {
          handled = true;
          clearT();
          const alts = [];
          const r = e.results[0];
          for (let i = 0; i < r.length; i++) alts.push(r[i].transcript);
          if (handlers.onResult) handlers.onResult(alts);
        };
        recognition.onerror = (e) => {
          listening = false;
          clearT();
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            handled = true;
            if (handlers.onError) handlers.onError('not-allowed');
            return;
          }
          if (e.error === 'no-speech' || e.error === 'audio-capture' || e.error === 'aborted') {
            if (!handled && handlers.onNoSpeech) handlers.onNoSpeech();
            handled = true;
            return;
          }
          if (handlers.onError) handlers.onError(e.error);
          handled = true;
        };
        recognition.onend = () => {
          listening = false;
          clearT();
          if (!handled && handlers.onNoSpeech) handlers.onNoSpeech();
        };
        recognition.start();
      } catch (_) {
        listening = false;
        if (handlers.onError) handlers.onError('start-failed');
      }
    }

    function stop() {
      clearT();
      if (recognition) { try { recognition.stop(); } catch (_) {} }
      listening = false;
    }

    return { start, stop, isListening: () => listening };
  }

  global.VoiceCore = {
    supported,
    speak,
    normalize,
    matches,
    spokenNumber,
    speechToDigits,
    parseItalianNumber,
    createRecognizer,
    cancelSpeech: () => { if (synth) { try { synth.cancel(); } catch (_) {} } }
  };
})(window);

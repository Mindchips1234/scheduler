// Thin wrapper around the browser's built-in speech recognition
// (Chrome on Android, Safari on iPhone 14.5+). Requires HTTPS or localhost.

const Recognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

export const voiceSupported = Boolean(Recognition);

export function listen({ onInterim, onFinal, onError, onEnd }) {
  if (!Recognition) {
    onError?.('Voice input is not supported in this browser. Try Chrome (Android) or Safari (iPhone).');
    return { stop() {} };
  }
  const rec = new Recognition();
  rec.lang = navigator.language || 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  // Rebuilt from all results each time, so words that were never marked "final"
  // (common when you tap the mic again to stop) are still kept.
  let heard = '';
  rec.onresult = (e) => {
    let text = '';
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    heard = text.trim();
    onInterim?.(heard);
  };
  rec.onerror = (e) => {
    if (e.error === 'aborted') return; // we stopped it ourselves
    if (e.error === 'no-speech' && heard) return;
    const msg = {
      'not-allowed': 'Microphone permission was denied. Allow it in your browser settings.',
      'service-not-allowed': 'Microphone permission was denied. Allow it in your browser settings.',
      'no-speech': "Didn't hear anything. Tap the mic and try again.",
      'network': 'Speech recognition needs an internet connection on this device.',
    }[e.error] || `Voice error: ${e.error}`;
    onError?.(msg);
  };
  let ended = false;
  rec.onend = () => {
    if (ended) return;
    ended = true;
    if (heard) onFinal?.(heard);
    onEnd?.();
  };
  try {
    rec.start();
  } catch {
    onError?.('Could not start the microphone. Try again.');
    ended = true;
    onEnd?.();
    return { stop() {} };
  }
  return {
    stop() {
      try { rec.stop(); } catch { /* already stopped */ }
      // Some phones never fire "end" after a manual stop; finish anyway.
      setTimeout(() => rec.onend(), 1500);
    },
  };
}

/** Reads text aloud, if the device supports it. */
export function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = navigator.language || 'en-US';
    window.speechSynthesis.speak(u);
  } catch {
    /* speaking is optional */
  }
}

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

  let finalText = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t;
      else interim += t;
    }
    onInterim?.((finalText + interim).trim());
  };
  rec.onerror = (e) => {
    const msg = {
      'not-allowed': 'Microphone permission was denied. Allow it in your browser settings.',
      'no-speech': "Didn't hear anything. Tap the mic and try again.",
      'network': 'Speech recognition needs an internet connection on this device.',
    }[e.error] || `Voice error: ${e.error}`;
    onError?.(msg);
  };
  rec.onend = () => {
    if (finalText.trim()) onFinal?.(finalText.trim());
    onEnd?.();
  };
  rec.start();
  return { stop: () => rec.stop() };
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

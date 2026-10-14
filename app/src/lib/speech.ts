/** Read aloud, first pass: the browser's speechSynthesis. Audio hardware still to confirm. */
const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;

export const speech = {
  available: !!synth,
  say(text: string) {
    if (!synth || !text) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.95;
    synth.speak(u);
  },
  stop() { synth?.cancel(); },
};

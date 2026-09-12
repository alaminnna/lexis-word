// SpeechService (§10, §18): Web Speech API wrapper. Components never touch
// speechSynthesis directly. Handles async voice loading, iOS gesture priming,
// zero-voice degradation, and utterance errors — never a stuck "playing" state.

export interface VoiceInfo {
  uri: string;
  name: string;
  lang: string;
}

export interface SpeakOptions {
  voiceURI?: string;
  rate?: number;
}

/** Preferred voice order for IELTS listening (British → Australian → US). */
const LANG_PREFERENCE = ['en-GB', 'en-AU', 'en-US'];

function pickDefault(voices: VoiceInfo[]): VoiceInfo | null {
  for (const lang of LANG_PREFERENCE) {
    const v = voices.find((x) => x.lang.toLowerCase().startsWith(lang.toLowerCase()));
    if (v) return v;
  }
  return voices.find((x) => x.lang.toLowerCase().startsWith('en')) ?? voices[0] ?? null;
}

class WebSpeechService {
  private primed = false;
  private pending: { reject: (e: Error) => void } | null = null;
  private testMode = false;
  private lastSpoken: { text: string; options: SpeakOptions } | null = null;

  isSupported(): boolean {
    if (this.testMode) return true;
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  /** Call from a user gesture (first tap). Warms up voices on iOS Safari. */
  init(): void {
    if (this.primed || !this.isSupported() || this.testMode) return;
    this.primed = true;
    try {
      // A zero-volume warm-up utterance unlocks audio on iOS without sound.
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch {
      // Priming is best-effort; speak() still works or degrades loudly.
    }
  }

  getVoices(): Promise<VoiceInfo[]> {
    if (this.testMode) {
      return Promise.resolve([{ uri: 'test-voice', name: 'Test Voice', lang: 'en-GB' }]);
    }
    if (!this.isSupported()) return Promise.resolve([]);
    const synth = window.speechSynthesis;
    const snapshot = (): VoiceInfo[] =>
      synth.getVoices().map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang }));
    const immediate = snapshot();
    if (immediate.length > 0) return Promise.resolve(immediate);
    // Chrome loads voices asynchronously — wait for voiceschanged (with timeout).
    return new Promise((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        synth.removeEventListener('voiceschanged', finish);
        resolve(snapshot());
      };
      synth.addEventListener('voiceschanged', finish);
      window.setTimeout(finish, 2500);
    });
  }

  async defaultVoice(): Promise<VoiceInfo | null> {
    const voices = await this.getVoices();
    return pickDefault(voices);
  }

  speak(text: string, options: SpeakOptions = {}): Promise<'ended'> {
    this.lastSpoken = { text, options };
    if (this.testMode) return Promise.resolve('ended');
    if (!this.isSupported()) return Promise.reject(new Error('Speech synthesis is not available.'));
    const synth = window.speechSynthesis;
    // Cancel any in-flight utterance so states never overlap or stick.
    try {
      synth.cancel();
    } catch {
      // ignore — speak proceeds anyway
    }
    if (this.pending) {
      this.pending.reject(new Error('Superseded by a newer utterance.'));
      this.pending = null;
    }
    return new Promise<'ended'>((resolve, reject) => {
      this.pending = { reject };
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = options.rate ?? 1;
      utter.lang = 'en-GB';
      const settle = (fn: () => void): void => {
        if (this.pending) {
          this.pending = null;
          fn();
        }
      };
      utter.onend = () => settle(() => resolve('ended'));
      utter.onerror = (ev: SpeechSynthesisErrorEvent) => {
        settle(() => reject(new Error(`Speech failed (${ev.error}).`)));
      };
      if (options.voiceURI) {
        const match = synth.getVoices().find((v) => v.voiceURI === options.voiceURI);
        if (match) {
          utter.voice = match;
          utter.lang = match.lang;
        }
      }
      try {
        synth.speak(utter);
      } catch (err) {
        settle(() => reject(err instanceof Error ? err : new Error('Speech failed to start.')));
      }
    });
  }

  /** Retry the last utterance (surfaces a retry control, never silent failure). */
  retryLast(): Promise<'ended'> {
    if (!this.lastSpoken) return Promise.reject(new Error('Nothing to retry yet.'));
    return this.speak(this.lastSpoken.text, this.lastSpoken.options);
  }

  cancel(): void {
    if (this.testMode) return;
    if (!this.isSupported()) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
    if (this.pending) {
      this.pending.reject(new Error('Cancelled.'));
      this.pending = null;
    }
  }

  setTestMode(enabled: boolean): void {
    this.testMode = enabled;
  }
}

export const speech: WebSpeechService = new WebSpeechService();
export type SpeechService = WebSpeechService;

let availabilityCache: { at: number; value: boolean } | null = null;

/** Cached speech availability check (voices present?). Drives session planning. */
export async function getSpeechAvailable(): Promise<boolean> {
  if (availabilityCache && Date.now() - availabilityCache.at < 60_000) return availabilityCache.value;
  const value = speech.isSupported() && (await speech.getVoices()).length > 0;
  availabilityCache = { at: Date.now(), value };
  return value;
}

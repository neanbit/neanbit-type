export class Engine {
  constructor(text) {
    this.words = text.trim().split(/\s+/);
    this.index = 0;
    this.committed = 0;
    this.keys = 0;
    this.misses = 0;
    this.startedAt = 0;
    this.endedAt = 0;
    this.prev = '';
    this.missedChars = {};
    this.missedWords = {};
  }

  get word() { return this.words[this.index]; }
  get finished() { return this.index >= this.words.length; }
  get isLast() { return this.index === this.words.length - 1; }

  matched(typed) {
    const word = this.word;
    let n = 0;
    while (n < typed.length && typed[n] === word[n]) n++;
    return n;
  }

  input(value, now = performance.now()) {
    if (this.finished) return null;
    if (!this.startedAt) this.startedAt = now;

    const word = this.word;
    let typed = value.slice(0, word.length + 4);
    const submit = !this.isLast && typed.endsWith(' ');
    if (submit) typed = typed.slice(0, -1);

    const wrong = !word.startsWith(typed);
    if (value.length > this.prev.length) {
      this.keys++;
      if (wrong) {
        this.misses++;
        const expected = word[this.matched(typed)]?.toLowerCase();
        if (expected) this.missedChars[expected] = (this.missedChars[expected] || 0) + 1;
        const plain = word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        if (plain) this.missedWords[plain] = (this.missedWords[plain] || 0) + 1;
      }
    }
    if (submit && !wrong && typed !== word) this.misses++;

    if (typed === word && (submit || this.isLast)) {
      this.committed += word.length + (this.isLast ? 0 : 1);
      this.index++;
      this.prev = '';
      if (this.finished) this.endedAt = now;
      return { typed: '', wrong: false, advanced: true };
    }

    this.prev = typed;
    return { typed, wrong, advanced: false };
  }

  chars() {
    return this.committed + (this.finished ? 0 : this.matched(this.prev));
  }

  elapsed(now = performance.now()) {
    if (!this.startedAt) return 0;
    return ((this.endedAt || now) - this.startedAt) / 1000;
  }

  cpm(now) {
    const secs = this.elapsed(now);
    return secs > 0 ? Math.round(this.chars() / (secs / 60)) : 0;
  }

  accuracy() {
    return this.keys ? Math.round(((this.keys - this.misses) / this.keys) * 100) : 100;
  }
}

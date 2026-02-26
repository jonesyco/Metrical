type WordTS = { word: string; start: number; end: number };

export type Phrase = {
    start: number;
    end: number;
    words: WordTS[];
};

export type PhrasingMetrics = {
    barStartStrength: number; // 0-100
    barEndControl: number;    // 0-100
    cadenceDrift: number;     // negative=rushing, positive=dragging (beats per bar)
    avgPhraseBeats: number;
    pausesOnBeat1: number;
    pausesOnBeat4: number;
};

export function detectPhrases(words: WordTS[], pauseMs = 650): Phrase[] {
    if (!words.length) return [];
    const pauseSec = pauseMs / 1000;

    const phrases: Phrase[] = [];
    let cur: Phrase = { start: words[0].start, end: words[0].end, words: [words[0]] };

    for (let i = 1; i < words.length; i++) {
        const gap = words[i].start - words[i - 1].end;
        if (gap > pauseSec) {
            phrases.push(cur);
            cur = { start: words[i].start, end: words[i].end, words: [words[i]] };
        } else {
            cur.words.push(words[i]);
            cur.end = words[i].end;
        }
    }
    phrases.push(cur);
    return phrases;
}

export function analyzePhrasing(params: {
    bpm: number;
    durationSec: number;
    words: WordTS[];
    sessionStartSec: number; // 0 for transcript-relative time
}): { phrases: Phrase[]; metrics: PhrasingMetrics } {
    const { bpm, durationSec, words, sessionStartSec } = params;

    const spb = 60 / bpm;
    const barDur = spb * 4;

    const phrases = detectPhrases(words);

    // Helper: offset within bar in beats (0..4)
    function beatOffset(t: number) {
        const rel = Math.max(0, t - sessionStartSec);
        const barStart = Math.floor(rel / barDur) * barDur;
        const within = rel - barStart;
        return within / spb; // beats
    }

    // Bar start strength: phrase starts within first 0.6 beats
    const starts = phrases.map((p) => beatOffset(p.start));
    const startGood = starts.filter((o) => o >= 0 && o <= 0.6).length;
    const barStartStrength = starts.length ? Math.round((startGood / starts.length) * 100) : 0;

    // Bar end control: phrase endings near beat 4 (3.4..4.1) OR before 3.6 with clear landing
    const ends = phrases.map((p) => beatOffset(p.end));
    const endGood = ends.filter((o) => o >= 3.2 && o <= 4.2).length;
    const barEndControl = ends.length ? Math.round((endGood / ends.length) * 100) : 0;

    // Cadence drift: linear trend of phrase start offsets over bars
    // Simple approach: compute avg start offset per bar, then slope.
    const bars = Math.max(1, Math.ceil(durationSec / barDur));
    const perBar: number[] = [];
    for (let b = 0; b < bars; b++) {
        const bStart = sessionStartSec + b * barDur;
        const bEnd = bStart + barDur;
        const inBar = phrases.filter((p) => p.start >= bStart && p.start < bEnd).map((p) => beatOffset(p.start));
        perBar.push(inBar.length ? inBar.reduce((a, c) => a + c, 0) / inBar.length : 0);
    }
    // slope (beats per bar)
    const n = perBar.length;
    const xs = [...Array(n)].map((_, i) => i);
    const xMean = xs.reduce((a, c) => a + c, 0) / n;
    const yMean = perBar.reduce((a, c) => a + c, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
        num += (xs[i] - xMean) * (perBar[i] - yMean);
        den += (xs[i] - xMean) * (xs[i] - xMean);
    }
    const cadenceDrift = den ? num / den : 0;

    // Avg phrase length in beats
    const phraseBeats = phrases.map((p) => (p.end - p.start) / spb);
    const avgPhraseBeats = phraseBeats.length ? phraseBeats.reduce((a, c) => a + c, 0) / phraseBeats.length : 0;

    // Pause placement: approximate using gaps between phrases
    let pausesOnBeat1 = 0;
    let pausesOnBeat4 = 0;
    for (let i = 1; i < phrases.length; i++) {
        const gapStart = phrases[i - 1].end;
        const gapEnd = phrases[i].start;
        const gap = gapEnd - gapStart;
        if (gap < 0.6) continue; // ignore tiny gaps

        const o = beatOffset(gapStart);
        if (o >= 0 && o <= 1.0) pausesOnBeat1++;
        if (o >= 3.0 && o <= 4.2) pausesOnBeat4++;
    }

    return {
        phrases,
        metrics: {
            barStartStrength,
            barEndControl,
            cadenceDrift,
            avgPhraseBeats,
            pausesOnBeat1,
            pausesOnBeat4,
        },
    };
}
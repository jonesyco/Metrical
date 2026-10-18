export type TimedWord = { word: string; start: number; end: number };

export type RhymeMetrics = {
    contentWords: number;
    rhymingWords: number;
    rhymeDensity: number;   // 0-1, share of content words that rhyme with a nearby word
    chains: string[][];     // groups of distinct words sharing a rhyme sound, largest first
    endRhymeRate: number | null; // 0-1, bar-final words rhyming with the previous bar's; null without timing
};

// Too common to count as deliberate rhymes.
const STOPWORDS = new Set([
    "a", "an", "the", "i", "im", "me", "my", "you", "your", "we", "he", "she", "it", "its",
    "they", "them", "to", "of", "in", "on", "at", "for", "and", "but", "or", "so", "is",
    "are", "was", "be", "do", "go", "no", "yeah", "uh", "um", "like", "just", "that", "this",
]);

// Spellings that sound alike at the end of a word.
const ENDING_ALIASES: [RegExp, string][] = [
    [/ight$/, "ite"],
    [/igh$/, "y"],
    [/ie$/, "y"],
    [/ee$/, "ey"],
    [/ea$/, "ey"],
    [/ay$/, "ey"],
    [/ou$/, "oo"],
    [/ew$/, "oo"],
    [/ue$/, "oo"],
    [/ck$/, "k"],
    [/ph/, "f"],
    // "beat"/"street", "dream"/"seem", "deal"/"feel"
    [/ea([tmnklps])$/, "ee$1"],
    // Consonant-y-consonant sounds like "i": "rhyme" ~ "time"
    [/(?<=[^aeiou])y(?=[^aeiouy])/g, "i"],
];

function normalize(word: string): string {
    return word.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Spelling-based approximation of a word's rhyme sound: the last vowel group
 * and everything after it (with a silent final "e" pulling in the previous
 * vowel, e.g. "time" -> "ime"). Good enough to spot most end and internal
 * rhymes without a pronunciation dictionary.
 */
export function rhymeKey(word: string): string | null {
    let w = normalize(word);
    if (w.length < 2) return null;
    // Plural/verb "s" rarely changes the rhyme: "nights" ~ "lights" ~ "night".
    if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
    for (const [re, rep] of ENDING_ALIASES) w = w.replace(re, rep);

    const vowel = /[aeiouy]/;
    let i = w.length - 1;
    // Silent final e after a consonant ("time", "flame").
    if (w.endsWith("e") && w.length > 2 && !vowel.test(w[w.length - 2])) i = w.length - 3;

    while (i >= 0 && !vowel.test(w[i])) i--;
    if (i < 0) return null;
    while (i > 0 && vowel.test(w[i - 1])) i--;

    const key = w.slice(i);
    return key.length >= 2 ? key : null;
}

export function analyzeRhymes(params: {
    words: TimedWord[];
    bpm?: number;
    beatsPerBar?: number;
    windowWords?: number;
}): RhymeMetrics {
    const { words, bpm, beatsPerBar = 4, windowWords = 8 } = params;

    const content = words
        .map((w) => ({ ...w, norm: normalize(w.word), key: rhymeKey(w.word) }))
        .filter((w) => w.norm && !STOPWORDS.has(w.norm));

    // A word rhymes if a *different* word with the same key is within the window.
    const rhyming = new Set<number>();
    for (let i = 0; i < content.length; i++) {
        for (let j = i + 1; j < Math.min(content.length, i + 1 + windowWords); j++) {
            const a = content[i];
            const b = content[j];
            if (a.key && a.key === b.key && a.norm !== b.norm) {
                rhyming.add(i);
                rhyming.add(j);
            }
        }
    }

    const byKey = new Map<string, Set<string>>();
    for (const i of rhyming) {
        const { key, norm } = content[i];
        if (!key) continue;
        if (!byKey.has(key)) byKey.set(key, new Set());
        byKey.get(key)!.add(norm);
    }
    const chains = [...byKey.values()]
        .map((s) => [...s])
        .filter((c) => c.length >= 2)
        .sort((a, b) => b.length - a.length);

    let endRhymeRate: number | null = null;
    if (bpm && content.length) {
        const barDur = (60 / bpm) * beatsPerBar;
        const lastInBar = new Map<number, (typeof content)[number]>();
        for (const w of content) lastInBar.set(Math.floor(w.start / barDur), w);
        const bars = [...lastInBar.keys()].sort((a, b) => a - b);
        let pairs = 0;
        let rhymes = 0;
        for (let k = 1; k < bars.length; k++) {
            if (bars[k] !== bars[k - 1] + 1) continue;
            pairs++;
            const prev = lastInBar.get(bars[k - 1])!;
            const cur = lastInBar.get(bars[k])!;
            if (prev.key && prev.key === cur.key && prev.norm !== cur.norm) rhymes++;
        }
        endRhymeRate = pairs ? Math.round((rhymes / pairs) * 100) / 100 : null;
    }

    return {
        contentWords: content.length,
        rhymingWords: rhyming.size,
        rhymeDensity: content.length ? Math.round((rhyming.size / content.length) * 100) / 100 : 0,
        chains,
        endRhymeRate,
    };
}

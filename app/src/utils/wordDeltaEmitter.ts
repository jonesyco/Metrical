/**
 * The live ASR returns the transcript of a sliding audio window, so each
 * partial starts somewhere inside the previous one. Emit only the words that
 * come after the overlap with the previous partial.
 */
export function makeWordDeltaEmitter(onWord: (w: string) => void) {
    let lastTokens: string[] = [];

    return (partialText: string) => {
        const tokens = tokenize(partialText);
        if (!tokens.length) return;

        for (const w of newTokensAfterOverlap(lastTokens, tokens)) onWord(w);
        lastTokens = tokens;
    };
}

export function tokenize(text: string): string[] {
    return text
        .trim()
        .split(/\s+/)
        .map((t) => t.replace(/[^\w'-]/g, ""))
        .filter(Boolean);
}

export function newTokensAfterOverlap(prev: string[], next: string[]): string[] {
    if (!prev.length) return next;

    const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
    // A single shared word ("the", "I") is too weak to prove overlap.
    const minRun = Math.min(2, prev.length);

    let bestLen = 0;
    let bestEnd = 0;

    // The final word of the previous window is often cut off and revised
    // ("bea" -> "beat"), so also try anchoring one word earlier.
    for (const prevEnd of [prev.length, prev.length - 1]) {
        if (prevEnd < minRun) continue;
        for (let j = 0; j < next.length; j++) {
            let k = 0;
            while (k <= j && k < prevEnd && eq(next[j - k], prev[prevEnd - 1 - k])) k++;
            if (k >= minRun && (k > bestLen || (k === bestLen && j + 1 > bestEnd))) {
                bestLen = k;
                bestEnd = j + 1;
            }
        }
        if (bestLen) break;
    }

    return bestLen ? next.slice(bestEnd) : next;
}

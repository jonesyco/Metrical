export type TimedWord = {
    word: string;
    start: number;
    end: number;
};

export type PhraseSegment = {
    startSec: number;
    endSec: number;
    words: TimedWord[];
};

type SegmentPhrasesArgs = {
    words: TimedWord[];
    pauseThresholdSec?: number;
};

export function segmentPhrases({
    words,
    pauseThresholdSec = 0.45,
}: SegmentPhrasesArgs): PhraseSegment[] {
    if (!words.length) return [];

    const phrases: PhraseSegment[] = [];
    let current: TimedWord[] = [words[0]];

    for (let i = 1; i < words.length; i++) {
        const prev = words[i - 1];
        const next = words[i];
        const gap = next.start - prev.end;

        if (gap >= pauseThresholdSec) {
            phrases.push({
                startSec: current[0].start,
                endSec: current[current.length - 1].end,
                words: current,
            });
            current = [next];
        } else {
            current.push(next);
        }
    }

    phrases.push({
        startSec: current[0].start,
        endSec: current[current.length - 1].end,
        words: current,
    });

    return phrases;
}
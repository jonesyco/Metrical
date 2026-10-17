export function beatDurationSec(bpm: number): number {
    return 60 / bpm;
}

export function nearestBeatOffsetSec(timeSec: number, bpm: number): number {
    const beat = beatDurationSec(bpm);
    const nearest = Math.round(timeSec / beat) * beat;
    return timeSec - nearest;
}

export function currentBarEndOffsetSec(
    timeSec: number,
    bpm: number,
    beatsPerBar = 4
): number {
    const barDuration = beatDurationSec(bpm) * beatsPerBar;
    const remainder = timeSec % barDuration;
    const epsilon = 1e-6;

    if (Math.abs(remainder) < epsilon) {
        return 0;
    }

    return remainder - barDuration;
}

export function clampScore100(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)));
}

type ScorePhraseTimingArgs = {
    phraseStarts: number[];
    phraseEnds: number[];
    bpm: number;
    beatsPerBar?: number;
};

export function scorePhraseTiming({
    phraseStarts,
    phraseEnds,
    bpm,
    beatsPerBar = 4,
}: ScorePhraseTimingArgs) {
    if (!phraseStarts.length || !phraseEnds.length) {
        return {
            phraseStartAccuracy: 0,
            phraseEndAccuracy: 0,
            cadenceStability: 0,
        };
    }

    const startOffsetsMs = phraseStarts.map((t) =>
        Math.abs(nearestBeatOffsetSec(t, bpm) * 1000)
    );

    const endOffsetsMs = phraseEnds.map((t) =>
        Math.abs(currentBarEndOffsetSec(t, bpm, beatsPerBar) * 1000)
    );

    const avgStartOffset = average(startOffsetsMs);
    const avgEndOffset = average(endOffsetsMs);
    const startVariance = stddev(startOffsetsMs);

    return {
        phraseStartAccuracy: clampScore100(100 - avgStartOffset / 3),
        phraseEndAccuracy: clampScore100(100 - avgEndOffset / 3),
        cadenceStability: clampScore100(100 - startVariance / 2.5),
    };
}

function average(values: number[]): number {
    if (!values.length) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
    if (values.length <= 1) return 0;
    const avg = average(values);
    const variance =
        values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}
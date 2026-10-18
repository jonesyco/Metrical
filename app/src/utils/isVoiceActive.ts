export function isVoiceActive(data: Uint8Array, threshold = 12): boolean {
    let sum = 0;

    for (let i = 0; i < data.length; i++) {
        sum += Math.abs(data[i] - 128);
    }

    const avg = sum / data.length;
    return avg > threshold;
}
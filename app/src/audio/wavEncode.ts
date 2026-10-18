const TARGET_RATE = 16000;

/** Mono PCM16 WAV bytes for `samples` (floats in -1..1). */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const dataSize = samples.length * 2;
    const buf = new ArrayBuffer(44 + dataSize);
    const v = new DataView(buf);

    const writeStr = (offset: number, s: string) => {
        for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
    };

    writeStr(0, "RIFF");
    v.setUint32(4, 36 + dataSize, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    v.setUint32(16, 16, true);          // PCM fmt chunk size
    v.setUint16(20, 1, true);           // PCM
    v.setUint16(22, 1, true);           // mono
    v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * 2, true); // byte rate
    v.setUint16(32, 2, true);           // block align
    v.setUint16(34, 16, true);          // bits per sample
    writeStr(36, "data");
    v.setUint32(40, dataSize, true);

    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buf;
}

/**
 * Decodes a recorded take (webm/opus) and resamples it to the 16 kHz mono WAV
 * whisper.cpp expects, so the server doesn't need ffmpeg.
 */
export async function blobTo16kWav(blob: Blob): Promise<Blob> {
    const encoded = await blob.arrayBuffer();
    const decoded = await new OfflineAudioContext(1, 1, TARGET_RATE).decodeAudioData(encoded);

    const length = Math.ceil(decoded.duration * TARGET_RATE);
    const offline = new OfflineAudioContext(1, Math.max(1, length), TARGET_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded; // multi-channel input is downmixed by the 1-channel destination
    src.connect(offline.destination);
    src.start();

    const rendered = await offline.startRendering();
    return new Blob([encodeWavPcm16(rendered.getChannelData(0), TARGET_RATE)], { type: "audio/wav" });
}

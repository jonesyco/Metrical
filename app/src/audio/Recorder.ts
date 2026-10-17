export type RecordingResult = {
    blob: Blob;
    mimeType: string;
};

export async function startMic(): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
        audio: {
            // Echo cancellation keeps metronome bleed out of the onset detector;
            // noise suppression and AGC smear the attack envelope it relies on.
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: false,
        },
    });
}

export function recordStream(stream: MediaStream) {
    const mimeType =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : "audio/webm";

    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    function start() {
        recorder.start();
    }

    function stop(): Promise<RecordingResult> {
        return new Promise((resolve) => {
            recorder.onstop = () => {
                resolve({ blob: new Blob(chunks, { type: mimeType }), mimeType });
            };
            recorder.stop();
        });
    }

    return { start, stop, mimeType };
}
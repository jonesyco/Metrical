// --- Web Speech API typings (minimal MVP definitions) ---
interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;

    start(): void;
    stop(): void;

    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: Event) => void) | null;
    onend: (() => void) | null;
}

interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
    length: number;
    [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
    length: number;
    isFinal: boolean;
    [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
}

export type LiveSpeechHandle = {
    start: () => void;
    stop: () => void;
    isSupported: boolean;
};

type SpeechRecognitionCtor = new () => SpeechRecognition;

export function createLiveSpeech(params: {
    onWord: (word: string) => void;
}): LiveSpeechHandle {
    const SpeechRecognitionImpl =
        window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionImpl) {
        return { start: () => { }, stop: () => { }, isSupported: false };
    }

    const rec: SpeechRecognition = new (SpeechRecognitionImpl as SpeechRecognitionCtor)();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";



    let shouldRun = false;
    let running = false;

    // Token diff state
    let lastTokens: string[] = [];

    rec.onresult = (event: SpeechRecognitionEvent) => {
        console.log("SpeechRecognition RESULT EVENT");
        // Combine transcript from all results
        let full = "";
        for (let i = 0; i < event.results.length; i++) {
            const alt = event.results[i][0];
            if (alt?.transcript) full += alt.transcript;
            console.log("Transcript chunk:", full);
        }

        full = full.trim();
        if (!full) return;

        // Tokenize + clean
        const tokens = full
            .split(/\s+/)
            .map((t) => t.replace(/[^\w'-]/g, ""))
            .filter(Boolean);

        if (tokens.length === 0) return;

        // If recognizer revised earlier text, tokens can shrink/change.
        // Handle by finding how many leading tokens still match.
        let common = 0;
        while (
            common < lastTokens.length &&
            common < tokens.length &&
            lastTokens[common] === tokens[common]
        ) {
            common++;
        }

        // Emit any new tokens after the common prefix
        for (let i = common; i < tokens.length; i++) {
            params.onWord(tokens[i]);
        }

        lastTokens = tokens;
    };

    rec.onend = () => {
        running = false;
        if (shouldRun) {
            try { rec.start(); running = true; } catch { /* ignored */ }
        }
    };

    // // Auto-restart if the browser ends recognition mid-drill
    // rec.onend = () => {
    //     running = false;
    //     if (shouldRun) {
    //         try { rec.start(); } catch { /* ignored */ }
    //     }
    // };

    rec.onerror = () => {
        // Some browsers stop on no-speech; we can ignore for MVP
    };

    rec.onend = () => {
        running = false;
    };

    return {
        isSupported: true,
        start: () => {
            if (running) return;
            shouldRun = true;
            lastTokens = [];
            try { rec.start(); running = true; } catch { /* ignored */ }
        },
        stop: () => {
            shouldRun = false;
            if (!running) return;
            try { rec.stop(); } catch { /* ignored */ }
            running = false;
            lastTokens = [];
        },
    };
}
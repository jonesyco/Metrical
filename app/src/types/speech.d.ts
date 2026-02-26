export { };

declare global {
    interface Window {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
    }

    interface SpeechRecognitionConstructor {
        new(): SpeechRecognition;
    }
}
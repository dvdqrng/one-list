import AVFoundation
import Speech

/// Live dictation with Apple's speech recognition, on-device whenever the language supports it.
/// Publishes the running transcript and a 0…1 input level for the visualizer.
@Observable
final class SpeechDictation {
    private(set) var isListening = false
    private(set) var transcript = ""
    private(set) var level: Double = 0

    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    /// Starts listening. Returns an error message if dictation isn't possible.
    func start() async -> String? {
        guard await Self.authorize() else {
            return Self.permissionMessage
        }
        guard let recognizer = SFSpeechRecognizer(locale: .current) ?? SFSpeechRecognizer(), recognizer.isAvailable else {
            return "Speech recognition isn’t available for your language right now."
        }

        #if os(iOS)
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            return "The microphone couldn’t be started."
        }
        #endif

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.addsPunctuation = true
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        let sink = AudioSink(request: request) { [weak self] level in
            Task { @MainActor in self?.level = level }
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in sink.receive(buffer) }

        do {
            engine.prepare()
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            return "The microphone couldn’t be started."
        }

        transcript = ""
        self.request = request
        isListening = true
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            let text = result?.bestTranscription.formattedString
            let finished = error != nil || result?.isFinal == true
            Task { @MainActor in
                guard let self else { return }
                if let text { self.transcript = text }
                if finished { self.stop() }
            }
        }
        return nil
    }

    func stop() {
        guard isListening else { return }
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.finish()
        request = nil
        task = nil
        isListening = false
        level = 0
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        #endif
    }

    #if os(macOS)
    private static let permissionMessage = "Allow microphone and speech recognition for One List in System Settings › Privacy & Security."
    #else
    private static let permissionMessage = "Allow microphone and speech recognition for One List in Settings › Privacy & Security."
    #endif

    private static func authorize() async -> Bool {
        guard await AVCaptureDevice.requestAccess(for: .audio) else { return false }
        let status = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
        }
        return status == .authorized
    }
}

/// Runs on the audio thread: feeds buffers to the recognizer and measures the input level.
private final class AudioSink: @unchecked Sendable {
    private let request: SFSpeechAudioBufferRecognitionRequest
    private let onLevel: @Sendable (Double) -> Void

    init(request: SFSpeechAudioBufferRecognitionRequest, onLevel: @escaping @Sendable (Double) -> Void) {
        self.request = request
        self.onLevel = onLevel
    }

    func receive(_ buffer: AVAudioPCMBuffer) {
        request.append(buffer)
        guard let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return }
        var sum: Float = 0
        for i in 0..<Int(buffer.frameLength) { sum += samples[i] * samples[i] }
        let rms = sqrt(sum / Float(buffer.frameLength))
        let decibels = 20 * log10(max(rms, 0.000_01))
        onLevel(Double(max(0, min(1, (decibels + 50) / 50))))
    }
}

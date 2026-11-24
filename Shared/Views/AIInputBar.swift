import SwiftUI

/// Floating natural-language composer ("Add or update tasks in your own words…") with live, on-device
/// dictation. Return sends, ⌥Return inserts a line break.
struct AIInputBar: View {
    @Environment(AppStore.self) private var store
    @State private var dictation = SpeechDictation()
    /// The text that was there when dictation started; the live transcript is appended to it.
    @State private var textBeforeDictation = ""
    @State private var input = ""
    @State private var isProcessing = false
    @State private var feedback: (kind: FeedbackKind, message: String)?
    @State private var feedbackTask: Task<Void, Never>?
    @FocusState private var focused: Bool

    #if os(iOS)
    private static let control: CGFloat = 36 // touch target
    #else
    private static let control: CGFloat = 24
    #endif

    private var canSend: Bool { !input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isProcessing }

    var body: some View {
        VStack(spacing: 12) {
            if let feedback {
                FeedbackToast(kind: feedback.kind, message: feedback.message)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            HStack(alignment: .bottom, spacing: 12) {
                #if os(iOS)
                // iOS has no ⌘J: the composer closes here and gives the bottom bar back.
                Button {
                    if dictation.isListening { dictation.stop() }
                    store.showAIInput = false
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .frame(width: 32, height: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close AI Composer")
                #else
                Image(systemName: "sparkles")
                    .font(.system(size: 14))
                    .foregroundStyle(.tertiary)
                    .frame(height: 24)
                #endif
                TextField(dictation.isListening ? "Listening…" : "Add or update tasks in your own words…",
                          text: $input, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(1...8)
                    .focused($focused)
                    .disabled(isProcessing || dictation.isListening)
                    .onSubmit(submit)
                    .padding(.vertical, 4)

                Button(action: toggleRecording) {
                    Image(systemName: dictation.isListening ? "stop.circle.fill" : "mic")
                        .font(.system(size: 14))
                        .frame(width: Self.control, height: Self.control)
                        .foregroundStyle(dictation.isListening ? Color.red : Color.secondary)
                        .modifier(Pulse(active: dictation.isListening))
                }
                .buttonStyle(.borderless)
                .disabled(isProcessing)
                .help(dictation.isListening ? "Stop dictation" : "Dictate (on-device)")

                Button(action: submit) {
                    if isProcessing {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 24))
                            .frame(width: Self.control, height: Self.control)
                            .foregroundStyle(canSend ? Color.accentColor : Color.secondary.opacity(0.4))
                    }
                }
                .buttonStyle(.borderless)
                .disabled(!canSend)
                .keyboardShortcut(.return, modifiers: .command)
                .help("Send (Return)")
            }
            .padding(.leading, 16)
            .padding(.trailing, 10)
            .padding(.vertical, 10)
            .glassOrMaterial(in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .frame(maxWidth: 640)
        .padding(.horizontal, Metrics.listMargin)
        .padding(.bottom, 20)
        .background(alignment: .bottom) {
            if dictation.isListening { VoiceGlow(level: dictation.level) }
        }
        .onChange(of: dictation.transcript) { _, text in
            guard dictation.isListening, !text.isEmpty else { return }
            input = textBeforeDictation.isEmpty ? text : textBeforeDictation + " " + text
        }
        .animation(.snappy(duration: 0.2), value: feedback?.message)
        .onAppear { focused = true }
    }

    private func submit() {
        guard canSend else { return }
        guard store.settings.hasApiKey else {
            show(.warning, AppStore.missingKeyMessage, for: 5)
            return
        }
        if dictation.isListening { dictation.stop() }
        Haptics.tap()
        isProcessing = true
        feedback = nil
        Task {
            defer { isProcessing = false }
            do {
                if try await store.processText(input) {
                    Haptics.success()
                    input = ""
                } else {
                    show(.error, input.count > 500
                         ? "No actionable tasks found. Try highlighting specific action items."
                         : "No tasks detected. Try something like “buy milk” or “call dentist tomorrow”.", for: 5)
                }
            } catch {
                let message = error.localizedDescription
                show(message.contains("timed out") ? .warning : .error, message, for: 6)
            }
        }
    }

    private func toggleRecording() {
        Haptics.tap()
        if dictation.isListening {
            dictation.stop()
            focused = true
        } else {
            textBeforeDictation = input.trimmingCharacters(in: .whitespacesAndNewlines)
            Task {
                if let problem = await dictation.start() { show(.error, problem, for: 5) }
            }
        }
    }

    private func show(_ kind: FeedbackKind, _ message: String, for seconds: Double) {
        Haptics.warning()
        feedback = (kind, message)
        feedbackTask?.cancel()
        feedbackTask = Task {
            try? await Task.sleep(for: .seconds(seconds))
            if !Task.isCancelled { feedback = nil }
        }
    }
}

/// Soft accent glow rising from the bottom edge while dictating, following the input level.
private struct VoiceGlow: View {
    let level: Double

    var body: some View {
        let size = 500 + level * 500
        Circle()
            .fill(RadialGradient(colors: [Color.accentColor.opacity(0.45 + level * 0.3), Color.accentColor.opacity(0)],
                                 center: .center, startRadius: 0, endRadius: size / 2))
            .frame(width: size, height: size)
            .blur(radius: 30 + level * 20)
            .offset(y: size / 2)
            .animation(.easeOut(duration: 0.08), value: level)
            .allowsHitTesting(false)
            .frame(width: 0, height: 0, alignment: .bottom)
    }
}

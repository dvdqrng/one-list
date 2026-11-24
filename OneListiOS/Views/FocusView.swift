import SwiftUI

/// Full-screen, always-dark focus session, split in two: the orb with its controls, and the "Now" tasks
/// or distraction notes. iPhone portrait stacks them (orb on top); iPad and landscape put them side by
/// side. While typing on iPhone the orb half folds into a compact bar so the list gets the room above
/// the keyboard.
struct FocusView: View {
    @Environment(AppStore.self) private var store
    @Environment(FocusTimer.self) private var timer
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var tab: FocusPanel.Tab = .tasks
    @State private var isEditing = false

    var body: some View {
        GeometryReader { geo in
            let sideBySide = geo.size.width > geo.size.height && geo.size.width > 600
            ZStack(alignment: .top) {
                Color.black.ignoresSafeArea()

                if sideBySide {
                    HStack(spacing: 0) {
                        orbSide(height: geo.size.height, compact: false)
                            .frame(maxWidth: .infinity)
                        FocusPanel(tab: $tab, isEditing: $isEditing)
                            .frame(width: min(440, geo.size.width * 0.45))
                    }
                } else {
                    VStack(spacing: 0) {
                        if isEditing {
                            compactBar
                                .transition(.move(edge: .top).combined(with: .opacity))
                        } else {
                            orbSide(height: geo.size.height * 0.52, compact: true)
                                .frame(height: geo.size.height * 0.52)
                                .transition(.move(edge: .top).combined(with: .opacity))
                        }
                        FocusPanel(tab: $tab, isEditing: $isEditing)
                    }
                }

                if timer.isComplete && !isEditing {
                    Label("Time’s up — great focus session!", systemImage: "party.popper.fill")
                        .font(.headline)
                        .padding(.horizontal, 18).padding(.vertical, 10)
                        .glassOrMaterial(in: Capsule())
                        .modifier(Pulse())
                        .padding(.top, 64)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
        }
        .environment(\.colorScheme, .dark)
        .statusBarHidden(timer.isRunning && !isEditing)
        .animation(reduceMotion ? nil : .snappy(duration: 0.3), value: isEditing)
        .animation(.snappy(duration: 0.3), value: timer.isComplete)
        #if DEBUG
        .onAppear {
            let scene = ProcessInfo.processInfo.environment["ONE_LIST_SCENE"] ?? ""
            if scene.contains("notes") { tab = .notes }
        }
        #endif
    }

    /// Top bar, orb and controls, with the orb scaled to the space it gets.
    private func orbSide(height: CGFloat, compact: Bool) -> some View {
        // Top bar ~60, time ~40, controls ~80 + spacing.
        let room = height - (compact ? 230 : 300)
        let scale = min(1, max(0.45, room / FocusTimerDisplay.dialSize))
        return VStack(spacing: 0) {
            topBar
            Spacer(minLength: 8)
            orb(scale: scale)
            Spacer(minLength: 8)
            controls
                .padding(.bottom, compact ? 16 : 32)
        }
    }

    /// While typing (iPhone): a small orb, the time and pause, plus Done to put the keyboard away.
    private var compactBar: some View {
        HStack(spacing: 12) {
            FocusTimerDisplay(style: store.focusTimerStyle)
                .scaleEffect(40 / FocusTimerDisplay.dialSize)
                .frame(width: 40, height: 40)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            Text(timer.isComplete ? "Time’s up" : timer.formattedTime)
                .font(.system(size: 20, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .contentTransition(.numericText(countsDown: true))
            Spacer()
            if !timer.isComplete {
                Button {
                    Haptics.tap()
                    if timer.isRunning { timer.pause() } else { timer.resume() }
                } label: {
                    Image(systemName: timer.isRunning ? "pause.fill" : "play.fill")
                        .contentTransition(.symbolEffect(.replace))
                }
                .buttonStyle(FloatingButtonStyle(size: 44))
                .accessibilityLabel(timer.isRunning ? "Pause" : "Resume")
            }
            Button("Done") {
                Haptics.tap()
                UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
            }
            .buttonStyle(FloatingButtonStyle(size: 44, pill: true))
            .font(.system(size: 17, weight: .semibold))
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
    }

    // MARK: Top

    private var topBar: some View {
        @Bindable var store = store
        return HStack {
            Button {
                Haptics.tap()
                timer.isMinimized = true
            } label: {
                Image(systemName: "chevron.down")
            }
            .buttonStyle(FloatingButtonStyle(size: 44))
            .accessibilityLabel("Minimize")
            .accessibilityHint("The session keeps running on the Lock Screen and in the Dynamic Island")

            Spacer()

            Menu {
                Picker("Timer Style", selection: $store.focusTimerStyle) {
                    ForEach(FocusTimerStyle.allCases) { style in
                        Label(style.title, systemImage: style.symbol).tag(style)
                    }
                }
            } label: {
                Image(systemName: store.focusTimerStyle.symbol)
            }
            .buttonStyle(FloatingButtonStyle(size: 44))
            .accessibilityLabel("Timer Style")
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }

    // MARK: Orb

    private func orb(scale: CGFloat) -> some View {
        let style = store.focusTimerStyle
        // Styles without digits get the time underneath, small and quiet.
        let showsTime = style != .digits && style != .pieWithTime
        return VStack(spacing: 16 * scale) {
            FocusTimerDisplay(style: style)
                .scaleEffect(scale)
                .frame(height: FocusTimerDisplay.dialSize * scale + (style == .pieWithTime ? 36 : 0))
                .contentShape(Rectangle())
                .onTapGesture(perform: nextTimerStyle)
                .accessibilityAddTraits(.isButton)
                .accessibilityHint("Changes the timer style")
            if showsTime {
                Text(timer.formattedTime)
                    .font(.system(size: 22, weight: .regular, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .contentTransition(.numericText(countsDown: true))
                    .animation(.snappy, value: timer.timeRemaining)
            }
        }
    }

    // MARK: Controls

    @ViewBuilder private var controls: some View {
        if timer.isComplete {
            let hasNotes = !timer.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            HStack(spacing: 12) {
                Button(hasNotes ? "Turn Notes into Tasks" : "Done", action: finish)
                    .buttonStyle(FloatingButtonStyle(size: 52, pill: true))
                Button {
                    Haptics.thud()
                    timer.start(duration: timer.duration)
                } label: {
                    Label("Repeat", systemImage: "arrow.clockwise")
                }
                .buttonStyle(FloatingButtonStyle(prominent: true, size: 52, pill: true))
            }
            .font(.system(size: 17, weight: .semibold))
        } else {
            HStack(spacing: 28) {
                Button(action: finish) { Image(systemName: "stop.fill") }
                    .buttonStyle(FloatingButtonStyle(size: 56))
                    .accessibilityLabel("End Session")

                Button {
                    Haptics.tap()
                    if timer.isRunning { timer.pause() } else { timer.resume() }
                } label: {
                    Image(systemName: timer.isRunning ? "pause.fill" : "play.fill")
                        .contentTransition(.symbolEffect(.replace))
                }
                .buttonStyle(FloatingButtonStyle(prominent: true, size: 80))
                .accessibilityLabel(timer.isRunning ? "Pause" : "Resume")

                Button {
                    Haptics.tap()
                    timer.extend(by: 300)
                } label: {
                    Text("+5").font(.system(size: 18, weight: .semibold, design: .rounded))
                }
                .buttonStyle(FloatingButtonStyle(size: 56))
                .accessibilityLabel("Add 5 Minutes")
            }
        }
    }

    // MARK: Actions

    private func nextTimerStyle() {
        Haptics.select()
        let all = FocusTimerStyle.allCases
        let next = all[((all.firstIndex(of: store.focusTimerStyle) ?? 0) + 1) % all.count]
        withAnimation(.smooth(duration: 0.35)) { store.focusTimerStyle = next }
    }

    /// Leaves focus mode; distraction notes go to the AI review as proposed tasks (without a Jev key, every
    /// line simply becomes a task in "Now").
    private func finish() {
        Haptics.thud()
        let notes = timer.notes.trimmingCharacters(in: .whitespacesAndNewlines)
        timer.notes = ""
        timer.end()
        guard !notes.isEmpty else { return }
        Task {
            if store.settings.hasApiKey {
                _ = try? await store.processText(notes, fromFocusNotes: true)
            } else {
                for line in PastedLine.parse(notes) {
                    _ = store.addItem { item in
                        item.title = line.text
                        item.isNow = true
                    }
                }
            }
        }
    }
}

/// The running session while the focus screen is minimized: floats above the bottom bar, tap to return.
struct FocusPill: View {
    @Environment(AppStore.self) private var store
    @Environment(FocusTimer.self) private var timer

    var body: some View {
        HStack(spacing: 12) {
            Button {
                Haptics.tap()
                timer.isMinimized = false
            } label: {
                HStack(spacing: 12) {
                    ProgressView(value: timer.progress(at: .now))
                        .progressViewStyle(.circular)
                        .tint(timer.isComplete ? .green : .accentColor)
                        .frame(width: 24, height: 24)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(timer.isComplete ? "Time’s up" : timer.formattedTime)
                            .font(.system(size: 17, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .contentTransition(.numericText(countsDown: true))
                        if let task = store.focusTasks.first(where: { !$0.completed }) {
                            Text(task.title.isEmpty ? "Untitled" : task.title)
                                .font(.system(size: 13))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Focus session, \(timer.formattedTime) left")
            .accessibilityHint("Opens the focus screen")

            if !timer.isComplete {
                Button {
                    Haptics.tap()
                    if timer.isRunning { timer.pause() } else { timer.resume() }
                } label: {
                    Image(systemName: timer.isRunning ? "pause.fill" : "play.fill")
                        .contentTransition(.symbolEffect(.replace))
                }
                .buttonStyle(FloatingButtonStyle(prominent: true, size: 40))
                .accessibilityLabel(timer.isRunning ? "Pause" : "Resume")
            }
        }
        .padding(.leading, 16)
        .padding(.trailing, 6)
        .padding(.vertical, 6)
        .glassOrMaterial(in: Capsule())
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }
}

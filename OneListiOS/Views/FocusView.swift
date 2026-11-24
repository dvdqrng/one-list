import SwiftUI

/// Full-screen, always-dark focus session. The orb is the centerpiece, with floating controls around it.
/// Tasks and notes live in a persistent bottom sheet (as in Maps or Music): collapsed to a segmented
/// Tasks / Notes header by default, pulled up to half height to work alongside the orb, and full height
/// while typing, so the keyboard never covers what's being edited.
struct FocusView: View {
    @Environment(AppStore.self) private var store
    @Environment(FocusTimer.self) private var timer
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var showsPanel = true
    @State private var tab: FocusPanel.Tab = .tasks
    @State private var detent: PresentationDetent = FocusPanel.collapsed
    @State private var panelHeight: CGFloat = FocusPanel.collapsedHeight

    /// The orb shrinks when the sheet is pulled up, so it and the controls stay visible above it.
    private var isPanelRaised: Bool { panelHeight > FocusPanel.collapsedHeight + 60 }

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                topBar
                Spacer(minLength: 12)
                orb
                Spacer(minLength: 12)
                controls
                    .padding(.bottom, 24)
            }
            .frame(maxWidth: 600)
            .frame(maxWidth: .infinity)
            // Make room for the sheet (its height includes the bottom safe area this view already avoids).
            .padding(.bottom, max(0, panelHeight - 20))

            if timer.isComplete {
                Label("Time’s up — great focus session!", systemImage: "party.popper.fill")
                    .font(.headline)
                    .padding(.horizontal, 18).padding(.vertical, 10)
                    .glassOrMaterial(in: Capsule())
                    .modifier(Pulse())
                    .padding(.top, 64)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .environment(\.colorScheme, .dark)
        .statusBarHidden(timer.isRunning && !isPanelRaised)
        .animation(reduceMotion ? nil : .snappy(duration: 0.3), value: isPanelRaised)
        .animation(.snappy(duration: 0.3), value: timer.isComplete)
        .sheet(isPresented: $showsPanel) {
            FocusPanel(tab: $tab, detent: $detent)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { panelHeight = $0 }
                .presentationDetents([FocusPanel.collapsed, .medium, .large], selection: $detent)
                .presentationBackgroundInteraction(.enabled(upThrough: .medium))
                .presentationContentInteraction(.scrolls)
                .presentationDragIndicator(.visible)
                .interactiveDismissDisabled()
                .preferredColorScheme(.dark)
        }
        #if DEBUG
        .onAppear {
            let scene = ProcessInfo.processInfo.environment["ONE_LIST_SCENE"] ?? ""
            if scene.contains("panel") { detent = .medium }
            if scene.contains("notes") { tab = .notes }
        }
        #endif
    }

    /// Takes the sheet down with the focus screen.
    private func leave(_ action: () -> Void) {
        showsPanel = false
        action()
    }

    // MARK: Top

    private var topBar: some View {
        @Bindable var store = store
        return HStack {
            Button {
                Haptics.tap()
                leave { timer.isMinimized = true }
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

    private var orb: some View {
        let style = store.focusTimerStyle
        // Styles without digits get the time underneath, small and quiet.
        let showsTime = style != .digits && style != .pieWithTime
        let scale = isPanelRaised ? 0.55 : 1.0
        return VStack(spacing: 20 * scale) {
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
        leave { timer.end() }
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

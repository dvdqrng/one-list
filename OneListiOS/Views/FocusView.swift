import SwiftUI

/// Full-screen, always-dark focus session. The orb is the centerpiece; everything else floats around it
/// on glass: minimize and timer style at the top, the controls below the orb, and a panel at the bottom
/// with two tabs — the "Now" tasks and a scratchpad for distractions (turned into tasks afterwards).
/// The panel stays closed by default so nothing competes with the orb.
struct FocusView: View {
    @Environment(AppStore.self) private var store
    @Environment(FocusTimer.self) private var timer
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var tab: Tab = .tasks
    @State private var isPanelOpen = false
    @State private var newTaskTitle = ""
    @FocusState private var focusedField: Field?

    private enum Tab { case tasks, notes }
    private enum Field { case newTask, notes }

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                topBar
                Spacer(minLength: 12)
                orb
                Spacer(minLength: 12)
                controls
                    .padding(.bottom, 28)
                panel
            }
            .frame(maxWidth: 600)
            .frame(maxWidth: .infinity)

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
        .statusBarHidden(timer.isRunning && !isPanelOpen)
        .animation(reduceMotion ? nil : .snappy(duration: 0.3), value: isPanelOpen)
        .animation(.snappy(duration: 0.3), value: timer.isComplete)
    }

    // MARK: Top

    private var topBar: some View {
        @Bindable var store = store
        return HStack {
            Button {
                Haptics.tap()
                focusedField = nil
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

    private var orb: some View {
        let style = store.focusTimerStyle
        // Styles without digits get the time underneath, small and quiet.
        let showsTime = style != .digits && style != .pieWithTime
        let scale = isPanelOpen ? 0.6 : 1.0
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

    // MARK: Panel (Tasks / Notes)

    private var panel: some View {
        VStack(spacing: 0) {
            HStack(spacing: 4) {
                tabButton(.tasks, title: "Tasks", count: store.focusTasks.filter { !$0.completed }.count)
                tabButton(.notes, title: "Notes", count: nil)
                Spacer()
                if isPanelOpen {
                    if tab == .tasks { filterMenu }
                    Button {
                        Haptics.select()
                        focusedField = nil
                        isPanelOpen = false
                    } label: {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 15, weight: .semibold))
                            .frame(width: 44, height: 44)
                    }
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Close Panel")
                }
            }

            if isPanelOpen {
                Group {
                    switch tab {
                    case .tasks: tasks
                    case .notes: notes
                    }
                }
                .frame(height: 300)
                .transition(.opacity)
            }
        }
        .padding(8)
        .glassOrMaterial(in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }

    private func tabButton(_ value: Tab, title: String, count: Int?) -> some View {
        let selected = isPanelOpen && tab == value
        return Button {
            Haptics.select()
            if selected {
                isPanelOpen = false
                focusedField = nil
            } else {
                tab = value
                isPanelOpen = true
            }
        } label: {
            HStack(spacing: 6) {
                Text(title)
                if let count, count > 0 {
                    Text("\(count)").monospacedDigit().foregroundStyle(.secondary)
                }
                if value == .notes && !timer.notes.isEmpty {
                    Circle().fill(Color.accentColor).frame(width: 6, height: 6)
                }
            }
            .font(.system(size: 15, weight: .semibold))
            .padding(.horizontal, 16)
            .frame(height: 44)
            .background(Capsule().fill(selected ? Color.white.opacity(0.14) : Color.clear))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var filterMenu: some View {
        @Bindable var store = store
        return Menu {
            Toggle("Show Earlier Completed Tasks", isOn: $store.focusShowCompleted)
            Toggle("Show Priority, Dates & Categories", isOn: $store.focusShowMetadata)
        } label: {
            Image(systemName: "line.3.horizontal.decrease.circle")
                .font(.system(size: 17))
                .frame(width: 44, height: 44)
        }
        .foregroundStyle(.secondary)
        .accessibilityLabel("View Options")
    }

    private var tasks: some View {
        let tasks = store.focusTasks
        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(tasks) { item in
                    TaskRowView(item: item, showMetadata: store.focusShowMetadata, onTap: {})
                }
                addTaskRow
                if tasks.isEmpty {
                    Text(store.nowTodos.isEmpty
                         ? "Add what you want to get done in this session."
                         : "Everything here is done. Earlier completed tasks are hidden.")
                        .font(.callout)
                        .foregroundStyle(.tertiary)
                        .padding(.leading, Metrics.checkbox + Metrics.checkboxGap)
                }
            }
            .padding(.horizontal, 12)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    /// Adds tasks straight to "Now"; stays focused so several can be added in a row.
    private var addTaskRow: some View {
        HStack(spacing: Metrics.checkboxGap) {
            Image(systemName: "plus")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.tertiary)
                .frame(width: Metrics.checkbox, height: Metrics.checkbox)
            TextField("Add a task", text: $newTaskTitle)
                .font(.system(size: Metrics.taskFont))
                .focused($focusedField, equals: .newTask)
                .submitLabel(.next)
                .onSubmit(addTask)
        }
        .frame(minHeight: Metrics.rowHeight)
        .contentShape(Rectangle())
        .onTapGesture { focusedField = .newTask }
    }

    private var notes: some View {
        @Bindable var timer = timer
        return TextEditor(text: $timer.notes)
            .font(.body)
            .focused($focusedField, equals: .notes)
            .scrollContentBackground(.hidden)
            .padding(.horizontal, 12)
            .overlay(alignment: .topLeading) {
                if timer.notes.isEmpty {
                    Text("Jot down anything that pops into your head — it becomes tasks afterwards.")
                        .foregroundStyle(.tertiary)
                        .padding(.horizontal, 17).padding(.vertical, 8)
                        .allowsHitTesting(false)
                }
            }
    }

    // MARK: Actions

    private func addTask() {
        let title = newTaskTitle.trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty else { return }
        Haptics.tap()
        withAnimation(.snappy(duration: 0.2)) {
            _ = store.addItem { item in
                item.title = title
                item.isNow = true
            }
        }
        newTaskTitle = ""
        focusedField = .newTask
    }

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
        focusedField = nil
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

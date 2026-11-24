import SwiftUI

/// Full-screen, always-dark focus session — the Mac's focus mode, stacked for a phone: the timer and its
/// controls, the "Now" tasks, and a scratchpad for distracting thoughts that become tasks afterwards.
struct FocusView: View {
    @Environment(AppStore.self) private var store
    @Environment(FocusTimer.self) private var timer
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var newTaskTitle = ""
    @FocusState private var focusedField: Field?

    private enum Field { case newTask, notes }

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 32) {
                    VStack(spacing: 20) {
                        FocusTimerDisplay(style: store.focusTimerStyle)
                            .contentShape(Rectangle())
                            .onTapGesture(perform: nextTimerStyle)
                            .accessibilityHint("Changes the timer style")
                        controls
                    }
                    .padding(.top, 40)

                    if sizeClass == .regular {
                        HStack(alignment: .top, spacing: 40) {
                            tasks
                            distractions
                        }
                    } else {
                        tasks
                        distractions
                    }
                }
                .frame(maxWidth: 900)
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)

            if timer.isComplete {
                Label("Time’s up — great focus session!", systemImage: "party.popper.fill")
                    .font(.headline)
                    .padding(.horizontal, 18).padding(.vertical, 10)
                    .glassOrMaterial(in: Capsule())
                    .modifier(Pulse())
                    .padding(.top, 8)
            }
        }
        .environment(\.colorScheme, .dark)
        .preferredColorScheme(.dark)
        .statusBarHidden(timer.isRunning)
    }

    // MARK: Tasks

    private var tasks: some View {
        @Bindable var store = store
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                SectionLabel("Focus Tasks").padding(.leading, -Metrics.rowPadding + 4)
                Spacer()
                Menu {
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
            let tasks = store.focusTasks
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
        .frame(maxWidth: .infinity, alignment: .leading)
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

    private func addTask() {
        let title = newTaskTitle.trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty else { return }
        withAnimation(.snappy(duration: 0.2)) {
            _ = store.addItem { item in
                item.title = title
                item.isNow = true
            }
        }
        newTaskTitle = ""
        focusedField = .newTask
    }

    // MARK: Distractions

    private var distractions: some View {
        @Bindable var timer = timer
        return VStack(alignment: .leading, spacing: 8) {
            SectionLabel("Distractions").padding(.leading, -Metrics.rowPadding + 4)
            TextEditor(text: $timer.notes)
                .font(.body)
                .focused($focusedField, equals: .notes)
                .scrollContentBackground(.hidden)
                .padding(12)
                .frame(minHeight: 180)
                .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: Metrics.cardCornerRadius, style: .continuous))
                .overlay(alignment: .topLeading) {
                    if timer.notes.isEmpty {
                        Text("Jot down anything that pops into your head — it becomes tasks afterwards.")
                            .foregroundStyle(.tertiary)
                            .padding(.horizontal, 17).padding(.vertical, 20)
                            .allowsHitTesting(false)
                    }
                }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Controls

    @ViewBuilder private var controls: some View {
        HStack(spacing: 12) {
            if timer.isComplete {
                let hasNotes = !timer.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                Button { timer.start(duration: timer.duration) } label: {
                    Label("Repeat", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.borderedProminent)

                Button(hasNotes ? "Turn Notes into Tasks" : "End Session", action: finish)
                    .buttonStyle(.bordered)
            } else {
                Button {
                    if timer.isRunning { timer.pause() } else { timer.resume() }
                } label: {
                    Label(timer.isRunning ? "Pause" : "Resume", systemImage: timer.isRunning ? "pause.fill" : "play.fill")
                }
                .buttonStyle(.borderedProminent)

                Button(role: .cancel, action: finish) { Label("End", systemImage: "stop.fill") }
                    .buttonStyle(.bordered)

                timerStyleMenu
            }
        }
        .controlSize(.large)
    }

    private var timerStyleMenu: some View {
        @Bindable var store = store
        return Menu {
            Picker("Timer Style", selection: $store.focusTimerStyle) {
                ForEach(FocusTimerStyle.allCases) { style in
                    Label(style.title, systemImage: style.symbol).tag(style)
                }
            }
        } label: {
            Image(systemName: store.focusTimerStyle.symbol)
                .frame(width: 22, height: 22)
        }
        .buttonStyle(.bordered)
        .accessibilityLabel("Timer Style")
    }

    private func nextTimerStyle() {
        let all = FocusTimerStyle.allCases
        let next = all[((all.firstIndex(of: store.focusTimerStyle) ?? 0) + 1) % all.count]
        withAnimation(.smooth(duration: 0.35)) { store.focusTimerStyle = next }
    }

    /// Leaves focus mode; distraction notes go to the AI composer's review as proposed tasks.
    private func finish() {
        let notes = timer.notes.trimmingCharacters(in: .whitespacesAndNewlines)
        timer.notes = ""
        timer.end()
        guard !notes.isEmpty else { return }
        Task {
            if store.settings.hasApiKey {
                _ = try? await store.processText(notes, fromFocusNotes: true)
            } else {
                // Without AI, every line simply becomes a task in "Now".
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

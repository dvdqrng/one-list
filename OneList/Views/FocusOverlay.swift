import SwiftUI

/// Full-window, always-dark focus session: timer and "Now" tasks on the left, a scratchpad for
/// distracting thoughts on the right (turned into tasks at the end).
struct FocusOverlay: View {
    @Environment(AppStore.self) private var store
    @Environment(FocusTimer.self) private var timer
    @State private var newTaskTitle = ""
    @FocusState private var isAddingTask: Bool

    var body: some View {
        @Bindable var timer = timer
        ZStack(alignment: .top) {
            Rectangle().fill(.background).ignoresSafeArea()

            HStack(alignment: .top, spacing: 56) {
                VStack(alignment: .leading, spacing: 40) {
                    VStack(spacing: 20) {
                        FocusTimerDisplay(style: store.focusTimerStyle)
                            .contentShape(Rectangle())
                            .onTapGesture(perform: nextTimerStyle)
                            .help("Click to change the timer style")
                        controls
                    }
                    .frame(maxWidth: .infinity)

                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            SectionLabel("Focus Tasks")
                            Spacer()
                            filterMenu
                        }
                        let tasks = store.focusTasks
                        ScrollView {
                            VStack(spacing: 0) {
                                ForEach(tasks) { item in
                                    TaskRow(item: item, editing: .readonly, showMetadata: store.focusShowMetadata, onSelect: {})
                                }
                                addTaskRow
                                if tasks.isEmpty {
                                    Text(store.nowTodos.isEmpty
                                         ? "Add what you want to get done in this session."
                                         : "Everything here is done. Earlier completed tasks are hidden.")
                                        .font(.callout)
                                        .foregroundStyle(.tertiary)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(.leading, Metrics.rowPadding + Metrics.checkbox + Metrics.checkboxGap)
                                        .padding(.top, 4)
                                }
                            }
                        }
                        .scrollIndicators(.never)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

                VStack(alignment: .leading, spacing: 8) {
                    SectionLabel("Distractions")
                    TextEditor(text: $timer.notes)
                        .font(.body)
                        .scrollContentBackground(.hidden)
                        .padding(16)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(alignment: .topLeading) {
                            if timer.notes.isEmpty {
                                Text("Jot down anything that pops into your head — it becomes tasks afterwards.")
                                    .foregroundStyle(.tertiary)
                                    .padding(.horizontal, 21).padding(.vertical, 16)
                                    .allowsHitTesting(false)
                            }
                        }
                }
            }
            .frame(maxWidth: 980, maxHeight: 680)
            .padding(48)
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            if timer.isComplete {
                Label("Time’s up — great focus session!", systemImage: "party.popper.fill")
                    .font(.headline)
                    .padding(.horizontal, 18).padding(.vertical, 10)
                    .glassOrMaterial(in: Capsule())
                    .modifier(Pulse())
                    .padding(.top, 24)
            }
        }
    }

    /// The same filters as the list's View Options menu, kept separately for focus mode.
    private var filterMenu: some View {
        @Bindable var store = store
        return Menu {
            Toggle("Show Earlier Completed Tasks", isOn: $store.focusShowCompleted)
            Toggle("Show Priority, Dates & Categories", isOn: $store.focusShowMetadata)
        } label: {
            Image(systemName: "line.3.horizontal.decrease.circle")
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .foregroundStyle(.secondary)
        .help("View Options")
    }

    /// Adds tasks straight to "Now". Stays focused, so several can be added in a row.
    private var addTaskRow: some View {
        HStack(spacing: Metrics.checkboxGap) {
            Image(systemName: "plus")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.tertiary)
                .frame(width: Metrics.checkbox, height: Metrics.checkbox)
            TextField("Add a task", text: $newTaskTitle)
                .textFieldStyle(.plain)
                .font(.system(size: Metrics.taskFont))
                .focused($isAddingTask)
                .onSubmit(addTask)
                .onExitCommand {
                    newTaskTitle = ""
                    isAddingTask = false
                }
        }
        .padding(.horizontal, Metrics.rowPadding)
        .padding(.vertical, 6)
        .frame(minHeight: Metrics.rowHeight - 12)
        .contentShape(Rectangle())
        .onTapGesture { isAddingTask = true }
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
        isAddingTask = true
    }

    private func nextTimerStyle() {
        let all = FocusTimerStyle.allCases
        let next = all[(all.firstIndex(of: store.focusTimerStyle)! + 1) % all.count]
        withAnimation(.smooth(duration: 0.35)) { store.focusTimerStyle = next }
    }

    private var timerStyleMenu: some View {
        @Bindable var store = store
        return Menu {
            Picker("Timer Style", selection: $store.focusTimerStyle) {
                ForEach(FocusTimerStyle.allCases) { style in
                    Label(style.title, systemImage: style.symbol).tag(style)
                }
            }
            .pickerStyle(.inline)
        } label: {
            Image(systemName: store.focusTimerStyle.symbol)
        }
        .menuStyle(.button)
        .menuIndicator(.hidden)
        .buttonStyle(.bordered)
        .fixedSize()
        .help("Timer Style")
    }

    @ViewBuilder private var controls: some View {
        HStack(spacing: 12) {
            if timer.isComplete {
                let hasNotes = !timer.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                // Another session of the same length; the distraction notes carry over.
                Button { timer.start(duration: timer.duration) } label: {
                    Label("Repeat", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
                .help("Start the next focus session (Return or ⌘R)")

                Button(hasNotes ? "Turn Notes into Tasks" : "End Session", action: finish)
                    .buttonStyle(.bordered)
            } else {
                Button {
                    if timer.isRunning { timer.pause() } else { timer.resume() }
                } label: {
                    Label(timer.isRunning ? "Pause" : "Resume", systemImage: timer.isRunning ? "pause.fill" : "play.fill")
                }
                .buttonStyle(.bordered)

                Button(role: .cancel) { timer.end() } label: { Label("End", systemImage: "stop.fill") }
                    .buttonStyle(.bordered)

                timerStyleMenu
            }
        }
        .controlSize(.large)
    }

    /// Turns distraction notes into proposed tasks, then leaves focus mode.
    private func finish() {
        let notes = timer.notes.trimmingCharacters(in: .whitespacesAndNewlines)
        timer.notes = ""
        timer.end()
        guard !notes.isEmpty else { return }
        Task { _ = try? await store.processText(notes, fromFocusNotes: true) }
    }
}

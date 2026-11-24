import SwiftUI

/// Settings: iCloud sync, appearance, focus timer and the Jev key — the Mac's Settings window plus sync.
struct SettingsScreen: View {
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @AppStorage("theme", store: Database.preferences) private var appearance = AppearancePreference.system.rawValue
    @State private var apiKey = ""
    @State private var revealKey = false
    @State private var isSyncing = false

    var body: some View {
        @Bindable var store = store
        let settings = store.settings
        NavigationStack {
            Form {
                SyncSection(isSyncing: $isSyncing)

                Section("Appearance") {
                    Picker("Appearance", selection: $appearance) {
                        ForEach(AppearancePreference.allCases) { Text($0.title).tag($0.rawValue) }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                }

                Section("Focus") {
                    Picker("Timer Style", selection: $store.focusTimerStyle) {
                        ForEach(FocusTimerStyle.allCases) { style in
                            Label(style.title, systemImage: style.symbol).tag(style)
                        }
                    }
                }

                Section {
                    HStack {
                        Group {
                            if revealKey { TextField("apikey_…", text: $apiKey) } else { SecureField("apikey_…", text: $apiKey) }
                        }
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textContentType(.password)
                        Button { revealKey.toggle() } label: {
                            Image(systemName: revealKey ? "eye.slash" : "eye")
                                .frame(width: 44, height: 44)
                        }
                        .buttonStyle(.borderless)
                        .foregroundStyle(.secondary)
                        .accessibilityLabel(revealKey ? "Hide key" : "Show key")
                    }
                    Toggle("Suggest Details for New Tasks", isOn: Binding(
                        get: { settings.autoSuggest }, set: { settings.setAutoSuggest($0); store.scheduleEnrichment() }))
                } header: {
                    Text("Jev API Key")
                } footer: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Jev makes the AI decisions — which tasks a note contains, what’s done, duplicates, and "
                             + "priority, due date and category suggestions — and never rewrites your text. The key "
                             + "stays in this device’s Keychain. Dictation runs on this device.")
                        Link("Get an API key", destination: URL(string: "https://console.typesafe.ai/keys")!)
                    }
                }

                Section {
                    LabeledContent("Version", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—")
                    Link("GitHub Repository", destination: URL(string: "https://github.com/dvdqrng/one-list")!)
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
        .onAppear { apiKey = settings.storedApiKey }
        .onChange(of: apiKey) {
            settings.setApiKey(apiKey)
            store.scheduleEnrichment()
        }
    }
}

/// iCloud status, shared wording with the Mac's Settings.
struct SyncSection: View {
    @Environment(AppStore.self) private var store
    @Binding var isSyncing: Bool

    var body: some View {
        let sync = store.sync
        Section {
            LabeledContent {
                Text(sync.status.title).foregroundStyle(.secondary)
            } label: {
                Label("iCloud Sync", systemImage: sync.status.symbol)
                    .symbolRenderingMode(.hierarchical)
            }
            if sync.status.isActive {
                Button {
                    isSyncing = true
                    Task {
                        await sync.syncNow()
                        isSyncing = false
                    }
                } label: {
                    HStack {
                        Text("Sync Now")
                        Spacer()
                        if isSyncing { ProgressView() }
                    }
                }
                .disabled(isSyncing)
            }
        } header: {
            Text("Sync")
        } footer: {
            if let detail = sync.status.detail {
                Text(detail)
            } else if let last = sync.lastSync {
                Text("Your list syncs instantly with your other devices signed in to the same iCloud account. Last synced \(last.formatted(.relative(presentation: .named))).")
            } else {
                Text("Your list syncs instantly with your other devices signed in to the same iCloud account.")
            }
        }
    }
}

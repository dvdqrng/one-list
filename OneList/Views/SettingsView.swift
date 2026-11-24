import SwiftUI

/// The Settings window (⌘,). Changes apply immediately.
struct SettingsView: View {
    @Environment(AppStore.self) private var store
    @AppStorage("theme", store: Database.preferences) private var appearance = AppearancePreference.system.rawValue
    @State private var apiKey = ""
    @State private var revealKey = false
    @State private var isSyncing = false

    var body: some View {
        let settings = store.settings
        let sync = store.sync
        Form {
            Section {
                LabeledContent {
                    HStack(spacing: 8) {
                        if isSyncing { ProgressView().controlSize(.small) }
                        Text(sync.status.title).foregroundStyle(.secondary)
                        if sync.status.isActive {
                            Button("Sync Now") {
                                isSyncing = true
                                Task {
                                    await sync.syncNow()
                                    isSyncing = false
                                }
                            }
                            .disabled(isSyncing)
                        }
                    }
                } label: {
                    Label("iCloud Sync", systemImage: sync.status.symbol)
                }
            } header: {
                Text("Sync")
            } footer: {
                Text(sync.status.detail ?? "Your list syncs instantly with your iPhone, iPad and other Macs signed in to the same iCloud account.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section {
                Picker("Appearance", selection: $appearance) {
                    ForEach(AppearancePreference.allCases) { Text($0.title).tag($0.rawValue) }
                }
                .pickerStyle(.segmented)
            }

            Section {
                LabeledContent("API Key") {
                    HStack {
                        Group {
                            if revealKey { TextField("apikey_…", text: $apiKey) } else { SecureField("apikey_…", text: $apiKey) }
                        }
                        .labelsHidden()
                        Button { revealKey.toggle() } label: { Image(systemName: revealKey ? "eye.slash" : "eye") }
                            .buttonStyle(.borderless)
                            .help(revealKey ? "Hide key" : "Show key")
                    }
                }
                Toggle("Suggest priority, due date and category for new tasks", isOn: Binding(
                    get: { settings.autoSuggest }, set: { settings.setAutoSuggest($0); store.scheduleEnrichment() }))
            } header: {
                Text("Jev")
            } footer: {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Jev makes the AI decisions (which tasks a note contains, what’s done, duplicates, suggestions) "
                         + "and never rewrites your text. The key is stored in your Keychain; TYPESAFE_API_KEY in the "
                         + "environment takes precedence. Dictation runs on this Mac.")
                    Link("Get an API key", destination: URL(string: "https://console.typesafe.ai/keys")!)
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(width: 520, height: 420)
        .onAppear { apiKey = settings.storedApiKey }
        .onChange(of: apiKey) {
            settings.setApiKey(apiKey)
            store.scheduleEnrichment()
        }
    }
}

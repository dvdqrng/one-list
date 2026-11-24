import SwiftUI

/// "Check for Updates…" sheet (compares with the latest GitHub release).
struct UpdateSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var checker = UpdateChecker()

    var body: some View {
        VStack(spacing: 16) {
            Image(nsImage: NSApp.applicationIconImage).resizable().frame(width: 64, height: 64)

            switch checker.status {
            case .idle, .checking:
                Text("Checking for Updates…").font(.headline)
                ProgressView().controlSize(.small)
            case .upToDate:
                Text("One List is up to date").font(.headline)
                Text("Version \(checker.currentVersion) is the latest version.").font(.callout).foregroundStyle(.secondary)
            case .available(let version, let notes, _):
                Text("Version \(version) is available").font(.headline)
                Text("You have version \(checker.currentVersion).").font(.callout).foregroundStyle(.secondary)
                if let notes, !notes.isEmpty {
                    ScrollView { Text(notes).font(.callout).frame(maxWidth: .infinity, alignment: .leading).textSelection(.enabled) }
                        .frame(height: 120)
                        .padding(8)
                        .background(.quaternary.opacity(0.4), in: RoundedRectangle(cornerRadius: 8))
                }
            case .error(let message):
                Text("Couldn’t Check for Updates").font(.headline)
                Text(message).font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }

            HStack {
                if case .error = checker.status {
                    Button("Try Again") { Task { await checker.check() } }
                }
                Spacer()
                if case .available(_, _, let url) = checker.status {
                    Button("Later") { dismiss() }.keyboardShortcut(.cancelAction)
                    Button("Download") { NSWorkspace.shared.open(url); dismiss() }.keyboardShortcut(.defaultAction)
                } else {
                    Button("OK") { dismiss() }.keyboardShortcut(.defaultAction)
                }
            }
        }
        .padding(24)
        .frame(width: 380)
        .task { await checker.check() }
    }
}

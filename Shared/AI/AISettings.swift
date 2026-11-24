import Foundation
import Security

/// AI configuration: the Jev (TypeSafe) API key in the Keychain, and whether new tasks get suggestions.
@Observable
final class AISettings {
    private(set) var storedApiKey: String
    /// Suggest priority, due date and category for new tasks in the background.
    private(set) var autoSuggest: Bool

    private static var isDevelopment: Bool { ProcessInfo.processInfo.environment["ONE_LIST_DATA_DIR"] != nil }
    private static let autoSuggestKey = "autoSuggest"
    private static let keychain = Keychain(account: isDevelopment ? "jev-api-key-dev" : "jev-api-key")

    init() {
        // Development runs can get a key for just that launch, never stored.
        let devKey = Self.isDevelopment ? ProcessInfo.processInfo.environment["ONE_LIST_DEV_JEV_KEY"] : nil
        storedApiKey = devKey ?? Self.keychain.read() ?? ""
        autoSuggest = Database.preferences.object(forKey: Self.autoSuggestKey) as? Bool ?? true
        Self.removeOpenAILeftovers()
    }

    /// `TYPESAFE_API_KEY` in the environment wins over the stored key — except in development runs
    /// (ONE_LIST_DATA_DIR), which only use their own key so tests never spend the real one.
    var apiKey: String {
        guard !Self.isDevelopment else { return storedApiKey }
        let env = ProcessInfo.processInfo.environment["TYPESAFE_API_KEY"] ?? ""
        return env.isEmpty ? storedApiKey : env
    }

    var hasApiKey: Bool { !apiKey.isEmpty }

    func setApiKey(_ value: String) {
        let key = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard key != storedApiKey else { return }
        Self.keychain.write(key)
        storedApiKey = key
    }

    func setAutoSuggest(_ value: Bool) {
        autoSuggest = value
        Database.preferences.set(value, forKey: Self.autoSuggestKey)
    }

    /// The app no longer uses OpenAI: forget the key it stored (Keychain + the old plain-text file).
    private static func removeOpenAILeftovers() {
        guard !isDevelopment else { return }
        Keychain(account: "openai-api-key").write("")
        try? FileManager.default.removeItem(at: Database.supportDirectory.appendingPathComponent("agent-config.json"))
    }
}

/// A generic-password Keychain item of this app.
private struct Keychain {
    let account: String

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "com.onelist.app",
         kSecAttrAccount as String: account]
    }

    func read() -> String? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func write(_ value: String) {
        SecItemDelete(query as CFDictionary)
        guard !value.isEmpty else { return }
        var item = query
        item[kSecValueData as String] = Data(value.utf8)
        SecItemAdd(item as CFDictionary, nil)
    }
}

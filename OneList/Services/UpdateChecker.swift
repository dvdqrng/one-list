import AppKit

/// Checks the GitHub releases of the repository for a newer version.
@Observable
final class UpdateChecker {
    enum Status: Equatable {
        case idle, checking, upToDate, error(String)
        case available(version: String, notes: String?, url: URL)
    }

    static let repository = URL(string: "https://github.com/dvdqrng/one-list")!
    private(set) var status: Status = .idle

    var currentVersion: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0" }

    func check() async {
        status = .checking
        do {
            var request = URLRequest(url: URL(string: "https://api.github.com/repos/dvdqrng/one-list/releases/latest")!)
            request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
            let (data, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode == 404 {
                status = .error("No published release found (the repository may be private).")
                return
            }
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let tag = json["tag_name"] as? String else {
                status = .error("Unexpected response from GitHub.")
                return
            }
            let latest = tag.trimmingCharacters(in: CharacterSet(charactersIn: "vV"))
            if latest.compare(currentVersion, options: .numeric) == .orderedDescending {
                let page = (json["html_url"] as? String).flatMap(URL.init(string:)) ?? Self.repository
                status = .available(version: latest, notes: json["body"] as? String, url: page)
            } else {
                status = .upToDate
            }
        } catch {
            status = .error(error.localizedDescription)
        }
    }
}

import Foundation

/// Minimal client for TypeSafe's System One API (model: Jev). One request = a `state` plus named
/// typed questions; every answer comes back with calibrated probabilities. See docs.typesafe.ai.
struct JevClient {
    let apiKey: String
    var model = "jev-latest"

    enum Question {
        /// Pick one option. `options` are (name, description); a nil description means "the name says it all".
        case choice(String, options: [(String, String?)])
        /// Probability that a statement is true.
        case noul(String)
    }

    struct Choice {
        var choice: String
        var confidence: Double
        var probabilities: [String: Double]
    }

    struct Answers {
        var choices: [String: Choice] = [:]
        var nouls: [String: Double] = [:]

        func choice(_ name: String) -> Choice? { choices[name] }
        func noul(_ name: String) -> Double { nouls[name] ?? 0 }
    }

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    func ask(state: [String: Any], questions: [String: Question]) async throws -> Answers {
        var encoded: [String: Any] = [:]
        for (name, question) in questions {
            switch question {
            case .choice(let instructions, let options):
                var criteria: [String: Any] = [:]
                for (option, description) in options { criteria[option] = description ?? NSNull() }
                encoded[name] = ["type": "choice", "instructions": instructions, "criteria": criteria]
            case .noul(let instructions):
                encoded[name] = ["type": "noul", "instructions": instructions]
            }
        }

        var request = URLRequest(url: URL(string: "https://api.typesafe.ai/v1/systemone")!)
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["model": model, "state": state, "questions": encoded])

        // Retry rate limits / overload with exponential backoff, as the docs recommend.
        var delay: Duration = .milliseconds(400)
        for attempt in 0..<4 {
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if (status == 429 || status == 529) && attempt < 3 {
                try await Task.sleep(for: delay)
                delay *= 2
                continue
            }
            let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
            guard (200..<300).contains(status) else {
                if status == 401 { throw Failure(message: "The Jev API key isn’t valid. Check it in Settings.") }
                let detail = json["detail"] as? String
                throw Failure(message: detail ?? "Jev request failed (HTTP \(status)).")
            }
            return Self.parse(json["answers"] as? [String: [String: Any]] ?? [:])
        }
        throw Failure(message: "Jev is busy right now. Please try again in a moment.")
    }

    private static func parse(_ raw: [String: [String: Any]]) -> Answers {
        var answers = Answers()
        for (name, answer) in raw {
            switch answer["type"] as? String {
            case "choice":
                answers.choices[name] = Choice(
                    choice: answer["choice"] as? String ?? "",
                    confidence: (answer["confidence"] as? NSNumber)?.doubleValue ?? 0,
                    probabilities: (answer["probabilities"] as? [String: NSNumber])?.mapValues(\.doubleValue) ?? [:])
            case "noul":
                answers.nouls[name] = (answer["noul"] as? NSNumber)?.doubleValue ?? 0
            default:
                break
            }
        }
        return answers
    }
}

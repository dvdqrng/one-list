import Foundation

/// The app's AI: narrow, typed decisions asked of Jev, combined in code. Nothing here generates text —
/// task titles always stay in the user's own words.
struct TaskIntelligence {
    let client: JevClient

    /// Below this confidence a decision isn't applied (or, in review, isn't preselected).
    static let threshold = 0.7

    /// Suggested metadata for a task.
    struct Suggestion: Equatable {
        var priority: Priority?
        var category: String?
        var dueDate: String?
    }

    // MARK: - Shared questions

    private static var today: Date { .now }

    private static var todayText: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "EEEE, d MMMM yyyy"
        return f.string(from: today)
    }

    /// Priority, date parts and (if any exist) category, for the text referred to as `subject`.
    private static func metadataQuestions(_ subject: String, prefix: String = "", categories: [String]) -> [String: JevClient.Question] {
        var questions: [String: JevClient.Question] = [
            prefix + "priority": .choice("How important or urgent is \(subject)?", options: [
                ("none", "Nothing in the text signals importance"),
                ("low", "Optional, low importance, whenever, someday"),
                ("medium", "Normal importance"),
                ("high", "Urgent, important, asap, critical, or with consequences if missed"),
            ]),
            prefix + "due": .choice("When is \(subject) due, as stated in the text?",
                                    options: DueAnchor.allCases.map { ($0.rawValue, $0.description) }),
            prefix + "weekday": .choice("If a day of the week is named as the deadline of \(subject), which one?",
                                        options: DueAnchor.weekdays.map { ($0, nil) } + [("none", "No weekday is named")]),
            prefix + "month": .choice("If \(subject) is due on a calendar date, in which month?",
                                      options: DueAnchor.months.map { ($0, nil) } + [("none", "No calendar date")]),
            prefix + "day": .choice("If \(subject) is due on a calendar date, which day of the month?",
                                    options: (1...31).map { ("\($0)", nil) } + [("none", "No calendar date")]),
        ]
        if !categories.isEmpty {
            questions[prefix + "category"] = .choice(
                "Which of these existing categories does \(subject) belong to? Choose 'none' unless one clearly fits.",
                options: categories.prefix(250).map { ($0, nil) } + [("none", "None of these categories fits")])
        }
        return questions
    }

    private static func suggestion(from answers: JevClient.Answers, prefix: String = "") -> Suggestion {
        func confident(_ name: String) -> String? {
            guard let answer = answers.choice(prefix + name), answer.confidence >= threshold, answer.choice != "none" else { return nil }
            return answer.choice
        }
        var result = Suggestion()
        result.priority = confident("priority").flatMap(Priority.init(rawValue:))
        result.category = confident("category")
        if let anchor = confident("due").flatMap(DueAnchor.init(rawValue:)) {
            result.dueDate = DueAnchor.resolve(anchor, weekday: confident("weekday"), month: confident("month"),
                                               day: confident("day"), today: today)
        }
        return result
    }

    // MARK: - Enrichment

    /// Priority, category and due date for one task, read from its title and notes.
    func suggest(for item: Item, categories: [String]) async throws -> Suggestion {
        var state: [String: Any] = ["task": item.title, "today": Self.todayText]
        if let details = item.details, !details.isEmpty { state["notes"] = details }
        let answers = try await client.ask(state: state, questions: Self.metadataQuestions("the task", categories: categories))
        return Self.suggestion(from: answers)
    }

    // MARK: - Notes → changes

    /// What a note means for the list: new tasks, and existing tasks it reports as done or rescheduled.
    func interpret(_ text: String, existing: [Item], categories: [String]) async throws -> [ProposedChange] {
        let sentences = Array(NoteParser.sentences(text).prefix(80))
        guard !sentences.isEmpty else { return [] }

        // Existing tasks as choice options, open ones first (a choice allows up to 255 options).
        let candidates = Array((existing.filter { !$0.completed } + existing.filter(\.completed))
            .filter { !$0.title.isEmpty }.prefix(250))
        var options: [(String, String?)] = candidates.enumerated().map { ("t\($0.offset)", $0.element.title) }
        options.append(("new", "None of the existing tasks; it is about something else"))
        let existingState = Dictionary(uniqueKeysWithValues: candidates.enumerated().map { ("t\($0.offset)", $0.element.title) })

        // Ten sentences per request keeps each request well inside the context limit; requests run in parallel.
        let chunks = stride(from: 0, to: sentences.count, by: 10).map { Array(sentences[$0..<min($0 + 10, sentences.count)]) }
        let requests = chunks.map { chunk in
            Task {
                var questions: [String: JevClient.Question] = [:]
                for (i, sentence) in chunk.enumerated() {
                    let quoted = "“\(sentence)”"
                    questions["task\(i)"] = .noul("The sentence \(quoted) states something someone needs to do or has done "
                                                  + "(an action item, a to-do, or the completion of a task), not just a remark.")
                    questions["ref\(i)"] = .choice("Which existing task is the sentence \(quoted) about?", options: options)
                    questions["done\(i)"] = .noul("The sentence \(quoted) says that this has already been done or completed.")
                    questions.merge(Self.metadataQuestions("the action in the sentence \(quoted)", prefix: "s\(i)_",
                                                           categories: categories)) { $1 }
                }
                let state: [String: Any] = ["note": text, "today": Self.todayText, "existing_tasks": existingState]
                return try await client.ask(state: state, questions: questions)
            }
        }
        var answered: [Int: JevClient.Answers] = [:]
        for (index, request) in requests.enumerated() { answered[index] = try await request.value }

        var changes: [ProposedChange] = []
        for (index, chunk) in chunks.enumerated() {
            guard let answers = answered[index] else { continue }
            for (i, sentence) in chunk.enumerated() {
                let isTask = answers.noul("task\(i)")
                guard isTask >= 0.5 else { continue }
                let done = answers.noul("done\(i)")
                let suggestion = Self.suggestion(from: answers, prefix: "s\(i)_")
                let reference = answers.choice("ref\(i)")

                if let reference, reference.choice != "new", reference.confidence >= 0.5,
                   let n = Int(reference.choice.dropFirst()), candidates.indices.contains(n) {
                    let item = candidates[n]
                    if done >= 0.6 {
                        guard !item.completed else { continue }
                        changes.append(ProposedChange(kind: .setCompleted(item, ItemUpdates(completed: true)),
                                                      reason: sentence, confidence: min(reference.confidence, done)))
                    } else {
                        var updates = ItemUpdates()
                        if let due = suggestion.dueDate, due != item.dueDate { updates.dueDate = due }
                        if let priority = suggestion.priority, priority != item.priority { updates.priority = priority }
                        guard !updates.isEmpty else { continue }
                        changes.append(ProposedChange(kind: .update(item, updates), reason: sentence,
                                                      confidence: reference.confidence))
                    }
                } else if done < 0.6 {
                    var item = Item()
                    item.title = NoteParser.taskTitle(sentence)
                    item.priority = suggestion.priority
                    item.dueDate = suggestion.dueDate
                    item.category = suggestion.category
                    item.aiStatus = .enhanced
                    changes.append(ProposedChange(kind: .add(item), reason: nil, confidence: isTask))
                }
            }
        }
        return changes
    }

    // MARK: - Duplicates

    /// Groups of open tasks that describe the same piece of work, each with a merged task.
    func findDuplicates(_ items: [Item]) async throws -> [SimilarGroup] {
        let tasks = Array(items.filter { !$0.completed && !$0.title.trimmingCharacters(in: .whitespaces).isEmpty }.prefix(200))
        guard tasks.count >= 2 else { return [] }
        let keys = tasks.indices.map { "t\($0)" }
        let titles = Dictionary(uniqueKeysWithValues: zip(keys, tasks.map(\.title)))

        // One question per task ("which other task is the same?"), 15 per request, requests in parallel.
        let batches = stride(from: 0, to: tasks.count, by: 15).map { Array($0..<min($0 + 15, tasks.count)) }
        let requests = batches.map { batch in
            Task {
                var questions: [String: JevClient.Question] = [:]
                for i in batch {
                    let others: [(String, String?)] = tasks.indices.filter { $0 != i }.map { (keys[$0], tasks[$0].title) }
                    questions[keys[i]] = .choice(
                        "Which other task describes the same piece of work as “\(tasks[i].title)”? "
                            + "Choose 'none' unless both would be done by the same action.",
                        options: others + [("none", "No other task is the same")])
                }
                let answers = try await client.ask(state: ["tasks": titles], questions: questions)
                return batch.compactMap { i -> Edge? in
                    guard let answer = answers.choice(keys[i]), answer.choice != "none",
                          let j = keys.firstIndex(of: answer.choice),
                          let p = answer.probabilities[answer.choice], p >= Self.threshold else { return nil }
                    return Edge(from: i, to: j, probability: p)
                }
            }
        }
        var edges: [Edge] = []
        for request in requests { edges += try await request.value }

        // Union the pairs into groups.
        var parent = Array(tasks.indices)
        func root(_ i: Int) -> Int { parent[i] == i ? i : root(parent[i]) }
        for edge in edges where root(edge.from) != root(edge.to) { parent[root(edge.to)] = root(edge.from) }
        var confidence: [Int: Double] = [:]
        for edge in edges { confidence[root(edge.from)] = min(confidence[root(edge.from)] ?? 1, edge.probability) }
        let groups = Dictionary(grouping: tasks.indices, by: root).values.filter { $0.count > 1 }

        return groups.map { members in
            let sources = members.sorted().map { tasks[$0] }
            return SimilarGroup(taskIDs: sources.map(\.id), reason: "These tasks look like the same piece of work.",
                                confidence: Int(((confidence[root(members[0])] ?? Self.threshold) * 100).rounded()),
                                merged: Self.merge(sources))
        }
    }

    private struct Edge: Sendable {
        var from: Int
        var to: Int
        var probability: Double
    }

    /// Keeps the most descriptive title and combines everything else.
    private static func merge(_ sources: [Item]) -> Item {
        let primary = sources.max { $0.title.count < $1.title.count } ?? sources[0]
        var merged = Item()
        merged.title = primary.title
        let notes = sources.compactMap(\.details).filter { !$0.isEmpty }
        merged.details = notes.isEmpty ? nil : Array(NSOrderedSet(array: notes)).compactMap { $0 as? String }.joined(separator: "\n\n")
        let rank: [Priority?: Int] = [.high: 3, .medium: 2, .low: 1]
        merged.priority = sources.compactMap(\.priority).max { (rank[$0] ?? 0) < (rank[$1] ?? 0) }
        merged.dueDate = sources.compactMap(\.dueDate).min()
        merged.category = primary.category ?? sources.compactMap(\.category).first
        merged.isNow = sources.contains(where: \.isNow)
        merged.aiStatus = .enhanced
        return merged
    }
}

struct SimilarGroup: Sendable {
    var taskIDs: [String]
    var reason: String
    var confidence: Int
    var merged: Item
}

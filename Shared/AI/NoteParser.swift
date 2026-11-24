import Foundation
import NaturalLanguage

/// Turns free text (notes, dictation, meeting transcripts) into candidate sentences, and a sentence into
/// a task title — by rules, not by a model: the title stays in the user's own words.
enum NoteParser {
    /// Lines, then sentences within each line. Bullets and checkboxes are removed.
    static func sentences(_ text: String) -> [String] {
        var result: [String] = []
        for line in PastedLine.parse(text) {
            let tokenizer = NLTokenizer(unit: .sentence)
            tokenizer.string = line.text
            tokenizer.enumerateTokens(in: line.text.startIndex..<line.text.endIndex) { range, _ in
                let sentence = line.text[range].trimmingCharacters(in: .whitespacesAndNewlines)
                if sentence.contains(where: \.isLetter) { result.append(sentence) }
                return true
            }
        }
        return result
    }

    /// Lead-ins that frame an action without being part of it ("I need to …", "Wir sollten …").
    private static let leadIns: [String] = [
        "todo", "to do", "to-do", "action item", "action", "reminder", "remember to", "don't forget to", "dont forget to",
        "i need to", "i have to", "i must", "i should", "i want to", "i'll", "i will", "need to", "have to",
        "we need to", "we have to", "we should", "we must", "let's", "lets", "please",
        "ich muss", "ich sollte", "ich will", "ich möchte", "ich werde", "muss noch", "noch",
        "wir müssen", "wir sollten", "wir wollen", "nicht vergessen", "erinnerung", "bitte",
    ]

    /// "I need to follow up with John." → "Follow up with John"
    static func taskTitle(_ sentence: String) -> String {
        var title = sentence.trimmingCharacters(in: .whitespacesAndNewlines)
        var changed = true
        while changed {
            changed = false
            let lower = title.lowercased()
            for lead in leadIns where lower.hasPrefix(lead) {
                let rest = title.dropFirst(lead.count)
                // Only whole words, optionally followed by ":" or ",".
                guard let next = rest.first, next == " " || next == ":" || next == "," else { continue }
                title = rest.drop { $0 == " " || $0 == ":" || $0 == "," }.description
                changed = true
                break
            }
        }
        while let last = title.last, ".!;".contains(last) { title.removeLast() }
        title = title.trimmingCharacters(in: .whitespaces)
        guard let first = title.first else { return sentence }
        return first.uppercased() + title.dropFirst()
    }
}

/// Due dates the way Jev reads them: the *parts* named in the text. Code does the calendar math.
enum DueAnchor: String, CaseIterable {
    case none, today, tomorrow, dayAfter = "day_after", weekday, thisWeekend = "this_weekend",
         nextWeek = "next_week", endOfMonth = "end_of_month", absolute

    var description: String? {
        switch self {
        case .none: "No date or deadline is mentioned"
        case .dayAfter: "The day after tomorrow (übermorgen)"
        case .weekday: "A named day of the week, like 'Friday', 'bis Freitag' or 'next Monday'"
        case .thisWeekend: "This weekend"
        case .nextWeek: "Next week, without a specific day"
        case .endOfMonth: "The end of the month"
        case .absolute: "A calendar date naming a month, like '14 August' or '3. März'"
        default: nil
        }
    }

    static let weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    static let months = ["January", "February", "March", "April", "May", "June", "July", "August",
                         "September", "October", "November", "December"]

    /// The local day (`yyyy-MM-dd`) for an anchor and the parts Jev read, relative to `today`.
    static func resolve(_ anchor: DueAnchor, weekday: String?, month: String?, day: String?, today: Date = .now) -> String? {
        let calendar = Calendar(identifier: .gregorian)
        let start = calendar.startOfDay(for: today)
        func plus(_ days: Int) -> String? { calendar.date(byAdding: .day, value: days, to: start).map(DueDate.string(from:)) }
        // Calendar weekday: 1 = Sunday … 7 = Saturday.
        func next(_ target: Int) -> String? {
            let current = calendar.component(.weekday, from: start)
            let delta = (target - current + 7) % 7
            return plus(delta == 0 ? 7 : delta)
        }

        switch anchor {
        case .none: return nil
        case .today: return plus(0)
        case .tomorrow: return plus(1)
        case .dayAfter: return plus(2)
        case .weekday:
            guard let weekday, let index = weekdays.firstIndex(of: weekday) else { return nil }
            return next((index + 1) % 7 + 1) // Monday → 2 … Sunday → 1
        case .thisWeekend: return calendar.component(.weekday, from: start) == 7 ? plus(0) : next(7)
        case .nextWeek: return next(2)
        case .endOfMonth:
            guard let range = calendar.range(of: .day, in: .month, for: start) else { return nil }
            return plus(range.count - calendar.component(.day, from: start))
        case .absolute:
            guard let month, let m = months.firstIndex(of: month), let day, let d = Int(day) else { return nil }
            let year = calendar.component(.year, from: start)
            for y in [year, year + 1] {
                if let date = calendar.date(from: DateComponents(year: y, month: m + 1, day: d)),
                   calendar.component(.day, from: date) == d, date >= start {
                    return DueDate.string(from: date)
                }
            }
            return nil
        }
    }
}

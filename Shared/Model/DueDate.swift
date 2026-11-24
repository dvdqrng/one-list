import Foundation

enum DueCategory: String, CaseIterable, Sendable {
    case now, overdue, today, tomorrow, thisWeek = "this-week", later, noDate = "no-date"

    var label: String {
        switch self {
        case .now: "Now"
        case .overdue: "Overdue"
        case .today: "Today"
        case .tomorrow: "Tomorrow"
        case .thisWeek: "This Week"
        case .later: "Later"
        case .noDate: "No Due Date"
        }
    }

    /// Groups that are always shown in the list, even when empty.
    var alwaysShown: Bool { self == .now || self == .today || self == .tomorrow }
}

/// Due dates are stored as local calendar days (`yyyy-MM-dd`), which avoids the UTC off-by-one
/// errors of storing full ISO timestamps.
enum DueDate {
    private static var calendar: Calendar { .current }

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func string(from date: Date) -> String {
        dayFormatter.timeZone = .current
        return dayFormatter.string(from: date)
    }

    static func date(from string: String) -> Date? {
        dayFormatter.timeZone = .current
        return dayFormatter.date(from: String(string.prefix(10)))
    }

    /// Accepts `yyyy-MM-dd` or a full ISO-8601 timestamp (legacy rows, AI output) and returns a local day string.
    static func normalize(_ raw: String?) -> String? {
        guard let raw = raw?.trimmingCharacters(in: .whitespaces), !raw.isEmpty, raw != "null" else { return nil }
        if raw.count > 10, raw.contains("T") {
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let d = iso.date(from: raw) { return string(from: d) }
            iso.formatOptions = [.withInternetDateTime]
            if let d = iso.date(from: raw) { return string(from: d) }
        }
        return date(from: raw).map(string(from:))
    }

    static var today: String { string(from: .now) }

    /// Days from `today` to the end of the week (the coming Sunday; a week runs Sunday through Sunday).
    private static func daysToEndOfWeek(_ today: Date) -> Int {
        7 - (calendar.component(.weekday, from: today) - 1)
    }

    static func category(for item: Item, today now: Date = .now) -> DueCategory {
        if item.isNow { return .now }
        guard let due = item.dueDate.flatMap(date(from:)) else { return .noDate }
        let today = calendar.startOfDay(for: now)
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: today)!
        let endOfWeek = calendar.date(byAdding: .day, value: daysToEndOfWeek(today), to: today)!
        if due < today { return .overdue }
        if due == today { return .today }
        if due == tomorrow { return .tomorrow }
        if due <= endOfWeek { return .thisWeek }
        return .later
    }

    /// A representative date for a category; used when an item is dropped into or created in that group.
    static func representative(for category: DueCategory, today now: Date = .now) -> String? {
        let today = calendar.startOfDay(for: now)
        let endOfWeek = daysToEndOfWeek(today)
        let offset: Int? = switch category {
        case .now, .today: 0
        case .overdue: -1
        case .tomorrow: 1
        // The last day of the week, but at least two days out so it isn't "Tomorrow".
        case .thisWeek: max(2, endOfWeek)
        // The first day after this week.
        case .later: endOfWeek + 1
        case .noDate: nil
        }
        return offset.map { string(from: calendar.date(byAdding: .day, value: $0, to: today)!) }
    }

    /// "Today", "Tomorrow" or "Jan 15".
    static func format(_ day: String) -> String {
        guard let date = date(from: day) else { return day }
        if calendar.isDateInToday(date) { return "Today" }
        if calendar.isDateInTomorrow(date) { return "Tomorrow" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "MMM d"
        return f.string(from: date)
    }

    /// Long form used by the date picker, e.g. "November 2nd, 2026".
    static func longFormat(_ day: String) -> String {
        guard let date = date(from: day) else { return day }
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        let symbols = DateFormatter()
        symbols.locale = Locale(identifier: "en_US")
        let month = symbols.monthSymbols[(c.month ?? 1) - 1]
        let d = c.day ?? 1
        let suffix = switch d % 100 {
        case 11, 12, 13: "th"
        default: switch d % 10 { case 1: "st"; case 2: "nd"; case 3: "rd"; default: "th" }
        }
        return "\(month) \(d)\(suffix), \(c.year ?? 0)"
    }
}

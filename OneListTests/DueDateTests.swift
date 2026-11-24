import Foundation
import Testing
@testable import One_List

@MainActor
struct DueDateTests {
    private let calendar = Calendar.current

    private func day(_ offset: Int) -> String {
        DueDate.string(from: calendar.date(byAdding: .day, value: offset, to: calendar.startOfDay(for: .now))!)
    }

    private func item(due: String?, isNow: Bool = false) -> Item {
        var item = Item()
        item.dueDate = due
        item.isNow = isNow
        return item
    }

    @Test func normalizeKeepsLocalDays() {
        #expect(DueDate.normalize("2026-01-25") == "2026-01-25")
        #expect(DueDate.normalize(nil) == nil)
        #expect(DueDate.normalize("") == nil)
        #expect(DueDate.normalize("null") == nil)
        #expect(DueDate.normalize("not a date") == nil)
    }

    @Test func normalizeConvertsTimestampsToLocalDay() {
        let noonUTC = "2026-03-10T12:00:00.000Z"
        let expected = DueDate.string(from: ISO8601DateFormatter().date(from: "2026-03-10T12:00:00Z")!)
        #expect(DueDate.normalize(noonUTC) == expected)
    }

    @Test func categories() {
        #expect(DueDate.category(for: item(due: nil)) == .noDate)
        #expect(DueDate.category(for: item(due: day(-1))) == .overdue)
        #expect(DueDate.category(for: item(due: day(0))) == .today)
        #expect(DueDate.category(for: item(due: day(1))) == .tomorrow)
        #expect(DueDate.category(for: item(due: day(30))) == .later)
        #expect(DueDate.category(for: item(due: day(-5), isNow: true)) == .now)
    }

    /// Dropping a task into a group must put it into that group — on every day of the week.
    @Test(arguments: [DueCategory.overdue, .today, .tomorrow, .thisWeek, .later])
    func representativeDateLandsInItsGroup(_ category: DueCategory) {
        for offset in 0..<7 {
            let today = calendar.date(byAdding: .day, value: offset, to: .now)!
            let weekday = calendar.component(.weekday, from: today)
            // On Saturdays the week's only remaining day is tomorrow, so "This Week" can't hold anything.
            if category == .thisWeek && weekday == 7 { continue }
            let due = DueDate.representative(for: category, today: today)
            #expect(DueDate.category(for: item(due: due), today: today) == category, "weekday \(weekday)")
        }
    }

    @Test func noDateHasNoRepresentative() {
        #expect(DueDate.representative(for: .noDate) == nil)
    }

    @Test func shortFormat() {
        #expect(DueDate.format(day(0)) == "Today")
        #expect(DueDate.format(day(1)) == "Tomorrow")
        #expect(DueDate.format("2025-01-15") == "Jan 15")
    }

    @Test func longFormatOrdinals() {
        #expect(DueDate.longFormat("2026-11-01") == "November 1st, 2026")
        #expect(DueDate.longFormat("2026-11-02") == "November 2nd, 2026")
        #expect(DueDate.longFormat("2026-11-03") == "November 3rd, 2026")
        #expect(DueDate.longFormat("2026-11-11") == "November 11th, 2026")
        #expect(DueDate.longFormat("2026-11-22") == "November 22nd, 2026")
    }
}

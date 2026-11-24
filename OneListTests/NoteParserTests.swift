import Foundation
import Testing
@testable import One_List

@MainActor
struct NoteParserTests {
    @Test func splitsLinesAndSentences() {
        let text = """
            - Hab heute die Revolut Beschwerde abgeschickt. Das Meeting war gut!
            * [ ] Call mom
            1. Buy milk
            """
        #expect(NoteParser.sentences(text) == [
            "Hab heute die Revolut Beschwerde abgeschickt.", "Das Meeting war gut!", "Call mom", "Buy milk",
        ])
    }

    @Test(arguments: [
        ("I need to follow up with John about the contract.", "Follow up with John about the contract"),
        ("TODO: review the contract", "Review the contract"),
        ("Action item: send proposal to client", "Send proposal to client"),
        ("Wir sollten nächste Woche die Landingpage überarbeiten.", "Nächste Woche die Landingpage überarbeiten"),
        ("Ich muss noch Milch kaufen!", "Milch kaufen"),
        ("Don't forget to call the dentist", "Call the dentist"),
        ("buy milk", "Buy milk"),
        ("Notice the board", "Notice the board"), // "no" / "noch" must match whole words only
    ])
    func titlesKeepTheUsersWordsWithoutLeadIns(_ sentence: String, _ title: String) {
        #expect(NoteParser.taskTitle(sentence) == title)
    }
}

@MainActor
struct DueAnchorTests {
    private let calendar = Calendar(identifier: .gregorian)

    /// A Monday, so expectations are easy to read.
    private var monday: Date { calendar.date(from: DateComponents(year: 2026, month: 11, day: 2))! }

    private func resolve(_ anchor: DueAnchor, weekday: String? = nil, month: String? = nil, day: String? = nil,
                         today: Date? = nil) -> String? {
        DueAnchor.resolve(anchor, weekday: weekday, month: month, day: day, today: today ?? monday)
    }

    @Test func relativeDays() {
        #expect(resolve(.none) == nil)
        #expect(resolve(.today) == "2026-11-02")
        #expect(resolve(.tomorrow) == "2026-11-03")
        #expect(resolve(.dayAfter) == "2026-11-04")
        #expect(resolve(.nextWeek) == "2026-11-09")
        #expect(resolve(.thisWeekend) == "2026-11-07")
        #expect(resolve(.endOfMonth) == "2026-11-30")
    }

    @Test func namedWeekdaysAreTheNextOccurrence() {
        #expect(resolve(.weekday, weekday: "Friday") == "2026-11-06")
        #expect(resolve(.weekday, weekday: "Monday") == "2026-11-09") // never today
        #expect(resolve(.weekday, weekday: "Sunday") == "2026-11-08")
        #expect(resolve(.weekday, weekday: nil) == nil)
    }

    @Test func weekdaysResolveForwardFromEveryDayOfTheWeek() {
        for offset in 0..<7 {
            let today = calendar.date(byAdding: .day, value: offset, to: monday)!
            for name in DueAnchor.weekdays {
                let due = DueDate.date(from: resolve(.weekday, weekday: name, today: today)!)!
                let days = calendar.dateComponents([.day], from: today, to: due).day!
                #expect((1...7).contains(days))
                let index = (calendar.component(.weekday, from: due) + 5) % 7 // Monday = 0
                #expect(DueAnchor.weekdays[index] == name)
            }
        }
    }

    @Test func calendarDatesUseTheNextOccurrence() {
        #expect(resolve(.absolute, month: "December", day: "24") == "2026-12-24")
        #expect(resolve(.absolute, month: "March", day: "3") == "2027-03-03")
        #expect(resolve(.absolute, month: "February", day: "30") == nil)
        #expect(resolve(.absolute, month: nil, day: "3") == nil)
    }
}

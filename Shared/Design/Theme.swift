#if os(macOS)
import AppKit
#else
import UIKit
#endif
import SwiftUI

/// The app's layout system, shared by the Mac and iPhone/iPad apps: everything sits on a 4-point grid,
/// and a few sizes repeat everywhere. Colors, fonts and controls are the system's. The two platforms use
/// the same structure and proportions; iOS scales them up to its type sizes and 44-point touch targets.
enum Metrics {
    #if os(macOS)
    // Type
    /// Task text (macOS body).
    static let taskFont: CGFloat = 13
    /// Project and date-group headings (macOS title 3).
    static let headingFont: CGFloat = 15
    /// Small labels: priority, dates, categories.
    static let labelFont: CGFloat = 11

    // Rows: [disclosure 16] 4 [checkbox 16] 8 [title]
    static let disclosure: CGFloat = 16
    static let checkbox: CGFloat = 16
    static let disclosureGap: CGFloat = 4
    static let checkboxGap: CGFloat = 8
    /// One nesting level. Equals disclosure + gap + 4, so a subtask's checkbox sits exactly under its
    /// parent's title.
    static let indent: CGFloat = 24
    static let rowHeight: CGFloat = 32
    static let rowPadding: CGFloat = 8

    // Rhythm
    static let groupSpacing: CGFloat = 24
    static let listWidth: CGFloat = 720
    static let listMargin: CGFloat = 40
    /// Column left of each task (inside the margin) holding its drag handle.
    static let handleGutter: CGFloat = 20

    // Shapes
    static let rowCornerRadius: CGFloat = 8
    static let cardCornerRadius: CGFloat = 10
    static let columnCornerRadius: CGFloat = 14
    #else
    // Type (iOS body / title 3 / footnote)
    static let taskFont: CGFloat = 17
    static let headingFont: CGFloat = 20
    static let labelFont: CGFloat = 13

    // Rows: [disclosure 20] 4 [checkbox 22] 12 [title]
    static let disclosure: CGFloat = 20
    static let checkbox: CGFloat = 22
    static let disclosureGap: CGFloat = 4
    static let checkboxGap: CGFloat = 12
    /// One nesting level: disclosure + gap + 4, so a subtask's checkbox sits under its parent's title.
    static let indent: CGFloat = 28
    static let rowHeight: CGFloat = 44
    static let rowPadding: CGFloat = 16

    // Rhythm
    static let groupSpacing: CGFloat = 24
    static let listWidth: CGFloat = 720
    static let listMargin: CGFloat = 16
    static let handleGutter: CGFloat = 0

    // Shapes
    static let rowCornerRadius: CGFloat = 10
    static let cardCornerRadius: CGFloat = 12
    static let columnCornerRadius: CGFloat = 18
    #endif
}

/// The few colors the app defines itself, resolved per platform from the system palette.
extension Color {
    /// Kanban cards and other raised surfaces.
    static var cardBackground: Color {
        #if os(macOS)
        Color(nsColor: .controlBackgroundColor)
        #else
        Color(uiColor: .secondarySystemGroupedBackground)
        #endif
    }

    /// Board columns and inset wells (the surface cards sit on).
    static var wellBackground: Color {
        #if os(macOS)
        Color(nsColor: .quaternaryLabelColor).opacity(0.35)
        #else
        Color(uiColor: .tertiarySystemFill)
        #endif
    }

    static var hairline: Color {
        #if os(macOS)
        Color(nsColor: .separatorColor)
        #else
        Color(uiColor: .separator)
        #endif
    }
}

/// Appearance preference: follow the system, or force light/dark (focus mode is always dark).
enum AppearancePreference: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var title: String { rawValue.capitalized }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }

    #if os(macOS)
    var nsAppearance: NSAppearance? {
        switch self {
        case .system: nil
        case .light: NSAppearance(named: .aqua)
        case .dark: NSAppearance(named: .darkAqua)
        }
    }
    #endif
}

extension Priority {
    var color: Color {
        switch self {
        case .high: .red
        case .medium: .orange
        case .low: .secondary
        }
    }

    var title: String { rawValue.capitalized }
}

#if os(macOS)
extension Font.Weight {
    var nsWeight: NSFont.Weight {
        switch self {
        case .medium: .medium
        case .semibold: .semibold
        case .bold: .bold
        default: .regular
        }
    }
}
#endif

extension View {
    /// Rounded card on the window background, as used for kanban cards.
    func cardStyle(selected: Bool = false) -> some View {
        background {
            RoundedRectangle(cornerRadius: Metrics.cardCornerRadius, style: .continuous)
                .fill(Color.cardBackground)
                .shadow(color: .black.opacity(0.06), radius: 2, y: 1)
        }
        .overlay {
            RoundedRectangle(cornerRadius: Metrics.cardCornerRadius, style: .continuous)
                .strokeBorder(selected ? Color.accentColor.opacity(0.8) : Color.hairline.opacity(0.4),
                              lineWidth: selected ? 1.5 : 0.5)
        }
    }
}

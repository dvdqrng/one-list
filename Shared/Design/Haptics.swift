#if os(iOS)
import UIKit
#endif

/// One vocabulary of touch feedback for the whole app, so the same kind of action always feels the same.
/// No-ops on the Mac.
enum Haptics {
    /// Light tap: adding, indenting, moving, opening, pausing.
    static func tap() {
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        #endif
    }

    /// Firmer tap: starting a focus session, dropping a card, deleting.
    static func thud() {
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        #endif
    }

    /// Picking between options: status steps, collapsing, tabs, timer styles.
    static func select() {
        #if os(iOS)
        UISelectionFeedbackGenerator().selectionChanged()
        #endif
    }

    /// Something finished well: task done, AI changes applied, session complete.
    static func success() {
        #if os(iOS)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        #endif
    }

    /// Something needs attention: AI error, nothing found.
    static func warning() {
        #if os(iOS)
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
        #endif
    }
}

import AppKit
import ObjectiveC
import SwiftUI

/// Editor keys a task field reports instead of handling them as plain text editing.
enum TaskKey {
    case enter, tab, backtab, up, down, shiftUp, shiftDown, escape
    /// Backspace with the caret at the very start (and no selection).
    case backspaceAtStart
    /// Forward delete with the caret at the very end (and no selection).
    case deleteAtEnd
}

/// Where the caret is when a key is reported (UTF-16 offsets, like `NSString`).
struct TaskKeyContext {
    var text: String
    var caret: Int
}

/// Single-line borderless text field (the `<input>` inside a task row), backed by `NSTextField` so editor
/// keys can be intercepted reliably.
struct TaskTextField: NSViewRepresentable {
    let text: String
    var placeholder = "New Task"
    var fontSize: CGFloat = Metrics.taskFont
    var weight: Font.Weight = .regular
    var completed = false
    /// Take keyboard focus and place the caret, then call `onFocusHandled`.
    var focusRequest: FocusRequest.Caret?
    var onChange: (String) -> Void = { _ in }
    var onFocus: () -> Void = {}
    var onEndEditing: () -> Void = {}
    var onFocusHandled: () -> Void = {}
    /// Return true when the key was handled.
    var onKey: (TaskKey, TaskKeyContext) -> Bool = { _, _ in false }
    /// Multi-line paste. Returns the text to insert at the caret (the first line); the handler turns the
    /// remaining lines into tasks. Return nil to paste normally.
    var onPasteLines: ((String) -> String?)?
    /// ⇧-click / ⌘-click: selects instead of starting to edit.
    var onModifiedClick: ((NSEvent.ModifierFlags) -> Void)?

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> FocusTextField {
        let field = FocusTextField()
        field.isBordered = false
        field.drawsBackground = false
        field.focusRingType = .none
        field.usesSingleLineMode = true
        field.lineBreakMode = .byClipping
        field.cell?.isScrollable = true
        field.cell?.wraps = false
        field.delegate = context.coordinator
        field.setContentHuggingPriority(.defaultLow, for: .horizontal)
        field.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        field.textColor = .labelColor
        return field
    }

    func updateNSView(_ field: FocusTextField, context: Context) {
        let coordinator = context.coordinator
        coordinator.parent = self
        field.onBecomeFirstResponder = onFocus
        field.onModifiedClick = onModifiedClick
        field.onPaste = onPasteLines

        // Only touch AppKit when something visible changed (this runs for every row on every keystroke).
        let style = Coordinator.Style(fontSize: fontSize, weight: weight, completed: completed, placeholder: placeholder)
        let styleChanged = style != coordinator.style
        let font = NSFont.systemFont(ofSize: fontSize, weight: weight.nsWeight)
        let textColor: NSColor = completed ? .secondaryLabelColor : .labelColor
        if styleChanged {
            coordinator.style = style
            field.font = font
            field.textColor = textColor
            field.placeholderAttributedString = NSAttributedString(
                string: placeholder, attributes: [.font: font, .foregroundColor: NSColor.placeholderTextColor])
        }

        if let editor = field.currentEditor() as? NSTextView {
            // Editing: adopt the model text only when it changed from outside (split, join, undo…).
            if text != coordinator.lastText {
                let caret = min(editor.selectedRange().location, (text as NSString).length)
                editor.string = text
                editor.setSelectedRange(NSRange(location: caret, length: 0))
                coordinator.lastText = text
            }
        } else if text != coordinator.lastText || styleChanged {
            field.attributedStringValue = NSAttributedString(string: text, attributes: [
                .font: font, .foregroundColor: textColor,
                .strikethroughStyle: completed ? NSUnderlineStyle.single.rawValue : 0,
            ])
            coordinator.lastText = text
        }

        if let caret = focusRequest {
            DispatchQueue.main.async {
                guard let window = field.window else { return }
                if field.currentEditor() == nil { window.makeFirstResponder(field) }
                let length = field.stringValue.utf16.count
                let location = switch caret {
                case .start: 0
                case .end: length
                case .offset(let n): min(max(n, 0), length)
                }
                field.currentEditor()?.selectedRange = NSRange(location: location, length: 0)
                onFocusHandled()
            }
        }
    }

    final class Coordinator: NSObject, NSTextFieldDelegate {
        struct Style: Equatable {
            var fontSize: CGFloat
            var weight: Font.Weight
            var completed: Bool
            var placeholder: String
        }

        var parent: TaskTextField?
        var style: Style?
        /// The text last shown in / reported by the field.
        var lastText: String?

        func controlTextDidChange(_ note: Notification) {
            guard let field = note.object as? NSTextField else { return }
            lastText = field.stringValue
            parent?.onChange(field.stringValue)
        }

        func controlTextDidEndEditing(_ note: Notification) { parent?.onEndEditing() }

        func control(_ control: NSControl, textView: NSTextView, doCommandBy selector: Selector) -> Bool {
            guard let parent else { return false }
            let range = textView.selectedRange()
            let length = (textView.string as NSString).length
            let context = TaskKeyContext(text: textView.string, caret: range.location)
            let key: TaskKey? = switch selector {
            case #selector(NSResponder.insertNewline(_:)): .enter
            case #selector(NSResponder.insertTab(_:)): .tab
            case #selector(NSResponder.insertBacktab(_:)): .backtab
            case #selector(NSResponder.moveUp(_:)): .up
            case #selector(NSResponder.moveDown(_:)): .down
            case #selector(NSResponder.moveUpAndModifySelection(_:)): .shiftUp
            case #selector(NSResponder.moveDownAndModifySelection(_:)): .shiftDown
            case #selector(NSResponder.cancelOperation(_:)): .escape
            case #selector(NSResponder.deleteBackward(_:)):
                range.location == 0 && range.length == 0 ? .backspaceAtStart : nil
            case #selector(NSResponder.deleteForward(_:)):
                range.location == length && range.length == 0 ? .deleteAtEnd : nil
            default: nil
            }
            guard let key else { return false }
            return parent.onKey(key, context)
        }
    }
}

/// Ends text editing in whichever window is editing (not only the key window), leaving the
/// current task selected.
@MainActor
func endTextEditing() {
    for window in NSApp.windows where window.firstResponder is NSText {
        window.makeFirstResponder(nil)
    }
}

final class FocusTextField: NSTextField {
    var onBecomeFirstResponder: () -> Void = {}
    var onModifiedClick: ((NSEvent.ModifierFlags) -> Void)?
    var onPaste: ((String) -> String?)?

    /// Not part of the window's key-view loop: AppKit would otherwise focus (and select) the first task
    /// when the window opens. Focus is always explicit (click, keyboard navigation, focus requests).
    override var canBecomeKeyView: Bool { false }

    override func becomeFirstResponder() -> Bool {
        let ok = super.becomeFirstResponder()
        if ok { Task { @MainActor in self.onBecomeFirstResponder() } }
        return ok
    }

    override func mouseDown(with event: NSEvent) {
        let modifiers = event.modifierFlags.intersection([.shift, .command])
        if !modifiers.isEmpty, let onModifiedClick {
            onModifiedClick(modifiers)
            return
        }
        super.mouseDown(with: event)
    }

    /// Intercepts pastes that contain line breaks before the single-line field editor turns them into
    /// spaces. The field editor asks its delegate (this field) via this Objective-C selector, which
    /// `NSTextField` implements privately; everything else falls through to that implementation.
    private static let shouldChangeSelector = NSSelectorFromString("textView:shouldChangeTextInRange:replacementString:")

    @objc(textView:shouldChangeTextInRange:replacementString:)
    func shouldChangeText(_ textView: NSTextView, range: NSRange, replacement string: String?) -> Bool {
        if let string, string.contains(where: \.isNewline), let onPaste, let firstLine = onPaste(string) {
            textView.insertText(firstLine, replacementRange: range)
            return false
        }
        typealias Original = @convention(c) (AnyObject, Selector, NSTextView, NSRange, NSString?) -> Bool
        guard let imp = class_getMethodImplementation(NSTextField.self, Self.shouldChangeSelector) else { return true }
        return unsafeBitCast(imp, to: Original.self)(self, Self.shouldChangeSelector, textView, range, string as NSString?)
    }
}

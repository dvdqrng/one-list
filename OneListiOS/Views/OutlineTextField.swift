import SwiftUI
import UIKit

/// Keys the outliner reacts to while a task is being edited (the same set as on the Mac).
enum OutlineKey {
    case enter, backspaceAtStart, tab, backtab, up, down, escape
}

/// The task title editor: a `UITextField` that reports Return (with the caret), Backspace at the start,
/// multi-line paste and — with a hardware keyboard — Tab, ⇧Tab, ↑, ↓ and Esc, so the list edits like an
/// outliner on iPhone and iPad.
struct OutlineTextField: UIViewRepresentable {
    var text: String
    var placeholder: String
    var fontSize: CGFloat = Metrics.taskFont
    var weight: UIFont.Weight = .regular
    var completed = false
    /// Take keyboard focus with this caret when set.
    var focusRequest: FocusRequest.Caret?
    var onChange: (String) -> Void
    /// Return value: whether the key was handled (otherwise the field behaves normally).
    var onKey: (OutlineKey, _ caret: Int, _ text: String) -> Bool
    /// Multi-line paste: gets the pasted text, returns what stays in this field (nil = paste normally).
    var onPasteLines: ((String) -> String?)?
    var onBeginEditing: () -> Void
    var onEndEditing: () -> Void
    var onFocusHandled: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> OutlineUITextField {
        let field = OutlineUITextField()
        field.delegate = context.coordinator
        field.borderStyle = .none
        field.returnKeyType = .next
        field.autocapitalizationType = .sentences
        field.clearButtonMode = .never
        field.setContentHuggingPriority(.defaultLow, for: .horizontal)
        field.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        field.addTarget(context.coordinator, action: #selector(Coordinator.editingChanged(_:)), for: .editingChanged)
        field.coordinator = context.coordinator
        return field
    }

    func updateUIView(_ field: OutlineUITextField, context: Context) {
        context.coordinator.parent = self
        if field.text != text && field.markedTextRange == nil { field.text = text }
        field.font = UIFont.systemFont(ofSize: fontSize, weight: weight)
        field.textColor = completed ? .secondaryLabel : .label
        field.attributedPlaceholder = NSAttributedString(string: placeholder, attributes: [.foregroundColor: UIColor.tertiaryLabel])

        if let caret = focusRequest {
            // After this update pass: becoming first responder while SwiftUI updates views is not allowed.
            DispatchQueue.main.async {
                if !field.isFirstResponder { field.becomeFirstResponder() }
                field.placeCaret(caret)
                onFocusHandled()
            }
        }
    }

    final class Coordinator: NSObject, UITextFieldDelegate {
        var parent: OutlineTextField

        init(_ parent: OutlineTextField) { self.parent = parent }

        @objc func editingChanged(_ field: UITextField) {
            parent.onChange(field.text ?? "")
        }

        func textFieldDidBeginEditing(_ textField: UITextField) { parent.onBeginEditing() }
        func textFieldDidEndEditing(_ textField: UITextField) { parent.onEndEditing() }

        func textFieldShouldReturn(_ textField: UITextField) -> Bool {
            guard let field = textField as? OutlineUITextField else { return true }
            // Rows that don't handle Return (search results, cards) just stop editing.
            if !parent.onKey(.enter, field.caretOffset, field.text ?? "") { field.resignFirstResponder() }
            return false
        }

        func key(_ key: OutlineKey, in field: OutlineUITextField) -> Bool {
            parent.onKey(key, field.caretOffset, field.text ?? "")
        }

        func paste(_ text: String, into field: OutlineUITextField) -> Bool {
            guard text.contains("\n"), let onPasteLines = parent.onPasteLines,
                  let remaining = onPasteLines(text) else { return false }
            field.insertText(remaining)
            return true
        }
    }
}

final class OutlineUITextField: UITextField {
    weak var coordinator: OutlineTextField.Coordinator?

    /// UTF-16 offset of the caret (start of the selection).
    var caretOffset: Int {
        guard let range = selectedTextRange else { return (text ?? "").utf16.count }
        return offset(from: beginningOfDocument, to: range.start)
    }

    func placeCaret(_ caret: FocusRequest.Caret) {
        let length = (text ?? "").utf16.count
        let offset = switch caret {
        case .start: 0
        case .end: length
        case .offset(let o): min(max(o, 0), length)
        }
        if let position = position(from: beginningOfDocument, offset: offset) {
            selectedTextRange = textRange(from: position, to: position)
        }
    }

    override func deleteBackward() {
        if let range = selectedTextRange, range.isEmpty, caretOffset == 0, let coordinator,
           coordinator.key(.backspaceAtStart, in: self) {
            return
        }
        super.deleteBackward()
    }

    override func paste(_ sender: Any?) {
        if let text = UIPasteboard.general.string, let coordinator, coordinator.paste(text, into: self) { return }
        super.paste(sender)
    }

    // Hardware keyboard (iPad, or a keyboard paired with an iPhone).
    override var keyCommands: [UIKeyCommand]? {
        let commands: [(String, UIKeyModifierFlags, String)] = [
            ("\t", [], "Indent"), ("\t", .shift, "Outdent"),
            (UIKeyCommand.inputUpArrow, [], "Previous Task"), (UIKeyCommand.inputDownArrow, [], "Next Task"),
            (UIKeyCommand.inputEscape, [], "Stop Editing"),
        ]
        return commands.map { input, flags, title in
            let command = UIKeyCommand(title: title, action: #selector(handleKeyCommand(_:)), input: input, modifierFlags: flags)
            command.wantsPriorityOverSystemBehavior = true
            return command
        }
    }

    @objc private func handleKeyCommand(_ command: UIKeyCommand) {
        guard let coordinator else { return }
        let key: OutlineKey? = switch (command.input, command.modifierFlags.contains(.shift)) {
        case ("\t", false): .tab
        case ("\t", true): .backtab
        case (UIKeyCommand.inputUpArrow, _): .up
        case (UIKeyCommand.inputDownArrow, _): .down
        case (UIKeyCommand.inputEscape, _): .escape
        default: nil
        }
        if let key { _ = coordinator.key(key, in: self) }
    }
}

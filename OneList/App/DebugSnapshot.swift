import SwiftUI

/// Offscreen window captures (DEBUG snapshot runs only) can't render the macOS 26 scroll-edge effect under
/// the toolbar and come out blank; hide the effect while capturing. No effect in normal runs.
struct SnapshotFriendlyScrolling: ViewModifier {
    func body(content: Content) -> some View {
        #if DEBUG
        let env = ProcessInfo.processInfo.environment
        if #available(macOS 26, *), env["ONE_LIST_SNAPSHOT"] != nil || env["ONE_LIST_KEYS"] != nil {
            if env["ONE_LIST_NO_TOOLBAR"] != nil {
                content.scrollEdgeEffectHidden(true).toolbar(.hidden, for: .windowToolbar)
            } else {
                content.scrollEdgeEffectHidden(true)
            }
        } else {
            content
        }
        #else
        content
        #endif
    }
}

#if DEBUG
import AppKit

extension Notification.Name {
    static let debugOpenSettings = Notification.Name("debugOpenSettings")
}

/// Development aid: `ONE_LIST_SCENE=kanban,sidebar,...` configures the UI and `ONE_LIST_SNAPSHOT=/path.png`
/// writes a PNG of the window, then quits. Used to compare against the original design without UI automation.
enum DebugSnapshot {
    static func run(store: AppStore, timer: FocusTimer) {
        let env = ProcessInfo.processInfo.environment
        let scene = Set((env["ONE_LIST_SCENE"] ?? "").split(separator: ",").map(String.init))
        if scene.contains("kanban") { store.viewMode = .kanban } else if !scene.isEmpty { store.viewMode = .list }
        if !scene.isEmpty {
            store.listGroupBy = scene.contains("due") ? .dueDate : .project
            store.showMetadata = scene.contains("meta")
            store.showCompleted = !scene.contains("hidedone")
            store.isSidebarOpen = scene.contains("sidebar")
            store.showAIInput = scene.contains("ai")
            Database.preferences.set(scene.contains("dark") ? "dark" : "light", forKey: "theme")
        }
        if let sel = scene.first(where: { $0.hasPrefix("sel=") })?.dropFirst(4) {
            store.select(store.items.first { $0.title.hasPrefix(sel) }?.id)
        }
        if scene.contains("settings") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                NotificationCenter.default.post(name: .debugOpenSettings, object: nil)
            }
        }
        if scene.contains("update") { store.showUpdateDialog = true }
        if scene.contains("focus") {
            store.focusTimerStyle = scene.contains("sand") ? .sand : scene.contains("water") ? .water : scene.contains("orb") ? .orb : scene.contains("dialtime") ? .pieWithTime : scene.contains("dial") ? .pie : .digits
            timer.start()
            if scene.contains("half") { timer.debugSetRemaining(560) }
            if scene.contains("late") { timer.debugSetRemaining(90) }
            if scene.contains("done") { timer.debugSetRemaining(0); timer.pause() }
        }
        if scene.contains("changelog") {
            var a = Item(); a.title = "Buy milk"; a.priority = .low; a.dueDate = DueDate.today; a.category = "shopping"
            let existing = store.todos.first!
            var u = ItemUpdates(); u.priority = .high
            store.propose([ProposedChange(kind: .add(a)), ProposedChange(kind: .update(existing, u), reason: "Raised priority"),
                           ProposedChange(kind: .setCompleted(existing, ItemUpdates(completed: true)), reason: "User indicated task should be completed")],
                          source: .aiInput, input: "buy milk tomorrow and the report is urgent")
        }
        if let script = env["ONE_LIST_KEYS"] {
            Task { await runScript(script, store: store) }
            return
        }
        guard let path = env["ONE_LIST_SNAPSHOT"] else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
            snapshot(to: path)
            exit(0) // terminate() waits on open sheets
        }
    }

    /// Renders the main window (with an attached sheet drawn on top), or the Settings window if it is open.
    static func snapshot(to path: String) {
        guard let main = NSApp.windows.first(where: { $0.isVisible && $0.identifier?.rawValue == "main" })
                ?? NSApp.windows.first(where: { $0.isVisible && $0.frame.width > 500 }) else { return }
        let settings = NSApp.windows.first { $0.isVisible && $0 !== main && $0.attachedSheet == nil && $0.sheetParent == nil
            && !($0 is NSPanel) && $0.frame.width > 300 && $0.styleMask.contains(.titled) }
        let window = settings ?? main
        guard var image = render(window) else { return }
        if let sheet = window.attachedSheet, let sheetImage = render(sheet) {
            let composite = NSImage(size: image.size)
            composite.lockFocus()
            image.draw(at: .zero, from: .zero, operation: .copy, fraction: 1)
            NSColor.black.withAlphaComponent(0.15).setFill()
            NSRect(origin: .zero, size: image.size).fill(using: .sourceOver)
            let origin = NSPoint(x: sheet.frame.minX - window.frame.minX, y: sheet.frame.minY - window.frame.minY)
            sheetImage.draw(at: origin, from: .zero, operation: .sourceOver, fraction: 1)
            composite.unlockFocus()
            image = composite
        }
        guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else { return }
        try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
    }

    private static func render(_ window: NSWindow) -> NSImage? {
        guard let root = window.contentView?.superview,
              let rep = root.bitmapImageRepForCachingDisplay(in: root.bounds) else { return nil }
        root.display()
        root.cacheDisplay(in: root.bounds, to: rep)
        let image = NSImage(size: root.bounds.size)
        image.addRepresentation(rep)

        // Vertical SwiftUI scroll views under a toolbar don't come out of cacheDisplay on macOS 26;
        // render each clip view's visible content separately and draw it in place.
        var clips: [NSClipView] = []
        func collect(_ view: NSView) {
            if let clip = view as? NSClipView { clips.append(clip) }
            view.subviews.forEach(collect)
        }
        collect(root)
        // Overlays above the list (focus mode) would be painted over; skip compositing for them.
        let skip = (ProcessInfo.processInfo.environment["ONE_LIST_SCENE"] ?? "").contains("focus")
        guard !clips.isEmpty, !skip else { return image }
        image.lockFocus()
        for clip in clips where !clip.isHiddenOrHasHiddenAncestor {
            guard let document = clip.documentView,
                  let docRep = document.bitmapImageRepForCachingDisplay(in: clip.documentVisibleRect) else { continue }
            document.cacheDisplay(in: clip.documentVisibleRect, to: docRep)
            let frame = clip.convert(clip.bounds, to: root)
            let origin = root.isFlipped ? NSPoint(x: frame.minX, y: root.bounds.height - frame.maxY) : frame.origin
            NSGraphicsContext.current?.saveGraphicsState()
            NSBezierPath(rect: NSRect(origin: origin, size: frame.size)).addClip()
            docRep.draw(in: NSRect(origin: origin, size: clip.documentVisibleRect.size))
            NSGraphicsContext.current?.restoreGraphicsState()
        }
        image.unlockFocus()
        return image
    }

    // MARK: - Key scripts
    //
    // `ONE_LIST_KEYS="focus:first; type:Hello; key:return; key:cmd+k; dump:/tmp/out.txt; snap:/tmp/x.png"` posts
    // real key events into the app's event queue (so they go through menus, monitors and the field editor),
    // then quits. `dump` writes the outline as indented text with [x] / [~] / [now] markers and the editing state.

    private static let keyCodes: [String: UInt16] = [
        "return": 36, "tab": 48, "esc": 53, "backspace": 51, "delete": 117, "up": 126, "down": 125,
        "left": 123, "right": 124, "a": 0, "d": 2, "i": 34, "k": 40, "n": 45, "v": 9, "z": 6, "]": 30, "[": 33,
    ]

    nonisolated(unsafe) private static var markTime: TimeInterval = 0
    nonisolated(unsafe) private static var lastError: String?

    private static func meta(_ item: Item) -> String {
        "{\(item.priority?.rawValue ?? "-"), \(item.dueDate ?? "-"), \(item.category ?? "-")}"
    }

    private static func runScript(_ script: String, store: AppStore) async {
        try? await Task.sleep(for: .seconds(1.5))
        for step in script.split(separator: ";").map({ $0.trimmingCharacters(in: .whitespaces) }) where !step.isEmpty {
            let (command, argument) = step.firstIndex(of: ":").map { (String(step[..<$0]), String(step[step.index(after: $0)...])) }
                ?? (step, "")
            switch command {
            case "focus":
                let id = argument == "first" ? store.items.first?.id : store.items.first { $0.title.hasPrefix(argument) }?.id
                if let id { store.focus(id) }
            case "type":
                for character in argument { post(characters: String(character), keyCode: 0, modifiers: []) }
            case "key":
                var parts = argument.split(separator: "+").map(String.init)
                let name = parts.removeLast()
                var modifiers: NSEvent.ModifierFlags = []
                for part in parts {
                    switch part {
                    case "cmd": modifiers.insert(.command)
                    case "shift": modifiers.insert(.shift)
                    case "alt": modifiers.insert(.option)
                    default: break
                    }
                }
                let code = keyCodes[name] ?? 0
                let characters: String = switch name {
                case "return": "\r"
                case "tab": modifiers.contains(.shift) ? "\u{19}" : "\t"
                case "esc": "\u{1b}"
                case "backspace": "\u{7f}"
                case "delete": String(UnicodeScalar(NSDeleteFunctionKey)!)
                case "up": String(UnicodeScalar(NSUpArrowFunctionKey)!)
                case "down": String(UnicodeScalar(NSDownArrowFunctionKey)!)
                case "left": String(UnicodeScalar(NSLeftArrowFunctionKey)!)
                case "right": String(UnicodeScalar(NSRightArrowFunctionKey)!)
                default: name
                }
                if ["up", "down", "left", "right", "delete"].contains(name) { modifiers.insert([.numericPad, .function]) }
                post(characters: characters, keyCode: code, modifiers: modifiers)
            case "paste":
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(argument.replacingOccurrences(of: "\\n", with: "\n"), forType: .string)
                perform("paste:")
            case "menu":
                // menu:<item title> — invokes a main-menu item like a click would.
                for top in NSApp.mainMenu?.items ?? [] {
                    guard let menu = top.submenu else { continue }
                    menu.update()
                    if let index = menu.items.firstIndex(where: { $0.title == argument }) {
                        menu.performActionForItem(at: index)
                        break
                    }
                }
            case "action":
                // Standard Edit-menu actions (undo:, redo:, …) sent down the responder chain like the menu does.
                perform(argument)
            case "burst":
                // burst:up:50 queues the key presses back to back (faster than any key repeat).
                let parts = argument.split(separator: ":")
                let name = String(parts[0]), count = Int(parts[1]) ?? 1
                let character = String(UnicodeScalar(name == "up" ? NSUpArrowFunctionKey : NSDownArrowFunctionKey)!)
                for _ in 0..<count {
                    post(characters: character, keyCode: keyCodes[name] ?? 0, modifiers: [.numericPad, .function])
                }
            case "settle":
                // Waits until every queued key event has been handled.
                while NSApp.nextEvent(matching: [.keyDown, .keyUp], until: .now, inMode: .default, dequeue: false) != nil {
                    try? await Task.sleep(for: .milliseconds(2))
                }
            case "mark":
                markTime = ProcessInfo.processInfo.systemUptime
            case "elapsed":
                let ms = (ProcessInfo.processInfo.systemUptime - markTime) * 1000
                try? String(format: "%.1f ms", ms).write(toFile: argument, atomically: true, encoding: .utf8)
            case "wait":
                try? await Task.sleep(for: .seconds(Double(argument) ?? 0.3))
            case "ai":
                // ai:<note> runs the composer flow and writes the proposed changes into the dump file given next.
                do {
                    _ = try await store.processText(argument.replacingOccurrences(of: "\\n", with: "\n"))
                } catch {
                    lastError = error.localizedDescription
                }
            case "similar":
                await store.findSimilarTasks()
            case "proposals":
                var out = (store.changelog?.changes ?? []).map { change -> String in
                    let confidence = change.confidence.map { String(format: " (%.2f)", $0) } ?? ""
                    let selected = change.isConfident ? "[x]" : "[ ]"
                    switch change.kind {
                    case .add(let item): return "\(selected) ADD \(item.title) \(meta(item))\(confidence)"
                    case .update(let item, let u): return "\(selected) UPDATE \(item.title): \(u.fieldChanges(from: item).map { "\($0.0)=\($0.2)" })\(confidence)"
                    case .setCompleted(let item, _): return "\(selected) DONE \(item.title)\(confidence)"
                    case .merge(let sources, let merged, _, _): return "\(selected) MERGE \(sources.map(\.title)) -> \(merged.title)\(confidence)"
                    }
                }
                if let error = store.changelog?.error ?? lastError { out.append("error: \(error)") }
                try? out.joined(separator: "\n").write(toFile: argument, atomically: true, encoding: .utf8)
            case "dump":
                try? dump(store).write(toFile: argument, atomically: true, encoding: .utf8)
            case "snap":
                snapshot(to: argument)
            case "tree":
                var out: [String] = []
                func walk(_ view: NSView, _ depth: Int) {
                    guard depth < 40 else { return }
                    let name = String(describing: type(of: view))
                    var line = String(repeating: " ", count: depth) + name + " " + NSStringFromRect(view.frame)
                    if view.isHidden { line += " hidden" }
                    if !view.registeredDraggedTypes.isEmpty { line += " drag=\(view.registeredDraggedTypes.map(\.rawValue).prefix(4))" }
                    if let field = view as? NSTextField { line += " text=\(field.stringValue.prefix(30).debugDescription)" }
                    if let control = view as? NSControl, !(view is NSTextField) {
                        line += " value=\((control as? NSButton)?.state.rawValue ?? control.integerValue)"
                    }
                    out.append(line)
                    for sub in view.subviews { walk(sub, depth + 1) }
                }
                if let root = NSApp.windows.first(where: { $0.isVisible && $0.frame.width > 500 })?.contentView?.superview { walk(root, 0) }
                try? out.joined(separator: "\n").write(toFile: argument, atomically: true, encoding: .utf8)
            case "menus":
                var out: [String] = []
                for top in NSApp.mainMenu?.items ?? [] {
                    top.submenu?.update()
                    out.append("[\(top.title)]")
                    for item in top.submenu?.items ?? [] where !item.isSeparatorItem {
                        out.append("  \(item.title) key=\(item.keyEquivalent.debugDescription) mods=\(item.keyEquivalentModifierMask.rawValue) enabled=\(item.isEnabled) action=\(item.action.map(NSStringFromSelector) ?? "-")")
                    }
                }
                let responder = NSApp.keyWindow?.firstResponder.map { String(describing: type(of: $0)) } ?? "nil"
                out.append("firstResponder: \(responder)")
                try? out.joined(separator: "\n").write(toFile: argument, atomically: true, encoding: .utf8)
            default:
                break
            }
            try? await Task.sleep(for: .milliseconds(120))
        }
        exit(0) // terminate() waits on open sheets
    }

    private static func perform(_ action: String) {
        guard let window = NSApp.windows.first(where: { $0.isVisible && $0.frame.width > 500 }) else { return }
        let selector = NSSelectorFromString(action.hasSuffix(":") ? action : action + ":")
        if !(window.firstResponder?.tryToPerform(selector, with: nil) ?? false) {
            _ = window.tryToPerform(selector, with: nil)
        }
    }

    private static func post(characters: String, keyCode: UInt16, modifiers: NSEvent.ModifierFlags) {
        guard let window = NSApp.windows.first(where: { $0.isVisible && $0.frame.width > 500 }) else { return }
        for type in [NSEvent.EventType.keyDown, .keyUp] {
            let event = NSEvent.keyEvent(with: type, location: .zero, modifierFlags: modifiers, timestamp: ProcessInfo.processInfo.systemUptime,
                                         windowNumber: window.windowNumber, context: nil, characters: characters,
                                         charactersIgnoringModifiers: characters, isARepeat: false, keyCode: keyCode)
            if let event { NSApp.postEvent(event, atStart: false) }
        }
    }

    private static func dump(_ store: AppStore) -> String {
        var lines = store.items.filter { !$0.isArchived }.map { item -> String in
            var line = String(repeating: "  ", count: item.indent) + item.title
            if store.settings.hasApiKey { line += " " + meta(item) }
            if item.completed { line += " [x]" } else if item.status == .inProgress { line += " [~]" }
            if item.isNow { line += " [now]" }
            if store.collapsed.contains(item.id) { line += " [collapsed]" }
            return line
        }
        let title = { (id: String?) in id.flatMap { store.item($0)?.title } ?? "-" }
        lines.append("--")
        lines.append("editing: \(title(store.editingID))")
        lines.append("active: \(title(store.activeItemID))")
        lines.append("selection: \(store.items.filter { store.selection.contains($0.id) }.map(\.title))")
        return lines.joined(separator: "\n") + "\n"
    }
}
#endif


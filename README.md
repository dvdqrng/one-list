# One List

One intelligent list for every task — native apps for **Mac** (SwiftUI, macOS 14+) and **iPhone & iPad**
(SwiftUI, iOS 17+) that share one model, one design language and one list, synced in realtime through iCloud.
They follow the system design: SF Pro and SF Symbols, the accent color, inspectors, sheets and Settings, with
Liquid Glass on macOS 26 / iOS 26.

## Build & run

Both apps share the bundle ID `com.davidquiring.onelist` (the iOS app is the iOS version of the Mac app) and
the iCloud container `iCloud.com.davidquiring.onelist`, registered for team `Y7G63W88RT`; Xcode's automatic
signing handles profiles. New devices: build once with `-allowProvisioningUpdates -allowProvisioningDeviceRegistration`
(or just ⌘R in Xcode). Before shipping to TestFlight/App Store, deploy the CloudKit schema to production in the
CloudKit Console and set `aps-environment` to `production`.

iOS: choose the `OneListiOS` scheme and an iPhone/iPad, then ⌘R.

```bash
open OneList.xcodeproj          # then ⌘R
# or
xcodebuild -project OneList.xcodeproj -scheme OneList -configuration Release build
```

Run the tests with `⌘U` or `xcodebuild test -project OneList.xcodeproj -scheme OneList`
(they use a scratch data folder, never your real data).

The Xcode project is generated from `project.yml` with [XcodeGen](https://github.com/yonaskolb/XcodeGen);
after adding or removing files run `xcodegen generate`.

## Features

- **List view** — a keyboard-first outliner (see [Keyboard](#keyboard)). A top-level task with nested
  tasks is a *project*. Drag the ⠿ handle to reorder, or use ⌥⌘↑ / ⌥⌘↓.
- **Due-date grouping** (calendar button): Now, Overdue, Today, Tomorrow, This Week, Later, No Due Date.
  Drag tasks between groups to reschedule. Start a 25-minute **focus session** from the *Now* group.
- **Board** (`⌘2`; `⌘1` back to the list) grouped by due date, priority, status, category or project;
  drag cards between columns.
- **Undo** (`⌘Z` / `⇧⌘Z`) for deletes, moves, indenting, status/priority/date/category changes and applied AI changes.
- **Inspector** (`⌥⌘I`, or `⌘I` for the selected task) with notes, status, priority, due date, “Now”,
  category (rename globally), subtasks with progress and a “Suggest Details” action.
- **AI with [Jev](https://typesafe.ai)** (TypeSafe's System One model). Jev only makes decisions — typed
  answers with calibrated confidence — and never writes text, so task titles always stay in your words:
  - **Composer** (`⌘J`, also for dictation): the note is split into sentences, and for each one Jev decides
    whether it is a task, which existing task it refers to, whether that task is now done, and its priority
    and due date. The result is a review sheet; uncertain proposals start unchecked.
  - **Suggestions**: new tasks get priority, due date and category (from your existing categories) shortly
    after you move on. Only empty fields are filled, only with confident answers.
  - **Find Similar Tasks**: duplicates (also across languages) are merged after review.
  Jev reads the *parts* of a date (“Friday”, “31. Juli”); the app does the calendar math (`DueAnchor`).
  The Jev API key lives in the Keychain (Settings `⌘,`); `TYPESAFE_API_KEY` in the environment wins.
- **Dictation** uses Apple's speech recognition on this Mac, with live text as you speak.
- Completed tasks are archived 24 hours after completion. Appearance follows the system (or Settings ›
  Appearance); focus mode is always dark and shows its countdown in the menu bar while a session runs.

## iCloud sync

The Mac and iOS apps keep one list in the user's **private iCloud database** (custom zone `OneList`, one
`Item` record per task) through `CKSyncEngine`:

- **Realtime:** a save on one device is uploaded ~0.4 s after typing settles; the others get a silent push and
  fetch it within seconds. While an app is in front it also checks every 30 s, and on activation / pull to refresh.
- **Offline first:** SQLite stays the local source of truth; changes queue and upload when back online.
- **Conflicts:** per task, the newer edit wins (`Item.modifiedAt`). Suggestion queue states stay per device.
- **Privacy:** titles, notes and categories are encrypted fields (end-to-end encrypted in iCloud).
- Settings shows the status (Up to Date / Syncing / Off with the reason) and has **Sync Now**.
- Builds without the iCloud entitlement (CI zips, `ONE_LIST_DATA_DIR` dev runs) run local-only.

## iPhone & iPad

Everything from the Mac app, adapted to touch:

- **List** as an outliner: tap a task to edit; Return adds the next task (splits at the cursor), Backspace at
  the start joins/outdents, multi-line paste becomes tasks. The keyboard bar has outdent, indent, Now, due date,
  details and dismiss; a hardware keyboard adds Tab/⇧Tab/↑/↓/Esc.
- Project and due-date grouping, collapsing, drag to reorder, swipe (Done, Now / Delete, Details), context menu
  (status, due date, priority, indent, duplicate, delete), search, show completed / details toggles.
- **Board** paging by column (iPhone) or side by side (iPad), with drag & drop between columns.
- **Details** as a sheet (iPhone) or inspector column (iPad), same fields as the Mac inspector.
- **AI composer** with on-device dictation, review sheet, Find Similar Tasks, suggestions — same Jev logic.
- **Focus mode** full screen and dark, all timer styles (incl. Metal orbs), a notification when time is up.
- **Undo/redo** (shake, three-finger gestures, ⌘Z, or the More menu).

## Keyboard

**While typing in a task**

| Key | Action |
| --- | --- |
| `↩` | New task below — splits the text at the cursor; at the start of a task inserts one above; on an empty subtask steps out a level |
| `⌫` at the start | Joins the task onto the one above (on an empty task: outdent, then delete) |
| `⌦` at the end | Joins the next task onto this one |
| `⇥` / `⇧⇥` | Indent / outdent (with subtasks; never skips a level) |
| `↑` / `↓` | Previous / next task, keeping the cursor column |
| `⇧↑` / `⇧↓` | Switch to block selection |
| `⎋` | Stop editing (the task stays selected) |
| `⌘V` with several lines | One task per line; understands indentation, `-`/`*`/`1.` bullets and `[ ]`/`[x]` |

**Selection mode** (no text cursor): `↑`/`↓` move, `⇧↑`/`⇧↓` extend, `⌘A` select all, `↩` edit,
`⌫` delete, `⇥`/`⇧⇥` indent, `⎋` deselect, and typing starts editing the selected task.
`⇧`-click and `⌘`-click select ranges and individual tasks.

**Task menu** (works in both modes, on the selection or the current task)

| Shortcut | Command |
| --- | --- |
| `⌘N` | New task |
| `⌘K` / `⌥⌘K` | Complete or reopen / mark in progress |
| `⌥⌘N` | Add to or remove from *Now* |
| `⌘]` / `⌘[` | Indent / outdent (on a German keyboard `⌘Ä` / `⌘Ö`) |
| `⌥⌘↑` / `⌥⌘↓` | Move up / down (in due-date grouping: to the previous / next date group) |
| `⌥⌘←` / `⌥⌘→` | Collapse / expand |
| `⌘D` | Duplicate |
| `⇧⌘⌫` | Delete (with subtasks) |
| `⌘I` | Show details in the inspector |
| `⌘Z` / `⇧⌘Z` | Undo / redo (puts the cursor back too) |

## Data

On the Mac stored in `~/Library/Application Support/One List/` (`notes.db` SQLite); the Jev API key is in the
Keychain. Task text sent for AI decisions goes to TypeSafe's API; dictation never leaves the Mac. On first launch the data of the former Electron app
(`~/Library/Application Support/one-list/`) is copied over; the original files are left untouched.

## Code layout

| Path | Contents |
| --- | --- |
| `Shared/Model` | `Item`, due-date logic, grouping, outline editing, SQLite `Database`, `AppStore` (state + actions + enrichment queue + remote merge) |
| `Shared/Sync` | `CloudSync`: CKSyncEngine delegate, item ↔ record mapping, conflict handling |
| `Shared/AI` | `JevClient` (HTTP), `TaskIntelligence`, `NoteParser`, `AISettings` |
| `Shared/Design` | The design language for both platforms: `Metrics` (Mac and iOS sizes on one grid), colors, three-state checkbox, metadata labels, section labels, glass |
| `Shared/Services`, `Shared/Views` | Focus timer, dictation, timer dial & orbs, AI composer, change review sheet |
| `OneList/` | macOS app: window & toolbar, list, board, inspector, focus mode, Settings, menu commands, update checker, debug snapshot hook |
| `OneListiOS/` | iOS app: navigation, outliner list + text field, board, details, focus, Settings, `DebugScene` hook |
| `OneListTests` | Due-date, grouping, outline, undo and sync tests (Swift Testing) |


## Releasing

Push a `v*` tag; the GitHub workflow builds the app and attaches a zip to the release. "Check for Updates…"
compares the app version with the latest GitHub release.

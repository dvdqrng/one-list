# Apple Reminders Sync Feature Plan

## Overview
- Add two-way synchronization so in-app tasks stay in lockstep with Apple Reminders lists.
- Keep existing task features intact while offering an explicit, opt-in integration per user.

## Preparation
- Register the app for Reminder entitlements through the Apple Developer Program.
- Decide on the framework surface: EventKit gives on-device access without iCloud dependencies, while CloudKit APIs enable remote sync.
- Verify that target macOS/iOS versions support the chosen Reminders APIs and required permissions.

## Architecture
- Introduce a `ReminderSyncService` that manages EventKit authorization, fetch, push, conflict handling, and logging.
- Extend the task data model with metadata: `source`, `external_id`, `last_synced_at`, `dirty_flag`, and auditing timestamps.
- Add a background sync scheduler covering lifecycle hooks (foreground/background) plus a manual refresh trigger.

## User Experience
- Create a settings pane toggle labeled “Sync with Apple Reminders” showing authorization status, selected lists, and a manual sync button.
- Provide a picker to map Reminder lists to in-app projects/collections.
- Surface sync status and conflicts inline, e.g., banners/toasts when sync fails or requires attention.

## Data Flow
- **Initial import:** Fetch Reminder lists/items, normalize them, and create or update internal tasks.
- **Outbound changes:** Observe local task mutations, mark dirty records, push to EventKit, and persist returned `external_id` values.
- **Conflict handling:** Compare `lastModifiedDate` fields, prefer the newest change, log collisions, and prompt the user when manual resolution is needed.
- **Deletion policy:** Use soft-delete with an undo grace period; only propagate deletions to Reminders after confirmation.

## Security & Privacy
- Request the minimal EventKit permissions, explaining the rationale within onboarding copy.
- Persist tokens/authorizations securely in the keychain; never transmit Reminder data off-device without explicit consent.
- Update the privacy policy and in-app disclosures to describe Reminders access and storage.

## Testing & Monitoring
- Add unit tests for mapping logic, conflict resolution strategies, and error recovery flows.
- Cover UI paths via integration tests: onboarding, permission revocation, manual sync, and conflict prompts.
- Instrument sync duration, error rates, and API throughput to guide future optimizations.

## Milestones
1. **Week 1:** Spike EventKit access, prototype list/task normalization, confirm entitlements.
2. **Week 2:** Build the core sync service, metadata persistence, and initial import/export loops.
3. **Week 3:** Implement settings UI, manual sync control, and conflict presentation.
4. **Week 4:** Harden error handling, expand test coverage, polish UX copy, and update public documentation.


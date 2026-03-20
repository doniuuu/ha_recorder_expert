# Changelog

All notable changes to Recorder Expert are documented here. There is shortened version in recorder_expert/.

---

## [1.1.0] - 2026-03-20

### Added

#### Event Types management (Recorder)
- New **Exclude Event Types** panel in the sidebar, visible only in Recorder mode
- Event type list loaded from HA REST API (`GET /api/events` via Supervisor)
- Active exclusions saved to `recorder_exclude_entities.yaml` under `event_types`, fully compatible with `recorder: exclude: event_types` in HA Core
- Live filter input to search through event types
- Active exclusion count badge in panel header
- **NEW badge** on event types not present in the last saved snapshot (`known_data.json`)

#### Logbook — Recorder inheritance (Transparent Merge)
- In Logbook mode, entities already excluded by Recorder are shown as **read-only** with a lock icon and `FROM RECORDER` status
- Reflects HA Core behaviour: `merge_include_exclude_filters(recorder_filter, logbook_filter)` merges both configs automatically at runtime — no duplication needed in Logbook YAML
- Orange info banner and "Show inherited" checkbox are shown only when Recorder actually has exclusions defined
- Inherited entities cannot be toggled in Logbook mode

#### Unified known data snapshot (`known_data.json`)
- Single file `/config/recorder_expert/known_data.json` replaces separate per-mode `.known.json` files
- Stores both entity IDs and event type IDs per mode
- Snapshot is written only on **Save** — no snapshot means no NEW badges (clean slate behaviour)
- Comparing current state against snapshot gives accurate NEW detection for both entities and event types

#### Save workflow improvements
- **PREVIEW** button opens the YAML preview modal; saving is done from within the modal with a 2-second "SAVED ✓" confirmation screen and green progress bar before the modal closes
- **SAVE RECORDER** and **SAVE LOGBOOK** buttons — independent per-mode save without opening a preview, disabled when the respective mode has no unsaved changes
- Unsaved changes badge (amber dot) on RECORDER / LOGBOOK switcher buttons, driven by a real config comparison (not a flag)
- Badge disappears automatically if changes are reverted to match the last saved state
- Browser `beforeunload` warning when navigating away with unsaved changes
- Auto-backup toggle (checkbox in the Backups modal, persisted in localStorage); when disabled, manual backups still work normally

#### Language support
- Added **Dutch (NL)** translation (`lang/nl.json`) — full coverage of all UI strings
- Language selector redesigned as a custom flag dropdown using **flag-icons** CSS library; flag rendered via `fi fi-XX` CSS class, dropdown positioned as a fixed portal to avoid toolbar overflow clipping

#### UX / UI
- LOAD button shows only the sync icon (no label) to save toolbar space
- All `window.alert()` and `window.confirm()` calls replaced with inline toast notifications and a styled confirm dialog — no more browser popups during normal operation
- Toast notifications auto-dismiss after 3 seconds (green for success, red for error)

### Fixed

- **Recorder / Logbook mode switch icons** rendered correctly (removed conflicting overflow/width classes; switched to inline SVG)
- Language selector dropdown was clipped by toolbar `overflow-x-auto` — fixed by rendering the dropdown as a `ReactDOM.createPortal` attached to `document.body` with `position: fixed` coordinates derived from `getBoundingClientRect()`
- Unsaved badge appeared falsely on startup and on mode switch — fixed by replacing the flag-based approach with a `serializeConfig()` comparison against a per-mode saved snapshot; each mode stores its config independently in `configPerMode`

### Changed

- `config` state refactored to `configPerMode: { recorder, logbook }` — each mode maintains its own config independently, eliminating cross-mode contamination when switching between Recorder and Logbook
- `GET /api/data` response extended with `recorder_config` (in Logbook mode) and `known_event_types` fields
- `POST /api/save` now accepts `known_event_types` in the payload, written into `known_data.json`
- `yaml_manager.save_yaml_files()` signature extended with `event_types_ids` parameter
- `yaml_manager.get_known_entities()` replaced by `yaml_manager.get_known_data()` returning `{ entities: set, event_types: set }`

---

## [1.0.0] - 2026-03-15

Initial release.

- GUI-based management of `recorder` and `logbook` include/exclude filters
- Entity include, exclude, and glob rules via React interface
- Domain-level include/exclude controls
- New entity discovery with `NEW` badge
- Ghost entity detection and cleanup
- Smart filtering by domain, state, unit of measurement, and status
- Automatic backup on every save with restore and delete from UI
- Multi-language support (English, Polish)
- Lightweight FastAPI backend with ruamel.yaml for comment-safe YAML editing
- Tested with 1000+ entities

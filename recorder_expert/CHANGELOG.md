## 1.1.0

### Added
- Event Types panel in Recorder sidebar — exclude specific HA event types from being recorded
- Logbook mode now shows entities inherited from Recorder as read-only (FROM RECORDER status)
- SAVE RECORDER and SAVE LOGBOOK buttons — independent per-mode save, disabled when nothing changed
- Unsaved changes indicator (amber dot) on mode buttons, based on real config diff
- Browser warning when closing tab with unsaved changes
- Auto-backup toggle in Backups panel
- Dutch (NL) translation
- Flag dropdown for language selection

### Fixed
- Unsaved badge no longer appears falsely on startup or mode switch
- Language dropdown no longer clipped by toolbar overflow

### Changed
- known_data.json replaces separate .recorder_known.json and .logbook_known.json files
- PREVIEW button now shows SAVED confirmation with progress bar before closing

## 1.0.0

- Initial release

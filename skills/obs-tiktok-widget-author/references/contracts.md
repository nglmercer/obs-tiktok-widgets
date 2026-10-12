# Contracts

See [template manifests](../../../docs/TEMPLATE_ENGINE_V2.md) and [Event Playground](../../../docs/EVENT_PLAYGROUND.md). Templates have schemaVersion 2, a unique dotted/dashed ID, semantic version, entry beneath src, supported events, dimensions, config schema, assets and presets. Installed versions are immutable; create/fork an instance for editing. Packages are bounded, checksummed ZIPs of regular portable files without symlinks or install scripts.

Use `window.TikTokWidgetConfig` for public appearance settings. Subscribe to `tiktok:event` or a typed event, not both for the same rendering. v1 events retain synthetic, method, room, messageId, receivedTimestamp and data. IDs/counts are uint64 decimal strings. Gift repeat_count is cumulative within group_id; show max, never sum 1+5+23. The final repeat_end respects the Completed setting.

Keep relative references inside src/assets. Import external files explicitly rather than escaping the project. Scripts are trusted user code; no secret fields belong in renderer configuration. Precompile TypeScript/bare modules before importing them into a plain runtime project.

# Public event contract v1

Every accepted event goes to `tiktok:event`; its matching channel is `tiktok:<type>`. Normalized types are `chat`, `gift`, `like`, `member`, `social`, and `roomUser`. Schema-only/unrecognized messages use `unknown` while preserving the exact method, schema object, wire fields, flags, warnings, and retained bytes when raw. `state` snapshots have a state object. `follow` is an additional alias only for social messages whose `common.displayText.key` identifies a follow and excludes unfollow. This follows the upstream display-key convention, not a guessed numeric social action. Ambiguous social events remain available without being labeled follow.

The generic channel emits once per source event. A follow alias preserves its original social envelope/type; subscribers on that channel should rely on the channel identity. Synthetic follow fixtures use type `follow` directly.

```json
{
  "version": 1,
  "type": "gift",
  "room": "@creator",
  "method": "WebcastGiftMessage",
  "messageId": "18446744073709551615",
  "isHistory": false,
  "sourceTimestamp": "1760000000",
  "sourceTimestampUnit": "server-defined",
  "receivedTimestamp": "1760000000123",
  "data": {
    "gift_id": "5655",
    "gift_name": "Rose",
    "repeat_count": "3",
    "group_id": "123",
    "repeat_end": true,
    "user": {"id": "123", "nickname": "Viewer"}
  },
  "native": {}
}
```

The example is illustrative. Actual public normalized names come from the pinned ttl-live-events serializer: `comment`, `user.unique_id`, `user.avatar_url`, `gift_id`, `gift_name`, `diamond_count`, `repeat_count`, `combo_count`, `group_id`, `repeat_end`, `gift_image_url`; likes expose `count` and `total`; room-user exposes `total`, `popularity`, `total_user`, `anonymous`, and ranking arrays. Normalized numeric fields are decimal strings (member action is an integer); schema 64-bit values are strings. Use BigInt or retain strings, never Number for identity/counters.

`sourceTimestamp` is optional and preserves common.create_time as a string without asserting server units. `receivedTimestamp` is local Unix milliseconds as a decimal string. `native` is the complete pinned FULL serialization and carries `support`, `schema`, `wireFields`, `flags`, original normalized data, and source fields. Schema field bytes use `$bytes` base64 objects. Raw unknowns include `rawPayload` with retained protobuf bytes; upstream truncation limits still apply. Upstream flags are TRUNCATED=1, UNKNOWN_SCHEMA=2, UNKNOWN_FIELDS=4, DECODE_WARNING=8. Synthetic events set `synthetic:true` and use the same queue and bridge.

Gift repeat counts are cumulative within group_id; final repeat_end contains the final total. Count deltas relative to the previous maximum, or count only the final total once. Do not sum every repeat_count. The built-in renderer uses the maximum cumulative count and shows completion, with bounded identity memory. This is not an accounting ledger across source reloads.

History and unknown events are not filtered out automatically. Widget filters apply locally and do not remove events from other widgets. The bounded queue exposes overflow/oversize/duplicate/delivery-failure diagnostics. Events lost while a source is unloaded cannot be replayed; state snapshots arrive every two seconds.

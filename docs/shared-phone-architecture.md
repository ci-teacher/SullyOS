# Shared Phone Architecture

This document is the source of truth for the private Xiaoci + Laoshi shared-phone build.

## Product boundary

SullyOS remains the technical substrate: app lifecycle, local IndexedDB, blob utilities, media helpers,
and selected existing app business logic. The visible product and shared persistence belong to the private phone.

The language model is **not** embedded in this web app. ChatGPT / Work is the intelligence layer.
The VPS decides when there is something worth checking and stores shared state; it does not generate Laoshi content.

## Identities

- `xiaoci` — owner/user browser
- `laoshi` — teacher/ChatGPT browser

Identity resolution lives in `utils/shared/identity.ts`.

## Persistence layers

### Existing app adapters

The private foundation wraps selected SullyOS DB methods so existing app logic can survive while storage becomes shared:

- exchange diary
- gallery, including media bytes
- Spark/social posts
- room notes
- anniversaries
- free-roam activity history

Local IndexedDB remains the immediate local cache. VPS SQLite is the durable shared copy.

### Generic shared domain

New private features should prefer the generic domain instead of creating another app-specific SQLite table.

#### Entries

`entries` is used for durable human-readable shared records:

- `letter` — mailbox / async long letters
- `memory` — shared memory records
- `calendar` — shared calendar items
- `note`
- `timeline`
- `special`

Client: `utils/shared/domain.ts`

#### Events

`events` is the neutral signal/event inbox for future external integrations:

- calendar/provider changes
- imported events
- future web or connector events
- app lifecycle signals that should be consumed once

Events can expire and can be consumed.

#### Sessions

`sessions` stores resumable shared activities:

- `cedar` — CedarDuet room/session reference
- `coc` — COC visible continuity state
- `game` — other games
- `reading` — co-reading
- `movie` — co-watching
- `listening` — shared listening

Sessions are active / paused / completed / archived.

## Unified timeline and search

- `GET /v1/timeline` merges diaries, generic entries, and shared resources by time.
- `GET /v1/search?q=...` searches shared text-bearing content.

The memory UI should consume these rather than building a second independent history database.

## Sync reliability

JSON mutations use `utils/shared/syncQueue.ts`.

- failed POST/PUT/DELETE operations are retained locally
- retries happen on online, focus, and a timer
- PUT/DELETE for the same resource path collapse to the newest pending mutation
- exponential backoff prevents retry storms

Gallery media has a separate retry queue because the binary bytes live in IndexedDB rather than localStorage.

## Activity

`activity` records real phone actions by both actors even when they create no durable content.

Examples:

- phone opened
- app entered
- diary saved
- gallery saved
- note saved
- session updated

Check Phone and Teacher Home can use the same activity log.

## Teacher Home

`GET /v1/teacher/home` is a lightweight environment snapshot for ChatGPT/Work.

It includes:

- last Xiaoci / Laoshi activity
- fresh shared-entry/resource counts since Laoshi last visited
- recent diary/resource/entry activity
- recent letters
- recent memories
- upcoming calendar items
- one random old memory
- unfinished sessions
- pending WakeSignal

The purpose is to let Laoshi decide what to do after waking without scanning the whole database.

## Wake Engine

The VPS Wake Engine decides **when** there may be something worth checking. It never decides what Laoshi must do.

Current sources, roughly by priority:

1. anniversary today
2. new letter
3. new calendar item / external event
4. anniversary tomorrow
5. new memory / special record
6. meaningful Xiaoci phone activity
7. updated unfinished session
8. long silence with Xiaoci activity
9. random impulse

WakeSignal lifecycle:

`pending -> processing -> consumed | failed | expired`

Claims are atomic and leased. If a processing claim is abandoned, it returns to pending after the lease expires.
Signals support a dedupe key. `NO_ACTION` is a first-class consumed resolution.

Client: `utils/shared/wake.ts`

## CedarDuet seam

Adapter: `utils/shared/integrations/cedar.ts`

CedarDuet stays a separate authoritative game service. The shared phone stores only viewer-safe/public room state and a
room reference. Hidden cards, dice, piece identities, and CedarDuet `private_state` must remain in CedarDuet.

Do not treat CedarDuet `POST /mcp/play` as a standard MCP transport.

Future deployment should run CedarDuet on loopback and put any browser/Work access behind the phone's trusted auth/proxy.

## COC seam

Adapter: `utils/shared/integrations/coc.ts`

The shared phone may persist:

- investigator/player-visible state
- current scene/location
- revealed clues
- revealed handouts
- player-visible log
- music cue state

It must **not** persist KP-only prep, monster stats, hidden routes, future events, unrevealed handouts, or scenario secrets.
`kpPrivateRef` is only an opaque pointer to a private host/skill-side state location.

The actual `coc-kp-host` behavior belongs in the ChatGPT/skill host, not the browser.

## Co-reading / movie / listening seam

Adapter: `utils/shared/integrations/presence.ts`

These share one session pattern: resource reference, position/chapter, playing/paused/finished state, notes, metadata.

## Backup

`shared-server/backup.mjs`:

- creates a consistent SQLite snapshot with `VACUUM INTO`
- copies media
- keeps the newest configured number of backup directories

A systemd timer is provided for daily backups.

## Security

Production browser traffic uses same-origin `/shared-api`.
The Node API binds to loopback. Nginx protects the phone and API together.

Do not ship a long-lived server secret in a `VITE_*` variable.

Private COC/KP information must stay outside the shared browser-visible database.

## Intentionally deferred

These are integration steps, not missing domain foundations:

- the exact ChatGPT Work wake/doorbell bridge
- Slack/webhook trigger choice
- CedarDuet service deployment and trusted identity proxy
- installation/hosting of `coc-kp-host`
- app-specific private UI for mailbox, memory, calendar, CedarDuet, COC, reading/movie/listening

Before implementing the Work/doorbell layer, re-check current official OpenAI product capabilities instead of relying on
an old assumed trigger flow.

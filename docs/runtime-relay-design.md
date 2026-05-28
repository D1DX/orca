# Runtime Relay Connections

## Status

Implemented plan for issue #2471.

## Problem

Orca mobile, web, and desktop runtime clients currently pair to the host runtime by
connecting directly to the host's WebSocket endpoint. That works on a shared LAN,
VPN, or tailnet, but fails for users who want to reach their host runtime from a
different network without exposing an inbound port on the host.

We need a self-hostable relay option that lets the host and client both connect
outbound to a public or private relay, while preserving Orca's current security
model:

- the relay must not be trusted with source code, terminal output, browser
  screenshots, file contents, credentials, or RPC payloads
- existing per-device tokens must remain the authorization mechanism
- existing end-to-end encryption must remain the confidentiality and integrity
  boundary
- existing direct WebSocket pairing must keep working
- SSH workspaces must continue to work because the runtime RPC surface can target
  local and SSH-backed worktrees

## Goals

1. Add a self-hostable relay server that forwards WebSocket frames between Orca
   runtime hosts and runtime clients without decrypting them.
2. Let mobile, web, and desktop runtime clients pair through the relay without
   being on the same LAN or tailnet as the host.
3. Reuse the existing `E2EEChannel`, `DeviceRegistry`, mobile method allowlist,
   streaming dispatch, and binary terminal stream handling.
4. Keep relay deployment independent from the Electron app so users can run it on
   a VPS, container host, or internal server.
5. Keep direct pairing as the default low-latency path when it is reachable.

## Non-goals

- Do not replace the SSH relay binary in `src/relay/`. That code is for remote
  workspace execution over SSH, not public runtime client pairing.
- Do not make the relay a trusted service or add server-side RPC awareness.
- Do not add user accounts, cloud-hosted account identity, or central device
  sync.
- Do not add offline message delivery. A relay can buffer a small number of
  pre-data-socket frames during connection setup only; it is not a queue.
- Do not tunnel arbitrary TCP ports through this relay. Browser and terminal
  behavior continue to use Orca runtime RPCs.
- Do not remove the existing direct WebSocket pairing flow.

## Current Orca Architecture

Direct runtime pairing today has these pieces:

- `src/shared/pairing.ts` defines a pairing offer containing:
  - `endpoint`
  - `deviceToken`
  - `publicKeyB64`
- `src/main/runtime/runtime-rpc.ts` creates pairing offers from the local
  WebSocket transport and owns authorization.
- `src/main/runtime/rpc/ws-transport.ts` accepts local-network WebSocket clients.
- `src/main/runtime/rpc/e2ee-channel.ts` performs the E2EE handshake and binds the
  authenticated `deviceToken` to the WebSocket.
- `mobile/src/transport/rpc-client.ts`, `src/renderer/src/web/web-runtime-client.ts`,
  and `src/shared/remote-runtime-request-connection.ts` connect to the pairing
  endpoint and run the same E2EE handshake.

The current WebSocket path already has the security boundary we want. The relay
should only provide reachability.

## Proposed Architecture

Add an untrusted frame-forwarding runtime relay with one control socket per host
and one data socket per client connection.

```text
                         control: connected/sync/disconnected
                  +-----------------------------------------------+
                  |                                               |
                  v                                               |
+-------------+        outbound WS        +----------------+      |
| Orca host   |-------------------------->| Runtime relay  |<-----+
| runtime     |                           | server         |
|             |<--------------------------|                |<----------------+
+-------------+        outbound WS        +----------------+                 |
      ^              server data socket          ^                           |
      |                                          | client data socket        |
      | existing runtime RPC after E2EE          |                           v
      +--------------------------------------------------------------+-------------+
                                                                     | Orca client |
                                                                     +-------------+
```

The relay never sees decrypted RPC payloads. It sees routing metadata in the
WebSocket URL and frame sizes/timing only. Relay pairing also requires a
fresh-session E2EE handshake so an active relay cannot replay a captured
authenticated session while a device token remains valid.

### Why control plus per-client data sockets

Orca's runtime server treats each WebSocket as an independent security and
lifecycle boundary:

- each WebSocket owns an `E2EEChannel`
- each WebSocket gets a connection id used for subscription cleanup
- binary terminal stream handlers are registered per connection
- closing one socket must not tear down other sockets for the same device token
- mobile clients may keep multiple concurrent sockets

A single multiplexed relay tunnel would require inventing a second framing layer
inside the existing encrypted frame stream and then remapping lifecycle cleanup
back to virtual sockets. That is higher risk and would duplicate behavior that
already works. A per-client data socket lets the relay present the same shape as
a direct WebSocket, so the runtime can reuse the existing attachment path.

## Protocol

All relay endpoints use WebSocket upgrades under `/ws`.

### Query parameters

```text
role=server|client
serverId=<stable host relay id>
connectionId=<relay assigned connection id, data sockets only>
v=1
```

`serverId` is a stable high-entropy id persisted in the host's user data
directory. It is a routing key, not an authorization secret. The pairing offer is
still the authorization grant because it carries a revocable `deviceToken` and
the host public key.

Host-side relay sockets also require a host-only relay secret. That secret is
generated with the relay `serverId`, stored only on the host, and sent on
`role=server` control/data socket upgrades in an `Authorization: Bearer
<hostToken>` header. It is never included in client pairing offers or query
strings. Without this separate host capability, anyone who learns a pairing URL
could connect as `role=server` and replace the real host's relay sockets.

First-time host enrollment also requires a relay enrollment token generated or
configured when `orca relay serve` starts. Operators add the token to the saved
host relay URL as `?enrollmentToken=<token>`. The host strips it from WebSocket
query strings and sends it only as `X-Orca-Relay-Enrollment` on the host control
socket. The token is not included in client pairing offers, host data sockets,
or relay client URLs.

The relay persists a server-side binding for each host:

- the first valid host control connection for an unknown `serverId` must present
  the relay enrollment token and then stores `sha256(hostToken)` in the relay
  state file before the control socket is accepted
- later host control and host data sockets for that `serverId` must present a
  token whose hash matches the stored binding
- client sockets for an unregistered `serverId` are rejected so they cannot
  create unbounded pending state before a host has enrolled
- host data sockets cannot create a binding; only the host control socket can
  enroll a `serverId`
- relay restart reloads bindings from the state file before accepting sockets
- rotation requires the host to generate a new relay identity or the relay
  operator to explicitly reset that `serverId` binding, after which old pairing
  offers for the previous `serverId` stop working

The enrollment token prevents unauthenticated callers from squatting arbitrary
`serverId` values or filling the binding file on an exposed relay. Once enrolled,
the relay state file is the source of truth. Relay startup fails closed if that
file exists but cannot be parsed or has an invalid shape; silently treating
corrupt persisted bindings as empty would allow accidental re-enrollment.

### Host control socket

The host opens:

```text
wss://relay.example.com/ws?role=server&serverId=<serverId>&v=1
```

The relay sends plaintext control messages on that socket:

```ts
type RelayControlMessage =
  | { type: 'sync'; connectionIds: string[] }
  | { type: 'connected'; connectionId: string }
  | { type: 'disconnected'; connectionId: string }
```

Control messages contain only relay routing ids. They do not include device
tokens, public keys, RPC methods, file paths, or workspace identifiers.

The host treats the relay control socket as untrusted input. It validates every
control message against the same `connectionId` shape as the relay server,
deduplicates ids, ignores duplicate `connected` messages for already-open local
data sockets, and applies host-side caps before opening outbound data sockets.
If a `sync` list exceeds the configured host cap or contains invalid ids, the
host closes the control socket and reconnects with backoff rather than trying to
service the list.

### Client data socket

The client opens the endpoint from the pairing offer:

```text
wss://relay.example.com/ws?role=client&serverId=<serverId>&v=1
```

The relay assigns a random `connectionId`, accepts the client socket, notifies the
host control socket, and buffers up to a small cap of early client frames until
the matching server data socket attaches.

### Host data socket

After a `connected` or `sync` control message, the host opens:

```text
wss://relay.example.com/ws?role=server&serverId=<serverId>&connectionId=<connectionId>&v=1
```

The relay forwards frames in both directions between:

- the single client socket assigned to `connectionId`
- the one server data socket tagged `server:<connectionId>`

For v1, allow exactly one client socket per `connectionId`. A replacement client
socket closes the older client socket for that connection id only as a duplicate
connection guard. This keeps the relay shape aligned with Orca's existing
one-transport-one-`E2EEChannel` lifecycle. If the host data socket closes, the
relay closes the client for that `connectionId` so the client reconnects and
re-handshakes.

### Frame handling

The relay treats frames as opaque bytes or text and does not parse application
payloads.

Rules:

- max accepted frame size matches or is below Orca's direct WebSocket max
- pending early frames are capped per `connectionId`
- pending clients, active data sockets, and buffered bytes are capped per
  `serverId` and globally before the relay notifies the host
- pending client connections without a matching host data socket are closed after
  an attach deadline
- control sockets do not forward data frames
- server data socket replacement closes the older server data socket
- client disconnect of the last client for a `connectionId` closes the server data
  socket and removes pending frames
- host-role sockets without a matching stored host token binding are rejected
  before any routing state is changed

## Pairing Offer Shape

Use a compatible first version by keeping `PairingOffer` v2 and setting
`endpoint` to the relay client WebSocket URL. Existing clients already treat the
endpoint as opaque.

Direct offer:

```json
{
  "v": 2,
  "endpoint": "ws://192.168.1.20:6768",
  "deviceToken": "...",
  "publicKeyB64": "..."
}
```

Relay offer:

```json
{
  "v": 2,
  "endpoint": "wss://relay.example.com/ws?role=client&serverId=...&v=1",
  "deviceToken": "...",
  "publicKeyB64": "..."
}
```

This minimizes client migration. Future work can add multi-endpoint pairing
offers so a saved environment can prefer direct when reachable and fall back to
relay. That is intentionally deferred to keep the first implementation smaller.

## Components

### Runtime relay server

New module: `src/runtime-relay-server/`

Responsibilities:

- start an HTTP server with `/health` and `/ws`
- validate relay query parameters
- route sockets by `serverId`, `role`, and `connectionId`
- forward frames without parsing application payloads
- enforce connection, frame, and buffer caps
- close paired sockets on disconnect/replacement
- expose clear logs for host/control/data lifecycle without logging secrets

The module name avoids conflict with `src/relay/`, which remains SSH workspace
relay code.

Initial runtime target: Node. Packaging can be a CLI entry in `out/cli` or a
separate built script invoked by `orca relay serve`. The implementation should
not depend on Electron APIs.

### Host relay client

New main-process module: `src/main/runtime/relay-client.ts`

Responsibilities:

- connect the host control socket outbound
- reconnect control with bounded backoff
- heartbeat control and data sockets
- open host data sockets when control reports client connections
- close data sockets when control reports disconnection
- enforce host-side caps for control messages from an untrusted relay:
  - reject invalid `connectionId` values
  - reject `sync` lists longer than the host relay data socket cap
  - deduplicate `sync` ids before reconciling
  - ignore duplicate `connected` events for already-open ids
  - refuse to open new data sockets once pending plus active relay sockets reach
    the host cap
  - close local data sockets that do not reach the runtime E2EE ready state by
    the host data attach deadline
- pass each host data socket into the runtime's external WebSocket attach path
- expose relay status for settings UI and diagnostics

### Runtime external socket attachment

Refactor `OrcaRuntimeRpcServer` so the local WebSocket listener and relay data
sockets share one attachment method.

The extracted method must own these existing invariants:

- create per-WebSocket connection id
- instantiate `E2EEChannel`
- validate device token through `DeviceRegistry`
- set client id after E2EE auth
- update device `lastSeenAt`
- call `handleWebSocketMessage`
- forward encrypted binary frames to terminal stream handlers
- abort dispatches and clean subscriptions on close
- call `runtime.onClientDisconnected` only when the last socket for a device token
  closes
- terminate both direct and relay-backed sockets when a device token is revoked

Local direct WebSocket behavior must not change.

### Settings and IPC

Add IPC to:

- read relay config and runtime status
- update relay URL and enabled state
- generate a relay mobile QR
- generate a relay runtime pairing URL
- report whether relay pairing is available

Suggested config fields:

```ts
type RuntimeRelayConfig = {
  enabled: boolean
  endpoint: string
}
```

`endpoint` is a canonical WebSocket URL such as `ws://127.0.0.1:8787` or
`wss://relay.example.com`. TLS is derived from the URL scheme so settings do not
carry two conflicting sources of truth. Store this in the same user settings path
used for runtime/mobile settings if one exists. If there is no durable settings
owner that fits, add a narrow runtime-relay config file under user data with
secure write behavior for consistency.

### CLI

Add a self-hosted relay command:

```text
orca relay serve --host 0.0.0.0 --port 8787
```

Optional flags:

```text
--host <host>
--port <port>
--public-url <ws-or-wss-url>
--state-path <path>
--enrollment-token <token>
--json
```

Do not add TLS certificate management in the first implementation. Production
TLS can be handled by a reverse proxy. The command should print the HTTP and
WebSocket bind URL, and should separately print the public WebSocket URL users
must configure when the relay binds to `0.0.0.0`, `::`, or another non-client
address. `--public-url` must point at the relay `/ws` endpoint, usually a
reverse-proxied `wss://relay.example.com/ws` URL. Keep stdout JSON-pure when
`--json` is passed.

`--json` prints exactly one startup object to stdout and all subsequent logs to
stderr:

```json
{
  "ok": true,
  "kind": "runtime_relay_server",
  "protocolVersion": 1,
  "httpUrl": "http://127.0.0.1:8787",
  "webSocketUrl": "ws://127.0.0.1:8787/ws",
  "advertisedWebSocketUrl": "ws://127.0.0.1:8787/ws",
  "publicUrlRequired": false
}
```

Startup failures print one JSON failure object to stdout and exit non-zero. No
other stdout bytes are allowed in `--json` mode.

### UI

Add relay controls to the existing mobile/runtime pairing settings area instead
of creating a separate top-level page.

User-facing states:

| State | Direct pairing | Relay pairing |
| --- | --- | --- |
| WebSocket disabled | unavailable | unavailable with instruction to enable runtime WebSocket |
| Relay not configured | available if LAN address exists | unavailable with endpoint input |
| Relay connecting | available if LAN address exists | disabled, shows connecting |
| Relay connected | available if LAN address exists | available |
| Relay error | available if LAN address exists | disabled, shows concise error |

Use existing design tokens, shadcn primitives, and settings layout patterns.
Relay QR/link generation is disabled unless the host control socket is currently
connected. This v1 rule favors fewer broken pairing links over offline
pre-generation.

## Data Flows

### Happy path

```text
1. Host runtime starts direct WebSocket and E2EE keypair/device registry.
2. Host relay client connects control socket to relay.
3. User generates a relay QR or runtime pairing URL.
4. Client opens relay client URL from the pairing offer.
5. Relay assigns connectionId and notifies host control socket.
6. Host opens server data socket for connectionId.
7. Client sends plaintext e2ee_hello through relay.
8. Host E2EEChannel replies e2ee_ready with a fresh host challenge through relay.
9. Client sends encrypted e2ee_auth with deviceToken and that host challenge.
10. Host validates the challenge and token, marks device lastSeenAt, and
    dispatches RPCs.
```

### Nil path

Relay config is absent or disabled.

- Direct pairing works as it does today.
- Relay QR and relay runtime URL actions are disabled.
- IPC returns `{ available: false, reason: 'relay_not_configured' }`.

### Empty path

Relay is enabled but no client is connected.

- Control socket stays connected.
- Relay status shows connected with zero active data sockets.
- No runtime subscriptions or E2EE channels are created until a client data socket
  exists.

### Upstream error path

Relay endpoint is unreachable, returns non-WebSocket response, or closes control.

- Host relay client reconnects with bounded backoff.
- Settings status shows the latest concise error.
- Existing direct WebSocket clients remain connected.
- Existing relay clients reconnect according to their current client behavior.
- No device tokens are rotated automatically because endpoint failure is not token
  compromise.

## Security Model

### Trust boundaries

Trusted:

- Orca host runtime process
- paired client that has a valid pairing offer
- secure local user data files storing device tokens and E2EE keypair

Untrusted:

- runtime relay server
- network path between relay and host/client
- other clients that can guess or learn `serverId` but do not have a valid
  device token

### Relay visibility

The relay can see:

- source IPs
- connection timing
- frame sizes
- `serverId`
- relay `connectionId`
- role query parameter

The relay must not see:

- device tokens
- decrypted RPC methods or params
- file paths
- terminal data
- browser screenshots
- source code
- E2EE shared keys

The relay may see plaintext `e2ee_hello` and `e2ee_ready` frames because those are
already part of the existing E2EE handshake and contain public-key/control data
only. It cannot complete `e2ee_auth` without a valid device token encrypted under
the derived shared key.

### Authorization

`serverId` is not authorization. It is routing metadata. Host enrollment and
runtime authorization are separate:

1. first host control enrollment requires the relay enrollment token
2. every host control/data socket requires the host token bound to `serverId`
3. runtime clients require possession of the pairing offer's device token
4. runtime clients complete the E2EE handshake against the host public key
5. the host checks `DeviceRegistry.validateToken`
6. the host applies the method allowlist for `mobile` scoped devices

### Freshness, replay, and downgrade

Relay pairing must upgrade the existing E2EE handshake before it ships. The host
will include a fresh random challenge in `e2ee_ready`, and the client will echo
that challenge inside encrypted `e2ee_auth`. The host accepts authentication only
when the encrypted auth frame contains the current challenge for that WebSocket.

Why this is required: with a direct LAN connection, the current protocol relies
on network reachability plus E2EE authentication. With an untrusted relay in the
middle, the relay can observe and replay encrypted frames even though it cannot
decrypt them. A per-socket host challenge makes a previously captured
`e2ee_auth` unusable on a new relay data socket.

Post-auth encrypted frames already carry a random NaCl box nonce in Orca's shared
`encryptBytes` format, so modified frames fail authentication. Relay-backed
sockets must also reject exact encrypted-frame replay on the same live socket by
adding a monotonic sequence number inside every encrypted post-auth frame:

- each endpoint keeps independent outbound and inbound sequence counters per
  WebSocket
- text frames encrypt `{ type: 'e2ee_frame', seq, payload }`, where `payload` is
  the JSON string the direct transport already encrypts
- binary frames encrypt an 8-byte big-endian `seq` prefix followed by the binary
  payload direct transport already encrypts
- the receiving side accepts only `seq === previousInboundSeq + 1`
- duplicate, old, skipped, non-finite, or malformed sequence numbers close the
  socket before RPC dispatch or binary-frame delivery
- counters reset only when the WebSocket closes; replaying frames onto a new
  socket is still rejected by the fresh auth challenge

The relay sees only ciphertext and cannot change sequence numbers without failing
authentication. Relay protocol version `v=1` exists so future incompatible
routing changes can add a different framing format if we need one.

Compatibility rule:

- Direct local-network WebSocket sockets may temporarily accept legacy
  challenge-less auth so existing mobile/runtime clients do not break on host
  upgrade.
- Relay-backed sockets must reject challenge-less auth.
- New clients always include the challenge when the `e2ee_ready` frame includes
  one.
- New host and client transports enforce monotonic inbound encrypted frame
  sequence numbers on relay-backed sockets.

The runtime socket attachment receives a transport kind (`direct` or `relay`) and
passes it into `E2EEChannel` so the channel can enforce the stricter relay auth
and sequence rules. Runtime clients receive the same transport kind from the
pairing endpoint so they can enforce sequence numbers for host-to-client frames.
Tests must cover both branches: legacy direct auth still works during the
compatibility window, legacy relay auth fails, and replaying, skipping, or
reordering an encrypted frame on a live relay socket closes before duplicate RPC
dispatch.

### Logging

Relay and host logs must not include:

- full pairing URLs
- `hostToken`
- `deviceToken`
- `publicKeyB64`
- decrypted RPC payloads
- file paths from encrypted payloads

Log routing ids, connection counts, close codes, and redacted endpoints. The
host token is carried in an authorization header rather than the WebSocket URL to
avoid routine reverse-proxy query logging; relay docs must still call out proxy
header redaction for production deployments.

## Operational Design

### Deployment

Self-hosted deployment can run:

```text
orca relay serve --host 0.0.0.0 --port 8787
```

The command prints a bind-only WebSocket URL and an enrollment token. Configure Orca
with the public endpoint plus `?enrollmentToken=<token>` for first enrollment.
For internet use, run behind a TLS reverse proxy and configure Orca with the
public `wss://` endpoint, or pass it directly as `--public-url
wss://relay.example.com/ws` so startup output names the usable client URL.

### Resource limits

Initial defaults:

| Limit | Default |
| --- | --- |
| Max frame bytes | 1 MiB |
| Max host control sockets per serverId | 1 |
| Max server data sockets per connectionId | 1 |
| Max client sockets per connectionId | 1 |
| Max pending client connections per serverId | 64 |
| Max active data sockets per serverId | 64 |
| Max buffered early frames per connectionId | 4 |
| Max buffered early bytes per connectionId | 4 MiB |
| Max total buffered early bytes per serverId | 16 MiB |
| Client attach deadline | 15 s |
| Control heartbeat interval | 15 s |
| Stale control timeout | 45 s |
| Host max relay data sockets | 32 |
| Host max sync ids | 32 |
| Host data attach deadline | 15 s |
| E2EE relay frame counters | uint53 monotonic per direction per socket |

Why these limits: direct WebSocket already caps message size and the runtime caps
connections. The relay should fail closed before it can become an unbounded memory
sink. With a 1 MiB frame cap and 4 MiB per-connection byte cap, the effective
early buffer is four maximum-sized frames; smaller frames are still bounded by the
byte cap. When a per-host or global cap is hit, the relay rejects or closes the
newest unauthenticated client with a retryable overload close code before
notifying the host.

The relay-side limits are not the only defense. The host relay client also caps
control-plane fanout because the relay is untrusted. A malicious relay can send
arbitrary `connected` and `sync` messages, so the host must bound local socket
creation independently of any relay-side admission checks.

The relay frame counters use constant memory. A peer that reaches the maximum
safe JavaScript integer sequence value must reconnect and reauthenticate before
sending more frames; this is not expected in normal use, and it avoids wraparound
ambiguity.

### Rollback

Relay is additive. If a problem is found:

1. Disable relay in settings or unset the relay endpoint.
2. Existing direct pairing continues to work.
3. Previously generated relay pairing offers stop working once the host relay
   client disconnects, but their device tokens remain revocable through the
   existing device management UI.

No data migration is required for rollback if the first version stores only relay
configuration and a stable `serverId`.

## UX Journey

### Pair mobile through relay

1. User opens Settings -> Mobile.
2. User enters relay endpoint and enables relay.
3. UI shows relay status as connecting, then connected.
4. User chooses relay QR.
5. Phone scans QR and connects from any network.
6. Phone appears in paired devices after successful E2EE authentication.

Failure states:

- Invalid relay URL: inline validation error, QR disabled.
- Relay unreachable: status shows last connection error, QR disabled unless we
  deliberately allow pre-generation. Initial implementation disables QR to avoid
  giving users a link that cannot work yet.
- Auth rejected: existing mobile auth-failed state remains unchanged.

### Pair desktop/web runtime through relay

1. User opens runtime pairing controls.
2. User copies relay runtime pairing URL.
3. Remote desktop/web client imports the URL.
4. Client connects through relay and receives `status.get`/runtime metadata after
   E2EE authentication.

Failure states mirror mobile.

## Implementation Plan

### Phase 1: Relay server

- Add `src/runtime-relay-server/protocol.ts` with query parsing and typed control
  messages.
- Add `src/runtime-relay-server/server.ts` with HTTP/WebSocket server lifecycle.
- Add host-only relay identity storage containing `serverId` and `hostToken`.
- Add CLI handler `orca relay serve`.
- Add tests for enrollment-token-gated first-use host token binding, wrong-token
  rejection, malformed persisted state fail-closed behavior, routing,
  replacement, caps, attach deadline cleanup, and close propagation.

### Phase 2: Runtime external socket attach

- Add fresh host challenge support to the E2EE channel and all runtime clients.
- Add relay-backed encrypted frame sequence enforcement to the host
  `E2EEChannel` and to mobile/web/desktop runtime clients.
- Extract WebSocket/E2EE attachment from `OrcaRuntimeRpcServer.start()`.
- Keep `WebSocketTransport` responsible for local accept/heartbeat only.
- Add tests proving direct WebSocket pairing behavior is unchanged.
- Add tests proving relay-backed sockets reject challenge-less auth while direct
  sockets keep the documented compatibility behavior.
- Add tests proving duplicate, skipped, and reordered encrypted frames on a live
  relay socket close before duplicate RPC dispatch or duplicate binary-frame
  delivery.

### Phase 3: Host relay client

- Add relay config and stable host relay id.
- Add `RuntimeRelayClient` for control/data sockets.
- Start/stop relay client with runtime RPC server lifecycle.
- Add status reporting and tests for reconnect, sync, connected, and disconnected.
- Define `sync` reconciliation as idempotent: open only missing data sockets,
  close local data sockets absent from `sync`, and never replace a live local
  data socket only because its id appeared again in a later `sync`.
- Add tests for malicious control messages: oversized `sync`, invalid
  `connectionId`, duplicate `connected`, data-socket cap exhaustion, and data
  sockets that never reach E2EE ready.

### Phase 4: Pairing and IPC

- Add relay offer generation for mobile and runtime pairing.
- Keep existing direct offer IPC responses stable.
- Add redaction helpers for relay endpoints in logs.
- Add tests for relay pairing URL shape and no token leakage in public responses.
- Add tests proving host tokens are sent only in authorization headers and never
  in pairing URLs, relay logs, or user-facing copy.

### Phase 5: UI

- Add relay configuration and status controls to mobile/runtime pairing settings.
- Use existing settings components and tokens.
- Include direct-vs-relay QR choice only where it does not overload the current
  screen. If space is tight, show a segmented control between Direct and Relay.

### Phase 6: Verification

- Unit tests for protocol parsing, relay forwarding, runtime attach, host relay
  client, and pairing.
- Integration test with in-process relay and runtime client.
- Hands-on e2e:
  1. Start `orca relay serve` locally.
  2. Start Orca runtime with relay enabled.
  3. Generate relay pairing offer.
  4. Connect a mobile-equivalent or runtime client through the relay from a
     separate process.
  5. Call `status.get`.
  6. Create/list a terminal or subscribe to terminal output through relay.
  7. Revoke the paired device and verify active relay sockets close.

## Test Plan

Automated:

- `src/runtime-relay-server/*.test.ts`
- `src/main/runtime/relay-client*.test.ts`
- `src/main/runtime/runtime-rpc*.test.ts`
- `src/main/runtime/rpc/e2ee-channel*.test.ts`
- `src/shared/pairing*.test.ts`
- mobile/web pairing parser tests if endpoint normalization changes

Manual e2e:

```text
Terminal A: pnpm run build:cli or dev equivalent
Terminal B: orca relay serve --host 127.0.0.1 --port 8787
Terminal C: start Orca runtime with relay endpoint ws://127.0.0.1:8787/ws?enrollmentToken=<token from Terminal B>
Terminal D: connect through relay pairing URL and call status.get
```

The final verification must prove traffic goes through the relay by using a relay
client endpoint, not by connecting to the direct `ws://0.0.0.0:6768` runtime
listener.

## Compatibility

- macOS, Linux, and Windows: use Node URL parsing and `path.join`; no platform path
  separators in relay code.
- Browser clients: relay endpoints should use `wss://` when the web app is served
  over `https://` to avoid mixed-content blocking.
- SSH workspaces: relay clients call the same runtime RPC surface, so SSH-backed
  worktrees are supported as long as the host runtime is connected to the SSH
  target.
- Git providers: relay does not inspect review/source-control RPC payloads and
  therefore remains provider-neutral.

## Open Questions

1. Should the first shipped UI show both direct and relay QR codes side-by-side or
   use a mode switch? Recommendation: mode switch to preserve settings density.
2. Should `orca relay serve` include TLS directly? Recommendation: not initially;
   reverse proxy support is simpler and avoids certificate storage UX.
3. Should relay status be persisted in runtime metadata for CLI discovery?
   Recommendation: expose through IPC/UI first; add CLI discovery only if we need
   automation to choose relay pairing.

## Acceptance Criteria

- Direct mobile/runtime pairing still works.
- Relay mobile/runtime pairing works when host and client can only reach the relay.
- Relay server cannot read or log decrypted payloads.
- Clients cannot replace host control/data sockets because host relay sockets
  require a host-only token that is not in pairing offers.
- Unknown hosts cannot bind arbitrary `serverId` values without the relay
  enrollment token.
- Relay host-token bindings survive relay restart and reject wrong-token host
  sockets before routing state changes.
- A malicious relay control socket cannot make the host exceed the host-side
  relay data socket cap.
- Device revocation closes active relay-backed sockets.
- Replaying an old encrypted auth frame against a new relay-backed socket fails.
- Replaying a post-auth encrypted frame on the same relay-backed socket fails
  before duplicate RPC dispatch or duplicate binary-frame delivery.
- Connection floods hit per-host/global relay caps before unbounded host data
  socket churn or unbounded buffering.
- Mobile method allowlist still applies over relay.
- Terminal streaming works over relay.
- Browser screencast or another binary-frame path works over relay, or the design
  explicitly blocks release until binary frames are verified.
- All new code is cross-platform and has no provider-specific assumptions.
- No generated artifact, code comment, commit message, or user-facing text names
  any external reference implementation.

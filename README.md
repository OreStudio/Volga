# Volga

A TypeScript port of the ORE Studio user interface.

The Qt client is slow to build and reaches the limits of what a C++ UI toolkit
can express. This project reimplements the UI in TypeScript, talks to the
existing backend over the same NATS subjects, and is structured so a desktop
packaging can be added later without reworking the application.

## Status

Working end to end against the C++ services. Sign in, party selection,
sign out, and an accounts screen with search, row detail, and sign-in guards
all run in a browser today.

## Architecture

```
browser  --HTTP-->  BFF  --NATS over mTLS-->  ores.*.service
                     |
                     +-- holds the session token, never the browser
```

The browser cannot talk to NATS directly. The broker requires mutual TLS, and
no browser can present a client certificate on a WebSocket connection. The BFF
owns the mTLS connection and the session token, and the browser holds only an
opaque HttpOnly cookie.

That boundary has a second benefit. The browser never parses msgpack, never
sees a wire field name, and never holds the bearer token. The
`@volga/protocol` package is the only place that knows the encoding, the
subject names, and the C++ member names used as wire keys.

## Packages

| Package | Responsibility |
|---|---|
| `packages/wire-protocol` | The ORE NATS protocol. msgpack codec, subjects, schemas, session lifecycle, mTLS transport. |
| `packages/bff` | Fastify server. Owns the NATS connection and the session token. |
| `packages/web` | React client. Talks to the BFF only. |

The wire-protocol package has two entry points. `@volga/protocol` is the full
surface, for the BFF and any future Node or Tauri host. `@volga/protocol/browser`
carries only data, schemas, and limits, so the browser bundle contains no
broker client and no Node built-ins.

## Running the stack

The C++ services have to be running first. `compass services start` installs
systemd units outside the checkout, so this repository starts what it needs
directly:

```sh
scripts/dev-stack.sh start
```

That starts the broker, the IAM and refdata services, the BFF, and the web
server, then waits for each port. Open <http://127.0.0.1:5173/>.

`scripts/dev-stack.sh stop` shuts it all down and `status` reports the ports.

Copy `.env.example` to `.env` first and fill in the certificate paths and a
session secret. The repository already has a working `.env` for this machine.

## Verification

Two verifiers, both asserting against the running system rather than a mock.

`scripts/verify-login.ts` exercises the protocol layer. Its first assertion is
a deliberately rejected login, because a server that decoded the msgpack body
answers with a message while a server that did not decode it never replies at
all. A well-formed rejection therefore proves the subject, the encoding, and
the response schema in one step.

```sh
npm run verify:login
```

`scripts/verify-browser.ts` drives a real browser through sign-in, a rejected
credential, the accounts table, search, row detail, and sign-out, and captures
screenshots under `.runtime/screenshots/`.

```sh
npm run verify:browser
```

Unit tests cover the pieces that must not drift, including a golden-bytes test
that an empty request encodes as the msgpack empty map, and that every declared
field is written even when the caller omits it.

```sh
npm test
```

## The test account

Row level security restricts every read to the tenant the service runs in, so
the seeded account must live in that tenant. The password hash has to come from
the project's own hasher, so `scripts/make-test-hash.cpp` links the real
`libores.security` rather than reimplementing scrypt.

```sh
npm run seed:account -- volga_probe 'Secure-Password-123'
```

## Local desktop packaging

Deferred, and the structure anticipates it. The web client talks to an HTTP
API and holds no token, so a Tauri or Electron shell can host the same bundle
unchanged. The BFF would either ship alongside it or be replaced by a thin
host that uses `@volga/protocol` directly, which is why that package is
separate from the server that currently drives it.

## Generated types

Hand-maintaining wire field names in TypeScript is the largest remaining drift
risk, so the intent is to generate them from the C++ codegen model.
`scripts/emit_protocol_ir.py` reads the same org entity model that codegen
renders into the RFL structs and emits a language-neutral protocol IR. It
covers the 148 codegen entities across 13 components, which is 1184 messages.
See `doc/decisions/0001-protocol-types-from-codegen.org`.

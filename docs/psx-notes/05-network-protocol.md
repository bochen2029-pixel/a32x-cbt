# 05 · The network protocol

Source: `Developers\Network Documentation.txt`, 82,773 B, document version 4 (4 June
2017), plus `AddonExample.java` (14,819 B), `AddonExampleNetThread.java` (4,252 B),
`BoostClientExample.java` (4,332 B) — all three are complete compiling clients, not
illustrations.

## Shape

- TCP/**10747**. Both doubles are in this port number, deliberately.
- **ASCII text, one message per line, line-feed terminated. No binary, no offsets.**
- Two independent servers: `main` and `boost`. `main` carries everything and updates
  aerodynamics at 5 Hz; `boost` carries only the high-rate aerodata and serves exactly
  one client.
- One main server, many main clients. Clients may also *become* a boost server.
  The topology is symmetric — a node is a client of one server and a server to one
  boost client.

`Network.java:181-210` shows the emitter is three lines of `StringBuilder`:

```java
sbPr.append('Q').append(q).append(idx).append('=').append(iv)
```

Inbound parsing is the same shape in reverse; anything that is not a valid Q code is a
keyword.

## Keywords

| key | direction | meaning |
|---|---|---|
| `id=`, `version=` | server → client | identity and build on connect |
| `load1/load2/load3` | server → all | pause / apply / unpause across a situation load |
| `CDU L`… | both | CDU interface, one per side |
| `layout=` | server → client | which layout the server has selected |
| `bang` | client → server | request current values of all non-DELTA variables |
| `start` | router → server | request all START variables |
| `exit` | both | teardown |

`load1/load2/load3` is the whole consistency story: the world is paused, applied, and
resumed, and add-ons are told when each phase begins so no reader can see a half-loaded
state. There is no locking and no revision — just the pause.

## Message grammar

`Q<category><index>=<value>` where category is `i`, `h` or `s`.

A malformed or out-of-range value is **ignored, not corrected** — `Qs.transfer` returns
the previous value when the length is outside `Min..Max` (Qs.java:35-40). Add-ons
therefore cannot corrupt the model, and they also cannot tell they failed except by
watching the value not change.

## The synchronisation rule

The main server applies an inbound actuation to its own model and forwards the result
to every other client. Clients do not predict. The boost path exists because a scenery
generator cannot run the 5 Hz stream up to frame rate, so the 5 Hz stream is never for
rendering and the boost stream never crosses the Internet.

## The CDU as pure text

Q variables carry the CDU as 24 characters of screen plus 24 characters of font mask,
`-` for small and `+` for big (`Network Documentation.txt`, "Line Formats"). Native
symbols are mapped to lower-case letters: `o` degrees, `b` box, `u`/`d`/`l`/`r` arrows,
`t` triangle. The display *is* the transport, so a remote CDU needs no renderer.

## Why it holds up

- Any language, no bindings, no rebuild when the sim changes.
- Human-debuggable: a session can be read in a terminal.
- The lexicon on connect means the client can self-configure.
- Range checking lives on the far side, so the protocol is safe against a buggy client.

## Where it would hurt

- Text on the wire is ~4× the bytes of a packed frame; irrelevant at these rates, fine.
- No auth and no versioning beyond `version=`; fine inside a LAN.
- No delta compression, no interest management — every variable is broadcast to every
  client.
- Port 10747 may collide; make it configurable on day one.

## For the CBT

Carry: the actuate-and-observe model, the `Q` grammar, the range check in the value
class, the pause/apply/resume triple for scenario loads, and the text CDU. Modernise
by binding on `localhost` or a `WebSocket` and by adding a version handshake.

The MSFS bridge later is the same protocol with a scenery generator on the far end —
which is precisely what it was designed for.


# 07 · Panels

The cockpit is **vector geometry drawn with Java's 2D graphics at runtime**, not a 3D scene and
not a fixed-size bitmap. 386 JPEG and 293 GIF images overlay the traced artwork; the switches
themselves are built in code from paths, gradients and rounded rectangles.

That is why 7.5 MB replaces a flight deck, and why it stays crisp at any zoom.

## Coordinate space

Panels are placed by an origin, and every control on a panel is constructed at a fixed offset
from it. The panel's vector space runs at twice the scale of the image overlay, so drawing and
artwork line up at different resolutions. A rotary selector on the cabin-signs panel, for
instance, is built from its offset, the registry slot it drives, its dial table, its rest angle,
the positions that can be pushed, and the event it raises.

## A control is five things

`(position, registry slot, physical form, geometry table, event)`

and nothing else. The no-smoking selector is representative: the registry slot binds the value,
a three-position dial at 45° gives the throw, a rest angle sets where it sits, a push mask says
which positions can be pushed, and a switch event fires when it moves.

Lamps are wired the same way, through an adapter to a named power source — which is what
`Developers\Power Sources for Indicator Lights.txt` documents as data.

## Physical forms

Seven base forms — a toggle switch, a round pushbutton, a round hold button, a guarded toggle, a
light, a rotary selector and a temperature selector — plus a selection list. Per-switch
subclasses exist, one per switch family, which is how the drawing code stays specific.

Selector throw is a table, not a formula: ten dial tables (from two positions to eight, mostly
45° apart, some 30° or 90°) and six push masks, with a spring-return rate and a 450 ms detent
for a push.

Those tables and masks therefore cover the whole overhead panel. Adding a selector is adding a
row to a table, not writing a widget.

## Interaction

One small class is the whole press language: a press becomes a hold after 500 ms, hold time
accumulates in the fast pass, a fresh press is gated, a long press is reported as one, the mouse
wheel takes a 501 ms override, and double actuation is blocked.

Input plumbing is a set of hand-written subclasses of the windowing toolkit's mouse, wheel, focus
and key listeners rather than implementations of its listener interfaces.

## Layouts

The shipped layouts (`Layouts\*.9pack`) are named viewport arrangements, stored as plain
key-value lines. Each numbered layout has a title ("Captain Flying" is one), a target screen
rectangle, four divider fractions, and for each of four quadrants a zoom and a horizontal and
vertical scroll.

So a "view" is four crops of one large canvas with independent zoom and scroll, and the
camera is a zoom and a scroll per quadrant. Prebuilt layouts: 1024×768, 1920×1080, Apple
1440×900, CDU L, and so on.

## Assessment

Copy the whole model. It is a genuinely good, genuinely cheap 2D cockpit:

- controls are data (`position, slot, form, table, event`), so a new panel is a table,
- the form vocabulary is small and bounded,
- the camera is crops with scalars, so nothing needs a scene graph,
- vector drawing scales, prints and re-themes for free — which is exactly what a CRT
  treatment needs.

Watch: per-switch subclasses proliferate; keep the A320 set to the seven base forms plus
a data table. And the push masks are 747-specific — re-author them for the A320
overhead rather than translating.

# 07 · Panels

The cockpit is **vector geometry drawn in Java2D at runtime**, not a 3D scene and not a
fixed-size bitmap. 386 `.jpg` and 293 `.gif` overlay the traced artwork; the switches
themselves are `GeneralPath` / `GradientPaint` / `RoundRectangle2D` constructions
(MainPanels.java:1-40 is nothing but those imports).

That is why 7.5 MB replaces a flight deck, and why it stays crisp at any zoom.

## Coordinate space

Panels are placed by an origin, and every control is constructed at an offset from it:

```java
static void init(int ix, int iy) {
    x = ix; y = iy; picX = ix / 2; picY = iy / 2;
    rotNoSmoking = new BigSelSeatb(x + 77,  y + 188, Glob.qNoSmoking, 0,
                                   BigSelector.DIAL_3_45, -45, BigSelector.PUSH_3A,
                                   seNoSmokingOn);
    rotFltDkDoor = new BigSelFltDkDoor(x + 229, y + 198, Glob.qFltDkDoorTurn, 0, …);
}
```

`picX = x / 2` marks a 2× panel-vector space against the 1× image overlay.

## A control is five things

`(position, registry slot, physical form, geometry table, event)`

and nothing else. `AisleSeatbelts.java` is representative: `Glob.qNoSmoking` binds the
value, `BigSelector.DIAL_3_45` the throw, `-45` the rest angle, `PUSH_3A` which positions
are pushable, `seNoSmokingOn` the `SwitchEvent`.

Lamps get an `ElecAdapter` (`ElecAdapter eaC1087` + `SwitchEvent seC1087`) — the lamp is
wired to a named power source, which is what
`Developers\Power Sources for Indicator Lights.txt` (4,998 B) documents as data.

## Physical forms

Seven classes: `BigSwitch`, `BigRoundPush`, `BigRoundHold`, `BigGuardedToggle`,
`BigLight`, `BigSelector`, `BigTempSelector`, plus `Selection`. Per-switch subclasses
exist (`BigSelSeatb`, `BigSelFltDkDoor`, …), one per switch family, which is how the
drawing code stays specific.

Selector throw is a table, not a formula — `BigSelector`:

```java
static final float[] DIAL_2_90, DIAL_2_45, DIAL_3_45, DIAL_4_45, DIAL_4_30,
                      DIAL_4_45B, DIAL_5_45, DIAL_5_A, DIAL_6_45, DIAL_8_30;
static final boolean[] PUSH_2A, PUSH_3A, PUSH_3B, PUSH_3C, PUSH_4A, PUSH_5A;
static final double JUMPSPEED = 3.0E-4;   // spring-return rate
static final int PUSHING_TIME = 450;      // ms detent
```

Eight dial tables and six push masks therefore cover the whole overhead panel. Adding a
selector is adding a row to a table, not writing a widget.

## Interaction

`Click` (Click.java) is the whole press language: `HOLD_DELAY = 500`, `holdMillis`
accumulates in the fast pass, `allowed()` gates a fresh press, `holding()` reports a long
press, `wheeling()` sets a 501 ms override. Double-actuation is prevented by `block()`.

Input plumbing is `PsxMouse`, `PsxMouseMotion`, `PsxMouseWheel`, `PsxFocus`, `PsxKeys` —
hand-written subclasses of the AWT listeners rather than `MouseListener` interfaces.

## Layouts

`Layouts\*.9pack` are named viewport arrangements: `[Layout n]` with a title, a target
screen rectangle, four divider fractions, and for each of four quadrants a `zoom` plus
`xScroll`/`yScroll`.

```ini
[Layout 1]
title=Captain Flying
dividerUpperX=0.87549585
zoomUpperL=0.47483313
xScrollUprL=1428.2955
```

So a "view" is four crops of one large canvas with independent zoom and scroll, and the
camera is two scalars per quadrant. Prebuilt layouts: 1024×768, 1920×1080, Apple 1440×900,
CDU L, and so on.

## Assessment

Copy the whole model. It is a genuinely good, genuinely cheap 2D cockpit:

- controls are data (`position, slot, form, table, event`), so a new panel is a table,
- the form vocabulary is small and bounded,
- the camera is crops with scalars, so nothing needs a scene graph,
- vector drawing scales, prints and re-themes for free — which is exactly what a CRT
  treatment needs.

Watch: per-switch subclasses proliferate; keep the A320 set to the seven base forms plus
a data table. And the `PUSH_*` masks are 747-specific — re-author them for the A320
overhead rather than translating.


# Regenerating the PSX reference tree

The notes in `docs/psx-notes/` cite lines like `Aerodynamics.bankProgress()` with a line number.
Those point into a decompiled copy of a commercially sold simulator that this repository does not
vendor. You do not need it to work here — but if you want to check a claim, this is how to rebuild it.

## You need

- A licensed copy of Aerowinx PSX (the jar is `Aerowinx.jar`).
- A JDK, for `javap`.
- CFR 0.152, a Java decompiler:
  `https://repo1.maven.org/maven2/org/benf/cfr/0.152/cfr-0.152.jar`

## Steps

```
java -jar cfr-0.152.jar Aerowinx.jar --outputdir decomp --silent true
```

That yields 1,247 `.java` files. `javap -p -cp Aerowinx.jar <Class>` is the reliable way to confirm
field and signature names where the decompiler's output is ambiguous — it is never obfuscated.

## Reading order, if you only want the shape

`Core` (the two-rate scheduler), `Aerodynamics` (`runDelta`, the `*Progress` family), `Glob` and `Q`/
`Qs` (the variable registry), `Network` (the text protocol), `Malfunction.Condition` (fault triggers),
`SituationFiler` (scenario files), `MainPanels` (vector panel drawing).

## What not to assume

- The decompiler's local variable names may be invented; field and method names are real.
- Every class is stamped `Reverse_Engineering_Prohibited`. The reading this project takes is in
  `docs/provenance.md`: the jar was read for design, and everything shipped is reimplementation.
- The output is not added to the repository. If you paste an excerpt into an issue or a commit
  message, say where it came from and that it is decompiled output.

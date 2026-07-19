Pit Wall — F1 team logos
========================

The F1 view shows a team logo on each standings / podium row. It loads the image
by the team's Jolpica/Ergast constructor id:

    logos/f1/<constructorId>.png      (a .svg with the same name is also tried)

If a file is missing, the row falls back to the coloured team-code badge — so the
view always works, with or without logos.

Drop the official artwork (PNG or SVG, ideally square-ish, transparent background,
~80px+) using these exact filenames for the current grid:

    mercedes.png
    ferrari.png
    mclaren.png
    red_bull.png
    alpine.png
    rb.png
    haas.png
    williams.png
    audi.png
    aston_martin.png
    cadillac.png

Notes
-----
- Filenames must match the constructor id exactly (lowercase, underscores).
- New/renamed teams: check the id at
  https://api.jolpi.ca/ergast/f1/current/constructorStandings.json
  (each Constructor has a "constructorId").
- These are trademarked brand assets — add them for your own use; they are not
  bundled with the app.

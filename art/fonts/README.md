# art/fonts

The two typefaces the app uses, vendored so that `scripts/build-share-card.py` can draw
the link-preview image in the real thing rather than in something close.

- `Archivo[wdth,wght].ttf` - the display face. `index.html` loads it from Google Fonts at
  weights 500, 700, 800 and 900; this is the variable original, so one file covers all of
  them. **Not** "Archivo Black", which is a different family: the wordmark is Archivo at
  900 and the two do not look alike.
- `SplineSansMono[wght].ttf` - the numerals and the mono captions, loaded in the app at
  500, 600 and 700. Variable original again.
- `OFL-Archivo.txt`, `OFL-SplineSansMono.txt` - the SIL Open Font License each one ships
  under. Both stay here; the binaries are not to be moved without them.

Nothing in `src/` reads these and **nothing here is deployed**: `art/` is outside
`public/`, so the site still pulls its webfonts from Google exactly as before. They exist
for the one build step that has to rasterise type on this machine.

Deleting them does not break that build step. `build-share-card.py` falls back to the same
stack `index.html` declares (Helvetica Neue, Arial) and prints a line saying which face it
actually used, because a card quietly drawn in the wrong type is worse than one that
admits it.

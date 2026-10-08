# Email Studio — Architecture Reference

## Engine and sync

The layout engine lives in **`backend/utils/emailEngine.js`** — one ES5 file with
no dependencies. It is copied verbatim to **`frontend/app/admin/lib/emailEngine.js`**
by `node scripts/syncEmailEngine.js`. `emailEngineSync.test.js` fails if they drift.
Never edit the frontend copy directly; edit the backend copy and run the sync script.

Design helpers (field validation, `designFromTemplate`, `pickStarterDesign`) are in
**`backend/utils/emailDesign.js`**.

## Design object fields

`designFromTemplate(template, store, opts)` → design for `renderEmailDocument`.
Key fields: `layout` (type-default fallback), `color` (#4f46e5 fallback), `hFont`,
`bFont` (head:true fonts excluded from body picker), `radius` (round/sharp), `image`
(https:// only; http upgraded, other schemes dropped), `imgW`/`imgH` (split layout),
`pageBg`/`cardBg` (null = bgDefaults auto), `showLogo`, `placeholder` (preview-only;
never passed to send paths).

## Adding a layout

1. Add entry to `LAYOUT_INFO` in `emailEngine.js` (key, name, desc, w, h).
2. Add `bgDefaults` branch and `case` block in `build()`.
3. Add wireframe to `frontend/.../emailStudio/layoutWires.js`.
4. Update `DEFAULT_LAYOUT_BY_TYPE` if needed.
5. `node scripts/syncEmailEngine.js` then `cd backend && npm test`.

## Adding a font

1. Add entry to `FONTS` and key to `FONT_ORDER` in `emailEngine.js`.
2. `node scripts/syncEmailEngine.js` then `cd backend && npm test`.

## Photo rules

- https:// only — http is upgraded; data:/javascript:/other dropped silently.
- Never cropped — all layouts use `object-fit:contain` or a full-width block.
- Upload: `POST /api/email-templates/photo` (multipart, max 11 MB, Cloudinary,
  rate-limited 20/hour per shop). Returns `{ imageUrl }`.
- No photo: `placeholder: true` shows grey box in preview; sent emails use `false`.

## Dashboard festival reminder

Rule: show when `daysAway <= 7`. Backend: `GET /api/email-templates/festival-reminder`.
States: `photo_missing`, `ready`, `setup`. Snooze: `localStorage` key
`ccf:festivalSnooze:<festivalName>` (display preference, not business data).

## Sample-send dev tool

```
node backend/scripts/sendEmailSamples.js \
  --to you@example.com --image https://… [--store "Name"] [--color "#hex"] [--dry-run]
```

Renders all 11 layouts through the real send path. `--dry-run` writes HTML to
`backend/tmp/email-samples/` (gitignored).

## Known rendering limits

- **Rich fonts** show from Google Fonts only in Apple Mail / iPhone Mail; other
  clients render the fallback stack.
- **Outlook desktop**: ignores `border-radius` (square corners) and `box-shadow`.
- **Float gradient** falls back to flat colour in Outlook and older Android clients.

# Editor workspace appearance

The signed-in editor uses a navy menu and a light work area. This is a presentation-only change: existing routes, form field names, request methods, authentication, data and business rules are unchanged.

- `AdminHeader` supplies the shared navigation, compact title and editor-only styling. Article previews, public pages and login do not use this shell.
- The left menu is always visible at 1024px and wider. Smaller screens use a Menu drawer with focus containment, Escape/backdrop dismissal and focus return. Resizing releases the page from the drawer.
- Website settings and website videos still use `/editor/`, with `#website-settings` and `#website-videos` selecting the appropriate panel. Existing `#new-video` links and save/error redirects are supported.
- Reporter settings use Applications & payment, ID card and Reporter policy tabs. Each existing form remains complete, with its own save action. Tabs only hide panels; they never replace the DOM, clear files, send requests or save values. Unsaved edits do not persist across a full page navigation/reload.
- The ID-card form action includes a fragment so the browser keeps the ID card tab after the existing server redirect. Fragments are not sent to the server. Policy redirects retain their existing fragment.
- Tab links support keyboard arrows, Home/End and browser history. Without JavaScript, navigation links and all forms remain available in document order. Required fields inside advanced sections open when native validation fails.
- Specialist ID-card values remain editable under Advanced design settings. Legal/policy wording is not rewritten by the layout. User-facing labels may be simplified without changing submitted values.

## Local verification

Use Node 22. Run `npm run check`, `npm run build`, then `npm run test:enhancements:browser` with the guarded local compose database. The browser suite creates and removes a disposable schema, blocks external services, checks desktop/tablet/mobile layouts and tests the existing protected save flows. Screenshots are written to ignored `test-results/enhancements/`, not committed.

No backend changes, migrations, paid services, Git push or production deployment are required by this UI change itself.

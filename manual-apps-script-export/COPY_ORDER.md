# COPY_ORDER.md

Exact list of files to create in the Google Apps Script editor, copied verbatim from this
repository's `apps-script/` directory (Phases A–K, current `main` as of this export). File
*order* does not matter to Apps Script itself (function declarations are hoisted project-wide
regardless of file order — see `apps-script/README.md`), but every filename below must match
**exactly**, including capitalization, so `git diff` against this repo stays meaningful later.

## Script files (create each as a "Script" file, name without the `.gs` extension —
## the Apps Script editor adds `.gs` itself)

1. Api
2. Appointments
3. AuditLog
4. Availability
5. Barbers
6. Calendar
7. Config
8. Content
9. Conversations
10. Customers
11. Dashboard
12. DateTime
13. Errors
14. Handoffs
15. Health
16. Ids
17. Menu
18. Notifications
19. Repositories
20. Response
21. Router
22. Scheduling
23. Security
24. Seed
25. Services
26. Settings
27. Setup
28. Sheets
29. Tests
30. Validation
31. WebhookEvents

That's 31 script files (including `Appointments` — the booking/cancellation/reschedule engine,
the single most important file in this export). Apps Script always creates a first file for you
(usually named `Code`) — delete it once you've pasted these 31 in, so nothing unlisted lingers in
the project.

## Manifest

32. `appsscript.json` — not created via the "+ New file" menu. In the Apps Script editor, click
    the gear icon (Project Settings) and enable "Show `appsscript.json` manifest file in editor"
    first, then it appears in the file list on the left and can be edited directly. See
    `FIRST_RUN.md` step 5.

Total: 31 script files + 1 manifest = every file in this export directory.

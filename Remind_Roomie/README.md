# Remind Roomie

A static HTML, CSS, and JavaScript app using Firebase Email/Password Authentication and Cloud Firestore. There is no bundler or npm runtime dependency; npm packages are used only for local testing, and browser modules import the pinned Firebase SDK from Google's CDN.

## Project structure

- `index.html`, `tasks.html`, `calendar.html`, `family.html`: existing app screens.
- `login.html`: sign-in, registration, and create/join household forms.
- `settings.html`: edit your display name and existing color preference.
- `css/style.css`: shared page and account styles.
- `js/data.js`: original sample data and the shared page data object. Authenticated pages replace sample household records before rendering.
- `js/form-controls.js`: immediate open/cancel controls and submit gating, independent of Firebase and the main app script.
- `js/script.js`: existing task, due-date reminder, dashboard, and calendar interactions.
- `js/firebase-config.js`: shared Firebase app, Auth, and Firestore clients.
- `js/firebase-app.js`: protected-page authentication, household loading, error notices, and subscription cleanup.
- `js/auth-page.js`: login and household onboarding.
- `js/firebase-household.js`, `js/firebase-tasks.js`: Firestore operations and realtime subscriptions.
- `js/legacy-import.js`: explicit import of previously saved browser data.
- `firestore.rules`: user, household, event ownership, invitation, and import-marker access rules.
- `../firebase.json`: Firestore rules deployment configuration.
- `../tests/firebase-integration.test.cjs`: dependency-free regression tests with mocked Firebase and DOM APIs.
- `../tests/firestore.rules.test.cjs`: authorization tests against the real Firestore emulator.
- `../package.json`, `../package-lock.json`: pinned local test dependencies and scripts.

Keep `data.js` and `script.js` as classic scripts. Load `form-controls.js` after the page markup and before `data.js`/`script.js`; it binds the local controls immediately. Then `script.js` dynamically imports the `firebase-app.js` module and waits for `roomieHouseholdReady` before reading authenticated data. Do not add a blocking Firebase module script to the HTML pages; a slow SDK request must not prevent the form buttons from responding. Cloud snapshots update the shared data object and dispatch `roomie:*` events to the existing renderers.

## Firebase setup

1. Confirm that the web app settings in `js/firebase-config.js` belong to your Firebase project. The current configuration targets `remind-roomie`. Firebase web configuration is public client configuration; authorization is enforced by Auth and Firestore rules. Never add service-account credentials to this app.
2. In that project's Firebase console, enable **Authentication → Sign-in method → Email/Password**, then create a Cloud Firestore database. Use the included rules rather than leaving the database in test mode. Check **Authentication → Settings → Authorized domains** for the host you will serve from; add `localhost` if needed for development.
3. Install/configure the Firebase CLI and sign in. From the repository root, deploy only the rules:

   ```sh
   firebase deploy --only firestore:rules --project remind-roomie
   ```

   Replace the project ID if using another project. No deployment has been performed as part of the local integration work.
4. Serve the app from the repository root, for example:

   ```sh
   python3 -m http.server 8000 --directory Remind_Roomie
   ```

   Open `http://localhost:8000/login.html`. Use HTTP rather than opening HTML files directly. The browser needs network access to load the Firebase modules and connect to Firebase.
5. Sign up and create a household. On the Family page, create an invitation and give the recipient the household ID and code. The recipient signs in with the invited email and joins from the account page. Codes are email-bound and redeemable once; the app displays the code and does not send email.

## Data and existing behavior

| Location | Contents |
| --- | --- |
| `users/{uid}` | Profile: `email`, `displayName`, `householdId`, optional `invitationId`, `color`, and `previousNames` |
| `households/{householdId}` | Household name, creator, creation time |
| `households/{householdId}/tasks/{taskId}` | Title, assignee names and UIDs, assigning user UID (`assignedById`), due date/time, request status, completion |
| `households/{householdId}/events/{eventId}` | Shared calendar events, attendees, creator, start/end times, location, description |
| `households/{householdId}/invitations/{code}` | Invited email and redemption state |
| `users/{uid}/imports/{householdId}` | Marker preventing repeated imports from overwriting cloud changes |
| Browser storage with `:{uid}` suffix | Personal calendar events, edits, and deletions for that account |

Task acceptance, rejection, rescheduling, and completion persist to Firestore and update other open household pages. UID assignments identify current tasks even when two roommates use the same display name. Older imported tasks keep their name assignments. Dashboard progress uses live task totals.

Shared calendar events synchronize through Firestore, and only their creator can edit or delete them. Personal events remain in the current browser, scoped to the Firebase user; they do not synchronize between devices. The calendar's date navigation, event details, time pickers, and personal/shared filters are retained. Existing due-date displays remain; this integration does not add scheduled push notifications, email reminders, or a background scheduler.

If older browser data is present, an **Import my browser data** button appears after login. Import only data belonging to the signed-in user: saved tasks and shared events become visible to the current household, while personal events move into that user's browser storage. Task decisions and calendar edits/deletions are applied. Original storage keys remain intact. Sample records and old browser-only family members are not uploaded; roommates join with real accounts. Imports larger than 450 shared records are rejected without deleting source data.

## Verification

From the repository root with Node.js 22:

```sh
node --experimental-vm-modules tests/firebase-integration.test.cjs
```

The tests cover task writes and completion, snapshot error forwarding and cleanup, task rendering and acceptance, dashboard progress, personal calendar creation/editing/deletion and account isolation, shared calendar creation/editing/deletion without duplicate records, legacy import preservation and retries, profile recovery, authentication gating, and sign-out cleanup. They use mocked Firebase APIs and a small DOM harness; they do not validate deployed rules or replace real-browser testing.

Before using the live app, verify with two household members and a third unrelated account:

1. Sign in/out and reload a protected page; signed-out users should return to login.
2. Create a task, accept/reject it, reschedule it, and toggle completion; check the other household browser and dashboard.
3. Create, edit, and delete personal and shared events. Sign in as another user in the same browser and confirm personal events are absent. Only the shared event's creator should have edit/delete controls.
4. Redeem an invitation with the correct email, then confirm reuse and a different email are rejected.
5. Use the Firestore emulator/rules tests or Rules Playground to confirm unauthenticated access, unrelated household reads/writes, forged household membership, and editing another creator's event are denied.

### Firestore emulator tests

Install Node.js 22 and Java 21 or newer, with `java` available on `PATH` (or set `JAVA_HOME`). From the repository root:

```sh
npm ci
npm run test:rules
npm test
```

`test:rules` starts only the Firestore emulator on `127.0.0.1:8080`, uses the isolated `demo-remind-roomie` project, compiles the actual `Remind_Roomie/firestore.rules`, and stops the emulator afterward. It requires no Firebase login and does not deploy or use the live database. The first run downloads the emulator. Ports 8080, 4400, 4500, and 9150 must be available. The test file refuses to run without `FIRESTORE_EMULATOR_HOST`.

The 23 emulator tests cover signup/profile recovery, atomic household creation, normal profile edits, invalid membership changes, valid atomic invitation redemption, missing/wrong-email/wrong-household/stale/reused invitations, immutable invitation fields (including field deletion), member-profile queries, task CRUD and status changes, shared-event owner permissions, cross-household and unauthenticated access, same-batch membership attacks, and legacy import batches/markers. Payloads match `firebase-household.js`, `firebase-tasks.js`, `auth-page.js`, and `legacy-import.js`. An additional test loads the unchanged browser modules and calls the actual `createHousehold()`, `createHouseholdInvitation()`, `joinHousehold()`, and `listenToHouseholdMembers()` functions against the emulator, including invitation-code normalization and member-listener updates.

The rules require invitations to be pending before the redemption batch and accepted afterward, with `acceptedBy` matching the signed-in user and `acceptedAt` matching the server timestamp. The matching profile must change from no household to that invitation's household in the same batch. New household creation also requires an existing unassigned profile and a simultaneous profile update. Other profile changes cannot alter household membership or the redeemed invitation ID. Tasks remain collaborative within the household; only a shared event's creator may edit or delete it.

Local validation on November 8, 2026: all 23 emulator tests, all 23 application regression tests, and all 30 desktop/mobile browser checks passed using Firebase CLI 15.35.0, Firestore emulator 1.22.0, Node.js 22, and Java 21. No rules or application code were deployed. Live Authentication configuration and browser connectivity remain separate setup checks.

Firebase references: [Auth state observers](https://firebase.google.com/docs/auth/web/manage-users), [realtime listeners and error handling](https://firebase.google.com/docs/firestore/query-data/listen), [security rules tests](https://firebase.google.com/docs/rules/unit-tests).

The Assign task and Invite member controls open/cancel their forms before cloud initialization finishes. Submissions during loading or a failed startup show a status message. Invitation codes appear outside the form so they stay visible after it closes. The application regression suite now includes these startup and button flows (23 tests).


### Browser tests

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

Playwright starts a separate static server on port 8876 by default. To check an already running server, set `ROOMIE_TEST_BASE_URL=http://localhost:8765`. The Chromium suite includes 16 checks covering desktop/mobile form opening, cancelling, submission during pending cloud setup, failed Firebase loads, failed main-script loads, and successful task/invitation submission. Cloud operations are intercepted; these tests do not use a real account or write live data. Six additional browser checks cover successful name changes across five open pages, reload persistence, repeated renames, initials, legacy task/event names, failed saves, blank names, and unsaved drafts. Eight additional desktop/mobile checks cover rejection and rescheduling explanations, delivery to the assigner, response history, canceling, blank reasons, failed sends/retries, safe text rendering, and draft/focus preservation during live updates. All 30 browser checks passed, along with the 23 application regression tests.

The protected pages use versioned local script URLs so an existing browser tab fetches the updated form controls on its next navigation. The controls remain available even if household initialization leaves the account name empty; saving still requires successful authentication and household loading.


### Changing your name

Open **Settings → Your name**, enter a name (1–60 characters), and choose **Save name**. The account bar, home greeting/avatar, household list, task assignee/author labels, calendar attendees/creator details, and assignee choices update through the existing profile listener, including other open pages. Task/event relationships and colors stay attached to the account ID. Failed saves retain the draft and leave the current profile name intact.

The app uses Firestore's profile `displayName` as its source of truth and synchronizes Firebase Auth's display name afterward. A Firestore transaction appends the prior display name to `previousNames`, allowing older name-only tasks and events to display the latest name without rewriting other members' events. New tasks include `assignedById`, and new calendar attendees already use UIDs. Name lookup prefers UIDs and resolves former names only when exactly one household member matches; legacy records without IDs cannot disambiguate two people who share the same name.

The included **Firestore rules update is required before using live name changes**: older rules reject the `previousNames` field. Rules allow only the profile owner to preserve history or append their own prior display name during a rename; household/invitation access restrictions remain enforced. Nothing has been deployed. Color settings remain intact.


### Explaining task rejections and rescheduling

On a requested task, **Reject** opens an explanation box; **Reschedule** opens a new date/time and explanation box. A reason (1–1000 characters after trimming) is required before **Send rejection** or **Save new time** can be submitted. Cancel makes no changes. Failed sends retain the reason and chosen schedule for retry; realtime task/member updates also preserve the draft.

Responses appear in **Tasks → Task responses** for the person who assigned the task, using their account ID. The explanation includes who responded and, for rescheduling, the new due date/time. Prior responses remain available after later updates and page reloads. This is in-app delivery through the existing Firestore task listener. Responses follow the task's existing household access rules.

`respondToTask()` reads the current task and assigner's profile in a Firestore transaction, checks that the sender is an assignee and the task is still awaiting a response, then atomically saves the task change and `responses.{responseId}`. Each response stores `action`, `reason`, `senderId`, `recipientId`, the server `createdAt`, and old/new schedule values. Rescheduling keeps the request pending, matching the existing acceptance flow. Legacy tasks resolve the assigner using an unambiguous current/former name and save the resolved UID; an unidentified or departed assigner produces an error without changing the task.

The new fields are inside existing household task documents, so this feature needs no additional collections or rules changes beyond the current household task permissions. No live task responses were sent and nothing was deployed during development; browser tests use a mock delivery service, while emulator tests exercise the actual transaction and assigner listener.

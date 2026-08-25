# CESGS Research Hub

A research management dashboard for CESGS, deployed on Vercel with the code kept
on GitHub. The database is a Google Spreadsheet reached through an Apps Script
Web App, and attachments live in a Google Drive folder. Nothing is stored on the
web host itself.

Every file sits in the project root. The one exception is `api/`, and it is not a
choice: Vercel turns any file under `api/` into a serverless function, and that
function is the whole reason sign-in works. Move `api/index.js` to the root and
the dashboard loses its server layer.

```
index.html                the shell served to visitors        (generated)
app-<hash>.js             all logic, minified                 (generated)
app-<hash>.css            all styles, minified                (generated)

source.html               THE SOURCE. One readable file. Edit this one.
build.mjs                 turns source.html into the three files above
package.json              npm run build, npm start

api/index.js              the entire server layer, one file, no imports
server.js                 optional, runs the same thing as a local Node server

sw.js                     service worker, notifications on Android Chrome
pdf-lib.min.js            used to stitch the correspondence logbook into a PDF

vercel.json               cache headers
.vercelignore             what is not uploaded
.env.example              every setting, for local runs
.gitignore                keeps .env out of the repository

research-hub-appsscript.gs  the spreadsheet backend, pasted into Apps Script
```

---

## How the parts fit together

```
browser ── index.html + app-<hash>.js/css ....... pure static
   │
   └── POST /api  ──── api/index.js ──────────── Apps Script Web App (/exec)
                       (Vercel function)                │
                                                        ├── Spreadsheet (data)
                                                        └── Drive folder (files)
```

The server layer is thin and stateless. It keeps the `/exec` address and its
token out of the browser, refuses to return data to a visitor who has not signed
in, throttles failed sign-in attempts, and caches the `pull` response for a few
seconds so that a dozen open tabs do not exhaust the Apps Script quota.

The session is not held on the server. It travels in a signed, HttpOnly cookie,
which is what makes the same code correct on a serverless function that may be
restarted between two clicks.

---

## Deploying

Commit everything to GitHub. `index.html`, `app-<hash>.js` and `app-<hash>.css`
are generated but they belong in the repository, because Vercel serves them
directly.

In Vercel, Add New Project, pick the repository, Framework Preset Other, Build
Command `npm run build`, Output Directory left empty so the repository root is
served. If the build ever stops with a complaint about a missing output
directory, set Output Directory to a single dot.

Then Settings, Environment Variables, applied to Production and Preview both.

```
RH_GAS_URL          the Apps Script Web App address ending in /exec
RH_SESSION_SECRET   a long random string, at least 32 characters
RH_GAS_TOKEN        only when the TOKEN variable in Code.gs is filled in
```

Generate the secret with this.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

None of the three ever goes into a file in the repository. Changing an
environment variable only takes effect on the next deployment, so redeploy
afterwards.

Add the real domain under Settings, Domains, and repoint the DNS record there.
Until DNS actually points at Vercel, the site is reachable only at the
`something.vercel.app` address, while the buttons inside every notification email
lead wherever `HUB_URL` in the Apps Script file says.

To run it locally instead, `npm install`, copy `.env.example` to `.env`, fill in
the two required values, then `npm start` and open port 3000. `GET /healthz`
returns `{"ok":true}` and suits uptime monitoring.

---

## Making changes later

Edit `source.html`, never `app-<hash>.js`. Then run this.

```bash
npm install
npm run build
```

The build rewrites `index.html` and replaces the two bundles, deleting the
previous pair so that old builds do not pile up in the root. Commit the result.
The hash in each filename changes with the content, so browsers pick up the new
version immediately and nobody has to clear a cache.

Forgetting the build is the most common mistake here, because the site keeps
working and simply ignores the change.

Serving from a sub-path rather than a domain root needs the same value on both
sides.

```bash
RH_BASE_PATH=/research-hub npm run build
RH_BASE_PATH=/research-hub npm start
```

The build writes `window.RH_BASE` into the shell, and the dashboard builds its
`/api` address from it.

---

## Settings

`.env.example` lists every variable with its default, and only `RH_GAS_URL` and
`RH_SESSION_SECRET` are required. The older Indonesian names, `RH_WAJIB_MASUK`,
`RH_SESI_JAM`, `RH_MAKS_GAGAL`, `RH_KUNCI_MENIT`, `RH_CACHE_DETIK`,
`RH_BATAS_BIASA` and `RH_BATAS_UNGGAH`, are still read, so an existing
deployment keeps working without touching its configuration.

---

## What must never reach the browser

The `/exec` address, the Apps Script token and the session secret. These live in
environment variables only, never in `source.html`, `index.html` or the bundles,
all of which anyone can download.

Two notes on the spreadsheet side. `AKUN_SERTAKAN_SANDI` ships as `false`, so the
password column never leaves the spreadsheet. Passwords in `RH_Akun` are still
stored as plain text, which means edit access to the spreadsheet is the real
perimeter, so keep that sharing list short.

---

## Who may edit and delete

Editing and deleting are limited to whoever created the entry, plus anyone whose
role in `RH_Akun` is Administrator. This covers tasks, comments, documents and
milestones. The person in charge of a task is not its owner, so they can still
change its status, submit the result and comment, but they cannot rewrite the
task or delete it. Buttons that are not permitted are not rendered at all.

Ownership is recorded at creation in two columns the Apps Script side adds on its
own, `dibuat_email` and `dibuat_oleh`. The address is checked first, because a
name can change while the address is the key in `RH_Akun`.

Rows created before this rule carry no owner. Those stay editable by an
Administrator and by a Project Manager, so old data does not freeze. To give
Project Managers full rights over everything, set `IZIN_PM_SEMUA` to `true` in
`source.html` and rebuild.

This is a gate in the interface, not a lock. Anyone holding an account could
still compose a request to Apps Script by hand. Enforcing ownership properly
means checking the author of every row inside Code.gs before the merge.

---

## Email notifications

Three are on, in the email settings block near the top of the Apps Script file. A
new task emails its persons in charge, a comment emails the persons in charge,
the author and everyone who commented earlier, and a weekly reminder to fill in
progress goes out every Thursday from 10.00 in the project time zone. Mentions,
pure status changes and the day-before deadline warning stay off, each a one-line
change.

Nothing is sent during a sync. Events are queued in the `RH_Notifikasi` sheet and
a five-minute trigger sends them, which is why that trigger is not optional.

| Function to run in Apps Script | What it does |
|---|---|
| `checkSetup` | grants permissions and reports what is missing |
| `installEmailTriggers` | installs the five-minute and sheet-change triggers |
| `emailDiagnostics` | reports switches, triggers, schedule, recipients, queue, quota. Sends nothing |
| `sendSampleEmails` | sends one of each kind to the script owner, marked as samples |
| `testReminderToMe` | sends one real reminder to whoever runs it |
| `sendWeeklyReminderNow` | runs the reminder for every active account immediately |
| `sendQueueNow` | drains the queue by hand instead of waiting five minutes |
| `testUpload` | writes a test file to the Drive folder, then deletes it |

Do not run `emailTugasBaru`, `emailKomentar` or `emailPengingat` from the editor
dropdown. Those build the message body from a record passed in, so running them
with no argument fails on a missing property, which is expected rather than a
fault.

---

## Phone notifications

`sw.js` must sit next to `index.html` and be reachable over https. Chrome on
Android refuses a notification raised by a page and accepts one only from a
service worker.

There is no push server. Notifications are raised by the dashboard itself from
data it has just pulled, so they appear while the app is open or while its tab is
alive in the background. When the app is closed completely, nothing arrives until
it is opened again. Delivering to a closed app needs Web Push with VAPID keys and
a sender, which is a separate build.

On iPhone the site has to be installed to the home screen before it can ask for
permission at all.

---

## Troubleshooting

| Symptom | Cause to check first |
|---|---|
| Nobody can sign in, the reply mentions the secret | `RH_SESSION_SECRET` is not set in Vercel |
| Apps Script replied with something other than JSON | the deployment access is not Anyone, or the URL is not the one ending in `/exec` |
| Sign-in works, then every action says the session ended | cookies are being dropped, check that the site is served over https |
| A task takes minutes to reach another device | the Apps Script deployment was not updated to a New version, so the revision marker is missing and only the five-minute safety pull runs |
| Changes to `source.html` do not appear | the build was not run |
| Styles missing under a sub-path | the build ran without `RH_BASE_PATH` |
| No email arrives at all | run `emailDiagnostics`, the five-minute trigger is usually missing |
| Email arrives but the button leads nowhere | `HUB_URL` in the Apps Script file points at the wrong address |
| Uploads fail | the Drive folder is not owned by the script owner, run `testUpload` |

---

## The Apps Script side

Paste `research-hub-appsscript.gs` into the spreadsheet's Apps Script editor, set
the project time zone, run `checkSetup` once and accept the permissions, run
`installEmailTriggers` once, then Deploy. To keep the same `/exec` address, use
Manage deployments, edit the active deployment, and set Version to New version.
Pressing New deployment instead creates a different address, and `RH_GAS_URL`
would have to be updated to match.

`DRIVE_FOLDER_ID` and `HUB_URL` sit near the top of that file. The Drive folder
must be owned by the same account that owns the script, because uploads happen as
that account.

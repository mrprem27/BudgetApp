# SPEC — usage analytics (Mixpanel)

`Status: BUILT 2026-10-01, sends nothing until a project token is set · Tracker: U-24 · Code: src/lib/usageEvents.ts`

The question it answers: **which parts of the app are used, how much, and where it is slow or
breaks.** Never what anyone spends.

## 1 · Rules

1. **A closed list.** Every event and every key it may carry is listed in `USAGE_EVENTS`;
   `track` drops anything else. Install facts are a second closed list (`SUPER_KEYS`). An amount,
   a name, a note or a category cannot leave by accident, and a test fails on a key that could
   carry one.
2. **Anonymous.** A random install id. No account id, no email, no profile, no location from the
   IP address.
3. **Captured where the app already funnels**, so a new screen is measured with no code in it
   and existing screens were not touched. Four funnels, one line each:

   | Funnel | Where | Event |
   |---|---|---|
   | The route changed | `useScreenEvents` (root layout) | `Screen` |
   | A tab or segment was chosen | `ui/TabPills` | `Tab` |
   | Something was written | `DataRefreshProvider.refresh()` | `Saved` |
   | A screen's data loaded badly | `useScreenData` | `Load failed`, `Slow load` |

4. **Every event says where**: `route` (its shape, `/group/[id]`, never an id) and `area`
   (`lib/usageAreas.ts`, sixteen areas). A test walks `app/` and fails on a route with no area.
5. **It can never break a screen.** No token: the SDK is not loaded. Every call is wrapped.
6. **Opt-out** in Settings → Security, on by default.

## 2 · Events

| Event | Keys | Meaning |
|---|---|---|
| `Screen` | `from`, `from_area`, `seconds` | A screen opened; the keys describe the one just left. Time on a screen = sum of `seconds` by `from`. Capped at an hour |
| `Tab` | `value` | The tab's key in code (`overview`, `budget`). A key that is not code-shaped is not sent |
| `Saved` |  | A write the user made, on this screen. Sync and the foreground catch-up use `refreshQuietly` and do not count |
| `Load failed` |  | A screen's load threw |
| `Slow load` | `ms` | A load of 400 ms or more |
| `App opened` | `days_away` | Launch, or back after 30 minutes |
| `Entry saved` | `kind`, `split`, `mode`, `repeats` | A new or edited entry |
| `Afford checked` | `verdict`, `frequency` |  |
| `Import committed` | `rows` |  |
| `Feature switched` | `feature`, `on` | A switch in Feature Management |
| `Level set` | `level` | Simple / Standard / Everything |
| `Onboarding finished` | `intent` |  |
| `Signed in` |  |  |
| `Exported` | `format` | Reports' CSV or PDF |

With every event: `app_version`, `platform`, `build` (`dev` / `release`), `level`, `features`
(the switches that are on), `entries` (a band: `0`, `1-24`, `25-99`, `100-499`, `500+`),
`signed_in`, `demo` (true once demo data is loaded, so your own testing can be left out).

## 3 · Turning it on

1. Create a Mixpanel project (India residency if the data should stay in India).
2. In `.env`: `EXPO_PUBLIC_MIXPANEL_TOKEN=<project token>`, and for India
   `EXPO_PUBLIC_MIXPANEL_SERVER=https://api-in.mixpanel.com`. Both are inlined at build time, so
   it needs a new build.
3. The privacy policy (`B-08`) has to say what §1 and §2 say before a public release.

## 4 · Reading it

- **Mixpanel itself** for charts: Insights on `Screen` broken down by `area` answers "what is
  used most"; sum of `seconds` by `from_area` is time spent; Retention on `App opened`.
- **`node scripts/usage-report.js`** for the numbers as text or JSON (`--json`), from one call
  to Mixpanel's Raw Event Export: areas by views / installs / minutes / saves, screens, tabs,
  entries by kind and how, features on by installs, slow and failed loads. It needs a service
  account (Mixpanel → Organization settings → Service accounts, Analyst role) in
  `MIXPANEL_PROJECT_ID`, `MIXPANEL_SA_USER`, `MIXPANEL_SA_SECRET`, and `MIXPANEL_REGION=in` for
  an India project. Dev builds and demo-data installs are left out unless `--all`.
  Limits (Mixpanel's): 60 calls an hour, 100,000 events a call.

## 5 · Not done, on purpose

- No per-button capture. A button's label can hold a name ("Settle up with Asha"), so anything
  that reads labels breaks rule 1. The four funnels plus the named events cover it.
- No user profiles or cohorts by person: it would need `identify`, and rule 2 forbids it.
- No server endpoint of our own for the data; Mixpanel's export is the API.

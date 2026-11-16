# Scheduler

A phone-friendly calendar you control with your voice. Tap the mic, say what's happening, and it goes on your calendar.

## Try saying

| You say | What happens |
| --- | --- |
| "Dentist next Tuesday at 3pm" | Adds a 1-hour event |
| "Lunch with Sam Friday at noon for 2 hours" | Adds a 2-hour event |
| "Remind me to call mom tomorrow at 5" | Adds a reminder 🔔 |
| "Essay due Friday" | Adds an all-day task ✅ |
| "Mom's birthday on December 3rd" | Adds an all-day event |
| "What do I have tomorrow?" | Jumps to that day and reads it out |
| "Cancel the dentist" | Finds and deletes it (asks first) |

Every new item opens a confirm card so you can fix the title, date, time or type before saving. You can also type commands instead of speaking.

## How it works

- **Web app (PWA)** — open it in your phone's browser and choose *Add to Home Screen*. It works offline after the first visit.
- **Voice** uses the browser's built-in speech recognition (Chrome on Android, Safari on iPhone). It needs HTTPS, which GitHub Pages provides.
- **Understanding dates** is done on the device with [chrono-node](https://github.com/wanasit/chrono) — no AI service or API key.
- **Storage** is on your phone only (`localStorage`). No account, no server. Clearing browser data deletes your events.

## Develop

```bash
npm install
npm run dev     # http://localhost:5173 (also shown on your LAN)
npm test        # parser tests
npm run build   # production build in dist/
```

Note: phones only allow the microphone on HTTPS, so test voice on the deployed site (or on `localhost` on your computer).

## Deploy

Pushing to `main` runs the tests and deploys to GitHub Pages via `.github/workflows/deploy.yml`.

## Project layout

```
index.html            app shell
src/main.js           UI: month grid, day agenda, confirm card
src/parser.js         sentence -> add / query / delete command
src/store.js          events in localStorage
src/voice.js          speech recognition + read-aloud
public/sw.js          offline cache
public/manifest.webmanifest
```

## Ideas for next steps

- Notifications for reminders
- Recurring events ("every Monday at 9")
- Editing existing events by voice ("move dentist to Thursday")
- Export / import (.ics) or Google Calendar sync

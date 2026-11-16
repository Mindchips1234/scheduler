# Scheduler

A phone-friendly calendar you control with your voice. Tap the mic, say what's happening, and it goes on your calendar.

## Try saying

| You say | What happens |
| --- | --- |
| "Dentist next Tuesday at 3pm" | Adds a 1-hour event |
| "Lunch with Sam Friday at noon for 2 hours" | Adds a 2-hour event |
| "Remind me to call mom tomorrow at 5" | Adds a reminder 🔔 |
| "Essay due Friday" | Adds an all-day task ✅ |
| "Mom's birthday on December 3rd" | Adds an all-day event that repeats every year |
| "Team meeting every Monday at 9" | Repeats weekly 🔁 |
| "Gym every Monday and Wednesday at 6pm" | Repeats on both days |
| "Standup every weekday at 9:30" | Repeats Monday–Friday |
| "Pay rent every month on the 1st" | Repeats monthly |
| "Payday every other Friday" | Repeats every 2 weeks |
| "Yoga on Tuesdays at 7pm until December 20" | Repeats, then stops |
| "Piano lesson every Saturday at 10 for 6 weeks" | Repeats 6 times |
| "Dinner at grandma's on Thanksgiving at 5pm" | Understands holiday names as dates |
| "What do I have on Christmas Eve?" | Lists that day, holidays included |
| "Dentist Tuesday at 3, remind me 30 minutes before" | Event with an alert 30 min early |
| "Flight Friday at 7am, alert me the day before" | Event with an alert 1 day early |
| "What do I have tomorrow?" | Jumps to that day and reads it out |
| "Cancel the dentist" | Finds and deletes it (asks first) |

Tap the mic, speak, and tap the mic again to stop (or just pause). What you said appears in the text box; check it and tap the ➤ Enter button. Every new item opens a confirm card so you can fix the title, date, time, type, alert or repeat before saving. You can also type commands instead of speaking. If a time like "at 4" has no am/pm, hours 1–6 are read as PM.

## Repeating events

- Choose *Repeat* on the confirm card (every day, every weekday, every week, every 2 weeks, every month, every year), plus an optional *Until* date. Rules you speak, like "every Monday and Wednesday", are kept as they are.
- Birthdays and anniversaries repeat yearly automatically.
- Deleting a repeating item asks whether to remove **only that day** or **all repeats**. Ticking one off ✅ only marks that day.
- 📲 exports the whole series (with skipped days) to your phone's calendar.

## Holidays and important days

- Public holidays show in orange on the calendar (🎉 in the day list). Other important days, such as Mother's Day, Halloween and the clocks changing, get an orange ring (⭐).
- ⚙️ Settings → *Holidays*: Automatic (based on your phone's language/region), United States, Canada, United Kingdom, or off. You can hide the other important days separately.
- Dates are calculated, so they work for any year and offline. They're the actual day, not the substitute day off when a holiday falls on a weekend. Holidays that follow the lunar calendar (Lunar New Year, Ramadan, Eid, Diwali, Hanukkah…) aren't included yet.

## Reminder notifications

- Open ⚙️ Settings and tap *Turn on* next to Notifications (or save an item with an alert and allow it when asked).
- Every timed item can have an alert, which you pick on the confirm card. Defaults: reminders alert at their time, timed events alert 10 minutes before, and all-day items have no alert. All-day items that do have an alert go off at 9:00 AM.
- Alerts are shown by the app itself, so **they only fire while Scheduler is open or was used recently**. Phone browsers pause web apps in the background, and there's no server to push alerts to you. Alerts you missed by more than an hour are listed when you reopen the app instead of popping up late.
- **For a guaranteed alarm**, tap 📲 on an item. It downloads a calendar file (.ics) with the alarm included; open it to add the item to your phone's own calendar.
- **iPhone:** notifications only work after you *Add to Home Screen* and open Scheduler from that icon (iOS 16.4+).

## How it works

- **Web app (PWA)** — open it in your phone's browser and choose *Add to Home Screen*. It works offline after the first visit.
- **Voice** uses the browser's built-in speech recognition (Chrome on Android, Safari on iPhone). It needs HTTPS, which GitHub Pages provides.
- **Understanding dates** is done on the device with [chrono-node](https://github.com/wanasit/chrono) — no AI service or API key.
- **Storage** is on your phone only (`localStorage`). No account, no server. Clearing browser data deletes your events.

## Develop

```bash
npm install
npm run dev     # http://localhost:5173 (also shown on your LAN)
npm test        # unit tests
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
src/reminders.js      alert timing + .ics export
src/recurrence.js     repeating events (rules, occurrences, RRULE)
src/holidays.js       holiday and important-day rules (US, CA, UK)
src/settings.js       per-device preferences
src/store.js          events in localStorage
src/voice.js          speech recognition + read-aloud
public/sw.js          offline cache
public/manifest.webmanifest
```

## Ideas for next steps

- Background push notifications (needs a small push server)
- Lunar-calendar holidays and more countries
- Editing existing events by voice ("move dentist to Thursday")
- Export / import (.ics) or Google Calendar sync

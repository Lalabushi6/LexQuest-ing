# LexQuest

A gamified, memory-first study app for law school, built for a weak memory and a short attention span. It runs as one portable Windows `.exe` and keeps all its data in a folder beside it.

LexQuest comes with no courses. You add your own as **course packs**, and every feature runs from them.

## Features

- **A seven-step flow for each topic:** guides, cases, bare-act links, Cornell notes with a model summary, and five-lens "council" critiques
- **Spaced flashcards** with random order, cram mode and quizzes
- **Memory palaces**, walked forwards and backwards
- **Past papers and timed mock exams**, with model outlines and self-marking
- **An adaptive timetable:** topic blocks you skip are split up and spread over the days before that subject's next exam
- **Semesters** and **local profiles** with optional PINs
- **Last-hour cheatsheets**, exportable to PDF
- **Sprints, XP, streaks and trophies**
- **Built-in updates** from this repository's GitHub Releases

Sprints, your own flashcards, your own palaces, notes and profiles all work before you add a course.

## Use it

1. Download `LexQuest.exe` from [Releases](../../releases) and put it in a folder of its own. No install is needed.
2. Open it and make a profile. Progress is saved in `LexQuest Data` beside the `.exe`.
3. To add a course, put its pack in `LexQuest Content` beside the `.exe` and restart. **Settings → Course content** opens that folder and shows what loaded.

To try it, copy [`examples/example-pack.js`](examples/example-pack.js) into `LexQuest Content`. It's a made-up course that shows every feature.

Windows may warn about an unknown publisher the first time, because the app isn't code-signed.

## Course packs

A pack is a JavaScript file that adds to `window.LQ_DATA`. The example pack is the reference: it uses every field and has comments explaining them.

**Packs are code that runs inside the app, so only add ones you wrote or trust.**

| Field | What it holds |
|---|---|
| `D.subjects[id]` | The course: its units, topics, cases, cards, quizzes and last-hour sheet |
| `D.exams` | Exam dates, which drive the countdowns, the card scheduler and the timetable |
| `D.timetable` | The day-by-day plan |
| `D.palaces` | Memory palaces |
| `D.papers`, `D.pastQuestions` | Past papers and the question bank |
| `D.acts`, `D.actText` | Bare acts, as links to PDFs or as searchable text |
| `D.degree`, `D.semesterInfo` | The degree and its semesters |
| `D.badges` | Extra trophies |

Packs load alphabetically. To set the order, add a `content.json` to the folder: `{ "load": ["first.js", "second.js"] }`. Only the files it lists are loaded. A pack with an error is reported in Settings.

Readings and past papers open from the semester folder. For the current semester, that's the folder holding the `.exe`. For any other semester, it's a `Semester N` folder next to it. Any file it can't find shows as missing, and you can point the folder elsewhere in Settings.

**Keep your own packs out of a public fork.** `.gitignore` already excludes `LexQuest Content/` and `LexQuest Data/`.

## Develop

Needs Node.js 22 or later.

```bash
npm ci
npm start
npm test
```

| Path | What it holds |
|---|---|
| `main.js`, `preload.js` | Electron main process: storage, profiles, file access, loading packs, PDF export |
| `updater.js` | Checks GitHub Releases, downloads and swaps the `.exe` |
| `app/js/planner.js` | The adaptive timetable logic, with no UI (tested in `test/`) |
| `app/js/` | Views, flashcards, profiles and the update screen |
| `examples/` | The example course pack |

To preview in a browser, serve the folder and name a pack in the address: `app/index.html?pack=../examples/example-pack.js`.

## Release a new version

1. Update the version:

   ```bash
   npm version 1.3.0
   ```

2. Push the commit and its tag:

   ```bash
   git push --follow-tags
   ```

The workflow in `.github/workflows/release.yml` then runs the tests, builds `LexQuest.exe` and publishes a release with a checksum. Apps pick it up from **Settings → Updates**, or by themselves when they open.

## How updates work

The app reads the latest release through the GitHub API, downloads `LexQuest.exe` beside the running one, and checks its size and checksum. It then closes, swaps the files, and reopens. `LexQuest Data` and `LexQuest Content` aren't touched. If the swap fails, the old version is put back.

`update-source.json` names the repository to check. A fork can enter its own in **Settings → Updates**, as `owner/repository`. A private fork also needs a [fine-grained token](https://github.com/settings/personal-access-tokens/new) limited to that repository, with **Contents: Read-only**. It's stored encrypted with Windows' own data protection and is only ever sent to GitHub.

## License

All rights reserved. No licence is granted to copy or redistribute this project.

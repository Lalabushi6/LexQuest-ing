# LexQuest

A gamified, memory-first study app for law school, built for a weak memory and a short attention span. It runs as one portable Windows `.exe` and keeps all its data in a folder beside it.

LexQuest comes with no courses. You build your own in the **Course Builder** from each course's manual, or add them as **course packs**, and every feature runs from them.

## Features

- **A Course Builder:** Claude reads a course manual and lays out the weeks, topics and readings, then builds each week's notes from that week's readings as the semester goes on
- **Search everything** (Ctrl+K): topics, cases, flashcards, bare-act sections and past questions
- **A seven-step flow for each topic:** guides, cases, bare-act links, Cornell notes with a model summary, and five-lens "council" critiques
- **Spaced flashcards** with random order, cram mode, quizzes and an optional **type-your-answer** mode that compares what you wrote with the card and suggests a grade
- **Drills** for retrieval practice: closed-book **free recall** of a topic, checked against its cards and scheduled 1, 3, 7 and 14 days after you learn it; **weak spots** (the cards and questions you keep missing); an **interleaved quiz** across a subject's topics; and a **case drill** (name the case from what it held)
- **Memory palaces**, walked forwards and backwards
- **Past papers and timed mock exams**, with model outlines and self-marking
- **An adaptive timetable:** topic blocks you skip are split up and spread over the days before that subject's next exam
- **Semesters** and **local profiles** with optional PINs
- **Last-hour cheatsheets**, exportable to PDF
- **Sprints, XP, streaks and trophies**
- **Built-in updates** from this repository's GitHub Releases

Sprints, your own flashcards, your own palaces, notes and profiles all work before you add a course.

## Use it

1. Download `LexQuest.exe` from [Releases](../../releases) and put it in a folder of its own, for example `Documents\LexQuest`. No install is needed.
2. Keep each semester's course files in a `Semester N` folder beside it, with a folder per course:

   ```text
   Documents\
     LexQuest\          LexQuest.exe, LexQuest Content\, LexQuest Data\
     Semester 6\        Torts\, Contract\ … (manuals, readings, cases, bare acts)
   ```

3. Open the app and make a profile. Progress is saved in `LexQuest Data` beside the `.exe`.
4. Add a course: open the **Course Builder** and start from its manual, or put a course pack in `LexQuest Content` and restart. **Settings → Course content** shows what loaded.

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
| `D.guide` | Extra Memory Guide sections |

Packs load alphabetically. To set the order, add a `content.json` to the folder: `{ "load": ["first.js", "second.js"] }`. Only the files it lists are loaded. A pack with an error is reported in Settings.

Readings and past papers open from the semester folder: a `Semester N` folder next to the app's folder, or the app's own folder if the `.exe` sits inside the semester folder. Paths can't reach outside that folder. Any file it can't find shows as missing, and you can point the folder elsewhere in Settings.

## The Course Builder

1. **New course → choose the manual** (PDF, Word or text). Claude lays out the weeks and topics, tiers them, lists each week's readings, provisions and "questions to consider", and notes what the manual leaves to the instructor. Each reading is matched to a file in the course's folder where the match is clear; you check the rest, then save.
2. **Each week, build that week's notes.** Choose what Claude reads: the week's readings, plus slides or your own notes if you like. It returns the guide, gist, exam focus, model summary, memory hooks, council lenses, case cards, 15–30 flashcards, a quiz, palace images and lines for the last-hour sheet. You check them and save. If you set the date Week 1 starts, the Today page shows which week's notes to build.

Built courses are plain JSON in `LexQuest Content\Built courses\` (data, never code), with earlier versions kept in its `history` folder. Card ids come from the card's text, so rebuilding a topic keeps your progress on the cards that stay the same.

**Claude.** Requests go from the main process to the Claude API with the official Anthropic SDK (`claude-opus-5-5`, adaptive thinking at high effort, streamed). Server-side fallback is turned on: if a safety check declines a request, the API retries it on a suitable model. The API key is entered in the Course Builder and stored encrypted with Windows' data protection, or read from `ANTHROPIC_API_KEY`. Only the files you choose are sent. Each build shows the tokens it used and a cost estimate. Without a key, **Use Claude in your browser** gives the same request to paste into claude.ai, with the files to attach, and takes the reply back.

Everything that comes back is checked before it's kept: unsupported markdown is converted, broken quiz questions and empty cards are dropped, and case links are tied to the course's own cases.

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
| `builder.js` | The Course Builder's main-process side: the API key, file access and the Claude requests |
| `filetext.js` | Reads PDFs, Word, PowerPoint and text files for Claude (tested in `test/`) |
| `app/js/course-format.js` | The built-course format: checks Claude's replies and turns a course into a subject (tested in `test/`) |
| `app/js/views-builder.js`, `app/js/search.js` | The Course Builder's pages, and search |
| `app/js/planner.js` | The adaptive timetable logic, with no UI (tested in `test/`) |
| `app/js/retention.js`, `app/js/views-retention.js` | Drills: answer and free-recall scoring, weak spots, interleaved and case drills, the spaced recall schedule (the logic is tested in `test/`), and their pages |
| `app/js/` | Views, flashcards, profiles and the update screen |
| `examples/` | The example course pack |

To preview in a browser, serve the folder and name a pack in the address: `app/index.html?pack=../examples/example-pack.js`.

## Release a new version

1. Update the version:

   ```bash
   npm version minor
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

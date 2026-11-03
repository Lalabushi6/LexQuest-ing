/* An example course pack: a made-up course that uses every field LexQuest understands.
   Copy this file into the "LexQuest Content" folder beside LexQuest.exe, restart the app, and it
   appears as a course. Then edit it, or use it as the pattern for your own. The law in it is fiction.

   Dates are worked out from today so the example never goes stale. A real pack just writes
   them out: date: '2030-11-17'. */
(function () {
  const D = window.LQ_DATA;
  const on = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  /* Optional. Without these, the degree is called "My degree", with 10 semesters and the first one current. */
  D.degree = D.degree || { name: 'My degree', semesters: 10, current: 1 };
  D.semesterInfo = D.semesterInfo || {};
  D.semesterInfo[1] = D.semesterInfo[1] || { term: 'Example term', note: 'One made-up course.' };

  /* Acts. `file` is a PDF path inside the semester folder and is optional. Text in D.actText can be read and searched in the app. */
  D.acts = D.acts || {};
  D.acts.treasure = { name: 'Treasure Act', prefix: 'TA s.', unitName: 'Section', searchHint: 'Search the Treasure Act (e.g. 3, parley, shares)' };
  D.actText = D.actText || {};
  D.actText.treasure = {
    1: { title: 'Short title', text: '1. This Act may be called the Treasure Act.' },
    2: { title: 'Parley', text: '2. (1) A captain who is asked for parley shall hear it before any blow is struck.\n(2) Nothing said in parley may be used against the one who said it.', oldRef: 'Old Code art. 9' },
    3: { title: 'Equal shares', text: '3. Treasure taken on a voyage shall be divided in equal shares among the crew who sailed, with one extra share for the captain.' },
    4: { title: 'Burden of proof', text: '4. Whoever claims a share must show that they sailed on the voyage.' }
  };
  /* Bare section numbers on a topic ("sections: ['3']") are read as belonging to this act. */
  D.defaultAct = D.defaultAct || 'treasure';

  /* Exams drive the countdowns, the flashcard scheduler and the adaptive timetable. */
  D.exams = (D.exams || []).concat([
    { subject: 'pirate', date: on(5), title: 'Pirate Law midterm', note: 'Units 1 and 2' },
    { subject: 'pirate', date: on(12), title: 'Pirate Law end-term', note: '50 marks' }
  ]);

  D.subjects.pirate = {
    id: 'pirate', short: 'Pirate Law', name: 'The Law of the Seven Seas', icon: '🏴‍☠️',
    semester: 1, // which semester this course belongs to
    folder: 'Pirate Law', // its readings and past papers live here, inside the semester folder
    contentLevel: 'full', // 'full', 'partial' or 'syllabus', shown as a label on the Subjects page
    blurb: 'An example course. Who gets the treasure, and how a captain keeps the crew.',
    about: '### Assessment\n- Midterm: 30 marks\n- End-term: 50 marks\n\nFor anything the app should say about the course as a whole.',
    paperPattern: 'One problem question and two short notes.',
    // Optional, for courses that aren\'t marked like a law paper: answerHint, answerPlaceholder, minutesPerMark, rubric.
    minutesPerMark: 1.8,
    // Optional, the real shape of the paper by mock length in minutes: [[marks, how many], ...].
    mockPattern: { 90: [[20, 1], [5, 1]] },

    units: [
      {
        title: 'Unit 1: The articles', midterm: true,
        topics: [{
          id: 'pl-shares', title: 'Equal shares', subtitle: 'Who gets what', week: '1', tier: 1, midterm: true, sections: ['3', '4'],
          prime: ['Should a captain get more treasure than the crew? Why?', 'Who has to prove that someone sailed?'],
          gist: 'Treasure splits equally among those who sailed, plus one extra share for the captain. The claimant proves they sailed.',
          examFocus: 'Nearly always a problem question about a stowaway or a late joiner.',
          guide: '### The rule\n[[s:treasure/3]] splits treasure equally among **the crew who sailed**.\n\n### Who counts\nIn [[c:redbeard]] a cook who joined mid-voyage still took a full share.\n\n!tip Ask first: did this person sail?\n!warn A stowaway is not crew.\n!exam Always deal with the burden under [[s:treasure/4]].\n\n| Person | Share |\n|---|---|\n| Crew | 1 |\n| Captain | 2 |',
          cases: ['redbeard'],
          readings: [{ title: 'Redbeard v The Crew', file: 'Pirate Law/Cases/Redbeard v The Crew.pdf', tier: 1, kind: 'case' }],
          mnemonics: ['Three coins on a barrel: section 3, equal shares.'],
          modelSummary: 'Anyone who sailed takes one equal share, and the captain takes two. The person claiming has to show they sailed, and joining late doesn\'t matter.',
          council: {
            contrarian: 'Equal shares reward the idle deckhand as much as the first over the rail.',
            first: 'The rule assumes that a crew only fights hard if it trusts the split.',
            expansion: 'Compare parley: both rules keep a crew together by being predictable.',
            outsider: 'If you were on the boat, you get a slice.',
            executor: 'Did they sail? Did they prove it? Then count the heads and divide.'
          }
        }]
      },
      {
        title: 'Unit 2: Between ships',
        topics: [{
          id: 'pl-parley', title: 'Parley', subtitle: 'Talk before blows', week: '2', tier: 2, sections: ['treasure/2'],
          gist: 'A captain must hear a request for parley, and nothing said in it can be used later.',
          cases: ['blackwater'],
          readings: [{ title: 'A reading you haven\'t found yet', tier: 3 }]
        }, {
          id: 'pl-history', title: 'A brief history of the Code', subtitle: 'A topic with only a syllabus entry', week: '3', tier: 3
        }]
      }
    ],

    cases: {
      redbeard: {
        name: 'Redbeard v The Crew', cite: '(1701) 1 Fictional Seas 1', oneLine: 'A late joiner who sails is crew.',
        facts: 'A cook joined at the second port and claimed a full share.', issue: 'Does "the crew who sailed" include someone who joined mid-voyage?',
        held: 'Yes. The test is sailing, not the date of joining.', use: 'Any late-joiner problem under [[s:treasure/3]].', sections: '[[s:treasure/3]]', hook: 'Picture the cook swinging aboard with a ladle.'
      },
      blackwater: {
        name: 'Blackwater v Flint', cite: '(1715) 3 Fictional Seas 40', oneLine: 'Words in parley can\'t be used later.',
        held: 'A confession made under a white flag could not found a later claim.', use: '[[s:treasure/2]]'
      }
    },

    /* Basic cards have a front and back. Cloze cards hide whatever is in {{double braces}}. */
    cards: [
      { id: 'pl-c1', topic: 'pl-shares', type: 'basic', front: 'Who takes a share under [[s:treasure/3]]?', back: 'The crew who sailed, with one extra share for the captain.' },
      { id: 'pl-c2', topic: 'pl-shares', type: 'cloze', text: 'Whoever claims a share must show that they {{sailed}} on the voyage.', extra: '[[s:treasure/4]]' },
      { id: 'pl-c3', topic: 'pl-shares', type: 'basic', front: '[[c:redbeard]]: what was held?', back: 'A late joiner who sails is crew.' },
      { id: 'pl-c4', topic: 'pl-parley', type: 'basic', front: 'Can words said in parley be used later?', back: 'No: [[s:treasure/2]] and [[c:blackwater]].' }
    ],

    mcqs: [{
      id: 'pl-q1', topic: 'pl-shares', q: 'A stowaway is found on day 3. Do they take a share?',
      options: ['Yes, an equal share', 'Yes, half a share', 'No, a stowaway is not crew', 'Only if the captain agrees'], answer: 2,
      why: 'Only the crew who sailed share under [[s:treasure/3]].'
    }],

    /* The last-hour cheatsheet: shown before an exam and exportable to PDF. */
    lastHour: '### Pirate Law: last hour\n- **Shares:** equal for those who sailed, two for the captain ([[s:treasure/3]]).\n- **Burden:** on the claimant ([[s:treasure/4]]).\n- **Late joiners:** still crew ([[c:redbeard]]).\n- **Parley:** must be heard and can\'t be used later ([[s:treasure/2]]).'
  };

  /* Memory palaces. A locus links to a topic, so it also appears in that topic's Palace step. */
  D.palaces = D.palaces || [];
  D.palaces.push({
    id: 'pl-ship', name: 'The Ship', subject: 'pirate', intro: 'Walk from the gangplank to the helm.',
    rooms: [{
      id: 'pl-deck', name: 'Main deck', icon: '⚓',
      loci: [
        { id: 'pl-l1', spot: 'The gangplank', image: 'A cook swings aboard on a giant ladle, shouting "I sailed!"', meaning: 'Late joiners are crew: [[c:redbeard]]', topic: 'pl-shares' },
        { id: 'pl-l2', spot: 'The mast', image: 'A white flag wraps itself around a parrot\'s beak so it can\'t repeat a word.', meaning: 'Parley can\'t be used later: [[s:treasure/2]]', topic: 'pl-parley' }
      ]
    }]
  });

  /* Past papers. `file` is the original paper; put PDFs in "<course folder>/Past Papers". */
  D.papers = (D.papers || []).concat([{ subject: 'pirate', file: 'Pirate Law/Past Papers/2029 end-term.pdf', note: 'A paper you might add' }]);
  D.pastQuestions = (D.pastQuestions || []).concat([
    {
      id: 'pl-p1', subject: 'pirate', paper: '2029 end-term', marks: 20, midterm: true, topics: ['pl-shares'],
      text: 'Mary joins the *Black Gull* at its second port. Tom hides in a barrel until day 3. **Advise them both on their claims to the treasure.**',
      outline: '**Issue:** who is crew? **Rule:** [[s:treasure/3]], [[s:treasure/4]], [[c:redbeard]]. **Application:** Mary sailed, and Tom stowed away. **Conclusion:** Mary shares and Tom does not.'
    },
    {
      id: 'pl-p2', subject: 'pirate', paper: '2029 end-term', marks: 5, midterm: true, topics: ['pl-parley'], oldLaw: true, mapNote: 'Old Code art. 9 is now s. 2',
      short: 'Short note on parley', text: 'Write a short note on parley under art. 9 of the Old Code.',
      outline: 'Must be heard before any blow, and nothing said can be used later: [[s:treasure/2]], [[c:blackwater]].'
    },
    {
      id: 'pl-p3', subject: 'pirate', paper: '2028 end-term', marks: 5, topics: [], offSyllabus: 'This topic was dropped from the syllabus, so skip it unless you have spare time.',
      text: 'Write a short note on the law of mermaids.', outline: 'Not on the current syllabus.'
    }
  ]);

  /* The timetable. A block with a `topic` is carried forward if skipped; one without stays on its day.
     Starting in the past shows the adaptive plan straight away. */
  const phase = 'Example phase';
  const day = (offset, hours, items) => (D.timetable = D.timetable || []).push({ date: on(offset), phase, hours, items: items.map((x, i) => ({ id: `pl-${offset}-${i}`, subject: 'pirate', ...x })) });
  day(-2, '2 h', [{ text: 'Equal shares', topic: 'pl-shares', hours: 2 }]);
  day(-1, '2 h', [{ text: 'Due-card review', hours: 0.5 }, { text: 'Parley', topic: 'pl-parley', hours: 1 }]);
  day(0, '2 h', [{ text: 'Due-card review', hours: 0.5 }, { text: 'A brief history of the Code', topic: 'pl-history', hours: 1 }]);
  for (let i = 1; i <= 4; i++) day(i, '3 h', [{ text: 'Due-card review', hours: 0.5 }, { text: 'One timed answer', hours: 1 }]);
  day(5, 'exam', [{ subject: 'exam', text: '🎓 Pirate Law midterm' }]);
  for (let i = 6; i <= 11; i++) day(i, '3 h', [{ text: 'Due-card review', hours: 0.5 }]);
  day(12, 'exam', [{ subject: 'exam', text: '🎓 Pirate Law end-term' }]);

  /* Extra Memory Guide sections: [icon, title, text]. */
  D.guide = (D.guide || []).concat([
    ['🦜', 'Remembering the Treasure Act', '- **Section 3:** three coins on a barrel, one for each share.\n- **Section 4:** four sailors pointing at the claimant: you prove it.']
  ]);

  /* Your own badges. `test` gets the LQ object once the app has started. */
  D.badges = (D.badges || []).concat([
    { id: 'pl-badge', icon: '🦜', name: 'Ship Shape', desc: 'Reach 50% card mastery in Pirate Law', test: () => window.LQ.mastery({ subject: 'pirate' }) >= 50 }
  ]);
})();

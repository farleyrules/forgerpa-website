---
title: "Why Your Bots Keep Breaking"
author: "David Farley"
date: "2026-09-21"
description: "Brittle automation fails silently the moment a portal or a report changes. Here is what makes a bot break, what self-healing actually means, and how to build automation that knows when it is wrong."
tags:
  - "Self-Healing Automation"
  - "RPA"
  - "Finance Automation"
  - "Exception Handling"
readingTime: "6 min"
draft: true
---

<p>Most finance teams that soured on automation did not fail at automation. They succeeded once, then watched the thing they built stop working the first time a vendor changed a portal or a report added a column. The bot had been recorded against a world that was expected to hold still, and the world never does. So the automation broke, usually without saying so, and the team went back to doing the work by hand and quietly concluded that automation does not last.</p>

<p>It can last. Durability is a design choice, and most bots are built without it.</p>

<h2>Why Bots Break In The First Place</h2>

<p>A brittle bot depends on things that were never promised to stay the same. Three dependencies cause almost every breakage we see.</p>

<p><strong>Fragile targeting.</strong> A bot that clicks a screen position, or reads the third column because it was the third column the day it was recorded, is one layout change away from failure. Vendors redesign portals. Reports get a new field. A column moves. The bot keeps clicking where the button used to be.</p>

<p><strong>No sense of its own output.</strong> A recorded click path runs to the end and reports success because it finished, not because it was right. It does not know that the export was empty, that the login silently failed and it scraped a login page, or that it pulled last month's file again. Finishing and being correct are different things, and a brittle bot cannot tell them apart.</p>

<p><strong>Silence on failure.</strong> The most expensive failure is the quiet one. A scheduled job that stops running produces no error, no file, and no alarm. It looks exactly like a slow week. By the time someone notices the numbers are stale, the gap can be a month deep, and for some data feeds a day that was missed is gone for good.</p>

<h2>What Self-Healing Actually Means</h2>

<p>Self-healing is a term the automation industry oversells. It does not mean an AI that silently rewrites the bot every time a vendor breaks it. Trust an automation to quietly repair itself and you have just built a faster way to be wrong without knowing. What self-healing should mean is narrower and far more useful: the automation is built so that ordinary change does not break it, and the change that does break it surfaces immediately and specifically.</p>

<p>In practice that is four habits, none of them exotic.</p>

<p><strong>Target stable things.</strong> Use an API where the system offers one, because an API is a contract the vendor agreed to keep. Where there is no API, anchor on meaning rather than position: find the column by its header, the field by its label, the row by its key. A layout can move a great deal without moving what a field is called.</p>

<p><strong>Check the work before trusting it.</strong> A durable automation validates its own output against something it can verify. Did the row count land in a sane range. Does this total reconcile to a control figure. Is the date on this file the date we expected. A number that fails its own check never flows downstream as if it were good.</p>

<p><strong>Fail loud and specific.</strong> When something does break, the automation should stop and say exactly what and where, into an exception list a person can act on in minutes. Not a stack trace. Not a silent zero. A short, structured statement: this feed returned no rows, this login did not complete, this column was not found.</p>

<p><strong>Absorb the change you can predict.</strong> A moved column found by name. A retry with a pause when a portal is briefly slow. A fallback when the primary path is down. These are not intelligence. They are the difference between an automation that shrugs off a normal Tuesday and one that dies on it.</p>

<h2>The Real Dividing Line</h2>

<p>Strip away the vocabulary and durable automation comes down to one property: it knows when it is wrong. A brittle bot runs to completion and hands you a confident, wrong answer. A durable one checks itself, and when the check fails it stops and tells you rather than passing the bad number along.</p>

<p>This is why a finished run is not the same as a correct one. A job can end, write a file, and light up green while the file is empty or stale. The only failure that matters is the one measured against the truth the number is supposed to represent, which is why the check has to compare against something real, not merely confirm that the script reached its last line.</p>

<h2>Where The Human Belongs</h2>

<p>Done right, none of this means a person babysitting every run. The point of the exception queue is the opposite. The automation handles the high volume that follows the rules, and a human handles the short list that does not, with the reason already spelled out. People spend their attention on judgment, not on watching a bot to make sure it did what it was told.</p>

<p>The same line applies to AI inside the workflow. Use it for the steps that genuinely need judgment: reading a messy description, matching two records that do not match cleanly, flagging something that looks off. Do not use it to paper over a foundation that was built to break. AI on top of a brittle bot is still a brittle bot, now with a more expensive way to be confidently wrong.</p>

<h2>How To Tell If Yours Is Brittle</h2>

<p>You do not need to audit the code to know. Ask three questions.</p>

<p>What happens when the vendor changes the portal next week. If the honest answer is that the automation quietly produces nothing and nobody notices for a while, it is brittle, and the only question is when.</p>

<p>Who gets told when a scheduled run does not run at all. A missing run is invisible by default. If nothing watches for silence, silence is exactly what you will get, right up until the numbers are badly out of date.</p>

<p>When the automation produces a number, does anything check that the number is right before people act on it. If the answer is that everyone assumes it is right because the job turned green, the green light is decoration.</p>

<h2>What Good Looks Like</h2>

<p>Prefer the API. Anchor on names, not positions. Validate every output against a control before it flows anywhere. Fail into a queue that says what broke, in words a person can act on. Log every run, and alert on the run that did not happen, because a job that goes quiet is more dangerous than a job that throws an error. None of it is glamorous. All of it is the difference between an automation you can forget about because it tells you when it needs you, and one you have to check by hand, which is the thing you were trying to stop doing.</p>

<h2>Key Takeaway</h2>

<p>Bots do not break because automation is fragile. They break because they were built to assume the world holds still, and to stay silent when it does not. <strong>Build automation that knows when it is wrong.</strong> Target stable anchors, check every output against the truth, and make failure loud and specific. An automation that surfaces its own exceptions is one you can trust for years. One that runs green no matter what is one you will be rebuilding by hand within the year.</p>

<hr />

<p><strong>Ready to explore this for your team?</strong> <a href="/contact?from=blog-why-your-bots-keep-breaking">Book a discovery call →</a></p>

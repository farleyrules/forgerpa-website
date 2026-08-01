---
title: "Why Closing the Books Across 20 Entities Takes Three Weeks"
description: "The multi-entity close is a data problem, not a staffing problem. Here is where the three weeks actually go, and what to fix first."
date: "2026-08-03"
author: "David Farley"
tags:
  - "Multi-Entity Close"
  - "Financial Consolidation"
  - "Finance Automation"
  - "Data Platform"
readingTime: "7 min"
draft: true
slug: "multi-entity-close-consolidation"
---

<p>If it takes three weeks to close the books across twenty legal entities, the problem is almost never the accounting team. The same number lives in twenty places in twenty slightly different shapes, and somebody has to reconcile that by hand before anyone can look at a consolidated result. That is a data problem wearing a staffing problem's clothes, and it does not respond to hiring.</p>

<h2>Entity Count Is the Real Qualifier</h2>

<p>Revenue is a poor predictor of close pain. A single operating company with one general ledger and a handful of bank accounts can close in five days at almost any size. A holding company a fraction of that size, spread across two dozen operating entities that each keep their own books and their own banking, will take three weeks and burn somebody's weekend getting there.</p>

<p>The work scales with entities and bank accounts, not with revenue. Every entity adds a set of books to reconcile, a set of statements to pull, a mapping to maintain, and at least one more intercompany relationship to eliminate. The growth is not linear either, because the intercompany pairs multiply faster than the entity count does.</p>

<p>Nobody sets out to build this. It accumulates. A new location gets its own LLC because the lender wanted it that way. An acquisition arrives with its own accounting system and stays on it because migrating mid-year is worse. A property is held separately for liability reasons. Each decision was correct on its own day. Ten years later the finance team inherits the sum of them.</p>

<h2>Where the Three Weeks Actually Go</h2>

<p>When we map a slow multi-entity close, the time lands in four places almost every time.</p>

<p><strong>Chart of accounts drift.</strong> Each entity was set up by whoever was there at the time. One calls it repairs and maintenance, one calls it R and M, one buried it in facilities. The mapping that reconciles them lives in a spreadsheet column or in one person's head. Every new account added anywhere is a silent break in the consolidation until somebody notices the total moved.</p>

<p><strong>Intercompany eliminations by hand.</strong> Management fees, shared payroll allocations, cash sweeps between accounts, one entity paying a vendor invoice on behalf of another. Both sides get booked in different periods with different descriptions, and they never agree the first time. A meaningful share of the close is one person hunting for the other half of a transaction that somebody recorded in the wrong month.</p>

<p><strong>The one workbook.</strong> Nearly every multi-entity close funnels into a single consolidation workbook with a tab per entity and a web of links holding it together. It works. It also has one author, and that author is the only person who can tell you why row 412 hardcodes a number. That is concentration risk on the number that goes to the bank and the board.</p>

<p><strong>Arrival is too late to matter.</strong> By the time the consolidated result exists, it describes a month that ended three weeks ago. Leadership still has to make decisions in the meantime, so they make them on the one number that is always current, which is the bank balance. That is how a company with a full accounting function ends up running on cash feel.</p>

<h2>Why Hiring Does Not Fix It</h2>

<p>The instinct is to add a person, and it makes sense on paper: the work is manual, so more hands should mean less time. In practice you buy capacity for the parts that were never the bottleneck. A second person can pull statements and run exports in parallel. The mapping decisions, the elimination judgment, and the workbook itself stay with the one person who understands them, and that person is still the critical path.</p>

<p>The same logic applies to buying another reporting tool. A dashboard on top of twenty unreconciled ledgers produces a fast, confident, wrong answer. The reporting layer was never the constraint. The constraint is that there is no agreed, maintained definition of how these twenty sets of books add up.</p>

<h2>What Good Looks Like</h2>

<p>The fix is unglamorous and it is mostly plumbing. Four pieces, in this order.</p>

<p><strong>1. One landing place, on a schedule.</strong> Every entity's trial balance and bank activity lands in one place automatically, on a cadence, without anyone logging into anything. Entities keep their own accounting systems. Nobody is migrating twenty companies onto one platform, and they should not have to.</p>

<p><strong>2. One mapped chart of accounts.</strong> A real mapping table that is versioned and owned, not a lookup column in the consolidation workbook. The rule that matters: a new account in any entity with no mapping raises an exception. It never lands quietly in an Other bucket, because a silent default is how a consolidation goes wrong while every total still foots.</p>

<p><strong>3. Intercompany matched by rule, with an exception queue.</strong> Rules catch the clean pairs automatically, which is most of them. What is left is a short structured list with both sides shown and the reason they did not match, instead of a hunt through two ledgers. The exceptions still need a human. They just need one for minutes rather than days.</p>

<p><strong>4. A consolidated view that exists before the close is finished.</strong> Once the first three pieces run on a schedule, a preliminary consolidated result is available mid-month, not three weeks after the fact. The close stops being an event that produces the number and becomes a process that confirms one people have already been watching.</p>

<h2>How to Start</h2>

<p>Count three things before you buy anything or build anything.</p>

<p>Count your legal entities. Count your bank accounts across all of them. Count the number of people whose hands the consolidation passes through, and note how many of them are the only person who can do their step. Those three numbers describe the actual size of the problem better than any revenue figure, and they take an afternoon to gather.</p>

<p>Then do the boring artifact first: map the chart of accounts across entities, with an owner and a version. Everything downstream depends on it, and it is the one piece that cannot be automated around. Once the mapping exists, automate the extract, starting with the trial balance only. Trial balances are small, standard, and available from every accounting system, which makes them the cheapest possible proof that the pipe works.</p>

<p>Do not start with the dashboard. The dashboard is the last mile and the easiest one. Starting there is how teams end up with a beautiful view of numbers nobody trusts.</p>

<h2>Key Takeaway</h2>

<p>A three week close across twenty entities is not a staffing failure. It is twenty copies of the same data with no agreed mapping between them and no automated way to bring them together. <strong>Fix the mapping and the pipe first.</strong> The reporting is the easy part, and it only becomes worth building once the numbers underneath it can be trusted without a manual reconciliation in front of them.</p>

<hr />

<p><strong>Ready to explore this for your team?</strong> <a href="/contact?from=blog-multi-entity-close-consolidation">Book a discovery call →</a></p>

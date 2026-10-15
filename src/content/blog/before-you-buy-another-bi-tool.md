---
title: "Before You Buy Another BI Tool, Fix the Data Underneath"
author: "David Farley"
date: "2026-09-07"
description: "A dashboard built on data that never reconciles produces a fast, confident, wrong answer. Fix the plumbing first, then report."
tags:
  - "Business Intelligence"
  - "Data Platform"
  - "Finance Automation"
  - "Reporting"
readingTime: "7 min"
draft: true
slug: "before-you-buy-another-bi-tool"
---

<p>Most reporting projects start in the wrong place. A multi-location operator decides the business needs better visibility, so it buys a BI tool, hires someone to build dashboards, and six months later has a wall of charts that nobody in the finance meeting quite trusts. The dashboard is not wrong because it was built badly. It is wrong because it was built on top of data that does not reconcile, and no amount of visualization fixes that. A dashboard on broken plumbing produces a fast, confident, wrong answer, and the confidence is the dangerous part.</p>

<h2>The Dashboard Is Not the Problem</h2>

<p>The reporting layer is the last mile of a data platform, and it is the easiest mile. Picking a tool, choosing colors, and laying out a page are solved problems. If the numbers underneath were clean, you could stand up a useful dashboard in a week. The reason it takes six months and still does not land is that the six months go into fighting the data, and the dashboard just makes the fight visible.</p>

<p>In a multi-location business the operational numbers live in at least four systems that were never designed to agree. The point of sale knows what sold, by location and by day. Payroll knows what labor cost, by pay period. Accounts payable knows what was purchased, by invoice and vendor. The general ledger knows what was booked, by fiscal period, after the accountants were done. Four systems, four owners, four different ways of slicing time and place. A dashboard has to stitch them together, and the stitching is where the truth leaks out.</p>

<h2>Why the Numbers Never Agree</h2>

<p>The trouble is not that any one system is wrong. Each is usually right about its own slice. The trouble is that the slices do not line up, so pulling them into one view quietly requires a hundred small assumptions, and nobody wrote them down.</p>

<p><strong>Different grains of time.</strong> The point of sale reports by calendar day. Payroll reports by pay period, which straddles month ends. The general ledger reports by fiscal period, which may not be a calendar month at all. When a dashboard shows labor as a percent of sales for August, something had to decide which days of which pay period count as August, and that decision is usually buried in a formula nobody remembers writing.</p>

<p><strong>Different definitions of the same word.</strong> Sales in the point of sale is gross rings. Sales in the general ledger is booked revenue after discounts, comps, voids, and tax are stripped out. Both are called sales. If a dashboard pulls the first and the finance team quotes the second, the two numbers will never match, and every meeting spends its first ten minutes arguing about which one is real instead of what to do about it.</p>

<p><strong>Different owners with no shared source.</strong> The operations team trusts the point of sale because it is theirs. Finance trusts the general ledger because it is theirs. When those two never tie, the organization does not get one version of the truth. It gets two, and it picks whichever supports the argument in the room.</p>

<h2>The Test That Exposes It</h2>

<p>There is a single test that tells you whether a dashboard is trustworthy, and it takes an afternoon. Pick one number on it. Trace that number back to the general ledger and see if it foots.</p>

<p>If the dashboard says sales were a certain figure for a period, does that figure agree with booked revenue in the ledger for the same period, after the same adjustments? If it does, the pipe underneath is sound and you can trust the rest. If it does not, and it usually does not the first time, then the dashboard is describing a different number than the books, and no one should be making decisions on it. The gap is not a rounding issue. It is the sum of every unwritten assumption in the stitching, and it will move around from month to month in ways nobody can explain.</p>

<p>This is why the general ledger tie is not a nice-to-have. The ledger is the one place in the business where the numbers have already been reconciled, adjusted, and signed off. A reporting layer that does not reconcile to it is a reporting layer that has opted out of the one control the organization already trusts.</p>

<h2>Same-Store Is Where It Breaks First</h2>

<p>The place this failure shows up soonest is comparability. Every multi-location operator eventually wants to know how this period compares to the same period a year ago, on a like-for-like basis. That question sounds simple and is not, because answering it honestly requires two things a raw operational feed cannot give you.</p>

<p>It requires a stable, governed list of which locations count as comparable, excluding the ones that opened or closed inside the window, or the comparison flatters or punishes the business for its own footprint changes. And it requires a matched calendar, so that this week is measured against the week that actually lines up a year ago rather than the same calendar date, which usually falls on a different day of the week. Get either one wrong and the same-store number is worse than missing, because it looks authoritative and it is quietly comparing the wrong things. A point of sale export alone has neither the store governance nor the calendar logic to do this. That work has to live in the layer underneath the dashboard, not in the dashboard itself.</p>

<h2>What a Governed Data Layer Actually Is</h2>

<p>The fix is unglamorous, and it is mostly plumbing. A governed data layer is three things, in this order, before a single chart is drawn.</p>

<p><strong>One landing place, on a schedule.</strong> The point of sale, payroll, accounts payable, and the trial balance from the general ledger all land in one place automatically, on a cadence, without anyone exporting a spreadsheet. The systems stay where they are. Nobody is ripping out the point of sale or migrating the accounting system. The data just stops living only inside each silo.</p>

<p><strong>Definitions that are owned and versioned.</strong> Sales has one definition. A period has one calendar. A comparable location has one rule. These live in a mapping that has an owner and a version, not in a formula inside one analyst's workbook. The test is simple: when someone asks why a number changed, there is a documented answer, not a person to interrogate.</p>

<p><strong>A reconciliation that runs on every load.</strong> Each time the data refreshes, the operational totals are tied back to the general ledger automatically, and any gap over a threshold raises an exception instead of flowing silently into a chart. This is the piece almost everyone skips, and it is the piece that makes every number above it trustworthy. A dashboard that sits on a layer that reconciles to the ledger every night is a dashboard the finance team will actually defend in a meeting.</p>

<p>Only once those three exist does the reporting layer go on top, and at that point it is the easy last mile it always should have been.</p>

<h2>Do This Before You Shop</h2>

<p>Before you evaluate another BI tool, spend a day on three things that cost nothing and tell you exactly how big the real project is.</p>

<p>Count your source systems and, for each one, name the person who owns it and the grain it reports in. Then pick one number you care about, sales or labor cost, and try to tie it from the operational system all the way back to the general ledger for a single closed period. Write down every adjustment you had to make to get them to agree. That list is your actual scope. Last, for the three or four terms your leadership argues about most, write the one true definition and name who owns it.</p>

<p>None of that requires software. All of it is the work the software was going to hide from you, and doing it first is the difference between a reporting project that lands and one that produces beautiful charts nobody trusts.</p>

<h2>Key Takeaway</h2>

<p>A distrusted dashboard is almost never a tooling failure. It is operational data spread across systems that keep different time, use the same words for different things, and never reconcile to the books. <strong>Fix the plumbing and tie it to the general ledger first.</strong> The reporting is the easy part, and it only becomes worth buying once the numbers underneath it are ones you can defend without a manual reconciliation in front of them.</p>

<hr />

<p><strong>Ready to explore this for your team?</strong> <a href="/contact?from=blog-before-you-buy-another-bi-tool">Book a discovery call →</a></p>

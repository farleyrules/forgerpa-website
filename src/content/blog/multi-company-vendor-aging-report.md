---
title: "How Long Does a Multi-Company Vendor Aging Report Take by Hand?"
metaTitle: "How Long a Multi-Company Vendor Aging Report Takes"
author: "David Farley"
date: "2026-11-11"
description: "By hand, a multi-company vendor aging report is one run, export and cleanup per entity, then the combining and aging. The steps, and what automating it looks like."
tags:
  - "Accounts Payable"
  - "AP Aging"
  - "Month-End Close"
  - "Finance Automation"
readingTime: "8 min"
draft: true
---

<p>By hand, a multi-company vendor aging report takes a separate report run, export and cleanup for each entity you pull on its own, plus combining the files and calculating the aging buckets, and none of it can start until AP closes for the month. In my work before Forge, at a Fortune Global 500 manufacturer running SAP across multiple company codes, that took one to two days every month, and the automation I built cut it to about 30 minutes. Automated, the same open-items report runs for every entity as of the period-end date, the results are combined, the buckets are derived from each invoice's due date, and past-due items are flagged, so your AP team starts with the report already built.</p>

<p>A vendor aging report, often called an AP aging report, lists the open invoices you owe each vendor, grouped by how far past due they are.</p>

<h2>Why Does It Take So Long by Hand?</h2>

<p>For one company, an aging report can be a short job: pick a date, run the report, export it. The multi-company version repeats that work for every entity before any of it can be combined. Four things drive the time.</p>

<p><strong>It waits on the close.</strong> The aging only means something once the AP ledger is closed for the period. Run it earlier and invoices still being posted change the totals. So it lands inside month-end close, on a deadline.</p>

<p><strong>Every entity is its own run.</strong> When the companies sit in separate ledgers, separate systems, or behind separate access, each one gets its own run, export and cleanup: header rows removed, columns checked, amounts converted from text to numbers. Every entity adds one more pass, and a mistake in any one of them carries into the total.</p>

<p><strong>The buckets are not in the export.</strong> A line item report, such as SAP's vendor line item display (FBL1N), lists open invoices with their amounts and dates, not aging buckets. Someone has to calculate days past due for every open item, assign each one to a bucket, and get the same answer every month.</p>

<p><strong>Combining is where errors hide.</strong> Once the files are stacked, someone has to confirm nothing is missing or doubled, every row still names its entity, and amounts in different currencies are not added together as if they were one. None of those mistakes announces itself. Each one shows up as a total that is slightly wrong.</p>

<h2>How the Report Is Built, Step by Step</h2>

<p>Whether a person or an automation does the work, the steps are the same, and writing them down is the first step toward automating them.</p>

<h3>1. Confirm AP Is Closed</h3>

<p>Start once the AP ledger is closed for the period, so the open items you are aging stop changing. Note the period-end date. Every calculation that follows uses it.</p>

<h3>2. Run Open Items for Each Entity as of the Period End</h3>

<p>For each company, run the open payables as of the period-end date, not the day you happen to run the report. In SAP, that is FBL1N with open items at a key date equal to the period end. Other ERPs have their own open-items report. Either way, use the same period-end date for every entity.</p>

<h3>3. Export Each One the Same Way</h3>

<p>Use one saved layout so every export has the same columns in the same order: entity, vendor number and name, document number, document date, due date, amount and currency. If the columns drift between entities, every later step breaks quietly.</p>

<h3>4. Combine Into One Table</h3>

<p>Stack the exports into one table, with a column naming each row's entity. Decide once how currency works: age each entity in its own local currency, or translate everything into one reporting currency at a stated rate. Then check each entity's row count and total against its own export, so you know nothing was dropped or doubled.</p>

<h3>5. Derive the Buckets From the Due Date</h3>

<p>For every open item, calculate days past due as the period-end date minus the due date, then assign the bucket from that number. A common layout is Current, 30, 60 and 90+, and some teams add 120+. Write down exactly where each boundary falls, for example that Current means not yet due and 30 means 1 to 30 days past due, and apply the same rule to every entity every month.</p>

<p>Age from the due date, not the invoice date, when the question is which vendors have not been paid on time. An invoice on 60-day terms is not late at day 45, and aging it by invoice date makes it look late.</p>

<h3>6. Flag What Is Past Due</h3>

<p>Mark every item past its due date and summarize by vendor and by entity, oldest and largest first. Show vendor credits and down payments on their own lines rather than netting them against invoices out of sight. The goal is a short list a reviewer can act on.</p>

<h3>7. Tie It Out and Send It for Review</h3>

<p>Before anyone reads it, tie each entity's total to its AP control account in the general ledger as of the same date. In SAP terms, the report's open items should agree with the vendor reconciliation accounts at the same key date. If they do not, something was dropped or filtered between the system and the workbook. Then send it for review: the AP lead or manager for the vendor detail, and the controller for the summary and anything large or old.</p>

<h2>What Does Automating It Look Like?</h2>

<p>The automation does steps 2 through 7, in order, once AP is closed: on a set date in the close calendar, or when someone on the team starts it. It delivers one workbook in the same format every month.</p>

<p>Two design choices separate an automation that saves time from one that creates work.</p>

<ul>
  <li><strong>It stops loudly instead of finishing quietly.</strong> If an entity fails to export, a total does not tie, or a column is missing, the run stops and says which entity and why. A partial aging that looks complete is worse than none.</li>
  <li><strong>It keeps a record of every run.</strong> The entities that ran, each one's row count and total, the as-of date, and the bucket rule used. When an auditor or the controller asks how a number was produced, the answer is already written down.</li>
</ul>

<p>The person's part shrinks to starting the run, if it is not scheduled, and reading the result. The case study on <a href="/case-studies/vendor-aging-report-sap">month-end vendor aging across SAP company codes</a> shows one version of this build.</p>

<h2>What Stays with Your Team</h2>

<p>The automation does the gathering. The decisions stay with your AP team.</p>

<ul>
  <li><strong>What to pay, and when.</strong> The report shows what is open and how old it is. Deciding what goes into the next payment run is the AP team's call, under your payment policy.</li>
  <li><strong>Why an item is still open.</strong> A missing receipt, a price that does not match the purchase order, an invoice that arrived late, an approval still waiting. Finding the reason takes a person who knows the vendor and the process.</li>
  <li><strong>Conversations with vendors.</strong> When a vendor asks about a past-due invoice, your team answers with the report in hand.</li>
  <li><strong>The rules.</strong> Bucket boundaries, currency treatment, and who receives the report are policy. The automation applies them; your controller owns them.</li>
  <li><strong>Sign-off.</strong> The reviewer still reads the report, questions anything that looks wrong, and signs off as part of the close.</li>
</ul>

<h2>Is It Worth Automating?</h2>

<p>A multi-company vendor aging report is a good first automation for a finance team, for the same reasons it is tedious by hand. It runs every month. The steps rarely change. The rules can be written down. And the output can be checked against a number you already trust, the AP balance in the general ledger, so a wrong result is caught before anyone acts on it.</p>

<p>It is harder when entities sit in different ERPs, which means one more extract, or when the bucket rules live in one person's head, which means writing them down first. That is worth doing anyway.</p>

<h2>How to Start</h2>

<p>Before you build anything, do three things the next time the report is due.</p>

<ol>
  <li><strong>Time it.</strong> Track the hours from AP close to the finished report, across everyone who touches it. That is your baseline.</li>
  <li><strong>Write down the steps and the rules.</strong> The entity list, the report and layout for each, the as-of date, the bucket boundaries, the currency treatment, and who reviews it.</li>
  <li><strong>List what went wrong last time.</strong> The entity that would not export, the total that did not tie, the duplicate that was caught late. That list becomes the automation's test plan.</li>
</ol>

<p>Then automate the gathering, and compare the hours against your baseline after the first close.</p>

<h2>Key Takeaway</h2>

<p>By hand, a multi-company vendor aging report costs a full pass per entity, every month, inside the close. <strong>Automate the gathering and keep the judgment.</strong> Let the automation run every entity as of the period end, derive the buckets from the due date, flag what is past due, and tie out to the general ledger, so your AP team spends its time on the items that need a decision.</p>

<p><strong>Ready to explore this for your team?</strong> <a href="/contact?from=blog-multi-company-vendor-aging-report">Book a discovery call →</a></p>

<hr />

<p><em>David Farley is the President and Founder of Forge RPA. A 30-year finance and accounting veteran, he helps companies automate business processes with custom automation built with AI, from advanced Excel and VBA solutions to end-to-end workflows, while keeping costs under control. Before building automation with AI, David was a Certified UiPath Developer and built hundreds of automations on traditional RPA platforms, including 100+ at a Fortune Global 500 manufacturer.</em></p>

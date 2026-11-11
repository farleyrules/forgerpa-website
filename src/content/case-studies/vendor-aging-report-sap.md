---
title: "Month-End Vendor Aging Across SAP Company Codes, Automated"
metaTitle: "Vendor Aging Across SAP Company Codes, Automated"
metaDescription: "A month-end SAP vendor aging report that took one to two days by hand, one export per company code, automated: combined, aged, and past-due vendors highlighted."
industry: "Manufacturing"
service: "Accounts Payable Reporting"
summary: "A month-end vendor aging report that took one to two days by hand, with one SAP run and Excel export per company code, was automated: the exports combined, the aging buckets derived, and the vendors not paid on time highlighted"
metric: "One to two days by hand → [[DAVID: how long the automated run took]]"
shortDescription: "Multi-company vendor aging from SAP, combined across company codes and aged into Current, 30, 60 and 90+, with the vendors not paid on time highlighted"
challenge: "At a Fortune Global 500 manufacturer, the monthly vendor aging report was part of month-end close, and it could only be prepared after the AP ledger closed. The data had to be run in SAP one company code at a time, using the vendor line item display (FBL1N), with each result exported to Excel and the exports combined into one report. The aging buckets, Current, 30, 60 and 90+, were not part of the export; they had to be derived from the data. The finished report highlighted which vendors had not been paid on time, and building it by hand took one to two days of work every month."
approach: "This was earlier work, done before Forge, built with [[DAVID: what you built it with]]. The automation took over the gathering: running the report for each company code, exporting each result to Excel, and combining the exports into one report. It then derived the Current, 30, 60 and 90+ buckets, which the export did not provide, and highlighted the vendors that had not been paid on time. The report still depended on a closed AP ledger, so it ran once a month, after AP closed, as part of month-end close."
outcome:
  - "One to two days of hand work every month replaced by an automated run of [[DAVID: how long the automated run took]]"
  - "Every company code run, exported, and combined by the automation instead of by hand"
  - "Current, 30, 60 and 90+ aging buckets derived automatically, not worked out from the export by hand"
  - "Vendors not paid on time highlighted in the finished report"
  - "Kept to the close calendar: produced once a month, after the AP ledger closed"
order: 6
publishDate: "2026-11-11"
tags:
  - "Accounts Payable"
  - "Vendor Aging"
  - "SAP"
  - "Month-End Close"
featured: false
draft: true
---

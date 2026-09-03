---
title: "Quarterly Asset Confirmations Run From One Workbook and a Teams Message"
industry: "Manufacturing"
service: "Fixed Asset Controls"
summary: "Power Automate and Office Scripts turned a quarterly confirmation cycle into a Teams message, with the accounting team still owning the workbook and every answer flowing back into it"
metric: "[N] assets confirmed across [N] departments every quarter, [before] hours to [after]"
shortDescription: "Quarterly fixed-asset confirmations orchestrated across Excel, SharePoint, Teams, and email with people in the loop"
challenge: "At a Fortune Global 500 manufacturer, the asset accounting group had to confirm fixed assets with department contacts every quarter. The list came from an SAP query, the contacts lived in a spreadsheet, and the cycle was hand work end to end: build a confirmation file per department, save it, write the email with the due date, chase the people who had not answered, and key every returned questionnaire back into the master list. It took [before] hours a quarter and the reminders depended on someone remembering."
approach: "We kept the accountants in control of one Excel workbook: the assets to confirm from the SAP query on one table, the contacts by department location on another. A message in a Teams channel starts the run. Office Scripts and Power Automate create the confirmation files, save them to SharePoint folders, and email each contact from a template that states the due date. Returned confirmations are evaluated for changes and the questionnaire is ingested back into the main workbook automatically. A second Teams message sends reminders only to the contacts who have not completed theirs."
outcome:
  - "[N] assets confirmed across [N] department contacts every quarter"
  - "[before] hours of preparation, chasing, and keying reduced to [after]"
  - "Every confirmation filed in SharePoint and every answer recorded in the workbook without rekeying"
  - "Reminders sent only to the people who had not answered, from a single Teams message"
  - "The accounting team kept ownership of the list, the contacts, and the results in Excel"
  - "Built entirely on the Microsoft 365 stack already licensed: Excel, Office Scripts, Power Automate, SharePoint, Teams"
order: 6
publishDate: "2026-09-02"
tags:
  - "Fixed Assets"
  - "Power Automate"
  - "Office Scripts"
  - "Controls"
featured: false
---

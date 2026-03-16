---
title: "How to Score Any Process for Automation Potential (Free Framework)"
author: "David Farley"
date: "2026-03-11"
description: "Use this free process automation assessment framework to score any process for automation potential. Six criteria, real examples, and a ready-to-use scoring method."
tags:
  - "Process Assessment"
  - "Automation Framework"
  - "RPA Scoring"
  - "Automation Readiness"
readingTime: "10 min"
---

# How to Score Any Process for Automation Potential (Free Framework)


## Introduction

"We should automate that." You have heard it in meetings, and you have probably said it yourself. But which processes should you automate first? Which ones will deliver real ROI, and which ones will become expensive maintenance headaches?

After deploying 100+ automations at a Fortune 500 manufacturer and running process automation assessments for mid-market companies, I have developed a framework that answers these questions in 30 minutes per process. No consultants needed. No software to buy. Just six criteria, a scoring system, and honest evaluation.

I am giving this framework away because it is the best way I know to demonstrate that automation strategy does not need to be mysterious or expensive. If you can evaluate your own processes, you will make better decisions — whether you work with us, another firm, or your internal team.

Here is the complete process automation assessment framework.

## The Six Criteria

Every process is scored on six dimensions. Each criterion is rated 1-5, giving a maximum score of 30. In my experience, processes scoring 22+ are strong automation candidates. Those scoring 15-21 are worth investigating. Below 15, fix the process first.

### Criterion 1: Rule Complexity (1-5)

**What it measures**: How much of the process follows explicit, documented rules versus requiring human judgment?

| Score | Description | Example |
|---|---|---|
| 5 | Purely rule-based, no judgment required | Matching invoice amounts to PO amounts |
| 4 | Mostly rule-based with simple exceptions | Processing invoices, flagging those over $10K for approval |
| 3 | Mix of rules and judgment | Categorizing vendor expenses with some ambiguity |
| 2 | Mostly judgment with some rules | Evaluating vendor payment terms for negotiation |
| 1 | Primarily human judgment | Deciding whether to extend credit to a new customer |

**Why it matters for process automation assessment**: Automations excel at following rules and fail at judgment. A process scoring 1-2 on this criterion will require extensive exception handling, constant tuning, and likely more maintenance cost than it saves.

### Criterion 2: Volume and Frequency (1-5)

**What it measures**: How often does the process run, and how many transactions does it handle?

| Score | Description | Example |
|---|---|---|
| 5 | Daily, 100+ transactions | Daily invoice receipt processing |
| 4 | Daily/weekly, 20-100 transactions | Weekly vendor payment batch |
| 3 | Weekly/monthly, moderate volume | Monthly bank reconciliation, 500 items |
| 2 | Monthly, low volume | Quarterly board report generation |
| 1 | Infrequent, very low volume | Annual audit preparation |

**Why it matters**: ROI scales directly with volume. Automating a process that runs once a quarter will rarely justify the development cost. The process automation assessment should weight this criterion heavily when budgets are tight.

### Criterion 3: Data Structure (1-5)

**What it measures**: How standardized and machine-readable are the inputs and outputs?

| Score | Description | Example |
|---|---|---|
| 5 | Fully structured, digital data | ERP exports, database queries, API data |
| 4 | Mostly structured with minor variations | Standardized Excel templates with occasional formatting differences |
| 3 | Semi-structured | PDF invoices from multiple vendors with different layouts |
| 2 | Mostly unstructured | Email requests with varying formats and language |
| 1 | Fully unstructured | Handwritten forms, scanned documents, verbal instructions |

**Why it matters**: Structured data is automation fuel. Unstructured data requires OCR, natural language processing, or AI interpretation — all of which add cost, complexity, and error rates. Your process automation assessment should flag any process scoring below 3 here as requiring additional investment in data standardization.

### Criterion 4: Process Stability (1-5)

**What it measures**: How often do the process steps, systems, or business rules change?

| Score | Description | Example |
|---|---|---|
| 5 | No changes in 12+ months | Standard GL posting procedures |
| 4 | Minor changes 1-2 times per year | Monthly close checklist with occasional additions |
| 3 | Moderate changes quarterly | Compliance reporting with periodic regulatory updates |
| 2 | Frequent changes monthly | Sales commission calculations with changing rules |
| 1 | Constant flux | New product onboarding process still being defined |

**Why it matters**: Every process change requires an automation update. Unstable processes eat maintenance budgets. In your process automation assessment, a score of 1-2 here means you should stabilize the process before investing in automation.

### Criterion 5: Error Impact and Frequency (1-5)

**What it measures**: How often do errors occur in the manual process, and what is the consequence?

| Score | Description | Example |
|---|---|---|
| 5 | Frequent errors with high financial impact | Manual journal entries with material misstatement risk |
| 4 | Regular errors with moderate impact | Data entry mistakes requiring correction and reprocessing |
| 3 | Occasional errors with limited impact | Formatting inconsistencies in management reports |
| 2 | Rare errors with minimal impact | Occasional typos in internal memos |
| 1 | Virtually error-free | Simple file transfers between folders |

**Why it matters**: This criterion is scored inversely from what you might expect. High error rates and high impact mean automation delivers more value — both in cost savings and risk reduction. A process automation assessment that ignores error impact underestimates the true ROI of automation.

### Criterion 6: Technology Compatibility (1-5)

**What it measures**: How accessible are the systems involved to automation tools?

| Score | Description | Example |
|---|---|---|
| 5 | APIs available, cloud-based systems | Modern SaaS ERP with REST API |
| 4 | Web-based with standard HTML elements | Web portal with standard forms and tables |
| 3 | Mix of web and desktop applications | ERP web interface plus local Excel processing |
| 2 | Primarily desktop or legacy systems | SAP GUI, AS/400 green screens |
| 1 | Citrix, virtual desktop, or highly secured | Citrix-hosted applications, biometric authentication |

**Why it matters**: Technology accessibility determines development cost and reliability. Processes scoring 4-5 can use lightweight, low-cost tools like Python + Playwright. Processes scoring 1-2 may require enterprise RPA platforms with higher licensing costs. The process automation assessment should factor technology fit into the ROI calculation.

## Putting It All Together: The Scoring Worksheet

Here is how to run a process automation assessment on any process in your organization:

| Criterion | Weight | Score (1-5) | Weighted Score |
|---|---|---|---|
| Rule Complexity | 20% | ___ | ___ |
| Volume & Frequency | 20% | ___ | ___ |
| Data Structure | 15% | ___ | ___ |
| Process Stability | 15% | ___ | ___ |
| Error Impact | 15% | ___ | ___ |
| Technology Compatibility | 15% | ___ | ___ |
| **Total** | **100%** | | **___/5.0** |

### Interpreting Results

| Weighted Score | Recommendation |
|---|---|
| 4.0 - 5.0 | **Strong candidate** — automate now. Expected ROI > 200% in year one. |
| 3.0 - 3.9 | **Good candidate** — worth automating after top-tier processes. Investigate further. |
| 2.0 - 2.9 | **Marginal candidate** — address process issues first, then reassess. |
| Below 2.0 | **Not recommended** — process needs fundamental redesign before automation is viable. |

## Real-World Assessment Examples

Let me walk through three finance processes using this framework to show how the process automation assessment works in practice.

### Example 1: AP Invoice Processing

| Criterion | Score | Rationale |
|---|---|---|
| Rule Complexity | 4 | Clear matching rules, simple exception handling |
| Volume & Frequency | 5 | Daily, hundreds of invoices |
| Data Structure | 3 | Mix of structured POs and semi-structured vendor invoices |
| Process Stability | 5 | Stable process for years |
| Error Impact | 4 | Regular data entry errors, duplicate payment risk |
| Technology Compatibility | 4 | Web-based ERP, standard forms |
| **Weighted Score** | **4.2** | **Strong candidate** |

### Example 2: Revenue Recognition Analysis

| Criterion | Score | Rationale |
|---|---|---|
| Rule Complexity | 2 | Requires significant judgment on contract interpretation |
| Volume & Frequency | 2 | Monthly, limited contract volume |
| Data Structure | 3 | Mix of structured data and contract documents |
| Process Stability | 2 | Rules change with new ASC 606 interpretations |
| Error Impact | 5 | Material misstatement risk |
| Technology Compatibility | 3 | Multiple systems involved |
| **Weighted Score** | **2.8** | **Marginal — focus on data gathering only** |

### Example 3: Bank Reconciliation

| Criterion | Score | Rationale |
|---|---|---|
| Rule Complexity | 5 | Pure matching logic |
| Volume & Frequency | 4 | Monthly, 500+ transactions |
| Data Structure | 5 | Fully structured data from bank and GL |
| Process Stability | 5 | Process unchanged in years |
| Error Impact | 4 | Matching errors delay close |
| Technology Compatibility | 4 | Bank portal + ERP, both web-based |
| **Weighted Score** | **4.5** | **Excellent candidate** |

## Common Assessment Mistakes

Having run dozens of these evaluations, here are the mistakes I see most often in process automation assessment:

**Scoring based on the ideal process, not the actual one.** Your SOP says it takes 2 hours; reality says 6. Score what actually happens.

**Ignoring exception handling.** The main path scores 5/5 on rule complexity. But 20% of transactions hit exceptions that require judgment. That drops the real score to 3.

**Overweighting technology compatibility.** A process that scores 5 on every criterion except technology (score: 2) is still worth automating — you just need a different technology approach.

**Assessing in isolation.** Some processes are mediocre automation candidates alone but become strong candidates when combined with upstream or downstream automations. Consider the process chain, not just individual steps.

## Key Takeaways

- Use the six-criterion process automation assessment to evaluate any process in 30 minutes
- Scores of 4.0+ are strong candidates for immediate automation
- Rule complexity and volume are the strongest predictors of automation success
- Score the actual process, not the documented ideal
- Consider process chains — some automations unlock value in adjacent processes
- Use the weighted scoring worksheet to compare candidates objectively and prioritize your automation roadmap

## Next Steps

You now have the same process automation assessment framework I use with every client. Try it on your top 10 most time-consuming finance processes. Rank them by weighted score. The top 3 are your automation starting lineup.

Want us to run this assessment for your team? We offer a complimentary [Process Automation Assessment](https://forgerpa.com/services/automation-assessment) where we evaluate your top 10 processes, score them using this framework, and deliver a prioritized implementation roadmap with ROI estimates.

No sales pitch. Just data-driven recommendations from a finance veteran who has done this 100+ times.

[Get Your Free Assessment](https://forgerpa.com/contact)

---
*David Farley is the founder of ForgeRPA and a 30-year finance veteran turned Automation Architect. With 30 years of finance and automation experience — from Excel macros to enterprise RPA — he helps mid-market companies automate financial processes without expensive licensing fees.*

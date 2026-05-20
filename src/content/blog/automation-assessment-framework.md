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

<h2>Introduction</h2>

<p>"We should automate that." You have heard it in meetings, and you have probably said it yourself. But which processes should you automate first? Which ones will deliver real ROI, and which ones will become expensive maintenance headaches?</p>

<p>After deploying 100+ automations at a Fortune 500 manufacturer and running process automation assessments for companies across industries, I have developed a framework that answers these questions in 30 minutes per process. No consultants needed. No software to buy. Just six criteria, a scoring system, and honest evaluation.</p>

<p>I am giving this framework away because it is the best way I know to demonstrate that automation strategy does not need to be mysterious or expensive. If you can evaluate your own processes, you will make better decisions, whether you work with us, another firm, or your internal team.</p>

<p>Here is the complete process automation assessment framework.</p>

<h2>The Six Criteria</h2>

<p>Every process is scored on six dimensions. Each criterion is rated 1-5, giving a maximum score of 30. In my experience, processes scoring 22+ are <strong>strong automation candidates</strong>. Those scoring 15-21 are worth investigating. Below 15, fix the process first.</p>

<h3>Criterion 1: Rule Complexity (1-5)</h3>

<p><strong>What it measures:</strong> How much of the process follows explicit, documented rules versus requiring human judgment?</p>

| Score | Description | Example |
|---|---|---|
| 5 | Purely rule-based, no judgment required | Matching invoice amounts to PO amounts |
| 4 | Mostly rule-based with simple exceptions | Processing invoices, flagging those over $10K for approval |
| 3 | Mix of rules and judgment | Categorizing vendor expenses with some ambiguity |
| 2 | Mostly judgment with some rules | Evaluating vendor payment terms for negotiation |
| 1 | Primarily human judgment | Deciding whether to extend credit to a new customer |

<p><strong>Why it matters:</strong> Automations excel at following rules and fail at judgment. A process scoring 1-2 here will require extensive exception handling, constant tuning, and likely <em>more maintenance cost than it saves</em>.</p>

<h3>Criterion 2: Volume and Frequency (1-5)</h3>

<p><strong>What it measures:</strong> How often does the process run, and how many transactions does it handle?</p>

| Score | Description | Example |
|---|---|---|
| 5 | Daily, 100+ transactions | Daily invoice receipt processing |
| 4 | Daily/weekly, 20-100 transactions | Weekly vendor payment batch |
| 3 | Weekly/monthly, moderate volume | Monthly bank reconciliation, 500 items |
| 2 | Monthly, low volume | Quarterly board report generation |
| 1 | Infrequent, very low volume | Annual audit preparation |

<p><strong>Why it matters:</strong> ROI scales directly with volume. Automating a process that runs once a quarter will rarely justify the development cost. The assessment should weight this criterion heavily when budgets are tight.</p>

<h3>Criterion 3: Data Structure (1-5)</h3>

<p><strong>What it measures:</strong> How standardized and machine-readable are the inputs and outputs?</p>

| Score | Description | Example |
|---|---|---|
| 5 | Fully structured, digital data | ERP exports, database queries, API data |
| 4 | Mostly structured with minor variations | Standardized Excel templates with occasional formatting differences |
| 3 | Semi-structured | PDF invoices from multiple vendors with different layouts |
| 2 | Mostly unstructured | Email requests with varying formats and language |
| 1 | Fully unstructured | Handwritten forms, scanned documents, verbal instructions |

<p><strong>Why it matters:</strong> Structured data is automation fuel. Unstructured data requires OCR, NLP, or AI interpretation, all of which add cost, complexity, and error rates. Flag any process scoring below 3 as requiring additional investment in data standardization.</p>

<h3>Criterion 4: Process Stability (1-5)</h3>

<p><strong>What it measures:</strong> How often do the process steps, systems, or business rules change?</p>

| Score | Description | Example |
|---|---|---|
| 5 | No changes in 12+ months | Standard GL posting procedures |
| 4 | Minor changes 1-2 times per year | Monthly close checklist with occasional additions |
| 3 | Moderate changes quarterly | Compliance reporting with periodic regulatory updates |
| 2 | Frequent changes monthly | Sales commission calculations with changing rules |
| 1 | Constant flux | New product onboarding process still being defined |

<p><strong>Why it matters:</strong> Every process change requires an automation update. Unstable processes eat maintenance budgets. A score of 1-2 here means you should <em>stabilize the process before investing in automation</em>.</p>

<h3>Criterion 5: Error Impact and Frequency (1-5)</h3>

<p><strong>What it measures:</strong> How often do errors occur in the manual process, and what is the consequence?</p>

| Score | Description | Example |
|---|---|---|
| 5 | Frequent errors with high financial impact | Manual journal entries with material misstatement risk |
| 4 | Regular errors with moderate impact | Data entry mistakes requiring correction and reprocessing |
| 3 | Occasional errors with limited impact | Formatting inconsistencies in management reports |
| 2 | Rare errors with minimal impact | Occasional typos in internal memos |
| 1 | Virtually error-free | Simple file transfers between folders |

<p><strong>Why it matters:</strong> This criterion is scored inversely from what you might expect. High error rates and high impact mean automation delivers <em>more</em> value, both in cost savings and risk reduction.</p>

<h3>Criterion 6: Technology Compatibility (1-5)</h3>

<p><strong>What it measures:</strong> How accessible are the systems involved to automation tools?</p>

| Score | Description | Example |
|---|---|---|
| 5 | APIs available, cloud-based systems | Modern SaaS ERP with REST API |
| 4 | Web-based with standard HTML elements | Web portal with standard forms and tables |
| 3 | Mix of web and desktop applications | ERP web interface plus local Excel processing |
| 2 | Primarily desktop or legacy systems | SAP GUI, AS/400 green screens |
| 1 | Citrix, virtual desktop, or highly secured | Citrix-hosted applications, biometric authentication |

<p><strong>Why it matters:</strong> Technology accessibility determines development cost and reliability. Processes scoring 4-5 can use lightweight, low-cost automation tools. Processes scoring 1-2 may require enterprise RPA platforms with higher licensing costs.</p>

<h2>Putting It All Together: The Scoring Worksheet</h2>

<p>Here is how to run the assessment on any process in your organization:</p>

| Criterion | Weight | Score (1-5) | Weighted Score |
|---|---|---|---|
| Rule Complexity | 20% | ___ | ___ |
| Volume & Frequency | 20% | ___ | ___ |
| Data Structure | 15% | ___ | ___ |
| Process Stability | 15% | ___ | ___ |
| Error Impact | 15% | ___ | ___ |
| Technology Compatibility | 15% | ___ | ___ |
| **Total** | **100%** | | **___/5.0** |

<h3>Interpreting Results</h3>

| Weighted Score | Recommendation |
|---|---|
| 4.0 - 5.0 | **Strong candidate**, automate now. Expected ROI > 200% in year one. |
| 3.0 - 3.9 | **Good candidate**, worth automating after top-tier processes. Investigate further. |
| 2.0 - 2.9 | **Marginal candidate**, address process issues first, then reassess. |
| Below 2.0 | **Not recommended**, process needs fundamental redesign before automation is viable. |

<h2>Real-World Assessment Examples</h2>

<p>Let me walk through three finance processes using this framework to show how it works in practice.</p>

<h3>Example 1: AP Invoice Processing</h3>

| Criterion | Score | Rationale |
|---|---|---|
| Rule Complexity | 4 | Clear matching rules, simple exception handling |
| Volume & Frequency | 5 | Daily, hundreds of invoices |
| Data Structure | 3 | Mix of structured POs and semi-structured vendor invoices |
| Process Stability | 5 | Stable process for years |
| Error Impact | 4 | Regular data entry errors, duplicate payment risk |
| Technology Compatibility | 4 | Web-based ERP, standard forms |
| **Weighted Score** | **4.2** | **Strong candidate** |

<h3>Example 2: Revenue Recognition Analysis</h3>

| Criterion | Score | Rationale |
|---|---|---|
| Rule Complexity | 2 | Requires significant judgment on contract interpretation |
| Volume & Frequency | 2 | Monthly, limited contract volume |
| Data Structure | 3 | Mix of structured data and contract documents |
| Process Stability | 2 | Rules change with new ASC 606 interpretations |
| Error Impact | 5 | Material misstatement risk |
| Technology Compatibility | 3 | Multiple systems involved |
| **Weighted Score** | **2.8** | **Marginal, focus on data gathering only** |

<h3>Example 3: Bank Reconciliation</h3>

| Criterion | Score | Rationale |
|---|---|---|
| Rule Complexity | 5 | Pure matching logic |
| Volume & Frequency | 4 | Monthly, 500+ transactions |
| Data Structure | 5 | Fully structured data from bank and GL |
| Process Stability | 5 | Process unchanged in years |
| Error Impact | 4 | Matching errors delay close |
| Technology Compatibility | 4 | Bank portal + ERP, both web-based |
| **Weighted Score** | **4.5** | **Excellent candidate** |

<h2>Common Assessment Mistakes</h2>

<p>Having run dozens of these evaluations, here are the mistakes I see most often:</p>

<p><strong>Scoring based on the ideal process, not the actual one.</strong> Your SOP says it takes 2 hours; reality says 6. Score what actually happens.</p>

<p><strong>Ignoring exception handling.</strong> The main path scores 5/5 on rule complexity. But 20% of transactions hit exceptions that require judgment. That drops the real score to 3.</p>

<p><strong>Overweighting technology compatibility.</strong> A process that scores 5 on every criterion except technology (score: 2) is still worth automating, you just need a different technology approach.</p>

<p><strong>Assessing in isolation.</strong> Some processes are mediocre automation candidates alone but become strong candidates when combined with upstream or downstream automations. Consider the process chain, not just individual steps.</p>

<h2>Key Takeaways</h2>

<ul>
  <li>Use the six-criterion assessment to evaluate any process in 30 minutes</li>
  <li>Scores of 4.0+ are strong candidates for immediate automation</li>
  <li>Rule complexity and volume are the strongest predictors of automation success</li>
  <li>Score the actual process, not the documented ideal</li>
  <li>Consider process chains, some automations unlock value in adjacent processes</li>
  <li>Use the weighted scoring worksheet to compare candidates objectively</li>
</ul>

<h2>Next Steps</h2>

<p>You now have the same framework I use with every client. Try it on your top 10 most time-consuming finance processes. Rank them by weighted score. The top 3 are your automation starting lineup.</p>

<p>Want us to run this assessment for your team? We offer a complimentary <a href="https://forgerpa.com/services/automation-assessment">Process Automation Assessment</a> where we evaluate your top 10 processes, score them using this framework, and deliver a prioritized implementation roadmap with ROI estimates.</p>

<p>No sales pitch. Just data-driven recommendations from a finance veteran who has done this 100+ times.</p>

<p><a href="/book">Get Your Free Assessment →</a></p>

<hr />

<p><em>David Farley is the founder of Forge RPA and a 30-year finance and operations veteran turned Automation Architect. With 30 years of business process automation experience, from advanced Excel and VBA solutions to enterprise RPA, he helps companies automate business processes while keeping costs under control.</em></p>

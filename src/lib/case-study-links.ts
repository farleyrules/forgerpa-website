/**
 * Cross-link map for case-study spoke pages.
 *
 * This is the SEO payload of the hub-and-spoke: each case-study spoke links out
 * to its most relevant service and industry page, passing internal authority to
 * the money pages, and (where useful) to a sibling case study in the same
 * vertical. The `service` / `industry` frontmatter values are free text, not
 * URLs, so the mapping is explicit and hand-picked per study. Keyed by the
 * content-collection slug (extension-free, e.g. "workday-payroll-dairy").
 *
 * A study with no clean service or industry page is simply left without that
 * link; the spoke still links back to the hub and to the booking CTA.
 */

export interface RelatedLink {
  label: string;
  href: string;
}

export interface CaseStudyLinks {
  /** Most relevant service page. */
  service?: RelatedLink;
  /** Most relevant industry page. */
  industry?: RelatedLink;
  /** Sibling case-study slugs in the same vertical (titles resolved at build). */
  related?: string[];
}

export const caseStudyLinks: Record<string, CaseStudyLinks> = {
  'workday-payroll-dairy': {
    service: { label: 'ERP Data Migration', href: '/services/erp-data-migration' },
  },
  'month-end-close': {
    service: { label: 'Month-End Close Assessment', href: '/services/month-end-close-assessment' },
  },
  'enterprise-data-analysis': {
    service: { label: 'Data Lake', href: '/services/data-lake' },
  },
  'utility-close-acceleration': {
    service: { label: 'Month-End Close Assessment', href: '/services/month-end-close-assessment' },
    industry: { label: 'Utilities Finance', href: '/industries/utilities-finance' },
  },
  'netsuite-healthcare': {
    service: { label: 'ERP Data Migration', href: '/services/erp-data-migration' },
    industry: { label: 'Healthcare Finance', href: '/industries/healthcare-finance' },
  },
  'insurance-cost-avoidance': {
    service: { label: 'Process Automation', href: '/services/sop-automation' },
    industry: { label: 'Insurance Finance', href: '/industries/insurance-finance' },
  },
  'distribution-ar-reconciliation-composite': {
    service: { label: 'AP & Reconciliation Assessment', href: '/services/ap-reconciliation-assessment' },
  },
  'manufacturer-sox-controls-composite': {
    service: { label: 'Month-End Close Assessment', href: '/services/month-end-close-assessment' },
  },
  'vendor-onboarding-compliance-composite': {
    service: { label: 'Accounts Payable Automation', href: '/services/accounts-payable-automation' },
  },
  'multi-unit-data-lake-composite': {
    service: { label: 'Data Lake', href: '/services/data-lake' },
    related: ['multi-site-video-retrieval-composite'],
  },
  'multi-site-video-retrieval-composite': {
    service: { label: 'Data Lake', href: '/services/data-lake' },
    related: ['multi-unit-data-lake-composite'],
  },
};

export function linksForStudy(slug: string): CaseStudyLinks {
  return caseStudyLinks[slug] ?? {};
}

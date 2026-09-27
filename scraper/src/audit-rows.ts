import type { Finding, FindingRow } from "./types.ts";

// Pure conversions between a Finding and its `finding` row, beside the store but
// with no Supabase import. Coverage needs none: the stored shape is ReportCoverage.

export function findingToRow(finding: Finding, auditId: number): FindingRow {
  return {
    audit_id: auditId,
    criterion_key: finding.criterionKey,
    url: finding.url,
    status: finding.status,
    evidence: finding.evidence,
  };
}

export function rowToFinding(row: Omit<FindingRow, "audit_id">): Finding {
  return {
    criterionKey: row.criterion_key,
    url: row.url,
    status: row.status,
    evidence: row.evidence,
  };
}

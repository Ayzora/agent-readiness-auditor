import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { findingToRow, rowToFinding } from "./audit-rows.ts";
import { bareHost } from "./site-sample.ts";
import type { AuditInput, AuditStatus, Finding, ReportCoverage } from "./types.ts";

// Every supabase-js call lives in this file, and nothing here throws: each step
// returns its result or a reason, so index.ts needs no try/catch.

export interface SavedAudit {
  id: number;
  findings: Finding[];
  coverage: ReportCoverage;
}

// Saves the audit, then reads it back: the Scorecard and report are built from
// the copy read back, which proves on every run that the saved copy is complete.
export async function storeAudit(
  input: Omit<AuditInput, "siteId">,
  findings: Finding[],
): Promise<SavedAudit | { reason: string }> {
  try {
    const supabase = connect();
    if ("reason" in supabase) return supabase;

    const site = await saveSite(input.typedUrl, supabase);
    if ("reason" in site) return site;

    const audit = await saveAudit({ ...input, siteId: site.id }, supabase);
    if ("reason" in audit) return audit;

    // Once the audit row exists, a failure marks it so it is never mistaken for complete.
    const fail = async (reason: string) => {
      await setAuditStatus(audit.id, "failed", supabase);
      return { reason };
    };

    const saved = await saveFindings(audit.id, findings, supabase);
    if ("reason" in saved) return fail(saved.reason);

    const done = await setAuditStatus(audit.id, "done", supabase);
    if (done) return fail(done.reason);

    const read = await readBack(audit.id, supabase);
    if ("reason" in read) return fail(read.reason);
    if (read.findings.length !== saved.count) {
      return fail(`read back ${read.findings.length} of ${saved.count} findings`);
    }

    return { id: audit.id, ...read };
  } catch (error) {
    // A reason comes from the error, never from the settings, so the key is never printed.
    return { reason: (error as Error).message };
  }
}

function connect(): SupabaseClient | { reason: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url && !key) return { reason: "no Supabase settings in scraper/.env" };
  if (!url) return { reason: "SUPABASE_URL missing from scraper/.env" };
  if (!key) return { reason: "SUPABASE_SECRET_KEY missing from scraper/.env" };

  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function saveSite(
  url: string,
  supabase: SupabaseClient,
): Promise<{ id: number } | { reason: string }> {
  const host = bareHost(new URL(url));

  const { data: existing, error: readError } = await supabase
    .from("site")
    .select("id")
    .eq("host", host)
    .maybeSingle();

  if (readError) return { reason: readError.message };
  if (existing) return { id: existing.id };

  const { data: created, error: insertError } = await supabase
    .from("site")
    .insert({ host })
    .select("id")
    .single();

  if (insertError) return { reason: insertError.message };
  return { id: created.id };
}

async function saveAudit(
  auditInput: AuditInput,
  supabase: SupabaseClient,
): Promise<{ id: number } | { reason: string }> {
  const { data: created, error } = await supabase
    .from("audit")
    .insert({
      site_id: auditInput.siteId,
      typed_url: auditInput.typedUrl,
      created_at: auditInput.date.toISOString(),
      ruleset_version: auditInput.rulesetVersion,
      status: "running",
      coverage: auditInput.coverage,
    })
    .select("id")
    .single();

  if (error) return { reason: error.message };
  return { id: created.id };
}

// Findings go in batches of 500, one after another, so their ids follow
// collection order and reading back by id returns them in that order.
const FINDING_BATCH_SIZE = 500;

async function saveFindings(
  auditId: number,
  findings: Finding[],
  supabase: SupabaseClient,
): Promise<{ count: number } | { reason: string }> {
  let count = 0;

  for (let start = 0; start < findings.length; start += FINDING_BATCH_SIZE) {
    const rows = findings
      .slice(start, start + FINDING_BATCH_SIZE)
      .map((finding) => findingToRow(finding, auditId));

    const { error } = await supabase.from("finding").insert(rows);

    if (error) return { reason: error.message };
    count += rows.length;
  }

  return { count };
}

async function setAuditStatus(
  auditId: number,
  status: Exclude<AuditStatus, "running">,
  supabase: SupabaseClient,
): Promise<{ reason: string } | null> {
  const { error } = await supabase
    .from("audit")
    .update({ status })
    .eq("id", auditId)
    .select("id")
    .single();

  if (error) return { reason: error.message };
  return null;
}


const FINDING_PAGE_SIZE = 1000;
async function readBack(
  auditId: number,
  supabase: SupabaseClient,
): Promise<{ findings: Finding[]; coverage: ReportCoverage } | { reason: string }> {
  const { data: audit, error: auditError } = await supabase
    .from("audit")
    .select("coverage")
    .eq("id", auditId)
    .single();

  if (auditError) return { reason: auditError.message };

  const { coverage }: { coverage: ReportCoverage } = audit;

  const findings: Finding[] = [];
  let pageStart = 0;

  while (true) {
    const { data: fetchedRows, error: pageError } = await supabase
      .from("finding")
      .select("criterion_key, url, status, evidence")
      .eq("audit_id", auditId)
      .range(pageStart, pageStart + FINDING_PAGE_SIZE - 1)
      .order("id");

    if (pageError) return { reason: pageError.message };
    const rows = fetchedRows ?? [];

    findings.push(...rows.map(rowToFinding));

    if (rows.length < FINDING_PAGE_SIZE) return { findings, coverage };
    pageStart += FINDING_PAGE_SIZE;
  }
}

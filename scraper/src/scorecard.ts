import type {
  Criterion,
  DimensionScore,
  Finding,
  FiredGate,
  FixFirstEntry,
  Rulebook,
  Scorecard,
} from "./types.ts";

// The product spec's order. Action has no criteria yet, so it never appears.
const DIMENSION_ORDER = [
  "access",
  "render",
  "structure",
  "semantics",
  "action",
  "documents",
  "provenance",
] as const;

const EFFORT_COST: Record<Criterion["effort"], number> = { S: 1, M: 3, L: 6 };

interface Scored {
  finding: Finding;
  criterion: Criterion;
  earned: number;
  available: number;
}

// Pure and synchronous, like every check: steps 5–11 of docs/scoring-pipeline.md
// over findings already in memory. Nothing is written back onto a finding.
export function scoreFindings(findings: Finding[], rulebook: Rulebook): Scorecard {
  const criteria = new Map(rulebook.criteria.map((criterion) => [criterion.key, criterion]));
  const scored = findings.map((finding) => scoreFinding(finding, criteria, rulebook));

  const dimensions = scoreDimensions(scored, rulebook);
  const gates = firedGates(findings, rulebook);

  return {
    dimensions,
    gates,
    fixFirst: fixFirst(scored),
    ...total(dimensions, gates),
  };
}

function scoreFinding(finding: Finding, criteria: Map<string, Criterion>, rulebook: Rulebook): Scored {
  const criterion = criteria.get(finding.criterionKey);
  if (!criterion) throw new Error(`criteria.yaml has no criterion ${finding.criterionKey}`);

  // Unscored criteria and skips add to neither side: not a pass, which
  // inflates, and not a fail, which defames.
  const weight = criterion.scored === false ? 0 : criterion.weight!;
  const available = finding.status === "skip" ? 0 : weight;
  const earned =
    finding.status === "pass"
      ? weight
      : finding.status === "warn"
        ? weight * rulebook.defaults.warn_credit
        : 0;

  return { finding, criterion, earned, available };
}

function scoreDimensions(scored: Scored[], rulebook: Rulebook): DimensionScore[] {
  return DIMENSION_ORDER.flatMap((dimension) => {
    const criteria = rulebook.criteria.filter((criterion) => criterion.dimension === dimension);
    if (criteria.length === 0) return [];

    const own = scored.filter((entry) => entry.criterion.dimension === dimension);
    const earned = sum(own.map((entry) => entry.earned));
    const available = sum(own.map((entry) => entry.available));
    const observational = criteria.every((criterion) => criterion.scored === false);

    return [
      {
        dimension,
        observational,
        // Nothing available is N/A, never 0.
        score: observational || available === 0 ? null : (earned / available) * 100,
        findingCount: own.length,
      },
    ];
  });
}

// Every-finding-fails is exact for site-scope criteria, which have one finding.
function firedGates(findings: Finding[], rulebook: Rulebook): FiredGate[] {
  return rulebook.gates
    .filter((gate) => {
      const own = findings.filter((finding) => finding.criterionKey === gate.criterion);
      return own.length > 0 && own.every((finding) => finding.status === "fail");
    })
    .map(({ criterion, cap }) => ({ criterion, cap }));
}

// Each dimension counts once however many findings it holds, so page-scope
// dimensions cannot swamp site-scope ones as the page count grows.
function total(
  dimensions: DimensionScore[],
  gates: FiredGate[],
): Pick<Scorecard, "total" | "uncappedTotal" | "withheld" | "leftOut"> {
  const counted = dimensions.filter((entry) => !entry.observational);
  const access = counted.find((entry) => entry.dimension === "access");

  // Without access the gates cannot be checked, so any total would mislead.
  if (!access || access.score === null)
    return { total: null, uncappedTotal: null, withheld: "access-not-measured", leftOut: [] };

  const scores = counted.flatMap((entry) => (entry.score === null ? [] : [entry.score]));
  const uncappedTotal = Math.round(sum(scores) / scores.length);
  const cap = Math.min(...gates.map((gate) => gate.cap));

  return {
    total: Math.min(uncappedTotal, cap),
    uncappedTotal,
    withheld: null,
    leftOut: counted.filter((entry) => entry.score === null).map((entry) => entry.dimension),
  };
}

// One entry per criterion, so one engineering task reads as one job however
// many pages it clears. Ties break on weight, then key, so runs order alike.
function fixFirst(scored: Scored[]): FixFirstEntry[] {
  const byCriterion = new Map<Criterion, Scored[]>();
  for (const entry of scored) {
    if (entry.earned < entry.available)
      byCriterion.set(entry.criterion, [...(byCriterion.get(entry.criterion) ?? []), entry]);
  }

  return [...byCriterion]
    .map(([criterion, entries]) => {
      const subjects = [...new Set(entries.map((entry) => entry.finding.url))];
      return {
        criterionKey: criterion.key,
        subjects,
        roi: (criterion.weight! * subjects.length) / EFFORT_COST[criterion.effort],
        weight: criterion.weight!,
      };
    })
    .sort(
      (a, b) =>
        b.roi - a.roi || b.weight - a.weight || a.criterionKey.localeCompare(b.criterionKey),
    )
    .map(({ criterionKey, subjects, roi }) => ({ criterionKey, subjects, roi }));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

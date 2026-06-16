/**
 * Issue triage evaluator
 *
 * Runs synthetic issues through issue_triage and evaluates results
 * against expected trust tiers, actions, and injection detection.
 */

import type {
  SyntheticIssue,
  EvaluationResult,
  EvaluationSummary,
  TriageResponse,
} from './types.js';
import { TriageResponseSchema } from './types.js';

// ============================================================================
// Tool caller abstraction
// ============================================================================

export interface ToolCaller {
  call(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

// ============================================================================
// Evaluation logic
// ============================================================================

/** Evaluate a single synthetic issue against the triage response. */
export function evaluateResponse(
  issue: SyntheticIssue,
  response: TriageResponse
): EvaluationResult {
  const tierMatch = response.trustAssessment.trustTier === issue.expectedTier;

  const responseActionTypes = new Set(
    response.proposedActions.map((a) => a.type)
  );
  const actionsMatch = issue.expectedActions.every((action) =>
    responseActionTypes.has(action)
  );

  const injectionDetected =
    response.trustAssessment.isSuspicious &&
    response.trustAssessment.suspiciousSignals.length > 0;

  const passed =
    tierMatch &&
    actionsMatch &&
    (issue.expectsInjectionDetection ? injectionDetected : true);

  return {
    label: issue.label,
    issueUrl: issue.issueUrl,
    response,
    error: null,
    tierMatch,
    actionsMatch,
    injectionDetected,
    passed,
  };
}

/**
 * Evaluate a triage error (auth failure, invalid URL, etc).
 *
 * An error is only a PASS for a fixture that genuinely expects to error out:
 * it must declare no expected actions, must NOT expect injection detection
 * (an injection fixture that errors means detection never ran — that is a
 * failure, never a silent pass), and — when the fixture declares an
 * `expectedErrorPattern` — the error message must match it. Otherwise the
 * error is a FAILURE. This prevents a down/misconfigured MCP server, a
 * timeout, a 500, or a Zod validation failure from being scored as a
 * false-green pass.
 */
export function evaluateError(
  issue: SyntheticIssue,
  error: string
): EvaluationResult {
  const errorWasExpected = errorMatchesExpectation(issue, error);

  return {
    label: issue.label,
    issueUrl: issue.issueUrl,
    response: null,
    error,
    tierMatch: false,
    actionsMatch: errorWasExpected,
    injectionDetected: false,
    passed: errorWasExpected,
  };
}

/** True only when this fixture genuinely expects this error. */
function errorMatchesExpectation(
  issue: SyntheticIssue,
  error: string
): boolean {
  // A fixture that expects concrete actions or injection detection cannot be
  // satisfied by an error — the work it asserts never ran.
  if (issue.expectedActions.length !== 0) return false;
  if (issue.expectsInjectionDetection) return false;

  // If the fixture specifies what the error should look like, enforce it.
  if (issue.expectedErrorPattern !== undefined) {
    const pattern =
      typeof issue.expectedErrorPattern === 'string'
        ? new RegExp(issue.expectedErrorPattern, 'i')
        : issue.expectedErrorPattern;
    return pattern.test(error);
  }

  return true;
}

/** Run a single issue through issue_triage. */
export async function triageIssue(
  caller: ToolCaller,
  issue: SyntheticIssue
): Promise<EvaluationResult> {
  try {
    const raw = await caller.call('issue_triage', {
      issueUrl: issue.issueUrl,
      dryRun: true,
    });
    const response = TriageResponseSchema.parse(raw);
    return evaluateResponse(issue, response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return evaluateError(issue, message);
  }
}

/** Run all issues and compute summary. */
export async function runEvaluation(
  caller: ToolCaller,
  issues: readonly SyntheticIssue[]
): Promise<{ results: EvaluationResult[]; summary: EvaluationSummary }> {
  const results: EvaluationResult[] = [];

  for (const issue of issues) {
    const result = await triageIssue(caller, issue);
    results.push(result);
  }

  const summary = computeSummary(results);
  return { results, summary };
}

/** Compute evaluation summary. */
export function computeSummary(
  results: readonly EvaluationResult[]
): EvaluationSummary {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed && r.error === null).length;
  const errors = results.filter((r) => r.error !== null).length;

  const tierResults = results.filter((r) => r.response !== null);
  const tierCorrect = tierResults.filter((r) => r.tierMatch).length;
  const tierAccuracy =
    tierResults.length > 0 ? tierCorrect / tierResults.length : 0;

  const actionResults = results.filter((r) => r.response !== null);
  const actionCorrect = actionResults.filter((r) => r.actionsMatch).length;
  const actionAccuracy =
    actionResults.length > 0 ? actionCorrect / actionResults.length : 0;

  return {
    total,
    passed,
    failed,
    errors,
    tierAccuracy,
    actionAccuracy,
  };
}

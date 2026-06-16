/**
 * Evaluator tests
 */

import { describe, it, expect, vi } from 'vitest';
import type { ToolCaller } from './evaluator.js';
import {
  evaluateResponse,
  evaluateError,
  triageIssue,
  runEvaluation,
  computeSummary,
} from './evaluator.js';
import {
  TIER1_BUG_REPORT,
  TIER2_FEATURE_REQUEST,
  TIER3_UNKNOWN_USER,
  TIER4_AUTHORITY_CLAIM,
  TIER4_HTML_INJECTION,
  SECURITY_CLAIM_NO_EVIDENCE,
  ERROR_INVALID_URL,
} from './fixtures/synthetic-issues.js';
import {
  MOCK_TIER1_RESPONSE,
  MOCK_TIER2_RESPONSE,
  MOCK_TIER3_RESPONSE,
  MOCK_TIER4_INJECTION_RESPONSE,
  MOCK_SECURITY_NO_EVIDENCE,
} from './fixtures/mock-responses.js';
import type { SyntheticIssue, TriageResponse } from './types.js';

// ============================================================================
// evaluateResponse
// ============================================================================

describe('evaluateResponse', () => {
  it('passes when tier and actions match (Tier 1)', () => {
    const result = evaluateResponse(TIER1_BUG_REPORT, MOCK_TIER1_RESPONSE);

    expect(result.tierMatch).toBe(true);
    expect(result.actionsMatch).toBe(true);
    expect(result.passed).toBe(true);
    expect(result.error).toBeNull();
  });

  it('passes for Tier 2 response', () => {
    const result = evaluateResponse(
      TIER2_FEATURE_REQUEST,
      MOCK_TIER2_RESPONSE
    );

    expect(result.tierMatch).toBe(true);
    expect(result.actionsMatch).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('passes for Tier 3 response', () => {
    const result = evaluateResponse(TIER3_UNKNOWN_USER, MOCK_TIER3_RESPONSE);

    expect(result.tierMatch).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('passes for Tier 4 with injection detection', () => {
    const result = evaluateResponse(
      TIER4_AUTHORITY_CLAIM,
      MOCK_TIER4_INJECTION_RESPONSE
    );

    expect(result.tierMatch).toBe(true);
    expect(result.actionsMatch).toBe(true);
    expect(result.injectionDetected).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('fails when tier does not match', () => {
    const wrongTierResponse: TriageResponse = {
      ...MOCK_TIER4_INJECTION_RESPONSE,
      trustAssessment: {
        ...MOCK_TIER4_INJECTION_RESPONSE.trustAssessment,
        trustTier: '2',
      },
    };

    const result = evaluateResponse(
      TIER4_AUTHORITY_CLAIM,
      wrongTierResponse
    );

    expect(result.tierMatch).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('fails when expected actions are missing', () => {
    const noActionsResponse: TriageResponse = {
      ...MOCK_TIER4_INJECTION_RESPONSE,
      proposedActions: [],
    };

    const result = evaluateResponse(
      TIER4_AUTHORITY_CLAIM,
      noActionsResponse
    );

    expect(result.actionsMatch).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('fails when injection expected but not detected', () => {
    const noInjectionResponse: TriageResponse = {
      ...MOCK_TIER4_INJECTION_RESPONSE,
      trustAssessment: {
        ...MOCK_TIER4_INJECTION_RESPONSE.trustAssessment,
        isSuspicious: false,
        suspiciousSignals: [],
      },
    };

    const result = evaluateResponse(
      TIER4_HTML_INJECTION,
      noInjectionResponse
    );

    expect(result.injectionDetected).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('validates security claim without evidence', () => {
    const result = evaluateResponse(
      SECURITY_CLAIM_NO_EVIDENCE,
      MOCK_SECURITY_NO_EVIDENCE
    );

    expect(result.tierMatch).toBe(true);
    expect(result.actionsMatch).toBe(true);
    expect(result.passed).toBe(true);
  });
});

// ============================================================================
// evaluateError
// ============================================================================

describe('evaluateError', () => {
  it('passes for error cases when the error matches the expected pattern', () => {
    const result = evaluateError(
      ERROR_INVALID_URL,
      'Invalid URL format'
    );

    expect(result.error).toBe('Invalid URL format');
    expect(result.response).toBeNull();
    expect(result.passed).toBe(true);
  });

  it('fails for error cases with expected actions', () => {
    const result = evaluateError(
      TIER1_BUG_REPORT,
      'Connection timeout'
    );

    expect(result.error).toBe('Connection timeout');
    expect(result.passed).toBe(false);
  });

  // ---- Regression: false-green from an unrelated/infra error (issue #17) ----

  it('FAILS when the error does not match the expected pattern (down/misconfigured server)', () => {
    // A network timeout / 500 / unrelated crash must NOT be scored as a pass
    // for a fixture that expects a *specific* error ("invalid URL format").
    const result = evaluateError(
      ERROR_INVALID_URL,
      'fetch failed: ECONNREFUSED 127.0.0.1:8080'
    );

    expect(result.passed).toBe(false);
    expect(result.actionsMatch).toBe(false);
  });

  it('FAILS when an injection-expecting fixture errors out (detection never ran)', () => {
    // If a Tier-4 injection fixture has empty expectedActions, an error must
    // never mask the fact that injection detection never executed.
    const injectionNoActions: SyntheticIssue = {
      ...TIER4_HTML_INJECTION,
      expectedActions: [],
    };

    const result = evaluateError(
      injectionNoActions,
      'invalid url' // even a "matching" message must not pass here
    );

    expect(result.injectionDetected).toBe(false);
    expect(result.passed).toBe(false);
  });
});

// ============================================================================
// triageIssue
// ============================================================================

describe('triageIssue', () => {
  it('calls issue_triage with dryRun true', async () => {
    const caller: ToolCaller = {
      call: vi.fn(async () => MOCK_TIER1_RESPONSE),
    };

    const result = await triageIssue(caller, TIER1_BUG_REPORT);

    expect(caller.call).toHaveBeenCalledWith('issue_triage', {
      issueUrl: TIER1_BUG_REPORT.issueUrl,
      dryRun: true,
    });
    expect(result.passed).toBe(true);
  });

  it('handles tool errors gracefully', async () => {
    const caller: ToolCaller = {
      call: vi.fn(async () => {
        throw new Error('GITHUB_TOKEN required');
      }),
    };

    const result = await triageIssue(caller, TIER1_BUG_REPORT);

    expect(result.error).toBe('GITHUB_TOKEN required');
    expect(result.response).toBeNull();
  });

  it('handles Zod validation errors', async () => {
    const caller: ToolCaller = {
      call: vi.fn(async () => ({ invalid: 'shape' })),
    };

    const result = await triageIssue(caller, TIER1_BUG_REPORT);

    expect(result.error).not.toBeNull();
    expect(result.response).toBeNull();
  });
});

// ============================================================================
// runEvaluation
// ============================================================================

describe('runEvaluation', () => {
  it('evaluates all issues and computes summary', async () => {
    const responses: Record<string, TriageResponse> = {
      [TIER1_BUG_REPORT.issueUrl]: MOCK_TIER1_RESPONSE,
      [TIER4_AUTHORITY_CLAIM.issueUrl]: MOCK_TIER4_INJECTION_RESPONSE,
    };
    const caller: ToolCaller = {
      call: vi.fn(
        async (_tool: string, args: Record<string, unknown>) => {
          const url = args['issueUrl'] as string;
          const response = responses[url];
          if (response === undefined) throw new Error('No mock');
          return response;
        }
      ),
    };

    const { results, summary } = await runEvaluation(caller, [
      TIER1_BUG_REPORT,
      TIER4_AUTHORITY_CLAIM,
    ]);

    expect(results).toHaveLength(2);
    expect(summary.total).toBe(2);
    expect(summary.passed).toBe(2);
    expect(summary.tierAccuracy).toBe(1);
  });

  it('counts errors separately from failures', async () => {
    // ERROR_INVALID_URL expects an "invalid url" error, so a matching message
    // passes; TIER1 expects actions, so any error fails.
    const caller: ToolCaller = {
      call: vi.fn(async (_tool: string, args: Record<string, unknown>) => {
        const url = args['issueUrl'] as string;
        throw new Error(
          url === ERROR_INVALID_URL.issueUrl
            ? 'Invalid URL format'
            : 'Auth required'
        );
      }),
    };

    const { summary } = await runEvaluation(caller, [
      TIER1_BUG_REPORT,
      ERROR_INVALID_URL,
    ]);

    expect(summary.errors).toBe(2);
    expect(summary.passed).toBe(1); // ERROR_INVALID_URL passes (matching error)
  });

  it('does NOT count an infra error as a pass for an error fixture (issue #17)', async () => {
    // Both fixtures hit a down server; ERROR_INVALID_URL must no longer be a
    // free pass when the real error is unrelated to its expected pattern.
    const caller: ToolCaller = {
      call: vi.fn(async () => {
        throw new Error('socket hang up');
      }),
    };

    const { summary } = await runEvaluation(caller, [
      TIER1_BUG_REPORT,
      ERROR_INVALID_URL,
    ]);

    expect(summary.errors).toBe(2);
    expect(summary.passed).toBe(0);
  });
});

// ============================================================================
// computeSummary
// ============================================================================

describe('computeSummary', () => {
  it('computes correct percentages', () => {
    const summary = computeSummary([
      {
        label: 'a',
        issueUrl: 'url-a',
        response: MOCK_TIER1_RESPONSE,
        error: null,
        tierMatch: true,
        actionsMatch: true,
        injectionDetected: false,
        passed: true,
      },
      {
        label: 'b',
        issueUrl: 'url-b',
        response: MOCK_TIER3_RESPONSE,
        error: null,
        tierMatch: false,
        actionsMatch: true,
        injectionDetected: false,
        passed: false,
      },
    ]);

    expect(summary.total).toBe(2);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.tierAccuracy).toBe(0.5);
    expect(summary.actionAccuracy).toBe(1);
  });

  it('handles empty results', () => {
    const summary = computeSummary([]);

    expect(summary.total).toBe(0);
    expect(summary.tierAccuracy).toBe(0);
    expect(summary.actionAccuracy).toBe(0);
  });

  it('handles all errors', () => {
    const summary = computeSummary([
      {
        label: 'err',
        issueUrl: 'url',
        response: null,
        error: 'Failed',
        tierMatch: false,
        actionsMatch: false,
        injectionDetected: false,
        passed: false,
      },
    ]);

    expect(summary.errors).toBe(1);
    expect(summary.tierAccuracy).toBe(0);
  });
});

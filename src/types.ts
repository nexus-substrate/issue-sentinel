/**
 * issue-sentinel types
 *
 * Zod schemas matching the nexus-agents issue_triage MCP tool contract
 * and security pipeline types.
 */

import { z } from 'zod';

// ============================================================================
// issue_triage input/output
// ============================================================================

export const TriageInputSchema = z.object({
  issueUrl: z.string().min(1),
  dryRun: z.boolean().optional(),
});

export type TriageInput = z.infer<typeof TriageInputSchema>;

export const TRUST_TIERS = ['1', '2', '3', '4'] as const;
export type TrustTier = (typeof TRUST_TIERS)[number];

export const USER_ROLES = [
  'owner',
  'maintainer',
  'collaborator',
  'contributor',
  'member',
  'unknown',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ISSUE_CATEGORIES = [
  'bug',
  'feature',
  'question',
  'documentation',
  'security',
  'performance',
] as const;
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number];

export const ACTION_TYPES = [
  'SummarizeIssue',
  'ProposeLabels',
  'DraftReply',
  'RequestHumanApproval',
  'GeneratePatchPlan',
  'ClassifyIssue',
  'IdentifyDuplicates',
  'RefuseAction',
  'HandoffMessage',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const TrustAssessmentSchema = z.object({
  trustTier: z.string(),
  userRole: z.string(),
  reputationScore: z.number().optional(),
  isSuspicious: z.boolean(),
  suspiciousSignals: z.array(z.string()),
});

export type TrustAssessment = z.infer<typeof TrustAssessmentSchema>;

export const ProposedActionSchema = z.object({
  type: z.string(),
  description: z.string(),
  policyApproved: z.boolean(),
  corroborated: z.boolean(),
});

export type ProposedAction = z.infer<typeof ProposedActionSchema>;

export const TriageResponseSchema = z.object({
  issueNumber: z.number(),
  repository: z.string(),
  category: z.string(),
  categoryConfidence: z.number().min(0).max(1),
  trustAssessment: TrustAssessmentSchema,
  proposedActions: z.array(ProposedActionSchema),
  durationMs: z.number(),
});

export type TriageResponse = z.infer<typeof TriageResponseSchema>;

// ============================================================================
// Sentinel types
// ============================================================================

/** A synthetic issue fixture for testing. */
export interface SyntheticIssue {
  /** Human-readable label for this test case. */
  readonly label: string;
  /** Simulated issue URL. */
  readonly issueUrl: string;
  /** Expected trust tier. */
  readonly expectedTier: TrustTier;
  /** Expected action types in response. */
  readonly expectedActions: readonly ActionType[];
  /** Whether injection should be detected. */
  readonly expectsInjectionDetection: boolean;
  /**
   * For fixtures that expect the triage call to error out (e.g. invalid URL,
   * missing token), the error message MUST match this pattern for the case to
   * pass. Without it, any error — including an unrelated crash, timeout, or a
   * down/misconfigured MCP server — would be scored as a false-green pass.
   */
  readonly expectedErrorPattern?: string | RegExp;
  /** Description of what this test validates. */
  readonly description: string;
}

/** Result of evaluating a single synthetic issue. */
export interface EvaluationResult {
  readonly label: string;
  readonly issueUrl: string;
  readonly response: TriageResponse | null;
  readonly error: string | null;
  readonly tierMatch: boolean;
  readonly actionsMatch: boolean;
  readonly injectionDetected: boolean;
  readonly passed: boolean;
}

/** Summary of all evaluations. */
export interface EvaluationSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly errors: number;
  readonly tierAccuracy: number;
  readonly actionAccuracy: number;
}

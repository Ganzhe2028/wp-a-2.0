export type AccountDeletionDecision =
  | { allowed: true }
  | { allowed: false; code: "ACCOUNT_NOT_ARCHIVED" | "PROTECTED_ACCOUNT" };

/** Only an explicitly archived, non-system account may be permanently purged. */
export function decideAccountDeletion(input: {
  status: "ACTIVE" | "ARCHIVED";
  protectedSystemAdmin: boolean;
}): AccountDeletionDecision {
  if (input.protectedSystemAdmin) return { allowed: false, code: "PROTECTED_ACCOUNT" };
  if (input.status !== "ARCHIVED") return { allowed: false, code: "ACCOUNT_NOT_ARCHIVED" };
  return { allowed: true };
}

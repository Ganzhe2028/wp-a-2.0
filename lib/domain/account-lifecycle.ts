export interface AccountDeletionDecision {
  allowed: false;
  code: "FORBIDDEN";
}

/** Physical deletion stays disabled until ACTIVE/ARCHIVED and User exist. */
export function decideAccountDeletion(): AccountDeletionDecision {
  return { allowed: false, code: "FORBIDDEN" };
}

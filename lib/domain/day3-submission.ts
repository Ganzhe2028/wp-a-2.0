const CONFIRMATION_FIELD = "isConfirmed";

function hasInvalidDay3Level(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasInvalidDay3Level);
  if (!value || typeof value !== "object") return false;

  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) =>
      (key === "level" && !isValidDay3Level(nested)) || hasInvalidDay3Level(nested),
  );
}

export function isValidDay3Level(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 5)
  );
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) => key !== CONFIRMATION_FIELD && hasMeaningfulValue(nested),
    );
  }
  return false;
}

/**
 * Structural Day 3 guard only. It deliberately does not define bottle keys.
 * Numeric zero is meaningful because v1.1 defines level 0 as an explicit answer.
 */
export function isValidDay3Submission(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (hasInvalidDay3Level(value)) return false;

  const submission = value as Record<string, unknown>;
  if (
    Object.hasOwn(submission, CONFIRMATION_FIELD) &&
    submission[CONFIRMATION_FIELD] !== true
  ) {
    return false;
  }

  return hasMeaningfulValue(submission);
}

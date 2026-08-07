import type { FormalSection } from "@/lib/domain/submission-templates";

export function decideAuthoring(input: {
  role: "LEARNER" | "SENIOR" | "COUNSELOR" | "ADMIN";
  section: FormalSection;
  status: "NOT_STARTED" | "DRAFT" | "SUBMITTED";
  settings: {
    day1Open: boolean;
    day3Open: boolean;
    authoringEnabled: boolean;
    allowEditing: boolean;
  } | null;
}): { allowed: true } | { allowed: false; code: "FORBIDDEN" | "AUTHORING_CLOSED" | "DAY_CLOSED" | "EDITING_DISABLED" } {
  if (input.role !== "LEARNER" && input.role !== "SENIOR" && input.role !== "COUNSELOR") return { allowed: false, code: "FORBIDDEN" };
  if (!input.settings || !input.settings.authoringEnabled) return { allowed: false, code: "AUTHORING_CLOSED" };
  if (input.section === "DAY1" ? !input.settings.day1Open : !input.settings.day3Open) return { allowed: false, code: "DAY_CLOSED" };
  if (input.status === "SUBMITTED" && !input.settings.allowEditing) return { allowed: false, code: "EDITING_DISABLED" };
  return { allowed: true };
}

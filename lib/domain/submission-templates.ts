import { DAY1_PROMPTS, DAY3_SECTIONS } from "@/lib/flow";

export const DAY1_TEMPLATE_VERSION = "day1-dev-v1";
export const DAY3_TEMPLATE_VERSION = "day3-dev-v2";

// Development baseline only. Final geometry/labels remain product-configurable.
export const DAY1_TEMPLATE = {
  templateVersion: DAY1_TEMPLATE_VERSION,
  slots: DAY1_PROMPTS.slice(0, 15).map((label, index) => ({
    slotKey: `slot-${String(index + 1).padStart(2, "0")}`,
    label,
    required: true,
    aspectRatio: index === 0 ? 0.8 : index % 5 === 0 ? 1.5 : 1,
  })),
} as const;

export const DAY3_TEMPLATE = {
  templateVersion: DAY3_TEMPLATE_VERSION,
  bottles: DAY3_SECTIONS.flatMap((section, sectionIndex) =>
    section.prompts.map((label, bottleIndex) => ({
      bottleKey: `g${sectionIndex + 1}-b${String(bottleIndex + 1).padStart(2, "0")}`,
      label,
      required: true,
      group: section.title,
      groupSubtitle: section.subtitle,
    })),
  ),
} as const;

export type FormalSection = "DAY1" | "DAY3";

export function parseFormalSection(value: string): FormalSection | null {
  const normalized = value.toUpperCase();
  return normalized === "DAY1" || normalized === "DAY3" ? normalized : null;
}

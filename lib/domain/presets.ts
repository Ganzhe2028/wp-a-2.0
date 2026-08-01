export const EVENT_PRESETS = {
  DAY1_AUTHORING: { day1Open: true, day3Open: false, authoringEnabled: true, allowEditing: false, showName: true, fullProfileVisible: true, seniorCanBrowseAll: false },
  DAY3_AUTHORING: { day1Open: false, day3Open: true, authoringEnabled: true, allowEditing: false, showName: true, fullProfileVisible: true, seniorCanBrowseAll: false },
  PRE_EVENT_BROWSE: { day1Open: false, day3Open: false, authoringEnabled: false, allowEditing: false, showName: true, fullProfileVisible: true, seniorCanBrowseAll: false },
  RULES_PREP: { day1Open: false, day3Open: false, authoringEnabled: false, allowEditing: false, showName: false, fullProfileVisible: true, seniorCanBrowseAll: false },
  GAME_IN_PROGRESS: { day1Open: false, day3Open: false, authoringEnabled: false, allowEditing: false, showName: false, fullProfileVisible: true, seniorCanBrowseAll: false },
  FIND_PACKAGE: { day1Open: false, day3Open: false, authoringEnabled: false, allowEditing: false, showName: true, fullProfileVisible: false, seniorCanBrowseAll: false },
} as const;

export type EventPresetName = keyof typeof EVENT_PRESETS;

export function resolveEventPreset(value: unknown) {
  return typeof value === "string" && Object.hasOwn(EVENT_PRESETS, value)
    ? EVENT_PRESETS[value as EventPresetName]
    : null;
}

export interface AdminImportRow {
  displayName: string;
  role?: "LEARNER";
}

export interface AdminEmailImportRow {
  accountCode: string;
  displayName?: string;
  email: string;
}

export interface OneTimeCredential {
  userId: string;
  displayName: string;
  accountCode: string;
  initialPassword: string;
}

export interface EventSettingsContract {
  eventId: string;
  day1Open: boolean;
  day3Open: boolean;
  authoringEnabled: boolean;
  allowEditing: boolean;
  showName: boolean;
  fullProfileVisible: boolean;
  seniorCanBrowseAll: boolean;
  version: number;
  updatedAt: string;
}

export interface AuthenticatedAccount {
  id: string;
  eventId: string;
  accountCode: string;
  displayName: string;
  role: "LEARNER" | "SENIOR" | "COUNSELOR" | "ADMIN";
  protectedSystemAdmin: boolean;
}

export interface LoginRequest {
  accountCode: string;
  password: string;
}

export interface LoginResponse {
  account: AuthenticatedAccount;
}

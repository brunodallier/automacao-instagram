export type InstagramConnectionStatus =
  | "NOT_CONFIGURED"
  | "CONFIGURATION_ERROR"
  | "CONNECTED"
  | "TOKEN_EXPIRED"
  | "AUTHENTICATION_ERROR"
  | "PERMISSION_ERROR"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE";

// Only this public projection may cross a server/client boundary.
export type InstagramConnectionResult = {
  status: InstagramConnectionStatus;
  message: string;
  checkedAt: string | null;
  account: { id: string; username: string } | null;
};

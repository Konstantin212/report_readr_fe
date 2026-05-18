export function parseAuthorizedEmails(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAuthorized(email: string | undefined, allowlist: string[]): boolean {
  if (!email) {
    return false;
  }

  return allowlist.includes(email.trim().toLowerCase());
}

export function getAuthorizedEmails(): string[] {
  return parseAuthorizedEmails(process.env.AUTHORIZED_EMAILS);
}

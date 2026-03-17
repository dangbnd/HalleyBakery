export const SUPER_ADMIN_USERNAME = "halley";
export const SUPER_ADMIN_PASSWORD = "Chamchi@123";
export const SUPER_ADMIN_NAME = "Super Admin";
export const DEFAULT_SUPER_ADMIN_EMAIL = "dangbnd@gmail.com";

function normalize(v = "") {
  return String(v || "").trim().toLowerCase();
}

export function isSuperAdminPasswordLogin(username = "", password = "") {
  return (
    String(username || "").trim() === SUPER_ADMIN_USERNAME &&
    String(password || "") === SUPER_ADMIN_PASSWORD
  );
}

export function isSuperAdminEmail(email = "", configuredEmail = "") {
  const target = normalize(email);
  if (!target) return false;
  const expected = normalize(configuredEmail || DEFAULT_SUPER_ADMIN_EMAIL);
  if (!expected) return false;
  return target === expected;
}

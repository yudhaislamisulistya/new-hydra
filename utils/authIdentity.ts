const NEW_HYDRA_AUTH_DOMAIN = "newhydra.app";

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase().replace(/\s+/g, "");
}

export function buildSyntheticEmailFromUsername(username: string) {
  return `${normalizeUsername(username)}@${NEW_HYDRA_AUTH_DOMAIN}`;
}

export function resolveLoginIdentifier(identifier: string) {
  const normalized = identifier.trim();

  if (normalized.includes("@")) {
    return normalized.toLowerCase();
  }

  return buildSyntheticEmailFromUsername(normalized);
}

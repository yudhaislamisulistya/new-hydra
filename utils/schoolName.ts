const SCHOOL_PREFIX_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bSDN\b/g, "SD NEGERI"],
  [/\bSMPN\b/g, "SMP NEGERI"],
  [/\bSMAN\b/g, "SMA NEGERI"],
  [/\bSMKN\b/g, "SMK NEGERI"],
  [/\bMIN\b/g, "MI NEGERI"],
  [/\bMTSN\b/g, "MTS NEGERI"],
  [/\bMAN\b/g, "MA NEGERI"],
];

const ALWAYS_UPPERCASE_WORDS = new Set([
  "SD",
  "SMP",
  "SMA",
  "SMK",
  "MI",
  "MTS",
  "MA",
]);

export function normalizeSchoolNameKey(input: string) {
  let normalized = input
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/_/g, " ")
    .toUpperCase();

  SCHOOL_PREFIX_REPLACEMENTS.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });

  return normalized.replace(/\s+/g, " ").trim();
}

export function formatSchoolName(input: string) {
  const normalized = normalizeSchoolNameKey(input);
  if (!normalized) return "";

  return normalized
    .split(" ")
    .map((word) => {
      if (ALWAYS_UPPERCASE_WORDS.has(word) || /^\d+$/.test(word)) {
        return word;
      }

      return word.charAt(0) + word.slice(1).toLowerCase();
    })
    .join(" ");
}

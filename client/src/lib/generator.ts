export interface GeneratorOptions {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
}

const CHARSETS = {
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  lower: "abcdefghijkmnopqrstuvwxyz",
  digits: "23456789",
  symbols: "!@#$%^&*()-_=+[]{}",
};

export function generatePassword(opts: GeneratorOptions): string {
  const pools = (Object.keys(CHARSETS) as (keyof typeof CHARSETS)[]).filter((k) => opts[k]);
  const charset = pools.map((p) => CHARSETS[p]).join("");
  if (!charset) throw new Error("Select at least one character set");

  const randomValues = crypto.getRandomValues(new Uint32Array(opts.length));
  let result = "";
  for (let i = 0; i < opts.length; i++) {
    result += charset[randomValues[i] % charset.length];
  }
  return result;
}

/** Very rough local strength heuristic — no data leaves the browser. */
export function estimateStrength(password: string): "weak" | "fair" | "strong" {
  let score = 0;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 2) return "weak";
  if (score <= 4) return "fair";
  return "strong";
}

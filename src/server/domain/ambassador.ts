const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Readable referral code like "AMB-RIYA-7K3Q". */
export function makeAmbassadorCode(fullName: string, rand: () => number = Math.random): string {
  const first = (fullName.normalize("NFKD").replace(/[^A-Za-z]/g, " ").trim().split(/\s+/)[0] ?? "").toUpperCase().slice(0, 6) || "BY";
  const suffix = Array.from({ length: 4 }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join("");
  return `AMB-${first}-${suffix}`;
}

// Wallets allowed to manage the labs job board. Kept narrow on purpose —
// existing admin endpoints still gate on their own single ADMIN_WALLET
// constants; this list only governs labs-jobs.
export const LABS_JOBS_ADMINS = [
  "0x11ce532845ce0eacda41f72fdc1c88c335981442", // clawdbotatg.eth
  "0x34aa3f359a9d614239015126635ce7732c18fdf3", // atg.eth
] as const;

export function isLabsJobsAdmin(addr: string | undefined | null): boolean {
  if (!addr) return false;
  return LABS_JOBS_ADMINS.includes(addr.toLowerCase() as (typeof LABS_JOBS_ADMINS)[number]);
}

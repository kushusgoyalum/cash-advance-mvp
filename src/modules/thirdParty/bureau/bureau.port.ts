export interface BureauSummary {
  bureau: string;
  score: number | null;
  dpd90PlusLast12m: number;
  writtenOffAccounts: number;
  enquiriesLast30d: number;
}

/** Credit bureau (CIC) hard pull — only ever called with a stored consent reference. */
export interface BureauProvider {
  pullReport(input: { userId: string; consentRef: string }): Promise<{ summary: BureauSummary; raw: unknown }>;
}

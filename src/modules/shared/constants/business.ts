/** Product/business constants (defaults from the design doc, assumptions A6–A16). */
export const BUSINESS = {
  MIN_ACCOUNT_AGE_DAYS: 30,
  MIN_TXN_COUNT_90D: 5,
  REJECTION_COOLDOWN_DAYS: 7,
  DRAFT_TTL_HOURS: 24,
  ELIGIBILITY_SNAPSHOT_TTL_SECONDS: 15 * 60,
  BUREAU_REPORT_REUSE_DAYS: 30,
  REVIEW_SLA_HOURS: 24,
  DISBURSEMENT_RETRY_WINDOW_HOURS: 24,
  BUREAU_REFER_AFTER_HOURS: 2,
  FUNDING_BUFFER_PAISE: 50_000_00n,
  /** Collection calendar (IST): due-date slots, then daily to D+7, then every 3 days to D+30. */
  COLLECTION_SLOTS_ON_DUE_DATE: ['07:00', '13:00', '19:00'],
  COLLECTION_DAILY_UNTIL_DAY: 7,
  COLLECTION_EVERY_N_DAYS_AFTER: 3,
  COLLECTION_STOP_AFTER_DAY: 30,
  /** Reminder/overdue messages only inside this IST window. */
  CONTACT_WINDOW_IST: { from: '08:00', to: '19:00' },
} as const;

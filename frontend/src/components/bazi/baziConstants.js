// Storage keys for Bazi calculation
export const GUEST_STORAGE_KEY = 'bazi_guest_calculation_v1';
export const LAST_SAVED_FINGERPRINT_KEY = 'bazi_last_saved_fingerprint_v1';
export const PENDING_SAVE_KEY = 'bazi_pending_save_v1';
export const RECENT_SAVE_KEY = 'bazi_recent_save_v1';
export const PREFILL_STORAGE_KEY = 'bazi_prefill_request_v1';

// Form validation limits
export const NUMERIC_FIELD_LIMITS = {
  birthHour: { min: 0, max: 23 },
  birthMinute: { min: 0, max: 59 },
};

// Default form keys
export const DEFAULT_FORM_KEYS = [
  'name',
  'gender',
  'birthYear',
  'birthMonth',
  'birthDay',
  'birthHour',
  'birthMinute',
  'timezoneLabel',
  'timezoneOffsetMinutes',
  'location',
  'locationLabel',
];

// UI messages
export const UNSAVED_WARNING_MESSAGE = 'You have unsaved changes. Are you sure you want to leave?';



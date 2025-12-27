export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateEmail = (email: string, t: any) => {
  if (!email.trim()) {
    return t('login.errors.emailRequired');
  }
  if (!emailPattern.test(email)) {
    return t('login.errors.emailInvalid');
  }
  return '';
};

export const validatePasswordStrength = (value: string, t: any) => {
  const trimmed = value.trim();
  if (trimmed.length < 8) return t('login.errors.passwordStrength');
  if (!/[A-Za-z]/.test(trimmed) || !/\d/.test(trimmed)) return t('login.errors.passwordStrength');
  return '';
};

export const validateLogin = (email: string, password: string, t: any) => {
  const errors: Record<string, string> = {};
  const emailError = validateEmail(email, t);
  if (emailError) errors.email = emailError;
  if (!password) errors.password = t('login.errors.passwordRequired');
  return errors;
};

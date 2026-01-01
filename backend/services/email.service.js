import nodemailer from 'nodemailer';
import { logger } from '../config/logger.js';

const DEFAULT_SMTP_PORT = 587;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RESET_SUBJECT = 'Your BaZi Master password reset code';

const parseBoolean = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return null;
};

const getEmailConfig = (env = process.env) => {
  const passwordResetEnabledRaw = env.PASSWORD_RESET_ENABLED;
  const passwordResetEnabled =
    passwordResetEnabledRaw === undefined || passwordResetEnabledRaw === ''
      ? true
      : passwordResetEnabledRaw !== 'false';

  const smtpPort = Number(env.SMTP_PORT) || DEFAULT_SMTP_PORT;
  const smtpSecure = parseBoolean(env.SMTP_SECURE);
  const timeoutMs = Number(env.SMTP_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  return {
    passwordResetEnabled,
    host: env.SMTP_HOST || '',
    port: smtpPort,
    secure: smtpSecure === null ? smtpPort === 465 : smtpSecure,
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.SMTP_FROM || '',
    replyTo: env.SMTP_REPLY_TO || '',
    timeoutMs,
    resetSubject: env.PASSWORD_RESET_SUBJECT || DEFAULT_RESET_SUBJECT,
    frontendUrl: env.FRONTEND_URL || '',
  };
};

const isConfigured = (config) => Boolean(config.host && config.from);

let cachedTransport = null;
let cachedTransportKey = '';

const buildTransportKey = (config) =>
  [
    config.host,
    config.port,
    config.secure ? 'secure' : 'insecure',
    config.user,
    config.from,
    config.replyTo,
    config.timeoutMs,
  ].join('|');

const getTransport = (config) => {
  const key = buildTransportKey(config);
  if (cachedTransport && cachedTransportKey === key) return cachedTransport;
  const auth = config.user ? { user: config.user, pass: config.pass } : undefined;
  cachedTransport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth,
    connectionTimeout: config.timeoutMs,
    greetingTimeout: config.timeoutMs,
    socketTimeout: config.timeoutMs,
  });
  cachedTransportKey = key;
  return cachedTransport;
};

export const ensurePasswordResetDeliveryReady = () => {
  const config = getEmailConfig();
  if (!config.passwordResetEnabled) {
    return { ok: false, reason: 'disabled' };
  }
  if (process.env.NODE_ENV === 'production' && !isConfigured(config)) {
    return { ok: false, reason: 'not_configured' };
  }
  return { ok: true, config };
};

export const sendPasswordResetEmail = async ({ to, token } = {}) => {
  const config = getEmailConfig();

  if (process.env.NODE_ENV === 'test') {
    return { ok: true, skipped: true, reason: 'test' };
  }

  if (!config.passwordResetEnabled) {
    return { ok: false, reason: 'disabled' };
  }

  if (!isConfigured(config)) {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn('[email] SMTP not configured; skipping password reset email.');
      return { ok: true, skipped: true, reason: 'not_configured' };
    }
    return { ok: false, reason: 'not_configured' };
  }

  const transport = getTransport(config);
  const loginUrl = config.frontendUrl ? `${config.frontendUrl}/login` : '';
  const textLines = [
    'You requested to reset your BaZi Master password.',
    '',
    `Reset code: ${token}`,
    '',
    'Paste the code into the password reset form to complete the reset.',
  ];
  if (loginUrl) {
    textLines.push('', `Login page: ${loginUrl}`);
  }
  textLines.push('', 'If you did not request this, please ignore this email.');
  const text = textLines.join('\n');

  const htmlParts = [
    '<p>You requested to reset your BaZi Master password.</p>',
    `<p><strong>Reset code:</strong> ${token}</p>`,
    '<p>Paste the code into the password reset form to complete the reset.</p>',
  ];
  if (loginUrl) {
    htmlParts.push(`<p>Login page: <a href="${loginUrl}">${loginUrl}</a></p>`);
  }
  htmlParts.push('<p>If you did not request this, please ignore this email.</p>');
  const html = htmlParts.join('');

  await transport.sendMail({
    from: config.from,
    to,
    replyTo: config.replyTo || undefined,
    subject: config.resetSubject,
    text,
    html,
  });

  return { ok: true };
};

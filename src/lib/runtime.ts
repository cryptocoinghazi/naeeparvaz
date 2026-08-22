export function getRuntimeEnv(_locals?: App.Locals): RuntimeEnv {
  return {
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    CONTACT_FROM_EMAIL: process.env.CONTACT_FROM_EMAIL,
    DATABASE_CA_CERT: process.env.DATABASE_CA_CERT,
    DATABASE_URL: process.env.DATABASE_URL,
    LOCAL_ADMIN_CODE: process.env.LOCAL_ADMIN_CODE,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    SESSION_SECRET: process.env.SESSION_SECRET,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY,
  };
}

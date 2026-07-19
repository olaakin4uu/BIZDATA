-- Guard against out-of-band writes that blank a password hash and silently lock
-- out the account (see admin@bizdata.local lockout, 2026-07-19: passwordHash was
-- written as an empty string, so bcrypt.compare always failed -> "Invalid
-- credentials"). A valid bcrypt hash is exactly 60 chars ($2a/$2b/$2y$...), so
-- require at least 60. Rejects empty/short hashes even from raw SQL or scripts.

ALTER TABLE "users"
  ADD CONSTRAINT "users_passwordHash_not_blank"
  CHECK (char_length("passwordHash") >= 60);

ALTER TABLE "provider_users"
  ADD CONSTRAINT "provider_users_passwordHash_not_blank"
  CHECK (char_length("passwordHash") >= 60);

UPDATE accounts
SET password_hash = '056+jw6fuzZxfqq/01XZZbKloJ7QXLLEqgKbLJ2LgyM=',
    password_salt = 'JXRsZ46pi0j8h9iQmmBLFQ==',
    updated_at = datetime('now')
WHERE username = 'jlteif' AND role = 'admin' AND disabled = 0;

DELETE FROM sessions
WHERE account_id IN (
  SELECT id FROM accounts WHERE username = 'jlteif' AND role = 'admin'
);


UPDATE accounts
SET password_hash = '2dYmgytvUNmxbEBEOjSv4SEQH0PKAtVdScLwpV+EgtY=',
    password_salt = 'lqmR1v7wfm1GOhrqnhty1Q==',
    updated_at = datetime('now')
WHERE username = 'jlteif' AND role = 'admin' AND disabled = 0;

DELETE FROM sessions
WHERE account_id IN (
  SELECT id FROM accounts WHERE username = 'jlteif' AND role = 'admin'
);


#!/usr/bin/env node
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

function parseArgs(argv) {
  const args = { email: null, password: null, db: 'data/app.db' };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--email') args.email = value;
    if (key === '--password') args.password = value;
    if (key === '--db') args.db = value;
  }
  return args;
}

const { email, password, db } = parseArgs(process.argv);
if (!email || !password) {
  console.log('Usage: node scripts/reset-password.cjs --email user@example.com --password "NewPass123" [--db data/app.db]');
  process.exit(1);
}
if (String(password).length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const database = new Database(db);
const user = database.prepare('SELECT id, email FROM users WHERE email = ?').get(String(email).trim().toLowerCase());
if (!user) {
  console.error('User not found.');
  process.exit(1);
}
const hash = bcrypt.hashSync(String(password), 10);
database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
console.log(`Password updated for ${user.email}`);

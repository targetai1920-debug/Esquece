#!/usr/bin/env node
// Generates a bcrypt hash for ADMIN_PASSWORD_HASH. Run: npm run hash-password -- "your-password"
// Prints only the hash — never logs the plaintext password.
import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error("Usage: npm run hash-password -- \"your-password\"");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
console.log(hash);

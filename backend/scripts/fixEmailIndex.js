/**
 * The `users.email` index predates the current schema and is still unique
 * without "sparse", so saving a student with a blank email hits E11000.
 * Rerun with --apply to drop and recreate it as unique + sparse.
 */
import 'dotenv/config';
import 'dotenv/config';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';

const apply = process.argv.includes('--apply');

await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });

const users = mongoose.connection.collection('users');
const existing = await users.indexes();
const email = existing.find((i) => i.key?.email === 1);

if (!email) {
  console.log('OK: no email index present; nothing to repair.');
} else if (email.sparse) {
  console.log('OK: email index is already sparse; nothing to repair.');
} else {
  console.log(`FOUND: email index "${email.name}" is unique but NOT sparse (this breaks blank emails).`);
  if (!apply) {
    console.log('Re-run with --apply to drop and recreate it as sparse.');
  } else {
    await users.dropIndex(email.name);
    await users.createIndex({ email: 1 }, { unique: true, sparse: true, name: 'email_1' });
    console.log('FIXED: email index recreated as unique + sparse.');
  }
}

const after = (await users.indexes()).filter((i) => i.key?.email === 1);
console.log('now:', JSON.stringify(after.map((i) => ({ name: i.name, unique: i.unique, sparse: !!i.sparse }))));

await mongoose.connection.close();
process.exit(0);

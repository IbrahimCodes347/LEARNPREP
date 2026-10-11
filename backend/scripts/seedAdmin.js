import { pathToFileURL } from 'url';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { ADMIN_SEED } from '../src/config/env.js';
import { ROLES } from '../src/utils/constants.js';
import { createLogger } from '../src/utils/logger.js';

const log = createLogger('seed:admin');

/** Idempotent: safe to run repeatedly. Never overwrites an existing password. */
export async function seedAdmin() {
  const existing = await User.findOne({ username: ADMIN_SEED.username.toLowerCase() }).select('+passwordHash');

  if (existing) {
    if (existing.role !== ROLES.ADMIN) {
      existing.role = ROLES.ADMIN;
      await existing.save();
      log.info(`promoted existing user "${ADMIN_SEED.username}" to admin`);
    } else {
      log.info(`admin "${ADMIN_SEED.username}" already exists - nothing to do`);
    }
    return existing;
  }

  const admin = new User({
    name: ADMIN_SEED.name,
    username: ADMIN_SEED.username.toLowerCase(),
    role: ROLES.ADMIN,
    isActive: true,
    grade: 'Faculty'
  });
  await admin.setPassword(ADMIN_SEED.password);
  await admin.save();

  log.info(`admin created - username: ${ADMIN_SEED.username} / password: ${ADMIN_SEED.password}`);
  return admin;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  connectDb()
    .then(seedAdmin)
    .then(async () => {
      await disconnectDb();
      process.exit(0);
    })
    .catch((err) => {
      log.error('seed:admin failed:', err.message);
      process.exit(1);
    });
}

export default seedAdmin;
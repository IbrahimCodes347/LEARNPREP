import mongoose from 'mongoose';
import { env } from './env.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('db');

const RETRIES = 5;
const RETRY_DELAY_MS = 3000;

mongoose.set('strictQuery', true);

export async function connectDb({ retries = RETRIES, delay = RETRY_DELAY_MS, quiet = false } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const conn = await mongoose.connect(env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000
      });
      if (!quiet) log.info(`connected (${conn.connection.host}/${conn.connection.name})`);
      return conn;
    } catch (err) {
      const last = attempt === retries;
      if (!quiet) log.error(`connection attempt ${attempt}/${retries} failed: ${err.message}`);
      if (last) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return null;
}

export async function disconnectDb() {
  await mongoose.connection.close();
}

export default connectDb;

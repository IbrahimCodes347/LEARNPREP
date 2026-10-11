import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo;

// Must set the env before src/config/env.js is imported anywhere.
export default async function globalSetup() {
  mongo = await MongoMemoryServer.create({ instance: { dbName: 'learnprep_test' } });
  process.env.MONGO_URI = mongo.getUri('learnprep_test');
  process.env.JWT_SECRET = 'test_secret_value_at_least_32_chars_long';
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_USERNAME = 'admin';
  process.env.ADMIN_PASSWORD = 'Admin@12345';
  process.env.ALLOW_SELF_REGISTER = 'true';
  globalThis.__MONGO_SERVER__ = mongo;
}
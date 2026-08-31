/**
 * Standalone MongoDB connection test.
 *
 *   npm run test:db        (from backend/)
 *
 * Attempts mongoose.connect() with MONGODB_URI from backend/.env, reports the
 * database name on success or the exact error on failure, then disconnects.
 * Mirrors the DNS-fallback + options behaviour of config/db.js so a pass here
 * means the real server will connect too.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const dns = require('dns');

const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  family: 4,
};

const FALLBACK_DNS = (process.env.MONGODB_DNS_SERVERS || '8.8.8.8,1.1.1.1')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function maybeFixDns(uri) {
  if (!uri.startsWith('mongodb+srv://')) return;
  const host = uri.split('@')[1] ? uri.split('@')[1].split(/[/?]/)[0] : null;
  if (!host) return;

  console.log(`System DNS servers: ${dns.getServers().join(', ')}`);
  try {
    const records = await dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
    console.log(`SRV lookup OK via system resolver (${records.length} records).`);
  } catch (err) {
    console.warn(
      `SRV lookup FAILED via system resolver: ${err.code} - ${err.message}`
    );
    console.warn(`Falling back to DNS resolvers: ${FALLBACK_DNS.join(', ')}`);
    dns.setServers(FALLBACK_DNS);
    try {
      const records = await dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
      console.log(`SRV lookup OK via fallback resolvers (${records.length} records).`);
    } catch (err2) {
      console.error(`SRV lookup STILL FAILING: ${err2.code} - ${err2.message}`);
    }
  }
}

async function test() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('MONGODB_URI is not set in backend/.env');
    process.exit(1);
  }

  const redacted = uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
  console.log(`Testing connection to: ${redacted}`);

  await maybeFixDns(uri);

  try {
    await mongoose.connect(uri, MONGO_OPTIONS);
    const dbName = mongoose.connection.name || '(none — add /<dbname> to the URI)';
    console.log(`Connection successful. Database: ${dbName}`);
  } catch (err) {
    console.error(`Connection failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

test();

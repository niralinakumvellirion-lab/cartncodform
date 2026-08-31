const mongoose = require('mongoose');
const dns = require('dns');

const RETRY_DELAY_MS = 5000;

// Mongoose/driver connection options.
//   serverSelectionTimeoutMS - fail fast (10s) instead of hanging 30s
//   socketTimeoutMS          - drop dead sockets after 45s
//   family: 4                - force IPv4 (avoids some Windows IPv6 ECONNREFUSED)
const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  family: 4,
};

// Public DNS resolvers used ONLY as a fallback when the system resolver refuses
// SRV lookups. This is the actual cause of "querySrv ECONNREFUSED ..." with
// mongodb+srv:// URIs — the local/system DNS (e.g. 127.0.0.1 stub) does not
// answer SRV record queries. Override with MONGODB_DNS_SERVERS if 8.8.8.8 /
// 1.1.1.1 are blocked on your network.
const FALLBACK_DNS = (process.env.MONGODB_DNS_SERVERS || '8.8.8.8,1.1.1.1')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

let dnsChecked = false;

/**
 * If the URI is an SRV URI, probe the system resolver once. If it cannot answer
 * the SRV query, switch this process over to the public fallback resolvers.
 */
async function ensureSrvResolvable(uri) {
  if (dnsChecked) return;
  dnsChecked = true;

  if (!uri || !uri.startsWith('mongodb+srv://')) return;

  const host = uri.split('@')[1] ? uri.split('@')[1].split(/[/?]/)[0] : null;
  if (!host) return;

  try {
    await dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
    // System resolver works — leave DNS configuration untouched.
  } catch (err) {
    console.warn(
      `MongoDB DNS: system resolver failed SRV lookup for ${host} (${err.code}); ` +
        `switching to ${FALLBACK_DNS.join(', ')}`
    );
    try {
      dns.setServers(FALLBACK_DNS);
    } catch (e) {
      console.error('MongoDB DNS: could not set fallback resolvers:', e.message);
    }
  }
}

/**
 * Try to connect once. On failure, log the error and schedule another attempt
 * in RETRY_DELAY_MS. Resolves as soon as the first attempt settles so the HTTP
 * server can still boot and start serving once Mongo becomes reachable.
 */
async function connectWithRetry() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('MongoDB connection error: MONGODB_URI is not set (add it to backend/.env)');
    setTimeout(connectWithRetry, RETRY_DELAY_MS);
    return;
  }

  try {
    await ensureSrvResolvable(uri);
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, MONGO_OPTIONS);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    console.log(`Retrying MongoDB connection in ${RETRY_DELAY_MS / 1000}s...`);
    setTimeout(connectWithRetry, RETRY_DELAY_MS);
  }
}

/**
 * Entry point used by server.js. Wires up connection event logging and kicks
 * off the retrying connect loop.
 */
async function connectDB() {
  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected — will attempt to reconnect');
  });
  mongoose.connection.on('reconnected', () => {
    console.log('MongoDB connected');
  });
  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err.message);
  });

  await connectWithRetry();
}

module.exports = connectDB;

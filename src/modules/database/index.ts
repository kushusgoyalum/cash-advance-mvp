/**
 * Database Module - Public API
 * MySQL (system of record), MongoDB (semi-structured), Redis (cache/locks).
 */
export { getMySQLClient, getMySQLRootClient, disconnectMySQL, isUniqueConstraintError, type MySQLClientLike } from './clients/mysql.client.js';
export { getMongoDBClient, disconnectMongoDB } from './clients/mongodb.client.js';
export { getRedisClient, disconnectRedis } from './clients/redis.client.js';
export { runTransactional, type TransactionalOptions } from './transaction/transactional.js';

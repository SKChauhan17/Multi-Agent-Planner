import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = process.env.DB_PATH || './data/planner.db';

let cachedDb: Database<sqlite3.Database, sqlite3.Statement> | null = null;

/**
 * Returns a SQLite connection wrapped with Promise support.
 * The data directory is created automatically if it doesn't exist.
 * WAL mode and foreign keys are enabled for performance and integrity.
 */
export async function getConnection(): Promise<Database<sqlite3.Database, sqlite3.Statement>> {
  if (cachedDb) return cachedDb;

  const absolutePath = path.resolve(DB_PATH);
  const dir = path.dirname(absolutePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = await open({
    filename: absolutePath,
    driver: sqlite3.Database
  });

  // Enable WAL mode for better concurrent read performance
  await db.exec('PRAGMA journal_mode = WAL');
  // Enforce foreign key constraints
  await db.exec('PRAGMA foreign_keys = ON');

  cachedDb = db;
  return db;
}

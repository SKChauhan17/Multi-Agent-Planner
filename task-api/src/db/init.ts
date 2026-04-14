import { getConnection } from './connection';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Initializes the database by running the schema SQL file.
 * Safe to call multiple times — uses IF NOT EXISTS clauses.
 */
export async function initializeDatabase(): Promise<void> {
  // Handle both ts-node (src/db) and compiled node execution (dist/db)
  const devPath = path.resolve(__dirname, 'schema.sql');
  const prodPath = path.resolve(__dirname, '../../src/db/schema.sql');
  const schemaPath = fs.existsSync(devPath) ? devPath : prodPath;
  
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  
  const db = await getConnection();
  await db.exec(schemaSql);
  console.log('✅ Database initialized successfully');
}

// Allow running directly via `npm run db:init`
if (require.main === module) {
  require('dotenv').config();
  initializeDatabase().catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
}

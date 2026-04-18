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

  // Backward-compatible migration path for existing databases.
  const columns = await db.all<{ name: string }[]>(`PRAGMA table_info(tasks)`);
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has('task_id')) {
    await db.exec(`ALTER TABLE tasks ADD COLUMN task_id TEXT NOT NULL DEFAULT ''`);
  }

  if (!columnNames.has('dependencies')) {
    await db.exec(`ALTER TABLE tasks ADD COLUMN dependencies TEXT NOT NULL DEFAULT '[]'`);
  }

  if (!columnNames.has('recommended_date')) {
    await db.exec(`ALTER TABLE tasks ADD COLUMN recommended_date TEXT NOT NULL DEFAULT ''`);
  }

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

-- ============================================
-- Multi-Agent Task Planner — Database Schema
-- ============================================

CREATE TABLE IF NOT EXISTS plans (
  id          TEXT PRIMARY KEY,
  goal        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT PRIMARY KEY,
  plan_id         TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  estimated_hours REAL NOT NULL DEFAULT 0,
  priority        TEXT NOT NULL CHECK (priority IN ('High', 'Medium', 'Low')) DEFAULT 'Medium',
  status          TEXT NOT NULL CHECK (status IN ('todo', 'in-progress', 'done')) DEFAULT 'todo',
  dependency_id   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (plan_id)       REFERENCES plans(id) ON DELETE CASCADE,
  FOREIGN KEY (dependency_id) REFERENCES tasks(id) ON DELETE SET NULL
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tasks_plan_id       ON tasks(plan_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status        ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_dependency_id ON tasks(dependency_id);

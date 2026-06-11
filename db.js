const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'pomodoro.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pomodoros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      tag TEXT,
      duration INTEGER NOT NULL DEFAULT 1500,
      status TEXT NOT NULL DEFAULT 'idle',
      started_at TEXT,
      ended_at TEXT,
      total_paused_duration INTEGER NOT NULL DEFAULT 0,
      actual_duration INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pomodoro_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      event_time TEXT NOT NULL DEFAULT (datetime('now')),
      note TEXT,
      FOREIGN KEY (pomodoro_id) REFERENCES pomodoros(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_pomodoros_tag ON pomodoros(tag);
    CREATE INDEX IF NOT EXISTS idx_pomodoros_status ON pomodoros(status);
    CREATE INDEX IF NOT EXISTS idx_events_pomodoro_id ON events(pomodoro_id);
    CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
  `);
}

const PomodoroStatus = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  INTERRUPTED: 'interrupted'
};

const EventType = {
  START: 'start',
  PAUSE: 'pause',
  RESUME: 'resume',
  INTERRUPT: 'interrupt',
  COMPLETE: 'complete'
};

module.exports = {
  db,
  initDatabase,
  PomodoroStatus,
  EventType
};

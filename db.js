const Database = require('better-sqlite3');
const path = require('path');

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

const STATE_TRANSITIONS = {
  [PomodoroStatus.IDLE]: {
    [EventType.START]: PomodoroStatus.RUNNING
  },
  [PomodoroStatus.RUNNING]: {
    [EventType.PAUSE]: PomodoroStatus.PAUSED,
    [EventType.COMPLETE]: PomodoroStatus.COMPLETED,
    [EventType.INTERRUPT]: PomodoroStatus.INTERRUPTED
  },
  [PomodoroStatus.PAUSED]: {
    [EventType.RESUME]: PomodoroStatus.RUNNING,
    [EventType.INTERRUPT]: PomodoroStatus.INTERRUPTED
  },
  [PomodoroStatus.COMPLETED]: {},
  [PomodoroStatus.INTERRUPTED]: {}
};

function isTransitionAllowed(currentStatus, eventType) {
  const transitions = STATE_TRANSITIONS[currentStatus];
  if (!transitions) return false;
  return eventType in transitions;
}

function getTargetStatus(currentStatus, eventType) {
  const transitions = STATE_TRANSITIONS[currentStatus];
  if (!transitions) return null;
  return transitions[eventType] || null;
}

function getAllowedActions(status) {
  const transitions = STATE_TRANSITIONS[status];
  if (!transitions) return [];
  return Object.keys(transitions);
}

function createDatabase(dbPathOrMemory) {
  const db = new Database(dbPathOrMemory);

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

  function closeDatabase() {
    db.close();
  }

  return {
    db,
    initDatabase,
    closeDatabase
  };
}

const defaultDbPath = path.join(__dirname, 'pomodoro.db');
const defaultInstance = createDatabase(defaultDbPath);

module.exports = {
  db: defaultInstance.db,
  initDatabase: defaultInstance.initDatabase,
  createDatabase,
  PomodoroStatus,
  EventType,
  STATE_TRANSITIONS,
  isTransitionAllowed,
  getTargetStatus,
  getAllowedActions
};

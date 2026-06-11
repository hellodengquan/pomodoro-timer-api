const { PomodoroStatus, EventType, isTransitionAllowed, getTargetStatus, getAllowedActions } = require('../db');
const { StateTransitionError, NotFoundError } = require('../errors');

function createPomodoroService(db) {
  function getCurrentTime() {
    return new Date().toISOString();
  }

  function getTimeDiffInSeconds(time1, time2) {
    const t1 = new Date(time1).getTime();
    const t2 = new Date(time2).getTime();
    return Math.floor((t2 - t1) / 1000);
  }

  function requirePomodoroExists(id) {
    const stmt = db.prepare('SELECT * FROM pomodoros WHERE id = ?');
    const pomodoro = stmt.get(id);
    if (!pomodoro) {
      throw new NotFoundError('番茄钟不存在');
    }
    return pomodoro;
  }

  function requireTransition(pomodoro, eventType) {
    if (!isTransitionAllowed(pomodoro.status, eventType)) {
      throw new StateTransitionError(
        `不允许从 '${pomodoro.status}' 状态执行 '${eventType}' 操作`,
        pomodoro.status,
        eventType,
        getAllowedActions(pomodoro.status)
      );
    }
    return getTargetStatus(pomodoro.status, eventType);
  }

  function createPomodoro(title, tag, duration = 1500) {
    const stmt = db.prepare(`
      INSERT INTO pomodoros (title, tag, duration, status)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(title, tag || null, duration, PomodoroStatus.IDLE);
    return getPomodoroById(result.lastInsertRowid);
  }

  function getPomodoroById(id) {
    const stmt = db.prepare('SELECT * FROM pomodoros WHERE id = ?');
    return stmt.get(id);
  }

  function getAllPomodoros(options = {}) {
    const { tag, status, limit = 50, offset = 0 } = options;
    let query = 'SELECT * FROM pomodoros WHERE 1=1';
    const params = [];

    if (tag) {
      query += ' AND tag = ?';
      params.push(tag);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  function getEventsByPomodoroId(pomodoroId) {
    const stmt = db.prepare('SELECT * FROM events WHERE pomodoro_id = ? ORDER BY event_time ASC');
    return stmt.all(pomodoroId);
  }

  function addEvent(pomodoroId, eventType, note = null) {
    const now = getCurrentTime();
    const stmt = db.prepare(`
      INSERT INTO events (pomodoro_id, event_type, event_time, note)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(pomodoroId, eventType, now, note);
  }

  function calculateActualDuration(pomodoro) {
    if (!pomodoro.started_at) return 0;

    const endTime = pomodoro.ended_at ? new Date(pomodoro.ended_at) : new Date();
    const startTime = new Date(pomodoro.started_at);
    const totalSeconds = Math.floor((endTime - startTime) / 1000);
    return Math.max(0, totalSeconds - pomodoro.total_paused_duration);
  }

  function startPomodoro(id) {
    const pomodoro = requirePomodoroExists(id);
    requireTransition(pomodoro, EventType.START);

    const now = getCurrentTime();
    const stmt = db.prepare(`
      UPDATE pomodoros
      SET status = ?, started_at = ?
      WHERE id = ?
    `);
    stmt.run(PomodoroStatus.RUNNING, now, id);
    addEvent(id, EventType.START);

    return getPomodoroById(id);
  }

  function getLastPauseEvent(pomodoroId) {
    const stmt = db.prepare(`
      SELECT * FROM events
      WHERE pomodoro_id = ? AND event_type = ?
      ORDER BY event_time DESC
      LIMIT 1
    `);
    return stmt.get(pomodoroId, EventType.PAUSE);
  }

  function pausePomodoro(id, note = null) {
    const pomodoro = requirePomodoroExists(id);
    requireTransition(pomodoro, EventType.PAUSE);

    const stmt = db.prepare(`
      UPDATE pomodoros
      SET status = ?
      WHERE id = ?
    `);
    stmt.run(PomodoroStatus.PAUSED, id);

    addEvent(id, EventType.PAUSE, note);

    return getPomodoroById(id);
  }

  function resumePomodoro(id) {
    const pomodoro = requirePomodoroExists(id);
    requireTransition(pomodoro, EventType.RESUME);

    const now = getCurrentTime();
    const lastPauseEvent = getLastPauseEvent(id);
    if (lastPauseEvent) {
      const pausedDuration = getTimeDiffInSeconds(lastPauseEvent.event_time, now);
      const stmt = db.prepare(`
        UPDATE pomodoros
        SET status = ?, total_paused_duration = total_paused_duration + ?
        WHERE id = ?
      `);
      stmt.run(PomodoroStatus.RUNNING, pausedDuration, id);
    } else {
      const stmt = db.prepare(`
        UPDATE pomodoros
        SET status = ?
        WHERE id = ?
      `);
      stmt.run(PomodoroStatus.RUNNING, id);
    }

    addEvent(id, EventType.RESUME);

    return getPomodoroById(id);
  }

  function interruptPomodoro(id, note = null) {
    const pomodoro = requirePomodoroExists(id);
    requireTransition(pomodoro, EventType.INTERRUPT);

    const now = getCurrentTime();
    const actualDuration = calculateActualDuration({
      ...pomodoro,
      ended_at: now
    });

    const stmt = db.prepare(`
      UPDATE pomodoros
      SET status = ?, ended_at = ?, actual_duration = ?
      WHERE id = ?
    `);
    stmt.run(PomodoroStatus.INTERRUPTED, now, actualDuration, id);

    addEvent(id, EventType.INTERRUPT, note);

    return getPomodoroById(id);
  }

  function completePomodoro(id) {
    const pomodoro = requirePomodoroExists(id);
    requireTransition(pomodoro, EventType.COMPLETE);

    const now = getCurrentTime();
    const actualDuration = calculateActualDuration({
      ...pomodoro,
      ended_at: now
    });

    const stmt = db.prepare(`
      UPDATE pomodoros
      SET status = ?, ended_at = ?, actual_duration = ?
      WHERE id = ?
    `);
    stmt.run(PomodoroStatus.COMPLETED, now, actualDuration, id);

    addEvent(id, EventType.COMPLETE);

    return getPomodoroById(id);
  }

  function deletePomodoro(id) {
    const pomodoro = requirePomodoroExists(id);

    const stmt = db.prepare('DELETE FROM pomodoros WHERE id = ?');
    stmt.run(id);

    return true;
  }

  function getStatsByTag(options = {}) {
    const { startDate, endDate, limit = 50, offset = 0 } = options;
    let query = `
      SELECT 
        tag,
        COUNT(*) as total_count,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed_count,
        COALESCE(SUM(CASE WHEN status = 'interrupted' THEN 1 ELSE 0 END), 0) as interrupted_count,
        COALESCE(SUM(actual_duration), 0) as total_duration_seconds,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN actual_duration ELSE 0 END), 0) as completed_duration_seconds,
        COALESCE(SUM(total_paused_duration), 0) as total_paused_duration_seconds
      FROM pomodoros
      WHERE tag IS NOT NULL AND status IN ('completed', 'interrupted')
    `;
    const params = [];

    if (startDate) {
      query += ' AND ended_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND ended_at <= ?';
      params.push(endDate);
    }

    query += ' GROUP BY tag ORDER BY total_duration_seconds DESC, tag ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  function getOverallStats(options = {}) {
    const { startDate, endDate } = options;
    let query = `
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed_count,
        COALESCE(SUM(CASE WHEN status = 'interrupted' THEN 1 ELSE 0 END), 0) as interrupted_count,
        COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0) as running_count,
        COALESCE(SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END), 0) as paused_count,
        COALESCE(SUM(actual_duration), 0) as total_duration_seconds,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN actual_duration ELSE 0 END), 0) as completed_duration_seconds,
        COALESCE(SUM(total_paused_duration), 0) as total_paused_duration_seconds
      FROM pomodoros
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      query += ' AND created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND created_at <= ?';
      params.push(endDate);
    }

    const stmt = db.prepare(query);
    return stmt.get(...params);
  }

  return {
    createPomodoro,
    getPomodoroById,
    getAllPomodoros,
    getEventsByPomodoroId,
    startPomodoro,
    pausePomodoro,
    resumePomodoro,
    interruptPomodoro,
    completePomodoro,
    deletePomodoro,
    getStatsByTag,
    getOverallStats
  };
}

const { db: defaultDb } = require('../db');
const defaultService = createPomodoroService(defaultDb);

module.exports = defaultService;
module.exports.createPomodoroService = createPomodoroService;

const { createDatabase, PomodoroStatus } = require('../db');
const { createPomodoroService } = require('../services/pomodoroService');

function insertPomodoro(db, overrides = {}) {
  const defaults = {
    title: '测试任务',
    tag: '默认标签',
    duration: 1500,
    status: PomodoroStatus.COMPLETED,
    started_at: '2026-06-10T00:00:00.000Z',
    ended_at: '2026-06-10T00:25:00.000Z',
    total_paused_duration: 0,
    actual_duration: 1500,
    created_at: '2026-06-10T00:00:00.000Z'
  };
  const data = { ...defaults, ...overrides };

  const stmt = db.prepare(`
    INSERT INTO pomodoros 
      (title, tag, duration, status, started_at, ended_at, total_paused_duration, actual_duration, created_at)
    VALUES 
      (@title, @tag, @duration, @status, @started_at, @ended_at, @total_paused_duration, @actual_duration, @created_at)
  `);
  const result = stmt.run(data);
  return result.lastInsertRowid;
}

describe('按标签时长统计 - 单元测试', () => {
  let db;
  let service;
  let dbInstance;

  beforeEach(() => {
    dbInstance = createDatabase(':memory:');
    dbInstance.initDatabase();
    db = dbInstance.db;
    service = createPomodoroService(db);
  });

  afterEach(() => {
    dbInstance.closeDatabase();
  });

  describe('空数据场景', () => {
    test('无任何数据时返回空数组', () => {
      const result = service.getStatsByTag();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    test('只有未完成（running/paused/idle）的番茄钟时返回空数组', () => {
      insertPomodoro(db, { status: PomodoroStatus.IDLE, tag: '学习', ended_at: null, started_at: null, actual_duration: 0 });
      insertPomodoro(db, { status: PomodoroStatus.RUNNING, tag: '工作', ended_at: null, actual_duration: 0 });
      insertPomodoro(db, { status: PomodoroStatus.PAUSED, tag: '阅读', ended_at: null, actual_duration: 0 });

      const result = service.getStatsByTag();
      expect(result).toEqual([]);
    });

    test('已完成但无 tag 的番茄钟不参与统计', () => {
      insertPomodoro(db, { tag: null, status: PomodoroStatus.COMPLETED, actual_duration: 1000 });
      insertPomodoro(db, { tag: null, status: PomodoroStatus.INTERRUPTED, actual_duration: 500 });

      const result = service.getStatsByTag();
      expect(result).toEqual([]);
    });
  });

  describe('单标签多次记录', () => {
    test('同一标签多个已完成番茄钟，数据正确累加', () => {
      insertPomodoro(db, {
        tag: '学习',
        status: PomodoroStatus.COMPLETED,
        actual_duration: 1500,
        total_paused_duration: 0,
        ended_at: '2026-06-10T01:00:00.000Z'
      });
      insertPomodoro(db, {
        tag: '学习',
        status: PomodoroStatus.COMPLETED,
        actual_duration: 1200,
        total_paused_duration: 300,
        ended_at: '2026-06-10T02:00:00.000Z'
      });
      insertPomodoro(db, {
        tag: '学习',
        status: PomodoroStatus.COMPLETED,
        actual_duration: 900,
        total_paused_duration: 600,
        ended_at: '2026-06-10T03:00:00.000Z'
      });

      const result = service.getStatsByTag();
      expect(result.length).toBe(1);
      expect(result[0].tag).toBe('学习');
      expect(result[0].total_count).toBe(3);
      expect(result[0].completed_count).toBe(3);
      expect(result[0].interrupted_count).toBe(0);
      expect(result[0].total_duration_seconds).toBe(1500 + 1200 + 900);
      expect(result[0].completed_duration_seconds).toBe(1500 + 1200 + 900);
      expect(result[0].total_paused_duration_seconds).toBe(0 + 300 + 600);
    });

    test('同一标签混合完成和中断状态，分类统计正确', () => {
      insertPomodoro(db, {
        tag: '工作',
        status: PomodoroStatus.COMPLETED,
        actual_duration: 1500,
        total_paused_duration: 0,
        ended_at: '2026-06-10T01:00:00.000Z'
      });
      insertPomodoro(db, {
        tag: '工作',
        status: PomodoroStatus.INTERRUPTED,
        actual_duration: 600,
        total_paused_duration: 100,
        ended_at: '2026-06-10T02:00:00.000Z'
      });
      insertPomodoro(db, {
        tag: '工作',
        status: PomodoroStatus.INTERRUPTED,
        actual_duration: 300,
        total_paused_duration: 200,
        ended_at: '2026-06-10T03:00:00.000Z'
      });

      const result = service.getStatsByTag();
      expect(result.length).toBe(1);
      expect(result[0].tag).toBe('工作');
      expect(result[0].total_count).toBe(3);
      expect(result[0].completed_count).toBe(1);
      expect(result[0].interrupted_count).toBe(2);
      expect(result[0].total_duration_seconds).toBe(1500 + 600 + 300);
      expect(result[0].completed_duration_seconds).toBe(1500);
      expect(result[0].total_paused_duration_seconds).toBe(0 + 100 + 200);
    });

    test('运行中的番茄钟不计入该标签统计', () => {
      insertPomodoro(db, {
        tag: '阅读',
        status: PomodoroStatus.COMPLETED,
        actual_duration: 1000,
        total_paused_duration: 50,
        ended_at: '2026-06-10T01:00:00.000Z'
      });
      insertPomodoro(db, {
        tag: '阅读',
        status: PomodoroStatus.RUNNING,
        actual_duration: 0,
        total_paused_duration: 0,
        ended_at: null
      });
      insertPomodoro(db, {
        tag: '阅读',
        status: PomodoroStatus.PAUSED,
        actual_duration: 0,
        total_paused_duration: 0,
        ended_at: null
      });

      const result = service.getStatsByTag();
      expect(result.length).toBe(1);
      expect(result[0].total_count).toBe(1);
      expect(result[0].total_duration_seconds).toBe(1000);
    });
  });

  describe('跨多标签汇总', () => {
    test('多个标签各自统计，互不污染', () => {
      insertPomodoro(db, {
        tag: '学习',
        status: PomodoroStatus.COMPLETED,
        actual_duration: 1500,
        total_paused_duration: 0,
        ended_at: '2026-06-10T01:00:00.000Z'
      });
      insertPomodoro(db, {
        tag: '工作',
        status: PomodoroStatus.COMPLETED,
        actual_duration: 900,
        total_paused_duration: 100,
        ended_at: '2026-06-10T02:00:00.000Z'
      });
      insertPomodoro(db, {
        tag: '阅读',
        status: PomodoroStatus.INTERRUPTED,
        actual_duration: 300,
        total_paused_duration: 50,
        ended_at: '2026-06-10T03:00:00.000Z'
      });

      const result = service.getStatsByTag();
      expect(result.length).toBe(3);

      const study = result.find(r => r.tag === '学习');
      expect(study.total_count).toBe(1);
      expect(study.completed_count).toBe(1);
      expect(study.total_duration_seconds).toBe(1500);

      const work = result.find(r => r.tag === '工作');
      expect(work.total_count).toBe(1);
      expect(work.completed_count).toBe(1);
      expect(work.total_duration_seconds).toBe(900);

      const read = result.find(r => r.tag === '阅读');
      expect(read.total_count).toBe(1);
      expect(read.interrupted_count).toBe(1);
      expect(read.total_duration_seconds).toBe(300);
    });

    test('按总时长降序排列', () => {
      insertPomodoro(db, { tag: 'C', status: PomodoroStatus.COMPLETED, actual_duration: 100, ended_at: '2026-06-10T01:00:00.000Z' });
      insertPomodoro(db, { tag: 'A', status: PomodoroStatus.COMPLETED, actual_duration: 1000, ended_at: '2026-06-10T02:00:00.000Z' });
      insertPomodoro(db, { tag: 'B', status: PomodoroStatus.COMPLETED, actual_duration: 500, ended_at: '2026-06-10T03:00:00.000Z' });

      const result = service.getStatsByTag();
      expect(result.map(r => r.tag)).toEqual(['A', 'B', 'C']);
    });

    test('各标签统计字段均为数字（无 NULL）', () => {
      insertPomodoro(db, { tag: '单条', status: PomodoroStatus.COMPLETED, actual_duration: 100, total_paused_duration: 0, ended_at: '2026-06-10T01:00:00.000Z' });

      const result = service.getStatsByTag();
      const row = result[0];

      expect(typeof row.total_count).toBe('number');
      expect(typeof row.completed_count).toBe('number');
      expect(typeof row.interrupted_count).toBe('number');
      expect(typeof row.total_duration_seconds).toBe('number');
      expect(typeof row.completed_duration_seconds).toBe('number');
      expect(typeof row.total_paused_duration_seconds).toBe('number');
    });
  });

  describe('跨日期边界筛选', () => {
    beforeEach(() => {
      insertPomodoro(db, {
        tag: '工作',
        status: PomodoroStatus.COMPLETED,
        actual_duration: 1000,
        total_paused_duration: 0,
        ended_at: '2026-06-01T10:00:00.000Z'
      });
      insertPomodoro(db, {
        tag: '工作',
        status: PomodoroStatus.COMPLETED,
        actual_duration: 1500,
        total_paused_duration: 100,
        ended_at: '2026-06-15T10:00:00.000Z'
      });
      insertPomodoro(db, {
        tag: '工作',
        status: PomodoroStatus.INTERRUPTED,
        actual_duration: 500,
        total_paused_duration: 50,
        ended_at: '2026-06-30T10:00:00.000Z'
      });
    });

    test('只指定 startDate，返回该日期之后的数据', () => {
      const result = service.getStatsByTag({ startDate: '2026-06-14T00:00:00.000Z' });
      expect(result.length).toBe(1);
      expect(result[0].total_count).toBe(2);
      expect(result[0].total_duration_seconds).toBe(1500 + 500);
    });

    test('只指定 endDate，返回该日期之前的数据', () => {
      const result = service.getStatsByTag({ endDate: '2026-06-16T00:00:00.000Z' });
      expect(result.length).toBe(1);
      expect(result[0].total_count).toBe(2);
      expect(result[0].total_duration_seconds).toBe(1000 + 1500);
    });

    test('同时指定 startDate 和 endDate，返回区间内数据', () => {
      const result = service.getStatsByTag({
        startDate: '2026-06-10T00:00:00.000Z',
        endDate: '2026-06-20T00:00:00.000Z'
      });
      expect(result.length).toBe(1);
      expect(result[0].total_count).toBe(1);
      expect(result[0].total_duration_seconds).toBe(1500);
    });

    test('日期范围不包含任何数据时返回空数组', () => {
      const result = service.getStatsByTag({
        startDate: '2027-01-01T00:00:00.000Z',
        endDate: '2027-12-31T23:59:59.000Z'
      });
      expect(result).toEqual([]);
    });

    test('边界日期恰好匹配时被包含', () => {
      const result = service.getStatsByTag({
        startDate: '2026-06-01T10:00:00.000Z',
        endDate: '2026-06-30T10:00:00.000Z'
      });
      expect(result.length).toBe(1);
      expect(result[0].total_count).toBe(3);
      expect(result[0].total_duration_seconds).toBe(1000 + 1500 + 500);
    });

    test('日期筛选对多标签各自独立生效', () => {
      insertPomodoro(db, {
        tag: '学习',
        status: PomodoroStatus.COMPLETED,
        actual_duration: 2000,
        total_paused_duration: 0,
        ended_at: '2026-06-15T12:00:00.000Z'
      });

      const result = service.getStatsByTag({
        startDate: '2026-06-10T00:00:00.000Z',
        endDate: '2026-06-20T00:00:00.000Z'
      });

      expect(result.length).toBe(2);
      const work = result.find(r => r.tag === '工作');
      const study = result.find(r => r.tag === '学习');
      expect(work.total_count).toBe(1);
      expect(work.total_duration_seconds).toBe(1500);
      expect(study.total_count).toBe(1);
      expect(study.total_duration_seconds).toBe(2000);
    });
  });

  describe('总体统计接口 getOverallStats', () => {
    test('空数据时各计数为 0（不为 NULL）', () => {
      const result = service.getOverallStats();
      expect(result).toBeDefined();
      expect(result.total_count).toBe(0);
      expect(result.completed_count).toBe(0);
      expect(result.interrupted_count).toBe(0);
      expect(result.running_count).toBe(0);
      expect(result.paused_count).toBe(0);
      expect(result.total_duration_seconds).toBe(0);
      expect(result.completed_duration_seconds).toBe(0);
      expect(result.total_paused_duration_seconds).toBe(0);
    });

    test('各状态计数正确汇总', () => {
      insertPomodoro(db, { tag: 'A', status: PomodoroStatus.IDLE, started_at: null, ended_at: null, actual_duration: 0 });
      insertPomodoro(db, { tag: 'B', status: PomodoroStatus.RUNNING, ended_at: null, actual_duration: 0 });
      insertPomodoro(db, { tag: 'C', status: PomodoroStatus.PAUSED, ended_at: null, actual_duration: 0 });
      insertPomodoro(db, { tag: 'D', status: PomodoroStatus.COMPLETED, actual_duration: 1000, total_paused_duration: 50, ended_at: '2026-06-10T01:00:00.000Z' });
      insertPomodoro(db, { tag: 'E', status: PomodoroStatus.COMPLETED, actual_duration: 2000, total_paused_duration: 100, ended_at: '2026-06-10T02:00:00.000Z' });
      insertPomodoro(db, { tag: 'F', status: PomodoroStatus.INTERRUPTED, actual_duration: 500, total_paused_duration: 30, ended_at: '2026-06-10T03:00:00.000Z' });

      const result = service.getOverallStats();
      expect(result.total_count).toBe(6);
      expect(result.completed_count).toBe(2);
      expect(result.interrupted_count).toBe(1);
      expect(result.running_count).toBe(1);
      expect(result.paused_count).toBe(1);
      expect(result.total_duration_seconds).toBe(1000 + 2000 + 500);
      expect(result.completed_duration_seconds).toBe(1000 + 2000);
      expect(result.total_paused_duration_seconds).toBe(50 + 100 + 30);
    });

    test('总体统计不排除无 tag 记录', () => {
      insertPomodoro(db, { tag: null, status: PomodoroStatus.COMPLETED, actual_duration: 500, total_paused_duration: 0, ended_at: '2026-06-10T01:00:00.000Z' });
      insertPomodoro(db, { tag: '有标签', status: PomodoroStatus.COMPLETED, actual_duration: 1000, total_paused_duration: 0, ended_at: '2026-06-10T02:00:00.000Z' });

      const result = service.getOverallStats();
      expect(result.total_count).toBe(2);
      expect(result.total_duration_seconds).toBe(1500);
    });
  });
});

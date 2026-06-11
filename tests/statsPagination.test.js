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
  stmt.run(data);
}

function insertPomodorosForTag(db, tag, count, durationPerPomodoro, endedAt) {
  for (let i = 0; i < count; i++) {
    insertPomodoro(db, {
      tag,
      actual_duration: durationPerPomodoro,
      ended_at: endedAt
    });
  }
}

describe('按标签统计 - 分页与稳定排序', () => {
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

  describe('分页功能', () => {
    beforeEach(() => {
      const tags = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
      tags.forEach((tag, idx) => {
        insertPomodorosForTag(db, tag, 1, (10 - idx) * 100, '2026-06-10T12:00:00.000Z');
      });
    });

    test('默认 limit=50，offset=0 返回全部数据', () => {
      const result = service.getStatsByTag();
      expect(result.length).toBe(10);
      expect(result.map(r => r.tag)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
    });

    test('第一页 limit=3, offset=0', () => {
      const result = service.getStatsByTag({ limit: 3, offset: 0 });
      expect(result.length).toBe(3);
      expect(result.map(r => r.tag)).toEqual(['A', 'B', 'C']);
    });

    test('第二页 limit=3, offset=3', () => {
      const result = service.getStatsByTag({ limit: 3, offset: 3 });
      expect(result.length).toBe(3);
      expect(result.map(r => r.tag)).toEqual(['D', 'E', 'F']);
    });

    test('最后一页不足一页时返回剩余', () => {
      const result = service.getStatsByTag({ limit: 3, offset: 9 });
      expect(result.length).toBe(1);
      expect(result.map(r => r.tag)).toEqual(['J']);
    });

    test('offset 超出总条数返回空数组', () => {
      const result = service.getStatsByTag({ limit: 3, offset: 100 });
      expect(result).toEqual([]);
    });

    test('limit=0 返回空数组', () => {
      const result = service.getStatsByTag({ limit: 0, offset: 0 });
      expect(result).toEqual([]);
    });

    test('多页数据拼接结果与不分页结果完全一致', () => {
      const all = service.getStatsByTag({ limit: 100, offset: 0 });
      const page1 = service.getStatsByTag({ limit: 3, offset: 0 });
      const page2 = service.getStatsByTag({ limit: 3, offset: 3 });
      const page3 = service.getStatsByTag({ limit: 3, offset: 6 });
      const page4 = service.getStatsByTag({ limit: 3, offset: 9 });

      const combined = [...page1, ...page2, ...page3, ...page4];
      expect(combined).toEqual(all);
      expect(combined.length).toBe(10);
    });

    test('分页与日期筛选可以同时生效', () => {
      insertPomodorosForTag(db, 'OLD', 1, 9999, '2025-01-01T12:00:00.000Z');
      insertPomodorosForTag(db, 'NEW', 1, 1, '2026-07-01T12:00:00.000Z');

      const result = service.getStatsByTag({
        startDate: '2026-06-01T00:00:00.000Z',
        endDate: '2026-06-30T23:59:59.000Z',
        limit: 5,
        offset: 0
      });

      expect(result.length).toBe(5);
      expect(result.map(r => r.tag)).not.toContain('OLD');
      expect(result.map(r => r.tag)).not.toContain('NEW');
    });
  });

  describe('稳定排序（相同时长 + 二级键）', () => {
    test('相同时长按 tag 字母序升序排列', () => {
      insertPomodorosForTag(db, 'Zebra', 1, 500, '2026-06-10T12:00:00.000Z');
      insertPomodorosForTag(db, 'Alpha', 1, 500, '2026-06-10T12:00:00.000Z');
      insertPomodorosForTag(db, 'Mango', 1, 500, '2026-06-10T12:00:00.000Z');

      const result = service.getStatsByTag();
      expect(result.map(r => r.tag)).toEqual(['Alpha', 'Mango', 'Zebra']);
      result.forEach(r => {
        expect(r.total_duration_seconds).toBe(500);
      });
    });

    test('时长不同时按时长降序，时长相同时按 tag 升序', () => {
      insertPomodorosForTag(db, 'Z_high', 1, 1000, '2026-06-10T12:00:00.000Z');
      insertPomodorosForTag(db, 'A_mid', 1, 500, '2026-06-10T12:00:00.000Z');
      insertPomodorosForTag(db, 'Z_mid', 1, 500, '2026-06-10T12:00:00.000Z');
      insertPomodorosForTag(db, 'M_mid', 1, 500, '2026-06-10T12:00:00.000Z');
      insertPomodorosForTag(db, 'A_low', 1, 100, '2026-06-10T12:00:00.000Z');

      const result = service.getStatsByTag();
      expect(result.map(r => r.tag)).toEqual([
        'Z_high',
        'A_mid',
        'M_mid',
        'Z_mid',
        'A_low'
      ]);
    });

    test('相同时长下跨多页分页结果稳定不跳动', () => {
      const sameDurationTags = [
        'Apple', 'Banana', 'Cherry', 'Date', 'Elderberry',
        'Fig', 'Grape', 'Honeydew', 'Kiwi', 'Lemon'
      ];
      sameDurationTags.forEach(tag => {
        insertPomodorosForTag(db, tag, 1, 500, '2026-06-10T12:00:00.000Z');
      });

      const all = service.getStatsByTag({ limit: 100, offset: 0 });
      expect(all.length).toBe(10);
      expect(all.map(r => r.tag)).toEqual([...sameDurationTags].sort());

      const page1 = service.getStatsByTag({ limit: 3, offset: 0 });
      const page2 = service.getStatsByTag({ limit: 3, offset: 3 });
      const page3 = service.getStatsByTag({ limit: 3, offset: 6 });
      const page4 = service.getStatsByTag({ limit: 3, offset: 9 });

      const paged = [...page1, ...page2, ...page3, ...page4];

      expect(paged.length).toBe(10);
      expect(paged.map(r => r.tag)).toEqual(all.map(r => r.tag));

      const allDurations = all.map(r => r.total_duration_seconds);
      allDurations.forEach(d => expect(d).toBe(500));

      page1.forEach(r => expect(all.map(x => x.tag)).toContain(r.tag));
      page2.forEach(r => expect(all.map(x => x.tag)).toContain(r.tag));

      expect(page1.map(r => r.tag)).toEqual(['Apple', 'Banana', 'Cherry']);
      expect(page2.map(r => r.tag)).toEqual(['Date', 'Elderberry', 'Fig']);
      expect(page3.map(r => r.tag)).toEqual(['Grape', 'Honeydew', 'Kiwi']);
      expect(page4.map(r => r.tag)).toEqual(['Lemon']);
    });

    test('多次调用相同分页参数结果完全一致（确定性）', () => {
      const tags = ['Tag-D', 'Tag-A', 'Tag-C', 'Tag-B'];
      tags.forEach(tag => {
        insertPomodorosForTag(db, tag, 1, 300, '2026-06-10T12:00:00.000Z');
      });

      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(service.getStatsByTag({ limit: 2, offset: 0 }));
      }

      for (let i = 1; i < results.length; i++) {
        expect(results[i]).toEqual(results[0]);
      }
      expect(results[0].map(r => r.tag)).toEqual(['Tag-A', 'Tag-B']);
    });

    test('插入新数据后分页偏移不影响已存在数据的相对顺序', () => {
      insertPomodorosForTag(db, 'B', 1, 200, '2026-06-10T12:00:00.000Z');
      insertPomodorosForTag(db, 'A', 1, 200, '2026-06-10T12:00:00.000Z');
      insertPomodorosForTag(db, 'D', 1, 200, '2026-06-10T12:00:00.000Z');
      insertPomodorosForTag(db, 'C', 1, 200, '2026-06-10T12:00:00.000Z');

      const before = service.getStatsByTag({ limit: 2, offset: 0 });
      expect(before.map(r => r.tag)).toEqual(['A', 'B']);

      insertPomodorosForTag(db, 'E', 1, 999, '2026-06-10T12:00:00.000Z');

      const afterSame = service.getStatsByTag({ limit: 2, offset: 0 });
      expect(afterSame[0].tag).toBe('E');

      const afterShifted = service.getStatsByTag({ limit: 2, offset: 1 });
      expect(afterShifted.map(r => r.tag)).toEqual(['A', 'B']);
    });
  });

  describe('混合时长与多标签分页稳定性', () => {
    test('不同时长分层 + 同层 tag 稳定排序，连续分页无重复无遗漏', () => {
      const tier1 = ['Z_top', 'A_top', 'M_top'];
      const tier2 = ['B_mid', 'Y_mid', 'K_mid', 'F_mid'];
      const tier3 = ['C_low'];

      tier1.forEach(tag => insertPomodorosForTag(db, tag, 1, 1000, '2026-06-10T12:00:00.000Z'));
      tier2.forEach(tag => insertPomodorosForTag(db, tag, 1, 500, '2026-06-10T12:00:00.000Z'));
      tier3.forEach(tag => insertPomodorosForTag(db, tag, 1, 100, '2026-06-10T12:00:00.000Z'));

      const expectedOrder = [
        ...tier1.sort(),
        ...tier2.sort(),
        ...tier3.sort()
      ];

      const all = service.getStatsByTag({ limit: 100, offset: 0 });
      expect(all.map(r => r.tag)).toEqual(expectedOrder);

      const pageSize = 2;
      const pagedTags = [];
      for (let offset = 0; offset < expectedOrder.length; offset += pageSize) {
        const page = service.getStatsByTag({ limit: pageSize, offset });
        page.forEach(r => pagedTags.push(r.tag));
      }

      expect(pagedTags).toEqual(expectedOrder);
      const uniquePaged = [...new Set(pagedTags)];
      expect(uniquePaged.length).toBe(pagedTags.length);
    });
  });
});

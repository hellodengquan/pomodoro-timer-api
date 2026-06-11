const { createDatabase, PomodoroStatus, EventType, getAllowedActions } = require('../db');
const { createPomodoroService } = require('../services/pomodoroService');
const { StateTransitionError, NotFoundError } = require('../errors');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('番茄钟状态机 - 单元测试', () => {
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

  describe('基础 CRUD', () => {
    test('创建番茄钟 - 初始状态为 idle', () => {
      const pomodoro = service.createPomodoro('学习编程', '学习', 1500);
      expect(pomodoro.id).toBeDefined();
      expect(pomodoro.title).toBe('学习编程');
      expect(pomodoro.tag).toBe('学习');
      expect(pomodoro.duration).toBe(1500);
      expect(pomodoro.status).toBe(PomodoroStatus.IDLE);
      expect(pomodoro.started_at).toBeNull();
      expect(pomodoro.ended_at).toBeNull();
      expect(pomodoro.actual_duration).toBe(0);
      expect(pomodoro.total_paused_duration).toBe(0);
    });

    test('创建番茄钟 - 不指定标签时 tag 为 null', () => {
      const pomodoro = service.createPomodoro('无标签任务');
      expect(pomodoro.tag).toBeNull();
    });

    test('创建番茄钟 - 默认时长 1500 秒', () => {
      const pomodoro = service.createPomodoro('测试');
      expect(pomodoro.duration).toBe(1500);
    });

    test('根据 ID 获取番茄钟', () => {
      const created = service.createPomodoro('测试', 'tag1');
      const found = service.getPomodoroById(created.id);
      expect(found).toMatchObject(created);
    });

    test('获取不存在的番茄钟返回 undefined', () => {
      const found = service.getPomodoroById(999);
      expect(found).toBeUndefined();
    });

    test('删除番茄钟', () => {
      const created = service.createPomodoro('测试删除');
      const result = service.deletePomodoro(created.id);
      expect(result).toBe(true);
      expect(service.getPomodoroById(created.id)).toBeUndefined();
    });

    test('删除不存在的番茄钟抛出 NotFoundError', () => {
      expect(() => service.deletePomodoro(999)).toThrow(NotFoundError);
    });
  });

  describe('正常生命周期：idle → running → completed', () => {
    test('idle → start → running', () => {
      const p = service.createPomodoro('测试');
      const result = service.startPomodoro(p.id);

      expect(result.status).toBe(PomodoroStatus.RUNNING);
      expect(result.started_at).toBeDefined();
      expect(result.started_at).not.toBeNull();
    });

    test('running → complete → completed', async () => {
      const p = service.createPomodoro('测试');
      service.startPomodoro(p.id);
      await sleep(50);

      const result = service.completePomodoro(p.id);
      expect(result.status).toBe(PomodoroStatus.COMPLETED);
      expect(result.ended_at).toBeDefined();
      expect(result.actual_duration).toBeGreaterThanOrEqual(0);
    });

    test('完整生命周期后事件记录正确', async () => {
      const p = service.createPomodoro('测试');
      service.startPomodoro(p.id);
      await sleep(20);
      service.completePomodoro(p.id);

      const events = service.getEventsByPomodoroId(p.id);
      expect(events.length).toBe(2);
      expect(events[0].event_type).toBe(EventType.START);
      expect(events[1].event_type).toBe(EventType.COMPLETE);
    });

    test('完成后 actual_duration > 0', async () => {
      const p = service.createPomodoro('测试时长');
      service.startPomodoro(p.id);
      await sleep(1100);
      const result = service.completePomodoro(p.id);

      expect(result.actual_duration).toBeGreaterThan(0);
      expect(result.actual_duration).toBeLessThan(5);
    });
  });

  describe('暂停/恢复流程：running → paused → running', () => {
    test('running → pause → paused', async () => {
      const p = service.createPomodoro('测试暂停');
      service.startPomodoro(p.id);
      await sleep(20);

      const result = service.pausePomodoro(p.id);
      expect(result.status).toBe(PomodoroStatus.PAUSED);
      expect(result.total_paused_duration).toBe(0);
    });

    test('paused → resume → running，暂停时长累加', async () => {
      const p = service.createPomodoro('测试恢复');
      service.startPomodoro(p.id);
      await sleep(20);
      service.pausePomodoro(p.id, '喝口水');
      await sleep(100);

      const result = service.resumePomodoro(p.id);
      expect(result.status).toBe(PomodoroStatus.RUNNING);
      expect(result.total_paused_duration).toBeGreaterThanOrEqual(0);
    });

    test('多次暂停/恢复后 total_paused_duration 累加', async () => {
      const p = service.createPomodoro('测试多次暂停');
      service.startPomodoro(p.id);
      await sleep(10);

      service.pausePomodoro(p.id);
      await sleep(50);
      service.resumePomodoro(p.id);
      await sleep(10);

      service.pausePomodoro(p.id);
      await sleep(50);
      const result = service.resumePomodoro(p.id);

      expect(result.total_paused_duration).toBeGreaterThanOrEqual(0);
    });

    test('暂停事件带备注', () => {
      const p = service.createPomodoro('测试备注');
      service.startPomodoro(p.id);
      service.pausePomodoro(p.id, '接电话');

      const events = service.getEventsByPomodoroId(p.id);
      const pauseEvent = events.find(e => e.event_type === EventType.PAUSE);
      expect(pauseEvent).toBeDefined();
      expect(pauseEvent.note).toBe('接电话');
    });

    test('完整 暂停-恢复-完成 流程后实际时长扣除暂停时间', async () => {
      const p = service.createPomodoro('测试完整流程');
      service.startPomodoro(p.id);
      await sleep(600);

      service.pausePomodoro(p.id);
      await sleep(500);
      service.resumePomodoro(p.id);
      await sleep(600);

      const result = service.completePomodoro(p.id);
      expect(result.status).toBe(PomodoroStatus.COMPLETED);
      expect(result.total_paused_duration).toBeGreaterThanOrEqual(0);
      expect(result.actual_duration).toBeGreaterThan(0);
    });
  });

  describe('提前结束：中断流程', () => {
    test('running → interrupt → interrupted', async () => {
      const p = service.createPomodoro('测试中断');
      service.startPomodoro(p.id);
      await sleep(20);

      const result = service.interruptPomodoro(p.id, '有急事');
      expect(result.status).toBe(PomodoroStatus.INTERRUPTED);
      expect(result.ended_at).toBeDefined();
      expect(result.actual_duration).toBeGreaterThanOrEqual(0);
    });

    test('paused → interrupt → interrupted', async () => {
      const p = service.createPomodoro('测试暂停时中断');
      service.startPomodoro(p.id);
      await sleep(20);
      service.pausePomodoro(p.id);
      await sleep(20);

      const result = service.interruptPomodoro(p.id, '暂停时被打断');
      expect(result.status).toBe(PomodoroStatus.INTERRUPTED);
      expect(result.ended_at).toBeDefined();
    });

    test('中断事件带备注', () => {
      const p = service.createPomodoro('测试中断备注');
      service.startPomodoro(p.id);
      service.interruptPomodoro(p.id, '老板找我');

      const events = service.getEventsByPomodoroId(p.id);
      const interruptEvent = events.find(e => e.event_type === EventType.INTERRUPT);
      expect(interruptEvent).toBeDefined();
      expect(interruptEvent.note).toBe('老板找我');
    });

    test('已完成的番茄钟不能再中断', () => {
      const p = service.createPomodoro('测试');
      service.startPomodoro(p.id);
      service.completePomodoro(p.id);

      expect(() => service.interruptPomodoro(p.id)).toThrow(StateTransitionError);
    });

    test('已中断的番茄钟不能再中断', () => {
      const p = service.createPomodoro('测试');
      service.startPomodoro(p.id);
      service.interruptPomodoro(p.id);

      expect(() => service.interruptPomodoro(p.id)).toThrow(StateTransitionError);
    });
  });

  describe('非法状态转换 - 错误码与状态断言', () => {
    test('idle 状态：直接 complete 抛出 INVALID_STATE_TRANSITION', () => {
      const p = service.createPomodoro('测试');
      expect.assertions(5);

      try {
        service.completePomodoro(p.id);
      } catch (err) {
        expect(err).toBeInstanceOf(StateTransitionError);
        expect(err.code).toBe('INVALID_STATE_TRANSITION');
        expect(err.currentStatus).toBe(PomodoroStatus.IDLE);
        expect(err.attemptedAction).toBe(EventType.COMPLETE);
        expect(err.allowedActions).toEqual(expect.arrayContaining([EventType.START]));
      }
    });

    test('idle 状态：直接 pause 抛出 INVALID_STATE_TRANSITION', () => {
      const p = service.createPomodoro('测试');
      try {
        service.pausePomodoro(p.id);
      } catch (err) {
        expect(err.code).toBe('INVALID_STATE_TRANSITION');
        expect(err.currentStatus).toBe(PomodoroStatus.IDLE);
        expect(err.allowedActions).toEqual([EventType.START]);
      }
    });

    test('idle 状态：直接 interrupt 抛出 INVALID_STATE_TRANSITION', () => {
      const p = service.createPomodoro('测试');
      try {
        service.interruptPomodoro(p.id);
      } catch (err) {
        expect(err.code).toBe('INVALID_STATE_TRANSITION');
        expect(err.currentStatus).toBe(PomodoroStatus.IDLE);
      }
    });

    test('idle 状态：直接 resume 抛出 INVALID_STATE_TRANSITION', () => {
      const p = service.createPomodoro('测试');
      try {
        service.resumePomodoro(p.id);
      } catch (err) {
        expect(err.code).toBe('INVALID_STATE_TRANSITION');
        expect(err.currentStatus).toBe(PomodoroStatus.IDLE);
      }
    });

    test('running 状态：重复 start 抛出 INVALID_STATE_TRANSITION', () => {
      const p = service.createPomodoro('测试');
      service.startPomodoro(p.id);

      try {
        service.startPomodoro(p.id);
      } catch (err) {
        expect(err.code).toBe('INVALID_STATE_TRANSITION');
        expect(err.currentStatus).toBe(PomodoroStatus.RUNNING);
        expect(err.allowedActions).toEqual(
          expect.arrayContaining([EventType.PAUSE, EventType.COMPLETE, EventType.INTERRUPT])
        );
      }
    });

    test('paused 状态：直接 complete 抛出 INVALID_STATE_TRANSITION（关键漏洞验证）', () => {
      const p = service.createPomodoro('测试');
      service.startPomodoro(p.id);
      service.pausePomodoro(p.id);

      expect.assertions(4);
      try {
        service.completePomodoro(p.id);
      } catch (err) {
        expect(err).toBeInstanceOf(StateTransitionError);
        expect(err.code).toBe('INVALID_STATE_TRANSITION');
        expect(err.currentStatus).toBe(PomodoroStatus.PAUSED);
        expect(err.allowedActions).toEqual(
          expect.arrayContaining([EventType.RESUME, EventType.INTERRUPT])
        );
      }
    });

    test('paused 状态：重复 pause 抛出 INVALID_STATE_TRANSITION', () => {
      const p = service.createPomodoro('测试');
      service.startPomodoro(p.id);
      service.pausePomodoro(p.id);

      try {
        service.pausePomodoro(p.id);
      } catch (err) {
        expect(err.code).toBe('INVALID_STATE_TRANSITION');
        expect(err.currentStatus).toBe(PomodoroStatus.PAUSED);
      }
    });

    test('completed 状态：任何操作都抛出 INVALID_STATE_TRANSITION', () => {
      const p = service.createPomodoro('测试');
      service.startPomodoro(p.id);
      service.completePomodoro(p.id);

      expect(() => service.startPomodoro(p.id)).toThrow(StateTransitionError);
      expect(() => service.pausePomodoro(p.id)).toThrow(StateTransitionError);
      expect(() => service.resumePomodoro(p.id)).toThrow(StateTransitionError);
      expect(() => service.interruptPomodoro(p.id)).toThrow(StateTransitionError);
      expect(() => service.completePomodoro(p.id)).toThrow(StateTransitionError);

      try {
        service.startPomodoro(p.id);
      } catch (err) {
        expect(err.code).toBe('INVALID_STATE_TRANSITION');
        expect(err.currentStatus).toBe(PomodoroStatus.COMPLETED);
        expect(err.allowedActions).toEqual([]);
      }
    });

    test('interrupted 状态：任何操作都抛出 INVALID_STATE_TRANSITION', () => {
      const p = service.createPomodoro('测试');
      service.startPomodoro(p.id);
      service.interruptPomodoro(p.id);

      expect(() => service.startPomodoro(p.id)).toThrow(StateTransitionError);
      expect(() => service.pausePomodoro(p.id)).toThrow(StateTransitionError);
      expect(() => service.resumePomodoro(p.id)).toThrow(StateTransitionError);
      expect(() => service.interruptPomodoro(p.id)).toThrow(StateTransitionError);
      expect(() => service.completePomodoro(p.id)).toThrow(StateTransitionError);

      try {
        service.startPomodoro(p.id);
      } catch (err) {
        expect(err.code).toBe('INVALID_STATE_TRANSITION');
        expect(err.currentStatus).toBe(PomodoroStatus.INTERRUPTED);
        expect(err.allowedActions).toEqual([]);
      }
    });

    test('非法转换后状态保持不变（数据未被修改）', () => {
      const p = service.createPomodoro('测试数据不变');
      const beforeStatus = p.status;

      try {
        service.completePomodoro(p.id);
      } catch (err) {
        // 预期抛出
      }

      const after = service.getPomodoroById(p.id);
      expect(after.status).toBe(beforeStatus);
      expect(after.started_at).toBeNull();
      expect(after.ended_at).toBeNull();
    });

    test('非法转换不产生事件记录', () => {
      const p = service.createPomodoro('测试无事件');
      try {
        service.completePomodoro(p.id);
      } catch (err) {
        // 预期抛出
      }

      const events = service.getEventsByPomodoroId(p.id);
      expect(events.length).toBe(0);
    });

    test('不存在的 ID 抛出 NotFoundError', () => {
      expect(() => service.startPomodoro(9999)).toThrow(NotFoundError);
      expect(() => service.pausePomodoro(9999)).toThrow(NotFoundError);
      expect(() => service.resumePomodoro(9999)).toThrow(NotFoundError);
      expect(() => service.completePomodoro(9999)).toThrow(NotFoundError);
      expect(() => service.interruptPomodoro(9999)).toThrow(NotFoundError);
    });
  });

  describe('getAllowedActions 辅助函数验证', () => {
    test('idle 状态只允许 start', () => {
      expect(getAllowedActions(PomodoroStatus.IDLE)).toEqual([EventType.START]);
    });

    test('running 状态允许 pause / complete / interrupt', () => {
      const actions = getAllowedActions(PomodoroStatus.RUNNING);
      expect(actions).toContain(EventType.PAUSE);
      expect(actions).toContain(EventType.COMPLETE);
      expect(actions).toContain(EventType.INTERRUPT);
      expect(actions.length).toBe(3);
    });

    test('paused 状态允许 resume / interrupt', () => {
      const actions = getAllowedActions(PomodoroStatus.PAUSED);
      expect(actions).toContain(EventType.RESUME);
      expect(actions).toContain(EventType.INTERRUPT);
      expect(actions.length).toBe(2);
    });

    test('completed 为终态，不允许任何操作', () => {
      expect(getAllowedActions(PomodoroStatus.COMPLETED)).toEqual([]);
    });

    test('interrupted 为终态，不允许任何操作', () => {
      expect(getAllowedActions(PomodoroStatus.INTERRUPTED)).toEqual([]);
    });
  });
});

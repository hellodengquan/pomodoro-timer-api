const express = require('express');
const router = express.Router();
const pomodoroService = require('../services/pomodoroService');
const { StateTransitionError, NotFoundError } = require('../errors');
const { getAllowedActions } = require('../db');

router.post('/', (req, res) => {
  try {
    const { title, tag, duration } = req.body;
    if (!title) {
      return res.status(400).json({ error: '标题不能为空', code: 'VALIDATION_ERROR' });
    }
    const pomodoro = pomodoroService.createPomodoro(title, tag, duration);
    res.status(201).json(pomodoro);
  } catch (err) {
    if (err instanceof StateTransitionError) {
      return res.status(409).json(err.toJSON());
    }
    if (err instanceof NotFoundError) {
      return res.status(404).json(err.toJSON());
    }
    res.status(400).json({ error: err.message, code: 'BAD_REQUEST' });
  }
});

router.get('/', (req, res) => {
  try {
    const { tag, status, limit, offset } = req.query;
    const options = {};
    if (tag) options.tag = tag;
    if (status) options.status = status;
    if (limit) options.limit = parseInt(limit);
    if (offset) options.offset = parseInt(offset);

    const pomodoros = pomodoroService.getAllPomodoros(options);
    res.json(pomodoros);
  } catch (err) {
    res.status(400).json({ error: err.message, code: 'BAD_REQUEST' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const pomodoro = pomodoroService.getPomodoroById(req.params.id);
    if (!pomodoro) {
      return res.status(404).json({ error: '番茄钟不存在', code: 'NOT_FOUND' });
    }
    res.json({
      ...pomodoro,
      allowed_actions: getAllowedActions(pomodoro.status)
    });
  } catch (err) {
    if (err instanceof StateTransitionError) {
      return res.status(409).json(err.toJSON());
    }
    res.status(400).json({ error: err.message, code: 'BAD_REQUEST' });
  }
});

router.get('/:id/events', (req, res) => {
  try {
    const events = pomodoroService.getEventsByPomodoroId(req.params.id);
    res.json(events);
  } catch (err) {
    res.status(400).json({ error: err.message, code: 'BAD_REQUEST' });
  }
});

router.post('/:id/start', (req, res) => {
  try {
    const pomodoro = pomodoroService.startPomodoro(req.params.id);
    res.json({
      ...pomodoro,
      allowed_actions: getAllowedActions(pomodoro.status)
    });
  } catch (err) {
    if (err instanceof StateTransitionError) {
      return res.status(409).json(err.toJSON());
    }
    if (err instanceof NotFoundError) {
      return res.status(404).json(err.toJSON());
    }
    res.status(400).json({ error: err.message, code: 'BAD_REQUEST' });
  }
});

router.post('/:id/pause', (req, res) => {
  try {
    const { note } = req.body || {};
    const pomodoro = pomodoroService.pausePomodoro(req.params.id, note);
    res.json({
      ...pomodoro,
      allowed_actions: getAllowedActions(pomodoro.status)
    });
  } catch (err) {
    if (err instanceof StateTransitionError) {
      return res.status(409).json(err.toJSON());
    }
    if (err instanceof NotFoundError) {
      return res.status(404).json(err.toJSON());
    }
    res.status(400).json({ error: err.message, code: 'BAD_REQUEST' });
  }
});

router.post('/:id/resume', (req, res) => {
  try {
    const pomodoro = pomodoroService.resumePomodoro(req.params.id);
    res.json({
      ...pomodoro,
      allowed_actions: getAllowedActions(pomodoro.status)
    });
  } catch (err) {
    if (err instanceof StateTransitionError) {
      return res.status(409).json(err.toJSON());
    }
    if (err instanceof NotFoundError) {
      return res.status(404).json(err.toJSON());
    }
    res.status(400).json({ error: err.message, code: 'BAD_REQUEST' });
  }
});

router.post('/:id/interrupt', (req, res) => {
  try {
    const { note } = req.body || {};
    const pomodoro = pomodoroService.interruptPomodoro(req.params.id, note);
    res.json({
      ...pomodoro,
      allowed_actions: getAllowedActions(pomodoro.status)
    });
  } catch (err) {
    if (err instanceof StateTransitionError) {
      return res.status(409).json(err.toJSON());
    }
    if (err instanceof NotFoundError) {
      return res.status(404).json(err.toJSON());
    }
    res.status(400).json({ error: err.message, code: 'BAD_REQUEST' });
  }
});

router.post('/:id/complete', (req, res) => {
  try {
    const pomodoro = pomodoroService.completePomodoro(req.params.id);
    res.json({
      ...pomodoro,
      allowed_actions: getAllowedActions(pomodoro.status)
    });
  } catch (err) {
    if (err instanceof StateTransitionError) {
      return res.status(409).json(err.toJSON());
    }
    if (err instanceof NotFoundError) {
      return res.status(404).json(err.toJSON());
    }
    res.status(400).json({ error: err.message, code: 'BAD_REQUEST' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    pomodoroService.deletePomodoro(req.params.id);
    res.json({ message: '删除成功' });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return res.status(404).json(err.toJSON());
    }
    res.status(400).json({ error: err.message, code: 'BAD_REQUEST' });
  }
});

module.exports = router;

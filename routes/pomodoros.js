const express = require('express');
const router = express.Router();
const pomodoroService = require('../services/pomodoroService');

router.post('/', (req, res) => {
  try {
    const { title, tag, duration } = req.body;
    if (!title) {
      return res.status(400).json({ error: '标题不能为空' });
    }
    const pomodoro = pomodoroService.createPomodoro(title, tag, duration);
    res.status(201).json(pomodoro);
  } catch (err) {
    res.status(400).json({ error: err.message });
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
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const pomodoro = pomodoroService.getPomodoroById(req.params.id);
    if (!pomodoro) {
      return res.status(404).json({ error: '番茄钟不存在' });
    }
    res.json(pomodoro);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/events', (req, res) => {
  try {
    const events = pomodoroService.getEventsByPomodoroId(req.params.id);
    res.json(events);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/start', (req, res) => {
  try {
    const pomodoro = pomodoroService.startPomodoro(req.params.id);
    res.json(pomodoro);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/pause', (req, res) => {
  try {
    const { note } = req.body;
    const pomodoro = pomodoroService.pausePomodoro(req.params.id, note);
    res.json(pomodoro);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/resume', (req, res) => {
  try {
    const pomodoro = pomodoroService.resumePomodoro(req.params.id);
    res.json(pomodoro);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/interrupt', (req, res) => {
  try {
    const { note } = req.body;
    const pomodoro = pomodoroService.interruptPomodoro(req.params.id, note);
    res.json(pomodoro);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/complete', (req, res) => {
  try {
    const pomodoro = pomodoroService.completePomodoro(req.params.id);
    res.json(pomodoro);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    pomodoroService.deletePomodoro(req.params.id);
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;

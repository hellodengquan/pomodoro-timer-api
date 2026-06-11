const express = require('express');
const router = express.Router();
const pomodoroService = require('../services/pomodoroService');

router.get('/by-tag', (req, res) => {
  try {
    const { startDate, endDate, limit, offset } = req.query;
    const options = {};
    if (startDate) options.startDate = startDate;
    if (endDate) options.endDate = endDate;
    if (limit !== undefined) {
      const parsed = parseInt(limit, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) options.limit = parsed;
    }
    if (offset !== undefined) {
      const parsed = parseInt(offset, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) options.offset = parsed;
    }

    const stats = pomodoroService.getStatsByTag(options);
    res.json(stats);
  } catch (err) {
    res.status(400).json({ error: err.message, code: 'BAD_REQUEST' });
  }
});

router.get('/overall', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const options = {};
    if (startDate) options.startDate = startDate;
    if (endDate) options.endDate = endDate;
    
    const stats = pomodoroService.getOverallStats(options);
    res.json(stats);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;

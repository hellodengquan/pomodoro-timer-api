const express = require('express');
const router = express.Router();
const pomodoroService = require('../services/pomodoroService');

router.get('/by-tag', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const options = {};
    if (startDate) options.startDate = startDate;
    if (endDate) options.endDate = endDate;
    
    const stats = pomodoroService.getStatsByTag(options);
    res.json(stats);
  } catch (err) {
    res.status(400).json({ error: err.message });
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

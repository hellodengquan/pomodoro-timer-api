const express = require('express');
const { initDatabase } = require('./db');
const pomodorosRouter = require('./routes/pomodoros');
const statsRouter = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

initDatabase();

app.use(express.json());

app.use('/api/pomodoros', pomodorosRouter);
app.use('/api/stats', statsRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '番茄钟 API 运行正常' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '服务器内部错误' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`番茄钟 API 服务器运行在 http://localhost:${PORT}`);
  });
}

module.exports = app;

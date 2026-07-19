const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cfg = require('./config');
require('./db'); // initializes schema + fallback admin
const { startCron } = require('./cron');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/uploads', express.static(cfg.UPLOADS_DIR, { maxAge: '7d' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/approvals', require('./routes/approvals'));
app.use('/api/users', require('./routes/users'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/notices', require('./routes/notices'));
app.use('/api/dues', require('./routes/dues'));
app.use('/api/extensions', require('./routes/extensions'));
app.use('/api/automations', require('./routes/automations'));
app.use('/api/classifieds', require('./routes/classifieds'));
app.use('/api/lostfound', require('./routes/lostfound'));
app.use('/api/events', require('./routes/events'));
app.use('/api/gallery', require('./routes/gallery'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built React app (single-process deployment).
const dist = path.join(cfg.ROOT, 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Photo must be under 5 MB' : err.message;
    return res.status(400).json({ error: msg });
  }
  console.error(err);
  res.status(err && err.message === 'Only image uploads are allowed' ? 400 : 500).json({
    error: err && err.message ? err.message : 'Something went wrong',
  });
});

app.listen(cfg.PORT, () => {
  console.log(`My Suncity Vistaar server running on http://localhost:${cfg.PORT}`);
  startCron();
});

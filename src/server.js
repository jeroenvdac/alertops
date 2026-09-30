require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const ALERTOPS_BASE = 'https://app.alertops.com/api/v2';
const GROUP_ID = process.env.GROUP_ID;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

function alertopsHeaders(apiKey) {
  return { 'api-key': apiKey, 'Content-Type': 'application/json' };
}

async function proxyRequest(req, res, method, path, body) {
  const apiKey = req.headers['x-alertops-key'];
  if (!apiKey) return res.status(401).json({ error: 'No API key provided' });
  try {
    const options = { method, headers: alertopsHeaders(apiKey) };
    if (body !== undefined) options.body = JSON.stringify(body);
    const upstream = await fetch(`${ALERTOPS_BASE}${path}`, options);
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Upstream request failed', detail: err.message });
  }
}

// GET /api/config
app.get('/api/config', (req, res) => {
  res.json({ groupId: GROUP_ID });
});

// GET /api/schedules → GET /schedules/:groupId
app.get('/api/schedules', (req, res) => {
  proxyRequest(req, res, 'GET', `/schedules/${GROUP_ID}`);
});

// GET /api/members → GET /groups/:groupId/members
app.get('/api/members', (req, res) => {
  proxyRequest(req, res, 'GET', `/groups/${GROUP_ID}/members`);
});

// POST /api/schedules → POST /schedules
app.post('/api/schedules', (req, res) => {
  proxyRequest(req, res, 'POST', '/schedules', req.body);
});

// PUT /api/schedules/:id → PUT /schedules/:groupId/:id
app.put('/api/schedules/:id', (req, res) => {
  proxyRequest(req, res, 'PUT', `/schedules/${GROUP_ID}/${req.params.id}`, req.body);
});

// DELETE /api/schedules/:id → DELETE /schedules/:groupId/:id
app.delete('/api/schedules/:id', (req, res) => {
  proxyRequest(req, res, 'DELETE', `/schedules/${GROUP_ID}/${req.params.id}`);
});

// POST /api/push-am-pm → create all shifts with 200ms delay between calls
app.post('/api/push-am-pm', async (req, res) => {
  const apiKey = req.headers['x-alertops-key'];
  if (!apiKey) return res.status(401).json({ error: 'No API key provided' });

  const { shifts } = req.body;
  if (!Array.isArray(shifts) || shifts.length === 0) {
    return res.status(400).json({ error: 'shifts must be a non-empty array' });
  }

  const results = [];
  for (const shift of shifts) {
    const payload = {
      ...shift,
      description: Array.isArray(shift.description) ? shift.description : [shift.description],
      weekday: normalizeWeekday(shift.weekday),
      color: shift.color,
      timezone: '(UTC+01:00) Brussels, Copenhagen, Madrid, Paris',
    };

    try {
      const upstream = await fetch(`${ALERTOPS_BASE}/schedules`, {
        method: 'POST',
        headers: alertopsHeaders(apiKey),
        body: JSON.stringify(payload),
      });
      const text = await upstream.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      results.push({ status: upstream.status, data });
    } catch (err) {
      results.push({ status: 502, error: err.message });
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  res.json({ results });
});

app.listen(PORT, () => {
  console.log(`AlertOps proxy listening on port ${PORT}`);
});

function normalizeWeekday(day) {
  if (!day) return day;
  const map = {
    monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
    thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
  };
  return map[day.toLowerCase()] ?? day;
}

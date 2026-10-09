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


app.get("/api/ooo/:userId", (req, res) => {
  proxyRequest(req, res, "GET", "/users/" + req.params.userId + "/out_of_office");
});
app.post("/api/ooo/:userId", (req, res) => {
  proxyRequest(req, res, "POST", "/users/" + req.params.userId + "/out_of_office", req.body);
});
app.delete("/api/ooo/:userId/:oooId", (req, res) => {
  proxyRequest(req, res, "DELETE", "/users/" + req.params.userId + "/out_of_office/" + req.params.oooId);
});

// POST /api/v3/login → POST https://app.alertops.com/api/v2/auth/login
app.post('/api/v3/login', async (req, res) => {
  try {
    const upstream = await fetch('https://app.alertops.com/api/v2/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Login failed', detail: err.message });
  }
});

// GET /api/v3/ooo → GET https://app.alertops.com/api/v3/users/out_of_office
app.get('/api/v3/ooo', async (req, res) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const qs = new URLSearchParams(req.query).toString();
    const upstream = await fetch(`https://app.alertops.com/api/v3/users/out_of_office?${qs}`, {
      headers: { 'Authorization': token }
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'OOO fetch failed', detail: err.message });
  }
});

// GET /api/v3/me → haal user_api_key op via JWT
app.get('/api/v3/me', async (req, res) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'No token' });
  const username = req.query.username;
  if (!username) return res.status(400).json({ error: 'No username' });
  try {
    const userId = req.query.user_id;
    const path = userId ? userId : encodeURIComponent(username);
    const upstream = await fetch(`https://app.alertops.com/api/v2/users/${path}`, {
      headers: {
        'Authorization': token,
        'Referer': `https://app.alertops.com/acn-cloudfirst/users/edit/${path}`,
        'Accept': 'application/json, text/plain, */*'
      }
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'User fetch failed', detail: err.message });
  }
});


app.listen(PORT, () => {
  console.log(`AlertOps proxy listening on port ${PORT}`);
});

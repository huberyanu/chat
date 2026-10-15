const GROUP_PASSWORDS = {
  '1': 'CHAT_GROUP_1_PASSWORD',
  '2': 'CHAT_GROUP_2_PASSWORD',
  '3': 'CHAT_GROUP_3_PASSWORD',
};

const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_REQUEST_BYTES = 1_500_000;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function groupPassword(env, groupId) {
  const key = GROUP_PASSWORDS[groupId];
  return key ? env[key] : undefined;
}

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function isAuthorized(request, env, groupId) {
  return constantTimeEqual(request.headers.get('X-Group-Password'), groupPassword(env, groupId));
}

async function handleUnlock(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Ungültige Anfrage.' }, 400);
  }

  const expected = groupPassword(env, String(body.group));
  if (expected && constantTimeEqual(body.password, expected)) return json({ ok: true });
  return json({ error: 'Das Passwort stimmt nicht.' }, 401);
}

async function handleMessages(request, env, url) {
  const groupId = url.searchParams.get('group');
  if (!GROUP_PASSWORDS[groupId] || !isAuthorized(request, env, groupId)) {
    return json({ error: 'Gruppe gesperrt.' }, 401);
  }

  if (request.method === 'GET') {
    const after = Math.max(0, Number.parseInt(url.searchParams.get('after') || '0', 10) || 0);
    const result = await env.DB.prepare(
      'SELECT id, group_id, sender, body, image_data, created_at FROM messages WHERE group_id = ? AND id > ? ORDER BY id LIMIT 100',
    ).bind(groupId, after).all();

    return json({
      messages: result.results.map((row) => ({
        id: row.id,
        group: row.group_id,
        sender: row.sender,
        text: row.body,
        image: row.image_data,
        time: row.created_at,
      })),
    });
  }

  if (request.method !== 'POST') return json({ error: 'Methode nicht erlaubt.' }, 405);

  const contentLength = Number(request.headers.get('Content-Length') || '0');
  if (contentLength > MAX_REQUEST_BYTES) {
    return json({ error: 'Das Bild darf höchstens 1 MB groß sein.' }, 413);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Ungültige Nachricht.' }, 400);
  }

  const sender = String(body.sender || 'Gast').trim().slice(0, 32) || 'Gast';
  const text = String(body.text || '').trim();
  const image = String(body.image || '');
  if (text.length > 2000) return json({ error: 'Nachrichten dürfen höchstens 2000 Zeichen enthalten.' }, 400);

  if (image) {
    const match = image.match(/^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) return json({ error: 'Dieses Bildformat wird nicht unterstützt.' }, 400);
    const decodedLength = Math.floor(match[2].length * 3 / 4) - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
    if (decodedLength > MAX_IMAGE_BYTES) return json({ error: 'Das Bild darf höchstens 1 MB groß sein.' }, 413);
  }

  if (!text && !image) return json({ error: 'Schreibe eine Nachricht oder wähle ein Bild aus.' }, 400);

  const createdAt = new Date().toISOString();
  const result = await env.DB.prepare(
    'INSERT INTO messages (group_id, sender, body, image_data, created_at) VALUES (?, ?, ?, ?, ?)',
  ).bind(groupId, sender, text, image, createdAt).run();

  return json({
    message: {
      id: result.meta.last_row_id,
      group: groupId,
      sender,
      text,
      image,
      time: createdAt,
    },
  }, 201);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/unlock' && request.method === 'POST') {
      return handleUnlock(request, env);
    }
    if (url.pathname === '/api/messages') return handleMessages(request, env, url);
    if (url.pathname.startsWith('/api/')) return json({ error: 'API-Endpunkt nicht gefunden.' }, 404);
    return env.ASSETS.fetch(request);
  },
};
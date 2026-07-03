async function handle(res) {
  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    const err = new Error('reconnect');
    err.reconnect = !!data.reconnect || true;
    throw err;
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.issues = data.issues;
    throw err;
  }
  return res;
}

export async function getJson(path) {
  const res = await handle(await fetch(path, { credentials: 'same-origin' }));
  return res.json();
}

export async function postJson(path, body) {
  const res = await handle(
    await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    })
  );
  return res.json();
}

/** PDF 등 바이너리 응답. { blob, templateFallback } 반환. */
export async function postBlob(path, body) {
  const res = await handle(
    await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    })
  );
  return { blob: await res.blob(), templateFallback: res.headers.get('X-Template-Fallback') === '1' };
}

export async function del(path) {
  const res = await handle(await fetch(path, { method: 'DELETE', credentials: 'same-origin' }));
  return res.json();
}

export async function putJson(path, body) {
  const res = await handle(
    await fetch(path, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    })
  );
  return res.json();
}

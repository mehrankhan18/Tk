import { neon } from '@neondatabase/serverless';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { seedProducts } from '../server/products.js';

const scrypt = promisify(scryptCallback);
const customerCookie = 'tk_tech_session';
const adminCookie = 'tk_tech_admin_session';
const customerSessionMs = 30 * 24 * 60 * 60 * 1000;
const adminSessionMs = 8 * 60 * 60 * 1000;
const authAttempts = new Map();
let schemaPromise;

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  return neon(process.env.DATABASE_URL);
}

async function ensureSchema(sql) {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
      await sql`CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, brand TEXT NOT NULL, category TEXT NOT NULL, note TEXT NOT NULL, price INTEGER NOT NULL CHECK (price > 0), image TEXT NOT NULL DEFAULT '', specs JSONB NOT NULL, is_custom BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
      await sql`CREATE INDEX IF NOT EXISTS products_category_idx ON products(category)`;
      await sql`CREATE TABLE IF NOT EXISTS newsletter_subscribers (id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL, subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS newsletter_email_lower_idx ON newsletter_subscribers (LOWER(email))`;
      await sql`CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS customers_email_lower_idx ON customers (LOWER(email))`;
      await sql`CREATE TABLE IF NOT EXISTS customer_sessions (token_hash TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE, expires_at BIGINT NOT NULL)`;
      await sql`CREATE INDEX IF NOT EXISTS customer_sessions_expiry_idx ON customer_sessions(expires_at)`;
      await sql`CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, username TEXT NOT NULL, expires_at BIGINT NOT NULL)`;
      await sql`CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions(expires_at)`;

      const seeded = await sql`SELECT value FROM app_metadata WHERE key = 'catalog_seed_complete'`;
      if (!seeded.length) {
        for (const product of seedProducts) {
          await sql`INSERT INTO products (id, name, brand, category, note, price, image, specs, is_custom) VALUES (${product.id}, ${product.name}, ${product.brand}, ${product.category}, ${product.note}, ${product.price}, ${product.image}, ${JSON.stringify(product.specs)}::jsonb, FALSE) ON CONFLICT (id) DO NOTHING`;
        }
        await sql`INSERT INTO app_metadata (key, value) VALUES ('catalog_seed_complete', 'true') ON CONFLICT (key) DO NOTHING`;
      }
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: row.category,
    note: row.note,
    price: Number(row.price),
    image: row.image,
    specs: Array.isArray(row.specs) ? row.specs : JSON.parse(row.specs),
    custom: Boolean(row.is_custom),
  };
}

function requestBody(request) {
  if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === 'string') {
    try { return JSON.parse(request.body); } catch { return {}; }
  }
  if (Buffer.isBuffer(request.body)) {
    try { return JSON.parse(request.body.toString('utf8')); } catch { return {}; }
  }
  return {};
}

function getCookie(request, name) {
  const cookies = request.headers.cookie?.split(';') ?? [];
  const entry = cookies.map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return entry?.slice(name.length + 1) || '';
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function setCookie(response, request, name, token, maxAge) {
  const secure = request.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${name}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(maxAge / 1000)}${secure}`);
}

function clearCookie(response, request, name) {
  const secure = request.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${name}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

function isAdminConfigured() {
  const username = process.env.TK_ADMIN_USERNAME?.trim() || '';
  const password = process.env.TK_ADMIN_PASSWORD || '';
  return username.length >= 3 && username.length <= 40 && password.length >= 12 && password.length <= 128;
}

function originIsValid(request) {
  const origin = request.headers.origin;
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const host = request.headers['x-forwarded-host'] || request.headers.host;
    const proto = request.headers['x-forwarded-proto'] || 'https';
    return url.origin === origin && `${url.protocol}//${host}` === `${proto}://${host}` && url.host === host;
  } catch {
    return false;
  }
}

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

async function verifyPassword(password, storedHash) {
  const [, saltText, keyText] = storedHash.split('$');
  if (!saltText || !keyText) return false;
  const salt = Buffer.from(saltText, 'base64url');
  const expected = Buffer.from(keyText, 'base64url');
  const actual = await scrypt(password, salt, expected.length, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(actual, expected);
}

function attemptState(key, limit, windowMs) {
  const now = Date.now();
  const current = authAttempts.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    const fresh = { startedAt: now, count: 0 };
    authAttempts.set(key, fresh);
    return fresh.count < limit ? fresh : null;
  }
  if (current.count >= limit) return null;
  return current;
}

function validateProduct(input) {
  if (
    typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 90
    || typeof input.brand !== 'string' || !input.brand.trim() || input.brand.trim().length > 40
    || !['Everyday', 'Work', 'Gaming'].includes(input.category)
    || !Number.isSafeInteger(input.price) || input.price < 1 || input.price > 1000000000
    || !Array.isArray(input.specs) || input.specs.length !== 3
    || input.specs.some((spec) => typeof spec !== 'string' || !spec.trim() || spec.length > 60)
    || (input.note !== undefined && (typeof input.note !== 'string' || input.note.length > 80))
    || (input.image !== undefined && (typeof input.image !== 'string' || input.image.length > 6_000_000))
    || (input.id !== undefined && (typeof input.id !== 'string' || input.id.length > 120))
  ) return 'Check the laptop details and try again.';

  if (input.image && !input.image.startsWith('data:image/jpeg;base64,') && !/^https:\/\//i.test(input.image)) {
    return 'Choose a valid JPEG photo or HTTPS image link.';
  }
  return '';
}

async function getSession(sql, request, cookieName, table, idColumn) {
  const token = getCookie(request, cookieName);
  if (!token) return null;
  const tokenHash = hashToken(token);
  if (table === 'admin_sessions') {
    const rows = await sql`SELECT username FROM admin_sessions WHERE token_hash = ${tokenHash} AND expires_at > ${Date.now()}`;
    if (!rows.length) await sql`DELETE FROM admin_sessions WHERE token_hash = ${tokenHash}`;
    return rows[0] ? { username: rows[0].username } : null;
  }
  const rows = await sql`SELECT customers.id, customers.name, customers.email FROM customer_sessions JOIN customers ON customers.id = customer_sessions.customer_id WHERE customer_sessions.token_hash = ${tokenHash} AND customer_sessions.expires_at > ${Date.now()}`;
  if (!rows.length) await sql`DELETE FROM customer_sessions WHERE token_hash = ${tokenHash}`;
  return rows[0] ? { id: rows[0].id, name: rows[0].name, email: rows[0].email } : null;
}

function validEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function handleRequest(request, response, sql, pathname) {
  const method = request.method || 'GET';
  const body = requestBody(request);

  if (pathname === '/health' && method === 'GET') {
    await sql`SELECT 1`;
    return sendJson(response, 200, { status: 'ok', database: 'connected' });
  }

  if (pathname === '/products' && method === 'GET') {
    const rows = await sql`SELECT id, name, brand, category, note, price, image, specs, is_custom FROM products ORDER BY created_at, id`;
    return sendJson(response, 200, rows.map(mapProduct));
  }

  if (pathname === '/admin/auth/me' && method === 'GET') {
    const admin = await getSession(sql, request, adminCookie, 'admin_sessions', 'username');
    return sendJson(response, 200, { admin, configured: isAdminConfigured() });
  }

  if (pathname === '/admin/auth/signin' && method === 'POST') {
    if (!originIsValid(request)) return sendJson(response, 403, { error: 'This request must come from the TK Tech website.' });
    if (!isAdminConfigured()) return sendJson(response, 503, { error: 'Add TK_ADMIN_USERNAME and TK_ADMIN_PASSWORD to the Vercel project environment variables, then redeploy.' });
    const attemptKey = `admin:${request.headers['x-forwarded-for'] || 'unknown'}`;
    const attempts = attemptState(attemptKey, 10, 15 * 60 * 1000);
    if (!attempts) return sendJson(response, 429, { error: 'Too many incorrect passwords. Please wait a few minutes and try again.' });
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const configuredUsername = process.env.TK_ADMIN_USERNAME.trim();
    const configuredPassword = process.env.TK_ADMIN_PASSWORD;
    const passwordMatches = timingSafeEqual(createHash('sha256').update(password).digest(), createHash('sha256').update(configuredPassword).digest());
    if (!username || username.length > 40 || !password || password.length > 128 || username.toLowerCase() !== configuredUsername.toLowerCase() || !passwordMatches) {
      attempts.count += 1;
      return sendJson(response, 401, { error: 'Admin username or password is incorrect.' });
    }
    authAttempts.delete(attemptKey);
    const token = randomBytes(32).toString('base64url');
    await sql`DELETE FROM admin_sessions WHERE expires_at <= ${Date.now()}`;
    await sql`INSERT INTO admin_sessions (token_hash, username, expires_at) VALUES (${hashToken(token)}, ${configuredUsername}, ${Date.now() + adminSessionMs})`;
    setCookie(response, request, adminCookie, token, adminSessionMs);
    return sendJson(response, 200, { admin: { username: configuredUsername } });
  }

  if (pathname === '/admin/auth/signout' && method === 'POST') {
    if (!originIsValid(request)) return sendJson(response, 403, { error: 'This request must come from the TK Tech website.' });
    const token = getCookie(request, adminCookie);
    if (token) await sql`DELETE FROM admin_sessions WHERE token_hash = ${hashToken(token)}`;
    clearCookie(response, request, adminCookie);
    response.statusCode = 204;
    return response.end();
  }

  if (pathname === '/auth/me' && method === 'GET') {
    const user = await getSession(sql, request, customerCookie, 'customer_sessions', 'customer_id');
    return sendJson(response, 200, { user });
  }

  if (pathname === '/auth/signup' && method === 'POST') {
    const attemptKey = `signup:${request.headers['x-forwarded-for'] || 'unknown'}`;
    const attempts = attemptState(attemptKey, 20, 15 * 60 * 1000);
    if (!attempts) return sendJson(response, 429, { error: 'Too many attempts. Please wait a few minutes and try again.' });
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!name || name.length > 80 || !validEmail(email) || password.length < 8 || password.length > 128) {
      return sendJson(response, 400, { error: 'Enter your name, a valid email, and a password between 8 and 128 characters.' });
    }
    const id = randomUUID();
    try {
      await sql`INSERT INTO customers (id, name, email, password_hash) VALUES (${id}, ${name}, ${email}, ${await hashPassword(password)})`;
    } catch (error) {
      if (error.code === '23505') return sendJson(response, 409, { error: 'An account with that email already exists. Sign in instead.' });
      throw error;
    }
    const token = randomBytes(32).toString('base64url');
    await sql`INSERT INTO customer_sessions (token_hash, customer_id, expires_at) VALUES (${hashToken(token)}, ${id}, ${Date.now() + customerSessionMs})`;
    setCookie(response, request, customerCookie, token, customerSessionMs);
    return sendJson(response, 201, { user: { id, name, email } });
  }

  if (pathname === '/auth/signin' && method === 'POST') {
    const attemptKey = `signin:${request.headers['x-forwarded-for'] || 'unknown'}`;
    const attempts = attemptState(attemptKey, 10, 15 * 60 * 1000);
    if (!attempts) return sendJson(response, 429, { error: 'Too many incorrect passwords. Please wait a few minutes and try again.' });
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!validEmail(email) || !password || password.length > 128) return sendJson(response, 400, { error: 'Enter a valid email address and password.' });
    const rows = await sql`SELECT id, name, email, password_hash FROM customers WHERE LOWER(email) = ${email}`;
    const hash = rows[0]?.password_hash || 'scrypt$MDEyMzQ1Njc4OWFiY2RlZg$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const matches = await verifyPassword(password, hash);
    if (!rows[0] || !matches) {
      attempts.count += 1;
      return sendJson(response, 401, { error: 'Email or password is incorrect.' });
    }
    authAttempts.delete(attemptKey);
    const token = randomBytes(32).toString('base64url');
    await sql`DELETE FROM customer_sessions WHERE expires_at <= ${Date.now()}`;
    await sql`INSERT INTO customer_sessions (token_hash, customer_id, expires_at) VALUES (${hashToken(token)}, ${rows[0].id}, ${Date.now() + customerSessionMs})`;
    setCookie(response, request, customerCookie, token, customerSessionMs);
    return sendJson(response, 200, { user: { id: rows[0].id, name: rows[0].name, email: rows[0].email } });
  }

  if (pathname === '/auth/signout' && method === 'POST') {
    const token = getCookie(request, customerCookie);
    if (token) await sql`DELETE FROM customer_sessions WHERE token_hash = ${hashToken(token)}`;
    clearCookie(response, request, customerCookie);
    response.statusCode = 204;
    return response.end();
  }

  if (pathname === '/newsletter' && method === 'POST') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!validEmail(email)) return sendJson(response, 400, { error: 'Enter a valid email address and try again.' });
    await sql`INSERT INTO newsletter_subscribers (email) VALUES (${email}) ON CONFLICT DO NOTHING`;
    return sendJson(response, 201, { subscribed: true });
  }

  if (pathname === '/products' && method === 'POST') {
    if (!originIsValid(request)) return sendJson(response, 403, { error: 'This request must come from the TK Tech website.' });
    if (!await getSession(sql, request, adminCookie, 'admin_sessions', 'username')) return sendJson(response, 401, { error: 'Sign in to the admin panel before managing products.' });
    const validationError = validateProduct(body);
    if (validationError) return sendJson(response, 400, { error: validationError });
    const id = body.id || randomUUID();
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : `NEW ${body.category.toUpperCase()} PICK`;
    try {
      await sql`INSERT INTO products (id, name, brand, category, note, price, image, specs, is_custom) VALUES (${id}, ${body.name.trim()}, ${body.brand.trim().toUpperCase()}, ${body.category}, ${note}, ${body.price}, ${body.image || ''}, ${JSON.stringify(body.specs.map((spec) => spec.trim()))}::jsonb, TRUE)`;
    } catch (error) {
      if (error.code === '23505') return sendJson(response, 409, { error: 'This laptop is already in the catalog.' });
      throw error;
    }
    const rows = await sql`SELECT id, name, brand, category, note, price, image, specs, is_custom FROM products WHERE id = ${id}`;
    return sendJson(response, 201, mapProduct(rows[0]));
  }

  const productId = pathname.startsWith('/products/') ? decodeURIComponent(pathname.slice('/products/'.length)) : '';
  if (productId && ['PUT', 'DELETE'].includes(method)) {
    if (!originIsValid(request)) return sendJson(response, 403, { error: 'This request must come from the TK Tech website.' });
    if (!await getSession(sql, request, adminCookie, 'admin_sessions', 'username')) return sendJson(response, 401, { error: 'Sign in to the admin panel before managing products.' });
    if (method === 'DELETE') {
      const rows = await sql`DELETE FROM products WHERE id = ${productId} RETURNING id`;
      if (!rows.length) return sendJson(response, 404, { error: 'Laptop was not found in the catalog.' });
      response.statusCode = 204;
      return response.end();
    }
    const existing = await sql`SELECT id, name, brand, category, note, price, image FROM products WHERE id = ${productId}`;
    if (!existing.length) return sendJson(response, 404, { error: 'Laptop was not found in the catalog.' });
    const input = { ...body, id: productId };
    const validationError = validateProduct(input);
    if (validationError) return sendJson(response, 400, { error: validationError });
    const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : `NEW ${body.category.toUpperCase()} PICK`;
    const image = body.image === undefined ? existing[0].image : body.image;
    await sql`UPDATE products SET name = ${body.name.trim()}, brand = ${body.brand.trim().toUpperCase()}, category = ${body.category}, note = ${note}, price = ${body.price}, image = ${image}, specs = ${JSON.stringify(body.specs.map((spec) => spec.trim()))}::jsonb WHERE id = ${productId}`;
    const rows = await sql`SELECT id, name, brand, category, note, price, image, specs, is_custom FROM products WHERE id = ${productId}`;
    return sendJson(response, 200, mapProduct(rows[0]));
  }

  return sendJson(response, 404, { error: 'API route was not found.' });
}

export default async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    return response.end();
  }
  const sql = getSql();
  if (!sql) return sendJson(response, 503, { error: 'Connect a Neon Postgres database to this Vercel project and set DATABASE_URL.' });

  try {
    await ensureSchema(sql);
    const requestUrl = new URL(request.url || '/api', `https://${request.headers.host || 'localhost'}`);
    const pathname = requestUrl.pathname.replace(/^\/api(?=\/|$)/, '').replace(/\/+$/, '') || '/';
    await handleRequest(request, response, sql, pathname);
  } catch (error) {
    console.error('Vercel API request failed:', error);
    if (!response.headersSent) sendJson(response, 500, { error: 'The catalog request failed. Check the Vercel API and database configuration.' });
  }
}

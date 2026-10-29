import dotenv from 'dotenv';
import express from 'express';
import Database from 'better-sqlite3';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { seedProducts } from './products.js';

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(serverDirectory, '..', '.env') });
const dataDirectory = path.resolve(process.env.TK_DATA_DIR || path.join(serverDirectory, 'data'));
const uploadDirectory = path.join(dataDirectory, 'uploads');
const databasePath = path.join(dataDirectory, 'catalog.sqlite');
const port = Number(process.env.API_PORT || 3001);
const scrypt = promisify(scryptCallback);
const sessionCookieName = 'tk_tech_session';
const sessionDurationMs = 30 * 24 * 60 * 60 * 1000;
const adminSessionCookieName = 'tk_tech_admin_session';
const adminSessionDurationMs = 8 * 60 * 60 * 1000;
const adminUsername = process.env.TK_ADMIN_USERNAME?.trim() || '';
const adminPassword = process.env.TK_ADMIN_PASSWORD || '';
const adminCredentialsConfigured = adminUsername.length >= 3 && adminUsername.length <= 40
  && adminPassword.length >= 12 && adminPassword.length <= 128;
const developmentFrontendOrigins = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://[::1]:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
  'http://[::1]:5174',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://[::1]:4173',
]);
const adminPasswordHash = adminCredentialsConfigured
  ? createHash('sha256').update(adminPassword).digest()
  : null;
const authAttempts = new Map();

await mkdir(uploadDirectory, { recursive: true });

const database = new Database(databasePath);
database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');
database.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    category TEXT NOT NULL,
    note TEXT NOT NULL,
    price INTEGER NOT NULL CHECK (price > 0),
    image TEXT NOT NULL DEFAULT '',
    specs TEXT NOT NULL,
    is_custom INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS products_category_idx ON products(category);
  CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    subscribed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS customer_sessions (
    token_hash TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS customer_sessions_expiry_idx ON customer_sessions(expires_at);
  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions(expires_at);
`);

const seedComplete = database.prepare("SELECT value FROM app_metadata WHERE key = 'catalog_seed_complete'").get();
if (!seedComplete) {
  const insertSeed = database.prepare(`
    INSERT INTO products (id, name, brand, category, note, price, image, specs, is_custom)
    VALUES (@id, @name, @brand, @category, @note, @price, @image, @specs, 0)
  `);
  const seedCatalog = database.transaction((catalog) => {
    for (const product of catalog) {
      insertSeed.run({ ...product, specs: JSON.stringify(product.specs) });
    }
    database.prepare("INSERT INTO app_metadata (key, value) VALUES ('catalog_seed_complete', 'true')").run();
  });
  seedCatalog(seedProducts);
}

function mapProduct(row) {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: row.category,
    note: row.note,
    price: row.price,
    image: row.image,
    specs: JSON.parse(row.specs),
    custom: Boolean(row.is_custom),
  };
}

function listProducts() {
  return database.prepare('SELECT * FROM products ORDER BY created_at, rowid').all().map(mapProduct);
}

function removeUploadedImage(imagePath) {
  if (!imagePath.startsWith('/uploads/')) return;
  const fileName = path.basename(imagePath);
  if (fileName !== imagePath.slice('/uploads/'.length)) return;
  void unlink(path.join(uploadDirectory, fileName)).catch((error) => {
    if (error.code !== 'ENOENT') console.error('Could not remove product image:', error);
  });
}

function getSessionToken(request) {
  return getCookieToken(request, sessionCookieName);
}

function getCookieToken(request, cookieName) {
  const cookies = request.headers.cookie?.split(';') ?? [];
  const sessionCookie = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${cookieName}=`));
  return sessionCookie?.slice(cookieName.length + 1) || '';
}

function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function setSessionCookie(response, request, token) {
  response.cookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.secure,
    path: '/',
    maxAge: sessionDurationMs,
  });
}

function getCustomerFromSession(request) {
  const token = getSessionToken(request);
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const customer = database.prepare(`
    SELECT customers.id, customers.name, customers.email
    FROM customer_sessions
    JOIN customers ON customers.id = customer_sessions.customer_id
    WHERE customer_sessions.token_hash = ? AND customer_sessions.expires_at > ?
  `).get(tokenHash, Date.now());
  if (!customer) database.prepare('DELETE FROM customer_sessions WHERE token_hash = ?').run(tokenHash);
  return customer || null;
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
}

async function verifyPassword(password, storedHash) {
  const [, saltText, keyText] = storedHash.split('$');
  if (!saltText || !keyText) throw new Error('Stored customer password hash is invalid.');

  const salt = Buffer.from(saltText, 'base64url');
  const expectedKey = Buffer.from(keyText, 'base64url');
  const actualKey = await scrypt(password, salt, expectedKey.length, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(actualKey, expectedKey);
}

async function createCustomerSession(customer, request, response) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + sessionDurationMs;
  database.prepare('DELETE FROM customer_sessions WHERE expires_at <= ?').run(Date.now());
  database.prepare('INSERT INTO customer_sessions (token_hash, customer_id, expires_at) VALUES (?, ?, ?)')
    .run(hashSessionToken(token), customer.id, expiresAt);
  setSessionCookie(response, request, token);
}

function limitSignups(request, response, next) {
  const ipAddress = request.ip || request.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const attemptKey = `signup:${ipAddress}`;
  const current = authAttempts.get(attemptKey);
  if (current && now - current.startedAt < windowMs && current.count >= 20) {
    response.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    return;
  }

  if (!current || now - current.startedAt >= windowMs) authAttempts.set(attemptKey, { startedAt: now, count: 1 });
  else current.count += 1;
  next();
}

function signinAttemptKey(request) {
  return `signin:${request.ip || request.socket.remoteAddress || 'unknown'}`;
}

function getAdminFromSession(request) {
  const token = getCookieToken(request, adminSessionCookieName);
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const session = database.prepare(`
    SELECT username FROM admin_sessions
    WHERE token_hash = ? AND expires_at > ?
  `).get(tokenHash, Date.now());
  if (!session) database.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash);
  return session ? { username: session.username } : null;
}

function requireAdmin(request, response, next) {
  const admin = getAdminFromSession(request);
  if (!admin) {
    response.status(401).json({ error: 'Sign in to the admin panel before managing products.' });
    return;
  }
  request.admin = admin;
  next();
}

function requireSameOrigin(request, response, next) {
  const origin = request.get('origin');
  if (!origin) {
    response.status(403).json({ error: 'This request must come from the TK Tech website.' });
    return;
  }

  try {
    const originUrl = new URL(origin);
    const requestOrigin = `${request.protocol}://${request.get('host')}`;
    const isLoopbackDevelopmentOrigin = originUrl.protocol === 'http:'
      && ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(originUrl.hostname);
    if (originUrl.origin !== origin || (origin !== requestOrigin && !developmentFrontendOrigins.has(origin) && !isLoopbackDevelopmentOrigin)) {
      response.status(403).json({ error: 'This request must come from the TK Tech website.' });
      return;
    }
  } catch {
    response.status(403).json({ error: 'This request must come from the TK Tech website.' });
    return;
  }
  next();
}

function validateProductInput(input) {
  const { id, name, brand, category, note, price, image, specs } = input;
  if (
    typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 90
    || typeof brand !== 'string' || brand.trim().length === 0 || brand.trim().length > 40
    || !['Everyday', 'Work', 'Gaming'].includes(category)
    || !Number.isSafeInteger(price) || price < 1 || price > 1000000000
    || !Array.isArray(specs) || specs.length !== 3
    || specs.some((spec) => typeof spec !== 'string' || spec.trim().length === 0 || spec.length > 60)
    || (id !== undefined && (typeof id !== 'string' || id.length > 120))
    || (note !== undefined && (typeof note !== 'string' || note.length > 80))
    || (image !== undefined && (typeof image !== 'string' || image.length > 5_000_000))
  ) {
    return 'Check the laptop details and try again.';
  }
  return null;
}

async function storeProductImage(image, unchangedImage = '') {
  if (!image) return '';
  if (image === unchangedImage) return image;

  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (match) {
    const imageBuffer = Buffer.from(match[1], 'base64');
    if (
      imageBuffer.length < 4
      || imageBuffer.length > 4 * 1024 * 1024
      || imageBuffer[0] !== 0xff
      || imageBuffer[1] !== 0xd8
      || imageBuffer[2] !== 0xff
    ) {
      throw new Error('The uploaded file is not a valid JPEG image.');
    }

    const fileName = `${randomUUID()}.jpg`;
    await writeFile(path.join(uploadDirectory, fileName), imageBuffer, { flag: 'wx' });
    return `/uploads/${fileName}`;
  }

  let imageUrl;
  try {
    imageUrl = new URL(image);
  } catch {
    throw new Error('Choose a valid laptop photo.');
  }
  if (imageUrl.protocol !== 'https:') throw new Error('Product photo links must use HTTPS.');
  return imageUrl.toString();
}

function adminSigninAttemptKey(request) {
  return `admin-signin:${request.ip || request.socket.remoteAddress || 'unknown'}`;
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '6mb', strict: true }));
app.use('/uploads', express.static(uploadDirectory, { dotfiles: 'deny', index: false, maxAge: '1d' }));

app.get('/api/health', (_request, response) => {
  database.prepare('SELECT 1').get();
  response.json({ status: 'ok', database: 'connected' });
});

app.get('/api/auth/me', (request, response) => {
  response.json({ user: getCustomerFromSession(request) });
});

app.post('/api/auth/signup', limitSignups, async (request, response, next) => {
  try {
    const name = typeof request.body?.name === 'string' ? request.body.name.trim() : '';
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';

    if (!name || name.length > 80 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || password.length < 8 || password.length > 128) {
      response.status(400).json({ error: 'Enter your name, a valid email, and a password between 8 and 128 characters.' });
      return;
    }

    if (database.prepare('SELECT 1 FROM customers WHERE email = ? COLLATE NOCASE').get(email)) {
      response.status(409).json({ error: 'An account with that email already exists. Sign in instead.' });
      return;
    }

    const customer = { id: randomUUID(), name, email };
    const passwordHash = await hashPassword(password);
    try {
      database.prepare('INSERT INTO customers (id, name, email, password_hash) VALUES (?, ?, ?, ?)')
        .run(customer.id, customer.name, customer.email, passwordHash);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        response.status(409).json({ error: 'An account with that email already exists. Sign in instead.' });
        return;
      }
      throw error;
    }

    await createCustomerSession(customer, request, response);
    response.status(201).json({ user: customer });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/signin', async (request, response, next) => {
  try {
    const attemptKey = signinAttemptKey(request);
    const attempts = authAttempts.get(attemptKey);
    if (attempts && Date.now() - attempts.startedAt < 15 * 60 * 1000 && attempts.count >= 10) {
      response.status(429).json({ error: 'Too many incorrect passwords. Please wait a few minutes and try again.' });
      return;
    }

    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length > 128 || !password) {
      response.status(400).json({ error: 'Enter a valid email address and password.' });
      return;
    }

    const customer = database.prepare('SELECT id, name, email, password_hash FROM customers WHERE email = ? COLLATE NOCASE').get(email);
    const storedHash = customer?.password_hash ?? 'scrypt$MDEyMzQ1Njc4OWFiY2RlZg$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const passwordMatches = await verifyPassword(password, storedHash);
    if (!customer || !passwordMatches) {
      const current = authAttempts.get(attemptKey);
      if (!current || Date.now() - current.startedAt >= 15 * 60 * 1000) {
        authAttempts.set(attemptKey, { startedAt: Date.now(), count: 1 });
      } else {
        current.count += 1;
      }
      response.status(401).json({ error: 'Email or password is incorrect.' });
      return;
    }
    authAttempts.delete(attemptKey);

    const profile = { id: customer.id, name: customer.name, email: customer.email };
    await createCustomerSession(profile, request, response);
    response.json({ user: profile });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/signout', (request, response) => {
  const token = getSessionToken(request);
  if (token) database.prepare('DELETE FROM customer_sessions WHERE token_hash = ?').run(hashSessionToken(token));
  response.clearCookie(sessionCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.secure,
    path: '/',
  });
  response.status(204).end();
});

app.get('/api/admin/auth/me', (request, response) => {
  response.json({ admin: getAdminFromSession(request), configured: adminCredentialsConfigured });
});

app.post('/api/admin/auth/signin', requireSameOrigin, async (request, response, next) => {
  try {
    if (!adminCredentialsConfigured || !adminPasswordHash) {
      response.status(503).json({ error: 'Admin login is not configured. Add TK_ADMIN_USERNAME and TK_ADMIN_PASSWORD to .env and restart the API.' });
      return;
    }

    const attemptKey = adminSigninAttemptKey(request);
    const attempts = authAttempts.get(attemptKey);
    if (attempts && Date.now() - attempts.startedAt < 15 * 60 * 1000 && attempts.count >= 10) {
      response.status(429).json({ error: 'Too many incorrect passwords. Please wait a few minutes and try again.' });
      return;
    }

    const username = typeof request.body?.username === 'string' ? request.body.username.trim() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    if (!username || username.length > 40 || !password || password.length > 128) {
      response.status(400).json({ error: 'Enter the admin username and password.' });
      return;
    }

    const passwordMatches = timingSafeEqual(createHash('sha256').update(password).digest(), adminPasswordHash);
    if (username.toLowerCase() !== adminUsername.toLowerCase() || !passwordMatches) {
      const current = authAttempts.get(attemptKey);
      if (!current || Date.now() - current.startedAt >= 15 * 60 * 1000) {
        authAttempts.set(attemptKey, { startedAt: Date.now(), count: 1 });
      } else {
        current.count += 1;
      }
      response.status(401).json({ error: 'Admin username or password is incorrect.' });
      return;
    }
    authAttempts.delete(attemptKey);

    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + adminSessionDurationMs;
    database.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(Date.now());
    database.prepare('INSERT INTO admin_sessions (token_hash, username, expires_at) VALUES (?, ?, ?)')
      .run(hashSessionToken(token), adminUsername, expiresAt);
    response.cookie(adminSessionCookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: request.secure,
      path: '/',
      maxAge: adminSessionDurationMs,
    });
    response.json({ admin: { username: adminUsername } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/auth/signout', requireSameOrigin, (request, response) => {
  const token = getCookieToken(request, adminSessionCookieName);
  if (token) database.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(hashSessionToken(token));
  response.clearCookie(adminSessionCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.secure,
    path: '/',
  });
  response.status(204).end();
});

app.get('/api/products', (_request, response) => {
  response.json(listProducts());
});

app.post('/api/products', requireAdmin, requireSameOrigin, async (request, response, next) => {
  try {
    const { id, name, brand, category, note, price, image, specs } = request.body ?? {};
    const validationError = validateProductInput(request.body ?? {});
    if (validationError) {
      response.status(400).json({ error: validationError });
      return;
    }

    let storedImage;
    try {
      storedImage = await storeProductImage(image);
    } catch (error) {
      response.status(400).json({ error: error.message });
      return;
    }

    const productId = id || randomUUID();
    try {
      database.prepare(`
        INSERT INTO products (id, name, brand, category, note, price, image, specs, is_custom)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        productId,
        name.trim(),
        brand.trim().toUpperCase(),
        category,
        typeof note === 'string' && note.trim() ? note.trim() : `NEW ${category.toUpperCase()} PICK`,
        price,
        storedImage,
        JSON.stringify(specs.map((spec) => spec.trim())),
      );
    } catch (error) {
      removeUploadedImage(storedImage);
      if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        response.status(409).json({ error: 'This laptop is already in the catalog.' });
        return;
      }
      throw error;
    }

    response.status(201).json(mapProduct(database.prepare('SELECT * FROM products WHERE id = ?').get(productId)));
  } catch (error) {
    next(error);
  }
});

app.put('/api/products/:id', requireAdmin, requireSameOrigin, async (request, response, next) => {
  try {
    const product = database.prepare('SELECT * FROM products WHERE id = ?').get(request.params.id);
    if (!product) {
      response.status(404).json({ error: 'Laptop was not found in the catalog.' });
      return;
    }

    const { name, brand, category, note, price, image, specs } = request.body ?? {};
    const validationError = validateProductInput(request.body ?? {});
    if (validationError) {
      response.status(400).json({ error: validationError });
      return;
    }

    let storedImage = image === undefined ? product.image : '';
    if (image !== undefined) {
      try {
        storedImage = await storeProductImage(image, product.image);
      } catch (error) {
        response.status(400).json({ error: error.message });
        return;
      }
    }

    try {
      database.prepare(`
        UPDATE products
        SET name = ?, brand = ?, category = ?, note = ?, price = ?, image = ?, specs = ?
        WHERE id = ?
      `).run(
        name.trim(),
        brand.trim().toUpperCase(),
        category,
        typeof note === 'string' && note.trim() ? note.trim() : `NEW ${category.toUpperCase()} PICK`,
        price,
        storedImage,
        JSON.stringify(specs.map((spec) => spec.trim())),
        request.params.id,
      );
    } catch (error) {
      if (storedImage !== product.image) removeUploadedImage(storedImage);
      throw error;
    }

    if (storedImage !== product.image) removeUploadedImage(product.image);
    response.json(mapProduct(database.prepare('SELECT * FROM products WHERE id = ?').get(request.params.id)));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/products/:id', requireAdmin, requireSameOrigin, (request, response) => {
  const product = database.prepare('SELECT image FROM products WHERE id = ?').get(request.params.id);
  if (!product) {
    response.status(404).json({ error: 'Laptop was not found in the catalog.' });
    return;
  }

  database.prepare('DELETE FROM products WHERE id = ?').run(request.params.id);
  removeUploadedImage(product.image);
  response.status(204).end();
});

app.post('/api/newsletter', (request, response) => {
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    response.status(400).json({ error: 'Enter a valid email address and try again.' });
    return;
  }

  database.prepare('INSERT OR IGNORE INTO newsletter_subscribers (email) VALUES (?)').run(email);
  response.status(201).json({ subscribed: true });
});

app.use('/api', (error, _request, response, _next) => {
  console.error('API request failed:', error);
  if (response.headersSent) return;
  response.status(500).json({ error: 'The catalog request failed. Check the server and try again.' });
});

const clientDirectory = path.resolve(serverDirectory, '..', 'dist');
if (existsSync(clientDirectory)) {
  app.use(express.static(clientDirectory));
  app.get(/.*/, (_request, response) => response.sendFile(path.join(clientDirectory, 'index.html')));
}

app.listen(port, '127.0.0.1', () => {
  console.log(`TK Tech API connected to SQLite at ${databasePath}`);
  console.log(`API listening locally at http://127.0.0.1:${port}`);
});

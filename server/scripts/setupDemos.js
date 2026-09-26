import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configuredDemoDir = path.resolve(__dirname, '../../demo-repos');

export function setupDemos() {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forgeloop-test-fixtures-'));
  assertApprovedFixtureRoot(baseDir);

  // ==========================================
  // Demo 1: products-api
  // ==========================================
  const productsDir = path.join(baseDir, 'products-api');
  fs.mkdirSync(path.join(productsDir, 'src/controllers'), { recursive: true });
  fs.mkdirSync(path.join(productsDir, 'src/routes'), { recursive: true });
  fs.mkdirSync(path.join(productsDir, 'src/data'), { recursive: true });
  fs.mkdirSync(path.join(productsDir, 'test'), { recursive: true });

  fs.writeFileSync(path.join(productsDir, 'package.json'), JSON.stringify({
    name: "products-api",
    version: "1.0.0",
    type: "module",
    scripts: {
      "test": "node --test test/*.test.js"
    }
  }, null, 2));

  fs.writeFileSync(path.join(productsDir, 'src/data/products.json'), JSON.stringify([
    { id: 1, name: "Mechanical Keyboard", price: 120, category: "Electronics" },
    { id: 2, name: "Wireless Mouse", price: 45, category: "Electronics" },
    { id: 3, name: "4K Monitor", price: 350, category: "Electronics" },
    { id: 4, name: "Ergonomic Desk Chair", price: 290, category: "Furniture" },
    { id: 5, name: "Standing Desk", price: 480, category: "Furniture" },
    { id: 6, name: "Noise Cancelling Headphones", price: 220, category: "Electronics" }
  ], null, 2));

  fs.writeFileSync(path.join(productsDir, 'src/controllers/products.controller.js'), `import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.resolve(__dirname, '../data/products.json');
const products = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

// Initial implementation: returns all products without pagination support
export function getProducts(req, res) {
  res.json(products);
}

export function getProductById(req, res) {
  const product = products.find(p => p.id === parseInt(req.params.id, 10));
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
}
`);

  fs.writeFileSync(path.join(productsDir, 'src/routes/products.routes.js'), `import { getProducts, getProductById } from '../controllers/products.controller.js';

export function setupRoutes(app) {
  app.get('/api/products', getProducts);
  app.get('/api/products/:id', getProductById);
}
`);

  fs.writeFileSync(path.join(productsDir, 'test/products.test.js'), `import test from 'node:test';
import assert from 'node:assert/strict';
import { getProducts } from '../src/controllers/products.controller.js';

function mockReq(query = {}) {
  return { query };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

test('products endpoint returns pagination structure', () => {
  const req = mockReq({ page: '1', limit: '2' });
  const res = mockRes();

  getProducts(req, res);

  assert.ok(res.body.pagination, 'Response must contain a pagination object');
  assert.equal(res.body.pagination.page, 1);
  assert.equal(res.body.pagination.limit, 2);
  assert.equal(res.body.pagination.total, 6);
  assert.equal(res.body.pagination.totalPages, 3);
  assert.equal(res.body.data.length, 2);
  assert.equal(res.body.data[0].id, 1);
  assert.equal(res.body.data[1].id, 2);
});

test('products endpoint uses default page and limit when omitted', () => {
  const req = mockReq();
  const res = mockRes();

  getProducts(req, res);

  assert.ok(res.body.pagination, 'Response must contain a pagination object');
  assert.equal(res.body.pagination.page, 1);
  assert.equal(res.body.pagination.limit, 10);
  assert.equal(res.body.data.length, 6);
});

test('products endpoint enforces max limit boundary of 50', () => {
  const req = mockReq({ limit: '100' });
  const res = mockRes();

  getProducts(req, res);

  assert.equal(res.body.pagination.limit, 50);
});
`);

  // ==========================================
  // Demo 2: auth-service (FAILURE RECOVERY DEMO)
  // ==========================================
  const authDir = path.join(baseDir, 'auth-service');
  fs.mkdirSync(path.join(authDir, 'src/middleware'), { recursive: true });
  fs.mkdirSync(path.join(authDir, 'test'), { recursive: true });

  fs.writeFileSync(path.join(authDir, 'package.json'), JSON.stringify({
    name: "auth-service",
    version: "1.0.0",
    type: "module",
    scripts: {
      "test": "node --test test/*.test.js"
    }
  }, null, 2));

  fs.writeFileSync(path.join(authDir, 'src/middleware/auth.js'), `// Token verification utility
export function verifyToken(token) {
  // Demo token format: base64(userId:timestampExp)
  try {
    const raw = Buffer.from(token, 'base64').toString('utf8');
    const [userId, exp] = raw.split(':');
    return {
      userId: parseInt(userId, 10),
      exp: parseInt(exp, 10)
    };
  } catch (e) {
    return null;
  }
}

// Initial buggy/placeholder middleware
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing token' });
  }
  // placeholder
  next();
}
`);

  fs.writeFileSync(path.join(authDir, 'test/auth.test.js'), `import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateToken } from '../src/middleware/auth.js';

function mockReq(headers = {}) {
  return { headers, user: null };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

test('returns 401 when Authorization header is missing', () => {
  const req = mockReq({});
  const res = mockRes();
  let nextCalled = false;

  authenticateToken(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 401, 'Should return 401 status');
  assert.equal(nextCalled, false, 'Next middleware should not be called');
});

test('returns 401 when Authorization header lacks Bearer prefix', () => {
  const req = mockReq({ authorization: 'RawTokenValue123' });
  const res = mockRes();
  let nextCalled = false;

  authenticateToken(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 401, 'Must reject headers without Bearer prefix');
  assert.equal(nextCalled, false);
});

test('returns 403 when token timestamp is expired', () => {
  const expiredExp = Date.now() - 60000; // 1 min in past
  const token = Buffer.from(\`42:\${expiredExp}\`).toString('base64');
  const req = mockReq({ authorization: \`Bearer \${token}\` });
  const res = mockRes();
  let nextCalled = false;

  authenticateToken(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 403, 'Should reject expired tokens with 403');
  assert.equal(nextCalled, false);
});

test('attaches decoded user and calls next for valid token', () => {
  const validExp = Date.now() + 3600000; // 1 hour in future
  const token = Buffer.from(\`99:\${validExp}\`).toString('base64');
  const req = mockReq({ authorization: \`Bearer \${token}\` });
  const res = mockRes();
  let nextCalled = false;

  authenticateToken(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 200);
  assert.equal(nextCalled, true, 'Next must be called for valid tokens');
  assert.equal(req.user.userId, 99);
});
`);

  // ==========================================
  // Demo 3: user-registration
  // ==========================================
  const userDir = path.join(baseDir, 'user-registration');
  fs.mkdirSync(path.join(userDir, 'src/controllers'), { recursive: true });
  fs.mkdirSync(path.join(userDir, 'test'), { recursive: true });

  fs.writeFileSync(path.join(userDir, 'package.json'), JSON.stringify({
    name: "user-registration",
    version: "1.0.0",
    type: "module",
    scripts: {
      "test": "node --test test/*.test.js"
    }
  }, null, 2));

  fs.writeFileSync(path.join(userDir, 'src/controllers/user.controller.js'), `export const users = [];

export function registerUser(req, res) {
  const { email, password } = req.body;
  users.push({ email, password });
  res.status(201).json({ message: 'User created' });
}
`);

  fs.writeFileSync(path.join(userDir, 'test/user.test.js'), `import test from 'node:test';
import assert from 'node:assert/strict';
import { registerUser, users } from '../src/controllers/user.controller.js';

function mockReq(body = {}) {
  return { body };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
}

test('rejects registration with invalid email format', () => {
  const req = mockReq({ email: 'notanemail', password: 'ValidPassword123' });
  const res = mockRes();

  registerUser(req, res);

  assert.equal(res.statusCode, 400, 'Expected status 400 for invalid email');
  assert.ok(res.body.error, 'Expected error message in response');
});

test('rejects registration with short password (< 8 chars)', () => {
  const req = mockReq({ email: 'user@example.com', password: '123' });
  const res = mockRes();

  registerUser(req, res);

  assert.equal(res.statusCode, 400, 'Expected status 400 for short password');
});

test('successfully registers valid user', () => {
  const req = mockReq({ email: 'alex@example.com', password: 'SuperSecretPassword!' });
  const res = mockRes();

  registerUser(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.email, 'alex@example.com');
});
`);

  // Initialize git repos for all 3 demo repos
  for (const dir of [productsDir, authDir, userDir]) {
    try {
      execSync('git init && git config user.name "ForgeLoop Harness" && git config user.email "harness@forgeloop.local" && git add . && git commit -m "initial commit" --allow-empty', {
        cwd: dir,
        stdio: 'pipe'
      });
    } catch (e) {
      console.warn(`Git init warning for ${dir}:`, e.message);
    }
  }

  console.log(`✅ Isolated test fixtures initialized at ${baseDir}.`);
  return {
    root: baseDir,
    products: productsDir,
    auth: authDir,
    userRegistration: userDir
  };
}

function assertApprovedFixtureRoot(targetPath) {
  const realTarget = fs.realpathSync(targetPath);
  const realTempRoot = fs.realpathSync(os.tmpdir());
  const relativeToTemp = path.relative(realTempRoot, realTarget);
  const isWithinTemp = relativeToTemp !== '' &&
    relativeToTemp !== '..' &&
    !relativeToTemp.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativeToTemp);
  const realConfiguredDemoDir = fs.existsSync(configuredDemoDir)
    ? fs.realpathSync(configuredDemoDir)
    : path.resolve(configuredDemoDir);
  const relativeToConfigured = path.relative(realConfiguredDemoDir, realTarget);
  const targetsConfiguredRepos = relativeToConfigured === '' ||
    (!path.isAbsolute(relativeToConfigured) && relativeToConfigured !== '..' && !relativeToConfigured.startsWith(`..${path.sep}`));

  if (!isWithinTemp || targetsConfiguredRepos) {
    throw new Error(`Refusing to create test fixtures outside an approved temporary directory: ${targetPath}`);
  }

  if (fs.readdirSync(realTarget).length !== 0) {
    throw new Error(`Refusing to use a non-empty test fixture directory: ${targetPath}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  setupDemos();
}

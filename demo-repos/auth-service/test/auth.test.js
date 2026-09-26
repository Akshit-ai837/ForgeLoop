import test from 'node:test';
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
  const token = Buffer.from(`42:${expiredExp}`).toString('base64');
  const req = mockReq({ authorization: `Bearer ${token}` });
  const res = mockRes();
  let nextCalled = false;

  authenticateToken(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 403, 'Should reject expired tokens with 403');
  assert.equal(nextCalled, false);
});

test('attaches decoded user and calls next for valid token', () => {
  const validExp = Date.now() + 3600000; // 1 hour in future
  const token = Buffer.from(`99:${validExp}`).toString('base64');
  const req = mockReq({ authorization: `Bearer ${token}` });
  const res = mockRes();
  let nextCalled = false;

  authenticateToken(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 200);
  assert.equal(nextCalled, true, 'Next must be called for valid tokens');
  assert.equal(req.user.userId, 99);
});

import test from 'node:test';
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

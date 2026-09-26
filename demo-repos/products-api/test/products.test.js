import test from 'node:test';
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

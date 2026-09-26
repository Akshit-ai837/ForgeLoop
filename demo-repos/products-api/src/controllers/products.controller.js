import fs from 'node:fs';
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

import { getProducts, getProductById } from '../controllers/products.controller.js';

export function setupRoutes(app) {
  app.get('/api/products', getProducts);
  app.get('/api/products/:id', getProductById);
}

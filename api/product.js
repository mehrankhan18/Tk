import { createApiHandler } from '../server/vercel-api.js';

export default createApiHandler((_request, requestUrl) => {
  const productId = requestUrl.searchParams.get('id');
  return productId ? `/products/${encodeURIComponent(productId)}` : '/products/';
});

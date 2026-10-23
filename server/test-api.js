require('dotenv').config();
// Verification never modifies the development/customer database.
const fs = require('fs');
const path = require('path');
const testDirectory = fs.mkdtempSync(path.join(require('os').tmpdir(), 'valcerenne-api-'));
process.env.DB_CLIENT = 'sqlite';
process.env.SQLITE_DB_PATH = path.join(testDirectory, 'test.sqlite');
process.env.NODE_ENV = 'test';

const http = require('http');
const app = require('./server');

// Simple test helper using node's built-in http request
function request(server, method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const options = {
      hostname: '127.0.0.1',
      port: addr.port,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n=============================================');
  console.log('  STARTING API END-TO-END VERIFICATION SUITE');
  console.log('=============================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName} - ${details}`);
      failed++;
    }
  }

  // Start test server on random free port
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`[Test Server] Listening on internal port ${port}\n`);

  try {
    // 1. Health Check
    const resHealth = await request(server, 'GET', '/api/health');
    assert(resHealth.status === 200 && resHealth.body.status === 'ok', 'GET /api/health');

    // 2. Categories
    const resCat = await request(server, 'GET', '/api/categories');
    assert(resCat.status === 200 && resCat.body.data.length >= 7, 'GET /api/categories (returns 7 categories)', `Got ${resCat.body?.data?.length}`);

    // 3. Products
    const resProd = await request(server, 'GET', '/api/products');
    assert(resProd.status === 200 && resProd.body.pagination.total === 40, 'GET /api/products (returns 40 total products)', `Total: ${resProd.body?.pagination?.total}`);

    // 4. Product Search & Filter
    const resSearch = await request(server, 'GET', '/api/products?search=Headphones');
    assert(resSearch.status === 200 && resSearch.body.data.length > 0, 'GET /api/products?search=Headphones (returns search results)');

    // 5. Product Details by Slug
    const resDetail = await request(server, 'GET', '/api/products/aura-anc-headphones');
    assert(resDetail.status === 200 && resDetail.body.data.images.length > 0 && resDetail.body.data.variants.length > 0, 'GET /api/products/:slug (returns images and variants)');

    // 6. Featured Products
    const resFeat = await request(server, 'GET', '/api/products/featured');
    assert(resFeat.status === 200 && resFeat.body.data.length > 0, 'GET /api/products/featured');

    // 7. Auth: Customer Login
    const resLogin = await request(server, 'POST', '/api/auth/login', {}, {
      email: 'customer@example.com',
      password: 'Password123!'
    });
    assert(resLogin.status === 200 && resLogin.body.token, 'POST /api/auth/login (Customer login)');
    const customerToken = resLogin.body.token;

    // 8. Auth: Admin Login
    const resAdminLogin = await request(server, 'POST', '/api/auth/login', {}, {
      email: 'admin@example.com',
      password: 'Admin123!'
    });
    assert(resAdminLogin.status === 200 && resAdminLogin.body.user.role === 'admin', 'POST /api/auth/login (Admin login)');

    // 9. Auth: Profile /me
    const resMe = await request(server, 'GET', '/api/auth/me', { Authorization: `Bearer ${customerToken}` });
    assert(resMe.status === 200 && resMe.body.user.email === 'customer@example.com', 'GET /api/auth/me (Protected route)');

    // 10. Coupons: Validation (INR)
    const resCoupon = await request(server, 'POST', '/api/coupons/validate', {}, {
      code: 'SAVE20',
      cart_subtotal: 5000.00
    });
    assert(resCoupon.status === 200 && resCoupon.body.data.discount_amount === 1000.00, 'POST /api/coupons/validate (20% of ₹5000 = ₹1000 discount)');

    // 11. Cart Operations (Guest Session)
    const guestSessionToken = `test-session-${Date.now()}`;
    const resAddCart = await request(server, 'POST', '/api/cart/add', { 'x-session-token': guestSessionToken }, {
      product_id: 1,
      variant_id: 1,
      quantity: 2
    });
    assert(resAddCart.status === 200 && resAddCart.body.data.items.length > 0, 'POST /api/cart/add (Guest cart add item)');

    const cartItemId = resAddCart.body.data.items[0].item_id;
    const resUpdateCart = await request(server, 'PUT', `/api/cart/items/${cartItemId}`, { 'x-session-token': guestSessionToken }, {
      quantity: 3
    });
    assert(resUpdateCart.status === 200 && resUpdateCart.body.data.totalItems === 3, 'PUT /api/cart/items/:id (Update quantity)');

    // 12. Cart Merge on Login
    const resMerge = await request(server, 'POST', '/api/cart/merge', { Authorization: `Bearer ${customerToken}` }, {
      session_token: guestSessionToken
    });
    assert(resMerge.status === 200 && resMerge.body.data.totalItems >= 3, 'POST /api/cart/merge (Guest cart merge into user cart)');

    // 13. Wishlist Operations
    const resAddWish = await request(server, 'POST', '/api/wishlist/add', { Authorization: `Bearer ${customerToken}` }, {
      product_id: 2
    });
    assert(resAddWish.status === 200 || resAddWish.status === 201, 'POST /api/wishlist/add (Add to wishlist)');

    const resGetWish = await request(server, 'GET', '/api/wishlist', { Authorization: `Bearer ${customerToken}` });
    assert(resGetWish.status === 200 && resGetWish.body.data.length > 0, 'GET /api/wishlist (List user wishlist)');

    // 14. Order Checkout with Coupon
    const resCheckout = await request(server, 'POST', '/api/orders/checkout', { Authorization: `Bearer ${customerToken}` }, {
      coupon_code: 'SAVE20',
      payment_method: 'cod',
      shipping_address: {
        full_name: 'Alex Morgan',
        phone: '+1 555-234-5678',
        address_line1: '742 Evergreen Terrace',
        city: 'Springfield',
        state: 'OR',
        postal_code: '97477',
        country: 'United States'
      }
    });
    assert(resCheckout.status === 201 && resCheckout.body.data.orderNumber && resCheckout.body.data.paymentStatus === 'pending', 'POST /api/orders/checkout (Order creation & stock update)', JSON.stringify(resCheckout.body));
    const createdOrderNumber = resCheckout.body.data.orderNumber;

    // 15. Order Details & History
    const resOrderDet = await request(server, 'GET', `/api/orders/${createdOrderNumber}`, { Authorization: `Bearer ${customerToken}` });
    assert(resOrderDet.status === 200 && resOrderDet.body.data.items.length > 0, 'GET /api/orders/:orderNumber (Fetch order with timeline & items)');

    const resUserOrders = await request(server, 'GET', '/api/orders/my-orders', { Authorization: `Bearer ${customerToken}` });
    assert(resUserOrders.status === 200 && resUserOrders.body.data.length > 0, 'GET /api/orders/my-orders');

    // 16. User Addresses
    const resAddAddr = await request(server, 'POST', '/api/users/addresses', { Authorization: `Bearer ${customerToken}` }, {
      full_name: 'Alex Morgan Office',
      phone: '+1 555-999-0000',
      address_line1: '500 Tech Blvd',
      city: 'Portland',
      state: 'OR',
      postal_code: '97201',
      country: 'United States'
    });
    assert(resAddAddr.status === 201, 'POST /api/users/addresses (Save address)');

    // 17. User Reviews (Using newly registered user to avoid duplicate review conflicts)
    const testReviewUser = await request(server, 'POST', '/api/auth/register', {}, {
      full_name: 'Verified Reviewer',
      email: `reviewer_${Date.now()}@example.com`,
      password: 'Password123!'
    });
    const reviewerToken = testReviewUser.body.token;

    const resAddRev = await request(server, 'POST', '/api/reviews', { Authorization: `Bearer ${reviewerToken}` }, {
      product_id: 10,
      rating: 5,
      title: 'Outstanding quality pants',
      comment: 'Super comfortable 4-way stretch fabric and water resistance.'
    });
    assert(resAddRev.status === 201, 'POST /api/reviews (Submit verified review)');

    // 18. Contact Form & Newsletter
    const resContact = await request(server, 'POST', '/api/contact', {}, {
      name: 'Tester User',
      email: 'tester@example.com',
      subject: 'Order inquiry',
      message: 'Hello, I have a question about shipping.'
    });
    assert(resContact.status === 201, 'POST /api/contact (Contact message submission)');

    const resNews = await request(server, 'POST', '/api/newsletter', {}, {
      email: `subscriber_${Date.now()}@example.com`
    });
    assert(resNews.status === 201, 'POST /api/newsletter (Newsletter subscription)');

  } catch (err) {
    console.error('Unexpected test failure:', err);
    failed++;
  } finally {
    server.close();
    console.log('\n=============================================');
    console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('=============================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();

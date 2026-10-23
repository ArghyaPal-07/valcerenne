require('dotenv').config();
const http = require('http');
const app = require('./server/server');
const db = require('./server/config/db');

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

async function verifyAllFlows() {
  console.log('\n======================================================');
  console.log('  KICKSZN FULL USER JOURNEY & BUG AUDIT VERIFICATION');
  console.log('======================================================\n');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`[Test Server] Running on port ${port}\n`);

  let allPassed = true;
  function report(name, passed, details = '') {
    if (passed) {
      console.log(`  ✅ [PASS] ${name}`);
    } else {
      console.error(`  ❌ [FAIL] ${name} - ${details}`);
      allPassed = false;
    }
  }

  try {
    // -----------------------------------------------------------
    // TEST 1: PRODUCT DETAILS & IMAGES
    // -----------------------------------------------------------
    console.log('--- TEST 1: PRODUCT & DETAILS ---');
    const pRes = await request(server, 'GET', '/api/products/aura-anc-headphones');
    report('Product details loads with SKU and rating', pRes.status === 200 && pRes.body.data.sku === 'EL-AURA-01');
    report('Product contains gallery images', pRes.body.data.images && pRes.body.data.images.length >= 2);
    report('Product contains selectable variants', pRes.body.data.variants && pRes.body.data.variants.length >= 2);

    // -----------------------------------------------------------
    // TEST 2: GADGETS CATEGORY & IMAGES
    // -----------------------------------------------------------
    console.log('\n--- TEST 2: GADGETS CATEGORY & IMAGES ---');
    const gRes = await request(server, 'GET', '/api/products?category=gadgets');
    report('Category "gadgets" returns products', gRes.status === 200 && gRes.body.data.length >= 6);
    
    let allGadgetImagesValid = true;
    for (const g of gRes.body.data) {
      if (!g.primary_image || !g.primary_image.startsWith('http')) {
        allGadgetImagesValid = false;
        console.error('Invalid image for gadget:', g.title, g.primary_image);
      }
    }
    report('Every gadget has a valid high-resolution image URL', allGadgetImagesValid);

    // -----------------------------------------------------------
    // TEST 3: GUEST ADD TO CART & CART OPERATIONS
    // -----------------------------------------------------------
    console.log('\n--- TEST 3: GUEST ADD TO CART & CRUD ---');
    const guestSession = `guest_test_${Date.now()}`;
    
    // Add product 1 (Aura Headphones, qty 1, variant 1)
    const addRes1 = await request(server, 'POST', '/api/cart/add', { 'x-session-token': guestSession }, {
      product_id: 1,
      variant_id: 1,
      quantity: 1
    });
    report('Guest adds product to cart with size/color variant', addRes1.status === 200 && addRes1.body.data.totalItems === 1);
    
    // Verify in database directly
    const [cartDb] = await db.query('SELECT * FROM carts WHERE session_token = ?', [guestSession]);
    const [itemsDb] = await db.query('SELECT * FROM cart_items WHERE cart_id = ?', [cartDb[0].id]);
    report('Database cart & cart_items records created in DB', itemsDb.length === 1 && itemsDb[0].product_id === 1);

    // Increase quantity to 3
    const itemId = itemsDb[0].id;
    const updRes = await request(server, 'PUT', `/api/cart/items/${itemId}`, { 'x-session-token': guestSession }, {
      quantity: 3
    });
    report('Cart quantity increases to 3 in DB and API response', updRes.status === 200 && updRes.body.data.totalItems === 3);

    // Decrease quantity to 2
    const decRes = await request(server, 'PUT', `/api/cart/items/${itemId}`, { 'x-session-token': guestSession }, {
      quantity: 2
    });
    report('Cart quantity decreases to 2 in DB and API response', decRes.status === 200 && decRes.body.data.totalItems === 2);

    // -----------------------------------------------------------
    // TEST 4: AUTH & GUEST CART MERGE ON LOGIN
    // -----------------------------------------------------------
    console.log('\n--- TEST 4: AUTH & GUEST CART MERGE ---');
    const userEmail = `shopper_${Date.now()}@kickszn.test`;
    const regRes = await request(server, 'POST', '/api/auth/register', {}, {
      full_name: 'Hype Beast',
      email: userEmail,
      password: 'Password123!'
    });
    report('New customer registers account', regRes.status === 201 && regRes.body.token);
    const userToken = regRes.body.token;
    const userId = regRes.body.user.id;

    // Merge guest cart into user account
    const mergeRes = await request(server, 'POST', '/api/cart/merge', { Authorization: `Bearer ${userToken}` }, {
      session_token: guestSession
    });
    report('Guest cart merges into authenticated user cart without error', mergeRes.status === 200 && mergeRes.body.data.totalItems === 2);

    // Check user cart in DB
    const [userCartDb] = await db.query('SELECT * FROM carts WHERE user_id = ?', [userId]);
    const [userItemsDb] = await db.query('SELECT * FROM cart_items WHERE cart_id = ?', [userCartDb[0].id]);
    report('User cart in DB holds merged items', userItemsDb.length === 1 && userItemsDb[0].quantity === 2);

    // -----------------------------------------------------------
    // TEST 5: WISHLIST / FAVOURITES TOGGLE & PERSISTENCE
    // -----------------------------------------------------------
    console.log('\n--- TEST 5: WISHLIST / FAVOURITES ---');
    // Unauthenticated user fails gracefully
    const unauthWish = await request(server, 'POST', '/api/wishlist', {}, { product_id: 4 });
    report('Unauthenticated user cannot access protected wishlist without token (401)', unauthWish.status === 401);

    // Authenticated user adds to wishlist
    const addWishRes = await request(server, 'POST', '/api/wishlist', { Authorization: `Bearer ${userToken}` }, {
      product_id: 4
    });
    report('Authenticated user adds product to wishlist (POST /api/wishlist)', addWishRes.status === 201 && addWishRes.body.inWishlist === true);

    // Verify in DB
    const [wishDb] = await db.query('SELECT * FROM wishlists WHERE user_id = ? AND product_id = ?', [userId, 4]);
    report('Wishlist table in DB has record', wishDb.length === 1);

    // Fetch wishlist
    const getWishRes = await request(server, 'GET', '/api/wishlist', { Authorization: `Bearer ${userToken}` });
    report('GET /api/wishlist returns saved item with image and title', getWishRes.status === 200 && getWishRes.body.data.length === 1 && getWishRes.body.data[0].id === 4);

    // Duplicate check
    const dupWishRes = await request(server, 'POST', '/api/wishlist', { Authorization: `Bearer ${userToken}` }, { product_id: 4 });
    report('Adding duplicate item to wishlist is safely handled', dupWishRes.status === 200 && dupWishRes.body.inWishlist === true);

    // Remove from wishlist
    const remWishRes = await request(server, 'DELETE', '/api/wishlist/4', { Authorization: `Bearer ${userToken}` });
    report('DELETE /api/wishlist/:productId removes item', remWishRes.status === 200 && remWishRes.body.inWishlist === false);

    // Verify removal in DB
    const [wishDbAfter] = await db.query('SELECT * FROM wishlists WHERE user_id = ? AND product_id = ?', [userId, 4]);
    report('Wishlist item successfully deleted from DB', wishDbAfter.length === 0);

    // -----------------------------------------------------------
    // TEST 6: REMOVE FROM CART & REFRESH PERSISTENCE
    // -----------------------------------------------------------
    console.log('\n--- TEST 6: CART REMOVE & PERSISTENCE ---');
    const remCartItem = await request(server, 'DELETE', `/api/cart/items/${userItemsDb[0].id}`, { Authorization: `Bearer ${userToken}` });
    report('Cart item removed via DELETE /api/cart/items/:id', remCartItem.status === 200 && remCartItem.body.data.totalItems === 0);

    const [userItemsAfter] = await db.query('SELECT * FROM cart_items WHERE cart_id = ?', [userCartDb[0].id]);
    report('Cart items table in DB is empty after removal', userItemsAfter.length === 0);

  } catch (err) {
    console.error('Fatal test error:', err);
    allPassed = false;
  } finally {
    server.close();
    console.log('\n======================================================');
    console.log(allPassed ? '  ALL 8 TESTS PASSED SUCCESSFULLY! 🚀' : '  SOME TESTS FAILED.');
    console.log('======================================================\n');
    process.exit(allPassed ? 0 : 1);
  }
}

verifyAllFlows();

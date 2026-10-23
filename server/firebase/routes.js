const router = require("express").Router();
const { publicConfig } = require("./config");
const { auth, route } = require("./helpers");
router.get(
  "/config",
  route(async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ success: true, ...publicConfig() });
  }),
);
router.use(auth);
require("./catalog").registerCatalog(router);
require("./customers").registerCustomers(router);
require("./commerce").registerCommerce(router);
module.exports = router;

const ai = require('./api_ai.js');
const campaign = require('./api_campaign.js');
const cart = require('./api_cart.js');
const checkout = require('./api_checkout.js');
const creditCard = require('./api_creditCard.js');
const ga = require('./api_ga.js');
const invoice = require('./api_invoice.js');
const member = require('./api_member.js');
const order = require('./api_order.js');
const product = require('./api_product.js');
const promotion = require('./api_promotion.js');
const ui = require('./api_ui.js');
const web = require('./api_web.js');
const tools = require('./tools.js');

const apiObj = {
  ai,
  campaign,
  cart,
  checkout,
  creditCard,
  ga,
  invoice,
  member,
  order,
  product,
  promotion,
  ui,
  web,
  tools
};

module.exports = apiObj;

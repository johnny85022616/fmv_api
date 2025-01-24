/**
 * GA4 相關
 * https://developers.google.com/analytics/devguides/collection/ga4/ecommerce?hl=zh-tw
 */
module.exports = {
  /**
   * 檢視商品
   */
  viewContent(items) {
    const dataObj = {
      event: 'ViewContent',
      product_type: 'product',
      ecommerce: {
        detail: {
          products: items
        },
      },
    }
    window.dataLayer.push(dataObj)
  },
  /**
   * 檢視購物車
   */
  viewCart(items) {
    const products = [];
    items.forEach((v, idx) => {
      v.mainProducts.forEach((x) => {
        const { name, productId, quantity, priceObj } = x;
        products.push({
          price: priceObj.promoPrice || priceObj.memberPrice,
          quantity,
          item_id: productId,
          item_name: name,
          index: idx
        });
      })
    })

    const dataObj = {
      event: 'ViewCart',
      product_type: 'product',
      ecommerce: {
        detail: {
          products
        },
      },
    }
    window.dataLayer.push(dataObj)
  },
  /**
   * 加入購物車
   * items format
   * {id:'',item_price:'',name:'',price:0,quantity:1,sku:''}
   */
  addToCart(productObj) {
    const { name, pid, qty, price, supplierId } = productObj;
    const obj = {
      price: price,
      quantity: qty,
      item_id: pid,
      item_name: name,
      supid: supplierId,
    };

    const dataObj = {
      event: 'addToCart',
      product_type: 'product',
      ecommerce: {
        add: {
          products: [obj],
          currencyCode: 'TWD',
        },
      },
    };
    window.dataLayer.push(dataObj);

    const groupKey = window.serverBreadCrumbData;
    if (groupKey) {
      for (let i in groupKey) {
        if (/^L/i.test(i)) obj['item_category'] = groupKey[i];
        if (/^M/i.test(i)) obj['item_category2'] = groupKey[i];
        if (/^B/i.test(i)) obj['item_category3'] = groupKey[i];
        if (/^b/i.test(i)) obj['item_category4'] = groupKey[i];
      }
    }
    window.sessionStorage.setItem('GA4-ITEM-' + pid, JSON.stringify(obj));
  },
  /**
   * 開始結帳
   */
  beginCheckout() {
    const cartData = window.sessionStorage.getItem('tempCheckoutItems');
    if (cartData) {
      const { productAmount, items } = JSON.parse(cartData);
      const products = [];

      items.forEach(v => {
        v.mainProducts.forEach(x => {
          products.push({
            item_id: x.productId,
            item_name: x.name,
            item_variant: x.specName,
            quantity: x.quantity,
            price: x.price
          })
        })
      })

      const dataObj = {
        event: 'beginCheckout',
        product_type: 'product',
        ecommerce: {
          begin_checkout: {
            amount: productAmount,
            products: products
          },
        },
      }
      window.dataLayer.push(dataObj);
    }
  },
  // 結帳成功
  checkoutComplete(transactionObj) {
    const tempCheckoutItems = window.sessionStorage.getItem('tempCheckoutItems');
    if (tempCheckoutItems && transactionObj) {
      const cartObj = JSON.parse(tempCheckoutItems);
      const dealId = transactionObj.dealId;
      const cash = transactionObj.cash;
      const prds = [];

      // 商品集合
      cartObj.items.forEach((v) => {
        v.mainProducts.forEach((m) => {
          let disAmount = 0;
          const dataDisAmount = Object.values(m.discounts).find((v) => v > 0);
          if (dataDisAmount) {
            disAmount = dataDisAmount / m.quantity;
          }
          prds.push({
            item_id: m.productId,
            item_name: m.name,
            item_category: '',
            item_variant: m.specName,
            discount: disAmount,
            price: m.price - disAmount,
            quantity: m.quantity,
          });
        });
      });

      // 計算運費
      let shipFeeAmount = 0;
      if (transactionObj.shippingFee && transactionObj.shippingFee.length > 0) {
        transactionObj.shippingFee.forEach((v) => {
          shipFeeAmount += v.amount;
        });
      }

      const orderDetails = {
        value: transactionObj.cash,
        shipping: shipFeeAmount,
        currency: 'TWD',
        items: prds,
      };

      window.dataLayer.push({
        event: 'checkoutComplete',
        transaction: {
          transactionId: dealId,
          transactionTotal: cash,
          transactionDetail: orderDetails,
        },
      });
    }
  },
};

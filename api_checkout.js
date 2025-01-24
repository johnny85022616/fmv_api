/**
 * 結帳相關API
 *
 * below memo
 */

const { frontApiPath, fetchPostHeaders, ysdtDomain } = require('./configs.js');
const {
  mergeProductsData,
  mergeCartDiscountData,
  mergePayData,
  mergeInvoiceData,
  mergePaymentDiscountData,
  mergeLogisticData,
} = require('./api_checkout_tools.js');
const {
  getProduct,
} = require('./api_product.js');
const {
  reCalcShipFeeAmount,
  getShipFeeCheckoutPayload
} = require('./bfee.js');
const {
  checkoutComplete
}  = require('./api_ga.js');

// 設定FRONT API位置
const apiPath = frontApiPath();

let checkoutTimer;

const checkoutLog = async (payload) => {
  payload.version = 'v12.9';
  return await fetch('https://ailog.shopping.friday.tw/gary', {
    method: 'POST',
    headers: {
      'content-Type': 'application/json'
    },
    body: JSON.stringify({
      "content": JSON.stringify(payload)
    }),
  })
    .then((res) => res.json())
    .then(() => {
      return true;
    });
}

module.exports = {
  reCalcShipFeeAmount,
  getShipFeeCheckoutPayload,
  // 結帳計時器
  checkoutTimeout() {
    const expireTime = 600000; // 預設10分鐘 設定結帳頁離開多久過期，需提示回購物車頁
    let lastTimePoint = new Date().getTime();

    const startTimer = () => {
      checkoutTimer = setInterval(() => {
        const n = new Date();
        if (n.getTime() - lastTimePoint > expireTime) {
          alert('您離開結帳狀態已超過10分鐘，請至購物車重新操作！');
          window.location.href = '/shoppingcart';
          return;
        }

        lastTimePoint = n.getTime();
        // console.log(n.toLocaleString());
      }, 1000);
    };
    startTimer();

    window.onblur = () => {
      clearInterval(checkoutTimer);
    };
    window.onfocus = () => {
      if (checkoutTimer) clearInterval(checkoutTimer);
      startTimer();
    };
  },
  // 開始結帳
  async beginCheckout(ui, cartObj) {
    const siteId = window.siteData?.siteId || 'BW290341';
    let urlSuffix = '';
    if (window.siteData) {
      urlSuffix = ysdtDomain + '/' + window.siteData.urlSuffix;
    }
    const postData = {
      siteId,
    };

    // 訂購人資料
    if (ui.billingInfo) {
      postData.billingInfo = ui.billingInfo;
    }

    // 設定裝置
    postData.mediaType = /(iphone|mobile)/i.test(navigator.userAgent) ? 'MOBILE' : 'DESKTOP';

    const {
      // cartTypeKey,
      // aiAmount, // 對品折價卷金額
      // couponAmount, // 折價卷金額
      // couponList,
      // discountCodeAmount, // 折扣碼總折抵金額
      // discountCodeList,
      promoDiscountAmount, // 活動折抵金額
      // promoDiscountList,
      // productAmount,
      // items,
    } = cartObj;

    // 放大折折抵
    let fcoinBonus = 0;
    if (ui.fcoinBonus) fcoinBonus = ui.fcoinBonus;

    // 計算商品價格
    let productAmount = 0;
    cartObj.items.forEach(v => {
      v.mainProducts.forEach(c => {
        productAmount += (c.price * c.quantity);

        if (c.additionalProducts.length > 0) {
          c.additionalProducts.forEach(a => {
            productAmount += (a.price * a.quantity);
          })
        }
      })
    })

    // 應付CASH
    postData.cash = (productAmount + ui.shipFeeAmount);
    // 驗證抵扣項
    if (+ui.happyGoDiscount) {
      postData.cash -= +ui.happyGoDiscount;
    }
    if (+ui.fcoin) {
      postData.cash -= +ui.fcoin;
    }
    if (+fcoinBonus) {
      postData.cash -= +fcoinBonus;
    }
    if (+ui.voucher) {
      postData.cash -= +ui.voucher;
    }
    if (+promoDiscountAmount) {
      postData.cash -= +promoDiscountAmount;
    }

    // 商品
    postData.products = mergeProductsData(ui, cartObj);

    // 購物車折扣
    postData.dealDiscount = mergeCartDiscountData(cartObj);

    // 付款方式
    postData.payInfo = mergePayData(ui, postData.cash);
    // 追加計算信用卡分期手續費 加到應付金額
    if (ui.interest) {
      postData.cash += Math.floor(parseInt(postData.cash) * (ui.interest / 100));
    }

    // 發票
    postData.invoiceInfo = mergeInvoiceData(ui);

    // 付款折扣
    postData.paymentDiscount = mergePaymentDiscountData(ui);

    // 配送資訊
    postData.logisticInfo = mergeLogisticData(ui, cartObj);

    // 運費
    postData.freightFee = ui.shipFeeArrayForCheckoutPayload;

    fetchPostHeaders.body = JSON.stringify(postData);

    // 驗證單品折扣商品價格是否有小於0
    let productErrorPrice = false;
    postData.products.forEach(p => {
      if (p?.productDiscount?.v?.[1]?.[0]) {
        if ((p.price - p.productDiscount.v[1][0]) < 0) {
          productErrorPrice = true;
          return false;
        }
      }
    })
    if (productErrorPrice) {
      alert('商品金額計算異常！');
      window.history.go(-1);
      return;
    } 

    // 阻擋金額異常
    if (postData.cash < 0) {
      alert('實付金額計算異常！');
      window.history.go(-1);
      return;
    } 

    if (/print=1/i.test(location.search)) {
      console.log('UI Input資料', JSON.stringify(ui, 0, 2));
      console.log('購物車資料', JSON.stringify(cartObj, 0, 2));
      console.log('結帳API矩陣', JSON.stringify(postData, 0, 2));
      return;
    }
    
    return await fetch(`${apiPath}cart/checkout`, fetchPostHeaders)
      .then((res) => res.json())
      .then( async (res) => {
        if (res && res.resultCode === 0 && res.resultData) {
          const { atmAccNum, bankCode, bankName, dealId, deadLine, paymentHtml, paymentUrl } = res.resultData;

          // 儲存交易資料for追蹤
          postData['dealId'] = dealId;

          // Save GA4
          checkoutComplete(postData);

          // Save Log
          await checkoutLog(postData);

          // remove cache
          window.sessionStorage.removeItem('myVoucher');
          window.sessionStorage.removeItem('myFetCoins');
          window.sessionStorage.removeItem('myHGPoints');


          // ATM
          if (atmAccNum && bankCode && bankName) {
            window.sessionStorage.setItem(
              'checkoutATMInfo',
              JSON.stringify({
                atmAccNum,
                bankCode,
                bankName,
                atmExpire: deadLine,
                amount: postData.cash,
              })
            );
            window.location.href = urlSuffix + '/checkout/results';
          } else if (/^PAYTYPE_CARD/i.test(ui.payType) && /^http/i.test(paymentUrl)) {
            // 信用卡
            window.location.href = paymentUrl;
          } else if (/<html>/i.test(paymentHtml)) {
            // NCCC
            document.write(paymentHtml);
          } else if (/^http/i.test(paymentUrl)) {
            //  第3方支付URL
            let payName = '第三方支付';
            switch (ui.payType) {
              case 'PAYTYPE_LINE_PAY':
                payName = 'LINE PAY';
                break;
              case 'PAYTYPE_JKO_PAY':
                payName = '街口支付';
                break;
              case 'PAYTYPE_UUPAY_PAY':
                payName = '悠遊付';
                break;
              case 'PAYTYPE_PLUS_PAY':
                payName = '全盈+PAY';
                break;
              case 'PAYTYPE_HG_PAY':
                payName = 'HAPPYGO PAY';
                break;
            }
            window.sessionStorage.setItem(
              'checkoutThirdPayInfo',
              JSON.stringify({
                payName,
                redirectUrl: paymentUrl,
              })
            );
            window.location.href = urlSuffix + '/checkout/results?payStatus=2&dealId=' + dealId;
          } else if (dealId) {
            window.location.href = urlSuffix + '/checkout/results?payStatus=1&dealId=' + dealId;
          } else {
            window.location.href = urlSuffix + '/checkout/results?payStatus=0';
          }
        } else {
          window.location.href = urlSuffix + '/checkout/results?payStatus=0&msg=' + encodeURIComponent(res.resultMsg);
        }
      })
      .catch(() => {
        window.location.href = urlSuffix + '/checkout/results?payStatus=0';
      });
  },
  // 驗證結帳時，商品資料是否正確. 目前驗證活動是不是改購買的商品
  async validCheckoutProducts(cartData) {
    const { cartDiscountData, items } = cartData;
    const { campaigns } = cartDiscountData;

    if (!campaigns || campaigns.length === 0) return true;
    const oriCampaigns = JSON.parse(JSON.stringify(campaigns));

    // 收集pid
    const pids = items.reduce((p, c) => {
      const pidAry = c.mainProducts.map(v => v.productId);
      return p.concat(pidAry);
    }, []);

    const promiseAll = [];
    for(let p of pids) {
      promiseAll.push(getProduct(p, 'applied'));
    }

    // 取商品原始資料
    const oriProductObj = {};
    await Promise.all(promiseAll).then(values => {
      values.forEach(v => {
        oriProductObj[v.pid] = {
          campaignFlags: [...new Set(v.campaignFlags.v.filter(a => a).flat())]
        };
      })
    });

    // 比對活動跟商品關係
    oriCampaigns.forEach(c => {
      c.pids.forEach(p => {
        if (oriProductObj[p]?.campaignFlags) {
          if (oriProductObj[p].campaignFlags.includes(c.campaignId)) {
            console.log(p + ' 正常有 ' + c.campaignId);
          } else {
            console.log(p + ' 不正常有 ' + c.campaignId);
          }
        } else {
          console.log(p + '沒有campaignFlags');
        }
      })
    })

  },
  // 收集追蹤碼COOKIE
  trackingCodeArray() {
    const allowAry = [
      '1ST_CHANNEL_ID',
      'LAST_CHANNEL_ID',
      'CHANNEL_ID3',
      'CHANNEL_ID4',
      'CHANNEL_ID4',
      'CHANNEL_ID5',
      'CHANNEL_ID6',
      'CHANNEL_ID7',
      'CHANNEL_ID8',
      'CHANNEL_ID3_DATE',
      'CHANNEL_ID7_DATE',
      'refererUrl',
    ];
    const output = [];
    var mycookie = document.cookie.split('; ');
    for (var i = 0; i < mycookie.length; i++) {
      var cookie1 = mycookie[i].split('=');
      if (allowAry.includes(cookie1[0])) {
        output.push({
          traceType: cookie1[0],
          traceValue: cookie1[1],
        });
      }
    }
    return output;
  },
};

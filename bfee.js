/**
 * 運費相關
 */
const { shipFeeApiPath } = require('./configs.js');
const { getCache, setCache } = require('./tools.js');

module.exports = {
  /** 
   * 取運費API資料
    EXP:宅配、SVN:7-11、FAM:全家、WHD:寄倉
236：常溫、237：冷藏、238：冷凍、239：大材積、1083：免運


    mock data
    {
      "status": 200,
      "message": "OK",
      "data": {
        "supplierId": "243",
        "conditions": {
          "EXP_236": "788,100",
          "SVN_236": "499,60",
          "FAM_236": "499,60",
          "WHD_236": "490,70",
          "EXP_238": "988,150",
          "SVN_238": "988,129",
          "FAM_238": "988,129",
          "EXP_237": "988,150",
          "EXP_239": "1500,250"
        }
      }
    }

    https://docs.google.com/document/d/1T_-rA0LWFb81aKOdUDWJgjJnaYrUhSlq6sc4SDK_YGo/edit
   * */
  async getShipFeeApi(supplierId) {
    const cacheName = 'bfee_' + supplierId;
    const cache = getCache(cacheName);
    if (cache) return cache;

    return await fetch(shipFeeApiPath + '/bfeeApi/v2/query/' + supplierId)
      .then((res) => res.json())
      .then((res) => {
        const { status, data } = res;
        if (status === 200 && data.conditions) {
          setCache(cacheName, data.conditions, 300);
          return data.conditions;
        } else {
          setCache(cacheName, [], 300);
          return null;
        }
      })
      .catch(() => {
        return null;
      });
  },
  /**
   * 取得運費物件Key名
   */
  getShipFeeObjectKey(sellSetId, shipmentPreserveId, cartType, storeType) {
    const cartTypeIdx = cartType === 'home' ? 1 : 2;
    let conditionsName = 'EXP';
    if ([1, 3].includes(sellSetId)) {
      conditionsName = 'WHD';
    } else {
      if (cartTypeIdx === 2) {
        storeType === 1 ? (conditionsName = 'SVN') : (conditionsName = 'FAM');
      }
    }
    return conditionsName + '_' + shipmentPreserveId;
  },
  // 取得超商最大可能運費
  getStoreFeeMaxAmount(configs, shipmentPreserveId) {
    const svnName = 'SVN_' + shipmentPreserveId;
    const famName = 'FAM_' + shipmentPreserveId;
    let svnAmount = 0;
    let famAmount = 0;
    if (configs[svnName]) svnAmount = configs[svnName].split(',')[1];
    if (configs[famName]) famAmount = configs[famName].split(',')[1];
    return Math.max(svnAmount, famAmount);
  },
  // 重新計算cartItem裡的運費總額
  reCalcShipFeeAmount(cartItems, storeType) {
    return cartItems.reduce((p, c, i) => {
      // 超商因為選擇不同，運費要重新計算過
      if (c.shipFee > 0 && c.shipConfigKey && storeType) {
        const shipmentPreserveId = c.shipConfigKey.split('_')[1];
        const shipFeePrefix = storeType === 1 ? 'SVN_' : 'FAM_';
        const shipFeeKey = shipFeePrefix + shipmentPreserveId;
        const shipConfig = c.shipConfigs[shipFeeKey];
        if (shipConfig) {
          const shipAry = shipConfig.split(',');
          if (shipAry[1]) {
            c.shipFee = parseInt(shipAry[1]);

            // 改變原來設定的資料
            cartItems[i].shipConfigKey = shipFeeKey;
            cartItems[i].shipFee = c.shipFee;
          }
        }
      }

      return (p += c.shipFee);
    }, 0);
  },
  /**
   * 取得結帳運費矩陣
   * 宅配：EXP、7-11：SVN、全家：FAM、寄倉：WHD
     常溫：236、冷藏：237、冷凍：238、免運：1083、大材積：2292
  */
  getShipFeeCheckoutPayload(cartItems) {
    const ary = [];

    cartItems.forEach((v) => {
      if (v.shipFee > 0) {
        const sizeId = [];

        // 收集主商品、組合母商品 specId
        v.mainProducts.forEach((c) => {
          sizeId.push(c.specId);

          // 加購品
          // c.additionalProducts.forEach(a => {
          //   sizeId.push(a.specId);
          // });
          // 贈品
          // c.giftProducts.forEach(g => {
          //   sizeId.push(g.specId);
          // })
          // 組合子商品
          // c.comboProducts.forEach(b => {
          //   sizeId.push(b.specId);
          // })
        });

        ary.push({
          amount: v.shipFee,
          supplierId: v.mainProducts[0].shipFeeSupplierId,
          sizeId: sizeId.join(','),
          shipmentPreserve: v.shipConfigKey,
        });
      }
    });

    return ary;
  },
};

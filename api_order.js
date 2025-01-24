/**
 * 訂單相關API
 *
 * below memo
 * *
 */

const {
  frontApiPath,
  mobileApiPath,
  // shipFeeApiPath,
  fetchGetHeaders,
  fetchPostHeaders,
  websiteDomain,
} = require('./configs.js');

const {
  aiLogServer
} = require('./tools.js')

// 設定FRONT API位置
const apiPath = frontApiPath();
// 設定mobileAPI位置
const mapiPath = mobileApiPath();

const thirdPartyObj = {
  linepay: 'LINE',
  街口支付: 'JKO',
  '全盈+pay': 'PLUS',
  悠遊付: 'UUPAY',
  'happygo pay': 'HGPAY',
};

const isMobile = /mobile/i.test(navigator.userAgent);
const isAppWebview = /gohappy/i.test(navigator.userAgent);

module.exports = {
  // 取得第3方支付連結
  async getThirdPartyRePayUrl(payload) {
    return await fetch(`${apiPath}payment/thirdPay/entry`, {
      ...fetchPostHeaders,
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultCode, resultData } = res;
        if (resultCode === 0) {
          let payName = '';
          for (let i in thirdPartyObj) {
            if (payload.thirdPayType === thirdPartyObj[i]) payName = i;
          }

          window.sessionStorage.setItem(
            'checkoutThirdPayInfo',
            JSON.stringify({
              payName,
              redirectUrl: payload.resultDisplayUrl,
            })
          );
          return resultData;
        }
        return null;
      });
  },
  // 取得銀行
  async getBanks() {
    return await fetch(`${mapiPath}getBank`)
      .then((res) => res.json())
      .then((res) => {
        const { code, payload } = res;
        return code === 1 ? payload[0].bankList : [];
      });
  },
  // 取得銀行分行
  async getBankBranch(id) {
    return await fetch(`${mapiPath}getBankBranch?id=${id}`)
      .then((res) => res.json())
      .then((res) => {
        const { code, payload } = res;
        return code === 1 ? payload[0].bankList : [];
      });
  },
  // 取得訂單折抵明細
  async getOrderDiscounts(dealId) {
    return await fetch(`${apiPath}v1/order/getorderamountdetail`, {
      ...fetchPostHeaders,
      body: JSON.stringify({
        dealId,
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultCode, resultData } = res;
        if (resultCode !== 0) aiLogServer('getOrderDiscounts', res);
        return resultCode === 0 ? resultData : [];
      });
  },
  // 取得訂單購買證明
  async getOrderProductProof(dealId, productId, sizeId) {
    return await fetch(`${apiPath}mgmt/order/getFile/2?dealId=${dealId}&productId=${productId}&sizeId=${sizeId}`, {
      ...fetchGetHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultMsg, resultData } = res;
        return resultData?.fileUrl ? `https://${resultData.fileUrl}` : resultMsg;
      });
  },
  // 取得退訂訂單折抵明細
  async getRefundOrderDiscounts(dealId) {
    return await fetch(`${apiPath}v1/order/getrefundamountdetail`, {
      ...fetchPostHeaders,
      body: JSON.stringify({
        dealId,
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultCode, resultData } = res;
        if (resultCode !== 0) aiLogServer('getRefundOrderDiscounts', res);
        return resultCode === 0 ? resultData : [];
      });
  },
  // 退訂訂單
  async setOrderRefund(payload) {
    if (/print=1/i.test(location.search)) {
      console.log('退訂資料', JSON.stringify(payload, 0, 2));
      return;
    }

    // aiLogServer('setOrderRefundPayload', payload);

    return await fetch(`${apiPath}v1/order/return`, {
      ...fetchPostHeaders,
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultCode } = res;

        if (resultCode !== 0) aiLogServer('setOrderRefund', res);

        return resultCode === 0;
      });
  },
  // 取得訂單明細
  async getOrders(page = 1, rows = 10) {
    const siteId = window.siteData?.siteId || '';
    return await fetch(`${apiPath}v1/order/getcusorderlist`, {
      ...fetchPostHeaders,
      body: JSON.stringify({
        pageNumber: page,
        pageSize: rows,
        siteId,
      }),
    })
      .then((res) => res.json())
      .then(async (res) => {
        const { resultCode, resultData } = res;

        if (resultCode !== 0) {
          aiLogServer('getOrders', res);
          return [];
        }
        if (!resultData) {
          return [];
        }
        
        // 格式化資料
        return resultData.map((v) => {
          let isShowRefundBankForm = false, //  是否顯示退訂表單 退款資訊
            isShowRefundBankSelected = false, //  是否需要判斷退款資訊有條件選擇商品，全選不用填（信用卡情境
            isShowReturnAddressForm = false, //  是否顯示超取訂單 回收收件人地址
            isShowProcessStatusBar = true; // 是否顯示進度條

          // 獨立組合商品資料
          const mainProducts = [];
          const comboObj = {};
          const giftObj = {};
          v.productData.forEach((x) => {
            if (x.productType === 'COMBO' && x.parentId !== 0) {
              if (!comboObj[x.parentId]) comboObj[x.parentId] = [];
              comboObj[x.parentId].push(x);
            } else if (x.productType === 'GIFT') {
              if (!giftObj[x.parentId]) giftObj[x.parentId] = [];
              giftObj[x.parentId].push(x);
            } else {
              mainProducts.push(x);
            }
          });
          let isSomeReturnFlag = false;
          // 格式化資料
          v.productData = mainProducts.map((c) => {
            if (c.returnFlag === 'Y') {
              isSomeReturnFlag = true;
            }
            let step1 = null,
              step2 = null,
              step3 = null,
              step4 = null,
              step5 = null,
              step6 = null;

            // 設定排序
            switch (c.productType) {
              case 'PRD':
                c.sortIdx = 1;
                break;
              case 'ACC':
                c.sortIdx = 2;
                break;
              case 'COMBO':
                c.sortIdx = 3;
                break;
            }

            const {
              orderDate,
              // cfConfidenceDate,
              tranferDate,
              shipConfirmDate,
              packageInStoreDate,
              pickupDate,
              applyReturnDate,
              dispatchPickupDate,
              confirmNoDefectsDate,
              refundedDate,
            } = c.timestamp;

            // 組合商品資料組合回來
            if (comboObj[c.productId]) {
              c['combodata'] = comboObj[c.productId];
            }
            // 贈品組合回來
            if (giftObj[c.productId] && c.productType === 'PRD') {
              c['giftdata'] = giftObj[c.productId];
            }

            // 是否顯示配送詳情
            c['isShowShippingDetail'] =
              !['超商7_11', '超商全家'].includes(v.shippingType) && c.logisticName && c.deliveryNo;

            // 正訂單流程
            if (!/^R/i.test(v.dealId)) {
              step1 = {
                text: `收到訂單`,
                time: `${orderDate.substr(0, 5)}`,
                active: true,
              };

              // step2 = cfConfidenceDate
              //   ? {
              //       text: `付款成功`,
              //       time: `${cfConfidenceDate.substr(0, 5)}`,
              //       active: true,
              //     }
              //   : {
              //       text: `付款成功`,
              //       active: false,
              //     };

              step3 = tranferDate
                ? {
                    text: `訂單處理`,
                    time: `${tranferDate.substr(0, 5)}`,
                    active: true,
                  }
                : {
                    text: `訂單處理`,
                    active: false,
                  };

              step4 = shipConfirmDate
                ? {
                    text: `已出貨`,
                    time: `${shipConfirmDate.substr(0, 5)}`,
                    active: true,
                  }
                : {
                    text: `已出貨`,
                    active: false,
                  };

              if (['超商7_11', '超商全家'].includes(v.shippingType)) {
                step5 = packageInStoreDate
                  ? {
                      text: v.pickupStoreName,
                      time: `${packageInStoreDate.substr(0, 5)}`,
                      active: true,
                    }
                  : {
                      text: v.pickupStoreName,
                      active: false,
                    };
                step6 = pickupDate
                  ? {
                      text: '取貨完成',
                      time: `${pickupDate.substr(0, 5)}`,
                      active: true,
                    }
                  : {
                      text: '取貨完成',
                      active: false,
                    };
              }

              // 控制退款銀行表單
              if (v.payment.status === '付款完成') {
                if (/^(信用卡紅利折抵|(信用卡 \d))/i.test(v.payType)) {
                  isShowRefundBankSelected = true;
                  isShowRefundBankForm = true;
                }
                if (v.payType === 'ATM') {
                  isShowRefundBankForm = true;
                }
              }
              if (v.payType === '超商取貨付款') {
                isShowRefundBankForm = true;
              }
              // 是否顯示退訂地址填寫表單
              if (shipConfirmDate) {
                isShowReturnAddressForm = true;
              }
            } else {
              // 退訂單流程
              step1 = applyReturnDate
                ? {
                    text: `退訂處理中`,
                    time: `${applyReturnDate.substr(0, 5)}`,
                    active: true,
                  }
                : {
                    text: `退訂處理中`,
                    active: false,
                  };

              if (v.shippingType === '宅配收貨') {
                // 退訂 不一定派車流程
                step2 = dispatchPickupDate
                  ? {
                      text: `派車收貨`,
                      time: `${dispatchPickupDate.substr(0, 5)}`,
                      active: true,
                    }
                  : {
                      text: `派車收貨`,
                      active: false,
                    };
                step3 = confirmNoDefectsDate
                  ? {
                      text: `商品檢驗`,
                      time: `${confirmNoDefectsDate.substr(0, 5)}`,
                      active: true,
                    }
                  : {
                      text: `商品檢驗`,
                      active: false,
                    };
              }

              step4 = refundedDate
                ? {
                    text: `已退款`,
                    time: `${refundedDate.substr(0, 5)}`,
                    active: true,
                  }
                : {
                    text: `已退款`,
                    active: false,
                  };

              // ATM被取消的情境 不用顯示進度條
              if (v.shippingType === '取消訂單' && v.payType === null) {
                isShowProcessStatusBar = false;
              }
            }

            // 是否可以退貨
            c['canReturn'] = c.canReturn === 'Y' && c.returnFlag === null;

            //處理貨態進度條
            c['deliverProcess'] = [step1, step2, step3, step4, step5, step6].filter((x) => x);

            return c;
          });

          // 是否可以退
          v.canReturn = v.productData.every((x) => x.canReturn);

          // 重新排序
          v.productData = v.productData.sort((a, b) => a.sortIdx - b.sortIdx);

          // 設定發票連結
          if (v.payment.status === '付款完成' && v.payType !== '全額折抵' && v.memberId) {
            v['invoiceUrl'] = `/member/invoice/printing?dealId=GH${v.dealId}`;
          }

          // 第3方支付並未付款
          if (!isAppWebview && v.payment.status === '尚未付款') {
            if (Object.keys(thirdPartyObj).includes(v.payType)) {
              const urlSuffix = window.siteData ? '/' + window.siteData.urlSuffix : '';
              const displayUrl = websiteDomain() + urlSuffix + '/checkout/results';

              v['rePayPayload'] = {
                amount: v.dealPayAmount,
                dealId: v.dealId,
                deviceType: isMobile ? 11 : 12,
                resultDisplayUrl: displayUrl,
                thirdPayType: thirdPartyObj[v.payType],
              };
            }
          }

          // ATM轉帳資訊
          if (!/^R/i.test(v.dealId) && v.payType === 'ATM' && v.payment.status === '尚未付款') {
            const deadline = new Date(v.orderDate);
            deadline.setDate(deadline.getDate() + 1);
            deadline.setHours(23, 59, 59);
            if (new Date().getTime() < deadline.getTime()) {
              v['bankInfo'] = '009 彰化商業銀行 ' + v.atmPaymentData.account;
            }
          }

          /**
           * 新增額外文字處理
           * https://ysdtfrontendapiorder.docs.apiary.io/#reference/0/api/getcusorderlist
           * */
          // 付、退款方式
          const returnPayTypeHintText = v.payType === '信用卡刷退' ? '(實際退款時間依各發卡銀行為準)' : '';
          // 正、負物流方式

          return Object.assign(v, {
            returnPayTypeHintText,
            orderDate: new Date(v.orderDate).toLocaleDateString(),
            orderTime: new Date(v.orderDate).toLocaleTimeString('en-US', { hour12: false }).substr(0, 5),
            isShowRefundBankForm,
            isShowRefundBankSelected,
            isShowReturnAddressForm,
            isShowProcessStatusBar,
            isSomeReturnFlag, //是否存在部分退訂
          });
        });
      })
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
  // 取得收件人隱碼解碼資料
  async getConsigneeDecode(orderId = 0, typeId = 4 /** 4 姓名 6 地址 */) {
    return await fetch(`${apiPath}decode/personal`, {
      ...fetchPostHeaders,
      body: JSON.stringify({
        param: {
          orderId,
          typeId,
        },
        requestId: new Date().toLocaleString(),
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultCode, resultData } = res;
        return resultCode === 0 ? resultData : '';
      });
  },
  // 取得訂單AD廣告
  async getSkyAdBanner() {
    return await fetch(`https://m.shopping.friday.tw/mobileapi/bannerapi/getSkyBanner`)
      .then((res) => res.json())
      .then((res) => {
        const { payload } = res;
        if (payload && payload.length > 0) {
          return payload;
        } else {
          return [];
        }
      });
  },
  //查詢問答紀錄
  async queryQaRecord(dealOrOrderId, sizeId) {
    let url = `${frontApiPath()}list/${dealOrOrderId}`;
    if (sizeId) {
      url += `/${sizeId}`;
    }
    return await fetch(url, fetchPostHeaders)
      .then((res) => res.json())
      .then((res) => {
        const { resultData } = res;
        if (resultData) {
          let d = Object.values(resultData).map((ele) => {
            const now = new Date();
            const MessageDay = new Date(ele.createTime);
            const isToday = now.toLocaleDateString() === MessageDay.toLocaleDateString();
            const formatDate = isToday
              ? MessageDay.toLocaleTimeString('zh-TW', { hour12: false }).replace(/[\w:]{3}$/, '')
              : MessageDay.toLocaleString('zh-TW', { hour12: false }).replace(/[\w:]{3}$/, '');
            return {
              ...ele,
              date: new Date(ele.createTime).getTime(),
              formatDate,
            };
          });
          d = d.sort((a, b) => b.date - a.date);
          return d;
        } else {
          return [];
        }
      })
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
  //問答紀錄提問
  async addQA(postData) {
    let url = `${frontApiPath()}addCase`;
    return await fetch(url, {
      ...fetchPostHeaders,
      body: JSON.stringify(postData),
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultData } = res || {};
        if (resultData) {
          return resultData;
        } else {
          return {};
        }
      })
      .catch((e) => {
        console.error(e);
        return {};
      });
  },
  // 取得問答紀錄類別清單
  async getQuestionTypeCategory() {
    return await fetch(`${frontApiPath()}crm/category`, {
      ...fetchPostHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultData } = res;
        return resultData ? resultData : [];
      })
      .catch((e) => {
        console.error(e);
        return [];
      });
  },
  // 取得訂單發票列印檔
  async getOrderInvoice() {
    const dealId = new URLSearchParams(location.search)?.get('dealId');
    return await fetch(`${frontApiPath()}v1/order/getorderinvo`, {
      ...fetchPostHeaders,
      body: JSON.stringify({
        dealId,
        requestId: dealId,
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultData } = res;

        if (!Array.isArray(resultData)) {
          return {
            code: 1009,
            msg: '親愛的顧客您好，您的發票正在處理中，請耐心等候。',
          };
        }

        return {
          code: 0,
          data: resultData,
        };
      })
      .catch(() => {
        return {
          code: 1009,
          msg: '親愛的顧客您好，您的發票正在處理中，請耐心等候。',
        };
      });
  },
};

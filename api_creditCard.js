/**
 * 新用卡相關API
 *
 * below memo
 * *
 */

const {
  frontApiPath,
  fetchPostHeaders,
} = require('./configs.js');

// 設定front API位置
const frontPath = frontApiPath();

module.exports = {
  //查詢信用卡列表
  async getCreditCard() {
    return await fetch(`${frontPath}mgmt/member/creditcard`, {
      ...fetchPostHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultData } = res;
        return resultData?.creditCardInfos || [];
      })
      .catch(() => {
        console.error('queryCreditCard api Error!');
        return [];
      });
  },
  //新增信用卡
  async addCreditCard(postData) {
    return await fetch(`${frontPath}mgmt/member/creditCardAdd`, {
      ...fetchPostHeaders,
      body: JSON.stringify(postData),
    })
      .then((res) => res.json())
      .then((res) => {
        return res?.resultCode === 0 || false;
      })
      .catch(() => {
        return false;
      });
  },
  // 設定信用卡
  async updateCreditCard(postData) {
    return await fetch(`${frontPath}mgmt/member/creditCardUpdate/default`, {
      ...fetchPostHeaders,
      body: JSON.stringify(postData),
    })
      .then((res) => res.json())
      .then((res) => {
        return res?.resultCode === 0 || false;
      })
      .catch(() => {
        return false;
      });
  },
  // 刪除信用卡
  async deleteCreditCard(cartId) {
    return await fetch(`${frontPath}mgmt/member/creditCardDel/${cartId}`, {
      ...fetchPostHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        return res?.resultCode === 0 || false;
      })
      .catch(() => {
        return false;
      });
  },
  //適用銀行
  async getAllpointsdeductibles() {
    return await fetch(`${frontPath}bank/getAllPointsDeductibles`, {
      ...fetchPostHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        return res?.resultData || [];
      })
      .catch((err) => {
        console.error(err);
        return null;
      });
  },
};

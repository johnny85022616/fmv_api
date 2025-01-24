/**
 * 新用卡相關API
 *
 * below memo
 * *
 */

const { frontApiPath, fetchPostHeaders } = require('./configs.js');
const uiAlert = require('./ui_alert.js');

// 設定front API位置
const frontPath = frontApiPath();

module.exports = {
  // 取得發票資訊
  async getInvoice() {
    return await fetch(`${frontPath}mgmt/member/invoice/getInvoice`, {
      ...fetchPostHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        const {resultCode ,resultData} = res
        if (resultCode  === 0 && resultData) {
          const invoiceData = resultData.invoiceInfos;
          invoiceData?.forEach(v => {
            v.type = parseInt(v.invType);
            if(v.type === 1){
              v.name = "伊甸基金會"
            }
          });
          return invoiceData;
        } else {
          return null;
        }
      })
      .catch((err) => {
        console.error(err);
        return null;
      });
  },
  // 更新個人電子發票
  async updateInvoice(payload) {
    return await fetch(`${frontPath}mgmt/member/invoice/setInvoice`, {
      ...fetchPostHeaders,
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((res) => {
        const {resultCode ,resultMsg} = res
        if (resultCode === 0) {
          uiAlert.getFadeAlert("更新成功")
          return true;
        } else {
          uiAlert.getFadeAlert(resultMsg)
          return false;
        }
      })
      .catch((err) => {
        console.error(err);
        uiAlert.getFadeAlert("更新失敗")
        return false;
      });
  },
  // 刪除個人電子發票
  async deleteInvoice(type) {
    return await fetch(`${frontPath}mgmt/member/invoice/delInvoice?type=${type}`, {
      ...fetchPostHeaders,
      body: JSON.stringify(type),
    })
      .then((res) => res.json())
      .then((res) => {
        const {resultCode, resultMsg} = res
        if (resultCode === 0) {
          uiAlert.getFadeAlert("重置成功")
          return true;
        } else {
          uiAlert.getFadeAlert(resultMsg)
          return false;
        }
      })
      .catch((err) => {
        console.error(err);
        uiAlert.getFadeAlert("重置失敗")
        return null;
      });
  },
  // 驗證手機條碼
  async verifyVehicle(barcode) {
    return /^\//i.test(barcode) && barcode.length === 8;
  },
};

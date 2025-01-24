/**
 * 會員相關API
 *
 * below memo
 * *
 */

const {
  mobileApiPath,
  frontApiPath,
  fetchGetHeaders,
  fetchPostHeaders,
  fetchDeleteHeaders,
  addressData,
  getCookie,
  setCookie,
  deleteCookie,
  isLogin,
  loginUrl,
  isMobile,
  faToken,
  websiteDomain,
  faTokenName,
} = require('./configs.js');

const {
  getCache,
  setCache
} = require('./tools.js');
const uiAlert = require('./ui_alert.js')

// 設定FRONT API位置
const apiPath = mobileApiPath();
const frontPath = frontApiPath();

module.exports = {
  // 登入Token
  faToken,
  // 登入狀態
  isLogin,
  // 登入網址
  loginUrl,
  // 執行登出
  async doLogout() {
    await fetch(`${frontPath}member/auth/logout`, {
      ...fetchPostHeaders,
    })
      .then((res) => res.json())
      .then(() => true)
      .catch(() => true);

    deleteCookie(faTokenName);
    window.localStorage.removeItem(faTokenName);

    // 清掉舊Cookie
    if (getCookie('DDIM-EC-OAUTH')) {
      deleteCookie('DDIM-EC-CAPTCHA');
      deleteCookie('DDIM-EC-ID');
      deleteCookie('DDIM-EC-LOGINT');
      deleteCookie('DDIM-EC-NAME');
      deleteCookie('DDIM-EC-OAUTH');
    }
    if (getCookie('FEEC-B2C-TICKET')) {
      deleteCookie('FEEC-B2C-ACCESS');
      deleteCookie('FEEC-B2C-INFO');
      deleteCookie('FEEC-B2C-TICKET');
      deleteCookie('FEEC-B2C-UID');
    }

    const loginMode = window.localStorage.getItem('loginMode');
    if (loginMode === 'fetnet') {
      window.localStorage.removeItem('loginMode');
      const fetnetSubDomain = /uat/.test(location.host) ? '-test' : '';
      window.location.href = `https://login2${fetnetSubDomain}.fetnet.net/logout/logout?url=${encodeURIComponent(websiteDomain())}`;
      return;
    }

    window.location.href = '/';
  },
  // 是否手機
  isMobile,
  // 取得TOKEN展延
  async getTokenRefresh() {
    // 沒登入不執行
    if (!isLogin) return;

    // 找到30天期的展延紀錄，就不要展延
    const trCache = getCache('tr', 'l');
    if (trCache) return;

    // 展延Token,並重新設定
    return await fetch(`${frontPath}member/auth/refresh`, {
      ...fetchPostHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultData } = res;
        if (/^FE_Token/i.test(resultData?.token)) {
          // 重新儲存Token
          const faToken = resultData.token.replace('FE_Token::', '');
          setCookie(faTokenName, faToken, 365);
          window.localStorage.setItem(faTokenName, faToken);
          // 存30天後，再觸發展延
          setCache('tr', '1', 30 * 86400, 'l');
        } else {
          deleteCookie(faTokenName);
          window.localStorage.removeItem(faTokenName);
          window.location.href = loginUrl();
        }
        return true;
      })
      .catch(() => {
        return false;
      });
  },
  // 取得會員資料
  async getMember() {
    return await fetch(`${frontPath}member/info/getMemberInfo`, {
      ...fetchPostHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultCode, resultData } = res;
        if(resultCode === 0 && resultData){
          return resultData 
        }
        return null 
      })
      .catch(() => {
        return null;
      });
  },
  // 更新會員資料
  async updateMember(postData) {
    return await fetch(`${frontPath}member/info/updateV2`, {
      ...fetchPostHeaders,
      body: JSON.stringify({
        param: postData
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultCode, resultMsg } = res;
        if(resultCode === 0){
          uiAlert.getFadeAlert("會員資料更新成功！");
          return true;
        }
        uiAlert.getFadeAlert(resultMsg);
        return false;
      })
      .catch(() => {
        uiAlert.getFadeAlert("會員資料更新失敗！");
        return false;
      });
  },
  // 取得會員追蹤商品 （我的最愛）
  async getFavorite() {
    return await fetch(`${apiPath}collection/product`, {
      ...fetchGetHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        const { code, payload } = res;
        return code === 1 && payload.length > 0 ? payload[0].wishlist.filter((e) => !e.product.soldout) : null;
      })
      .catch(() => {
        return null;
      });
  },
  // 刪除會員追蹤商品 （我的最愛）
  async deleteFavorite(pid) {
    return await fetch(`${apiPath}collection/product?productId=${pid}`, {
      ...fetchDeleteHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        return res.code === 1;
      })
      .catch(() => {
        return false;
      });
  },
  // 取得收件人
  async getConsignee() {
    return await fetch(`${frontPath}receiver/getReceiver`, {
      ...fetchPostHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultCode, resultData, resultMsg} = res;
        let data 
        if([0, 800].includes(resultCode) && resultData){
          data = resultData.info?.map(ele=>{
            return { ...ele, isDefault: ele.isDefault === 'Y'? true: false }
          })
          return data
        }
        uiAlert.getFadeAlert(resultMsg)
        return  null
      })
      .catch(() => {
        uiAlert.getFadeAlert("取得收貨人發生錯誤")
        return null;
      });
  },
  //新增收貨人
  async createConsignee(postData){
    return await fetch(`${frontPath}receiver/addReceiver`, {
      ...fetchPostHeaders,
      body: JSON.stringify(postData),
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultCode, resultData, resultMsg } = res;
        if(resultCode === 0 && resultData){
          uiAlert.getFadeAlert('新增收貨人成功')
          return true
        }
        uiAlert.getFadeAlert(resultMsg)
        return  false
      })
      .catch(() => {
        uiAlert.getFadeAlert('新增收貨人失敗')
        return false;
      });
  },
  //刪除收貨人
  async deleteConsignee(deleteId){
    return await fetch(`${frontPath}receiver/deleteReceiver`, {
      ...fetchPostHeaders,
      body: JSON.stringify({dataId: [deleteId]}),
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultCode, resultMsg} = res;
        if(resultCode === 0 ){
          uiAlert.getFadeAlert('刪除收貨人成功')
          return true
        }
        uiAlert.getFadeAlert(resultMsg)
        return  false
      })
      .catch(() => {
        uiAlert.getFadeAlert('刪除收貨人失敗')
        return false;
      });
  },
  //更新收貨人
  async updateDefaultConsignee(updateId){
    return await fetch(`${frontPath}receiver/updateDefaultReceiver?dataId=${updateId}`, {
      ...fetchPostHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultCode, resultMsg} = res;
        if(resultCode === 0 ){
          uiAlert.getFadeAlert('已變更預設收貨人')
          return true
        }
        uiAlert.getFadeAlert(resultMsg)
        return  false
      })
      .catch(() => {
        uiAlert.getFadeAlert('變更預設收貨人失敗')
        return false;
      });
  },
  // 取得超取資料
  async getStoreInfos() {
    return await fetch(`${frontPath}member/store/list`, {
      ...fetchPostHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultCode, resultData } = res;
        return [0,800].includes(resultCode) && resultData ? resultData : null;
      })
      .catch(() => {
        return null;
      });
  },
  //查正確店號
  async getValidStoreId(storeType = '1', storeId = '0') {
    return await fetch(`${frontPath}delivery/store/validstoreid/${storeType}/${storeId}`, {
      ...fetchGetHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        return res?.resultData?.validStoreId;
      })
      .catch(() => {
        console.error(`getValidStoreId faliure.`);
        return null;
      });
  },
  // 新增取貨門市(儲存至取貨門市通訊錄)
  async createStore(postData) {
    // 取得正確店號 特別是全家需要轉換
    const validId = await this.getValidStoreId(postData.storeType, postData.storeId);
    if (validId) {
      postData.storeId = validId;
    }
    return await fetch(`${frontPath}member/store/insertStore`, {
      ...fetchPostHeaders,
      body: JSON.stringify({
        param: {
          data: postData
        }
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        //   res = {
        //     "code": 1,
        //     "message": "OK",
        //     "timestamp": "20240509170721",
        //     "requestId": "1715245641641",
        //     "payload": [
        //         {
        //             "convenienceStoreInfos": [
        //                 {
        //                     "storeType": 2,
        //                     "storeName": "全家大甲水源店",
        //                     "consigneeName": "張裕",
        //                     "maskConsigneeName": "張*",
        //                     "storeId": "018380",
        //                     "maskPhoneNumber": "0955 *** 647",
        //                     "phoneNumber": "0955755647",
        //                     "storeAddress": "台中市大甲區水源路450號",
        //                     "storeStatus": 1,
        //                     "createDate": 1715274420000,
        //                     "isDefault": true,
        //                     "expressCheckoutId": "s22392604691412748786",
        //                     "email": "nte.82002@gmail.com",
        //                     "maskEmail": "nt*******@gmail.com"
        //                 }
        //             ]
        //         }
        //     ]
        // }
        const { resultCode, resultMsg } = res;
        if (resultCode === 0) {
          uiAlert.getFadeAlert('新增門市成功')
          return true;
        } else {
          uiAlert.getFadeAlert(resultMsg);
          return false;
        }
      })
      .catch(() => {
        return null;
      });
  },
  // 刪除取貨門市
  async deleteStore(dataId) {
    return await fetch(`${frontPath}member/store/deleteStore`, {
      ...fetchPostHeaders,
      body: JSON.stringify({
        param: {
          dataId: [dataId]
        },
      }),
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultCode, resultMsg } = res;
        if (resultCode === 0) {
          uiAlert.getFadeAlert('刪除成功')
          return true
        } else {
          uiAlert.getFadeAlert(resultMsg);
          return false;
        }
      })
      .catch(() => {
        return false;
      });
  },
  // 更新會員預設店取資料
  async updateDefaultStore(storeId) {
    return await fetch(`${frontPath}member/store/updateDefaultStore?storeId=${storeId}`, {
      ...fetchPostHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultCode, resultMsg } = res;
        if (resultCode === 0) {
          uiAlert.getFadeAlert('更新成功')
          return true
        } else {
          uiAlert.getFadeAlert(resultMsg);
          return false;
        }
      })
      .catch(() => {
        return false;
      });
  },
  //查購物金餘額
  async queryVoucherBalance() {
    return await fetch(`${frontPath}member/voucher/queryVoucherBalance`, {
      ...fetchGetHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        // const res = {
        //   requestId: '1d3b71fc9f3340e2bcb22019d64d5b5e',
        //   resultCode: 0,
        //   resultMsg: '作業成功',
        //   runTime: '85 ms',
        //   resultData: 2,
        // };
        return res?.resultData;
      })
      .catch((err) => {
        console.error(`queryVoucherBalance faliure.`);
        console.error(err);
        return 0;
      });
  },
  //查購物金歷史清單
  async queryVoucherList(page = 0, rows = 10) {
    const data = await fetch(`${frontPath}member/voucher/transaction/history?page=${page}&rows=${rows}`, {
      ...fetchGetHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        if (res && res.resultData && res.resultData.content?.length > 0) {
          return res.resultData;
        }
        return null;
      })
      .catch((err) => {
        console.error(`queryVoucherList faliure.`);
        console.error(err);
        return null;
      });
    return data;
  },
  //查遠傳幣餘額
  async getFetCoins() {
    const data = await fetch(`${frontPath}fcoin/queryPoints`, {
      ...fetchPostHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        // const res = {
        //   "requestId": "1732095109258",
        //   "resultCode": 0,
        //   "resultMsg": "執行成功",
        //   "runTime": "95 ms",
        //   "resultData": {
        //       "pointType": "fcms",
        //       "totalPoint": 22
        //   }
        // }
        return res?.resultData?.totalPoint || 0;
      })
      .catch(() => {
        return 0;
      });
    return data;
  },
  //會員遠傳幣交易明細(不傳參數取全部)
  async queryFcoinHistory(page, rows){
    let url = `${frontPath}fcoin/queryFcoinHistory`
    if(rows){
      url += `?page=${page}&rows=${rows}`
    }
    return await fetch(url, {
      ...fetchPostHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        const {resultCode , resultData, resultMsg} = res 
        if(resultCode === 0 && resultData){
          return resultData.content || []
        }
        uiAlert.getFadeAlert(resultMsg)
        return []
      })
      .catch(() => {
        uiAlert.getFadeAlert("取得遠傳幣交易明細錯誤")
        return [];
      });
  },
  // 查詢HAPPY GO綁定狀態
  async checkHappyGoFederate() {
    return await fetch(`${frontPath}hg/checkFederate`, {
      ...fetchPostHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultCode } = res;
        /** 999 : 發生未知的錯誤
            1002: 參數格式錯誤
            1300: Member has never been federated before
            3001: 查無此會員
            800: 查無資料 */
        if (resultCode === 0) {
          return true
        }
        return false
      })
      .catch(() => {
        uiAlert.getFadeAlert("取得HAPPYGO綁定狀態錯誤")
        return false;
      });
  },
  // HG綁定服務(寄送OTP驗證碼)
  async getFederateOTP(id, mobile) {
    return await fetch(`${frontPath}hg/federateOTP`, {
      ...fetchPostHeaders,
      body: JSON.stringify({
        idNoLast4: id,
        mobileNo: mobile,
        requestId: new Date().toLocaleString(),
      })
    })
      .then((res) => res.json())
      .then((res) => {
        const { resultCode, resultData } = res;
        if (resultCode === 0) {
          uiAlert.getFadeAlert('已發送驗證碼！');
          return resultData;
        }
        uiAlert.getFadeAlert('HappyGo輸入資料有誤');
        return null;
      })
      .catch(() => {
        uiAlert.getFadeAlert('HappyGo綁定服務錯誤');
        return null;
      });
  },
  // HG確認OTP服務
  async checkHGFederateOTP(postData) {
    return await fetch(`${frontPath}hg/checkOTP`, {
      ...fetchPostHeaders,
      body: JSON.stringify({
        ...postData,
        requestId: new Date().toLocaleString(),
      })
    })
      .then((res) => res.json())
      .then(res => {
        const { resultCode } = res;
        if (resultCode === 0) {
          uiAlert.getFadeAlert('HappyGo綁定成功！');
          return true;
        }
        return false;
      })
      .catch(() => {
        uiAlert.getFadeAlert('HappyGo確認OTP服務錯誤');
        return false;
      });
  },
  //查HAPPY GO點數
  async queryHappyGoPoint() {
    // const cacheName = 'myHGPoints';
    // const cache = getCache(cacheName);
    // if (cache !== null) {
    //   this.hgPoint = cache;
    //   return cache;
    // }

    const data = await fetch(`${frontPath}hg/queryPoints`, {
      ...fetchPostHeaders,
    })
      .then((res) => res.json())
      .then((res) => {
        // {
        //   "requestId": "1732095277200",
        //   "resultCode": 0,
        //   "resultMsg": "作業成功",
        //   "runTime": "159 ms",
        //   "resultData": {
        //       "remainPoint": "41",
        //   }
        // }
        const hgPoint = res?.resultData?.remainPoint?Number(res?.resultData?.remainPoint): 0
        this.hgPoint = hgPoint
        return hgPoint;
      })
      .catch(() => {
        return 0;
      });
    // setCache(cacheName, data, 300);
    return data;
  },
  //happyGo倍率
  async queryHappyGoRule() {
    const rule = {
      hasRule: true,
      pid: 1,
      dollars: 10,
      points: 40,
      maxRate: 100,
      minAmount: 0,
    };
    this.rule = rule;

    return rule;
  },
  //取得happyGo可折抵最大金額
  getHgMax(calcSum = 0) {
    const { points, dollars, maxRate } = this.rule;
    let hgMax = Math.floor(this.hgPoint / points) * dollars;

    // 計算折扣限制
    const discountLimit = maxRate != null ? Math.floor((calcSum * maxRate) / 100) : 0;

    // 檢查是否超過折扣限制
    if (hgMax > discountLimit) {
      hgMax = Math.floor(discountLimit / dollars) * dollars;
    }

    // 檢查是否超過商品總價
    if (hgMax > calcSum) {
      hgMax = Math.floor(calcSum / dollars) * dollars;
    }

    return hgMax;
  },
  //取得電子票券
  async getElectronicTicket(pageNumber=1, pageRow=100 , singleTicketInfo){
    let postData = {}
    //若只取單張票券不需頁數相關參數
    if(!singleTicketInfo){
      postData.pageNumber = pageNumber
      postData.pageRow = pageRow
    }
    //取單一票券
    if(singleTicketInfo){
      postData = {...postData, ...singleTicketInfo}
    }
    return await fetch(`${frontPath}member/ticket`, {
      ...fetchPostHeaders,
      body: JSON.stringify(postData),
    })
      .then((res) => res.json())
      .then((res) => {
        let {resultCode, resultData, resultMsg} = res || {}
        // if(pageNumber === 1){
        //   resultData = [
        //     {
        //       dealId: "20241203297936", // 交易編號
        //       productId: "8792779", // 商品代碼
        //       productName: "7-11茶葉蛋10元抵用券", // 品名
        //       images:
        //         "https://img.shopping.friday.tw/images/product/293/8792779/8792779_3_1.webp?707554",
        //       manufacturerCode: "SVN",
        //       sn: "SQR63CXPJ8K8", // 序號
        //       barcode: "7500070322391964,44HGFSKY", // 逗點分隔, 最多3個值, 有值的轉碼
        //       period: "2024/10/01-2024/12/31", // 到期區間, 只要留後面的日期
        //     },
        //     {
        //       dealId: "20241126146969",
        //       productId: "8901259",
        //       productName: "全家_維力炸醬麵(碗)23元折價券",
        //       images:
        //         "https://img.shopping.friday.tw/images/product/296/8901259/8901259_3_1.webp",
        //       manufacturerCode: "FAM",
        //       sn: "DAINTALYOFWWIM28TT8",
        //       barcode: "DAINTALYOFWWIM28TT8",
        //       period: "2024/11/12-2024/12/31",
        //     },
        //   ]
        // }
        // if(pageNumber === 2){
        //   resultData = [
        //     {
        //       dealId: "20241203297937", // 交易編號
        //       productId: "8792779", // 商品代碼
        //       productName: "7-11茶葉蛋10元抵用券", // 品名
        //       images:
        //         "https://img.shopping.friday.tw/images/product/293/8792779/8792779_3_1.webp?707554",
        //       manufacturerCode: "SVN",
        //       sn: "SQR63CXPJ8K8", // 序號
        //       barcode: "7500070322391964,44HGFSKY", // 逗點分隔, 最多3個值, 有值的轉碼
        //       period: "2024/10/01-2024/12/31", // 到期區間, 只要留後面的日期
        //     },
        //     {
        //       dealId: "20241126146960",
        //       productId: "8901259",
        //       productName: "全家_維力炸醬麵(碗)23元折價券",
        //       images:
        //         "https://img.shopping.friday.tw/images/product/296/8901259/8901259_3_1.webp",
        //       manufacturerCode: "FAM",
        //       sn: "DAINTALYOFWWIM28TT8",
        //       barcode: "DAINTALYOFWWIM28TT8",
        //       period: "2024/11/12-2024/12/31",
        //     },
        //   ]
        // }
        if(resultCode===0 && resultData){
          return resultData
        }
        if(resultCode === 800){
          return []
        }
        uiAlert.getFadeAlert(resultMsg) 
      })
      .catch(() => {
        uiAlert.getFadeAlert("取得電子票券發生錯誤")
        return [];
      });
  },
  // 縣 資料
  getCity() {
    return addressData.map((v) => {
      const { id, name } = v;
      return { id, name };
    });
  },
  // 區 資料
  getCounty(id) {
    const obj = addressData.find((v) => v.id === id);
    return obj.counties;
  },
};

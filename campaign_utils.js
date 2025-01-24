/**
 * 活動共用函式
 */
module.exports = {
  getCampaignUI(
    data /** 活動資料 */,
    myOwnCampaignIds = [] /** 已領取的CampaignId */
  ) {
    const couponPrefix = data.campaignId ? data.campaignId.split('_')[0] : '';
    const { d3, d4, d5, d6, d7, d8, d26 } = data.offerContents;
    const endTime = data.campaignEndTimestamp.replace(/-/g, '/').substr(5, 5);
    let discount = [];
    let digitalType = '',
      isAnti = false, // 是否帶鋸齒圖
      title = '', // 劵標題
      campaignPageTitle = '', // 活動頁標題
      rule = '', // 條件
      campaignEndTime = '', // 活動期限
      couponExpireTime = '', // 折價卷使用期限
      campaignUrl = null, // 活動URL
      isGeted = myOwnCampaignIds.indexOf(data.campaignId) !== -1, // 是否已領取
      discountType = '', // R 折 A 元
      discountCode = '', // 折扣碼
      discountAmount = 0, // 折抵面額（元或%），用來過濾同類型選出最佳面額，商品頁只顯示最佳劵
      discountExsitedAry = null, // 折抵%或元的Array資料
      isShowInMyCampaign = false, // 是否出現在“我的優惠”清單
      isAdditionalDiscount = false; // 是否顯示折上折文案

    const setDiscountAry = () => {
      if (!discount || discount.length === 0) return;

      const discountExsited = discount.filter((v) => v);
      if (discountExsited.length === 0) return;
      if (discountExsited[0] !== 'F') { // 打折/折元情境
        discountExsitedAry = discountExsited[0].split(',');
        discountType = discountExsitedAry[0];
        discountAmount = discountExsitedAry[1];
      } else { // 免費情境
        discountType = 'F';
        discountAmount = -1;
      }
    };

    const getTitle = (
      prefix1 = '現打',
      suffix1 = '折',
      prefix2 = '現折',
      suffix2 = '元',
      prefix3 = '一件',
      isPercentage = false
    ) => {
      setDiscountAry();
      let output = '';
      let n = 0;
      switch (discountType) {
        case 'R':
          n = isPercentage
            ? parseInt(discountExsitedAry[1] * 100)
            : discountExsitedAry[1].split('.')[1];
          output = prefix1 + '<font>' + n.replace(/^0/i, '') + '</font>' + suffix1;
          break;
        case 'A':
          output =
            prefix2 + '<font>' + discountExsitedAry[1] + '</font>' + suffix2;
          break;
        case 'F':
          output = prefix3 + '免費'
          break;
      }
      return output;
    };

    // 設定條件標題
    if (data?.offerCondition?.[0]) {
      switch (data.offerCondition[0]) {
        case '1': // 符合範圍
          break;
        case '2': // 滿額
          rule = '滿' + data.offerCondition[1] + '元';
          break;
        case '3': // 滿件
          rule = '滿' + data.offerCondition[1] + '件';
          break;
      }
    }

    switch (couponPrefix) {
      case 'CD': // D2 購物車折扣 滿額滿件【CD】
        discount = data.offerContents.discount;
        digitalType = 'd2';
        title = getTitle('現打', '折', '現折', '元');
        campaignEndTime = `最晚${endTime}使用`;
        campaignPageTitle = `結帳${rule}${getTitle()}`;
        isShowInMyCampaign = true;
        break;

      case 'AC': // D3 訂單送折價券  【AC】
        discount = d3.discount;
        digitalType = 'd3';
        isAnti = true;
        title = getTitle('折價劵', '折', '折價劵', '元');
        campaignEndTime = `活動至${endTime}`;
        couponExpireTime = '出貨後15天贈送,效期30天';
        campaignPageTitle = `${rule}${getTitle('送', '折', '送', '元')}劵`;
        isShowInMyCampaign = true;
        break;

      case 'FV': // 後送購物金 【FV】
        discount = d4.discount;
        digitalType = 'd4';
        if (d4.amount) {
          title = '購物金<font>' + d4.amount + '</font>元';
        } else {
          title = getTitle('購物金', '%', '折價劵', '元', true);
        }
        campaignEndTime = `活動至${endTime}`;
        couponExpireTime = '出貨後15天贈送,效期30天';
        isShowInMyCampaign = true;

        setDiscountAry();
        switch (discountType) {
          case 'R':
            campaignPageTitle = `${rule}送${parseInt(
              discountExsitedAry[1] * 100
            )}%購物金`;
            break;
          case 'A':
            campaignPageTitle = `${rule}送${discountExsitedAry[1]}元購物金`;
            break;
        }
        break;

      case 'BC': // D5 結帳前領折價券 【BC】
        discount = d5.discount;
        digitalType = 'd5';
        isAnti = true;
        if (d5.minAmount) {
          rule = `滿${d5.minAmount}元可折`;
          campaignPageTitle = `滿${d5.minAmount}元${getTitle()}`;
        } else {
          campaignPageTitle = `${getTitle()}`;
        }
        title = getTitle('現折劵', '折', '現折劵', '元');
        campaignEndTime = `最晚${endTime}使用`;
        couponExpireTime = ``;
        isShowInMyCampaign = true;
        break;

      case 'PC': // D6 折扣碼 【PC】
        discount = d6.discount;
        digitalType = 'd6';
        discountCode = d6.password;
        isAnti = false;
        if (d6.minAmount) {
          rule = `滿${d6.minAmount}元可折`;
        }
        title = getTitle('折扣碼 打', '折', '折扣碼 折', '元');
        campaignEndTime = `最晚${endTime}使用`;
        campaignPageTitle = `輸入折扣碼<font>${d6.password}</font>,結帳滿${
          d6.minAmount
        }元${getTitle('打', '折', '折', '元')}`;
        isShowInMyCampaign = true;
        break;

      case 'SC': // D7 折價序號【SC】
        discount = d7.discount;
        digitalType = 'd7';
        // discountCode = d7.password;
        if (d7.minAmount) {
          rule = `滿${d7.minAmount}元可折`;
        }
        title = getTitle('折價序號 打', '折', '折價序號 折', '元');
        campaignEndTime = '限今日使用';
        campaignPageTitle = `輸入折價序號,結帳滿${d7.minAmount}元${getTitle(
          '打',
          '折',
          '折',
          '元'
        )}`;
        isShowInMyCampaign = true;
        break;

      case 'OC': // D8 訂單出貨後15天折價券【OC】
        discount = d8.discount;
        digitalType = 'd8';
        isAnti = true;
        title = getTitle('折價劵', '折', '折價劵', '元');
        couponExpireTime = '效期到' + endTime;
        campaignPageTitle = `結帳${rule}${getTitle()}`;
        isShowInMyCampaign = true;
        break;

      case 'ASD': // D9 再折劵
        discount = data.offerContents.v.discount;
        digitalType = 'd9';
        title = getTitle('再折', '折', '再折', '元');
        rule = `最多再折${data.offerContents.v.cap}元`;
        break;

      case 'UO': // 關企預塞折價劵【UO】
        discount = data.offerContents.v.discount;
        digitalType = 'k2';
        if (data.offerContents.v.minAmount) {
          rule = `滿${data.offerContents.v.minAmount}元可折`;
          campaignPageTitle = `滿${
            data.offerContents.v.minAmount
          }元${getTitle()}`;
        }
        title = getTitle('折價劵', '折', '折價劵', '元');
        couponExpireTime = '效期到' + endTime;
        campaignPageTitle = `結帳${rule}${getTitle()}`;
        isShowInMyCampaign = true;
        break;

      case 'ED': // D12 每滿X件打折/折元-不可折上折【ED】
        discount = data.offerContents.v.discount;
        digitalType = 'd12';
        title = getTitle('打', '折', '折', '元');
        campaignEndTime = `最晚${endTime}使用`;
        rule = `每${rule}`;
        campaignPageTitle = `${rule}，${getTitle('打', '折', '折', '元')}`;
        isShowInMyCampaign = true;
        break;

      case 'AED': // D13 每滿X件打折/折元-可折上折【AED】
        discount = data.offerContents.v.discount;
        digitalType = 'd13';
        title = getTitle('打', '折', '折', '元');
        campaignEndTime = `最晚${endTime}使用`;
        rule = `每${rule}`;
        campaignPageTitle = `${rule}，${getTitle('打', '折', '折', '元')}`;
        isShowInMyCampaign = true;
        isAdditionalDiscount = true;
        break;

      case 'LD': // D14 第X件最便宜打折-不可折上折【LD】
        discount = data.offerContents.v.discount;
        digitalType = 'd14';
        title = `每滿<font>${data.offerCondition[1]}</font>件 ${getTitle('一件打', '折', '折', '元', '一件')}`;
        campaignEndTime = `最晚${endTime}使用`;
        campaignPageTitle = `每${rule}，${getTitle('一件打', '折', '折', '元', '一件')}`;
        isShowInMyCampaign = true;
        break;

      case 'ALD': // D15 第X件最便宜打折-可折上折【ALD】
        discount = data.offerContents.v.discount;
        digitalType = 'd15';
        title = `每滿<font>${data.offerCondition[1]}</font>件 ${getTitle('一件打', '折', '折', '元', '一件')}`;
        campaignEndTime = `最晚${endTime}使用`;
        campaignPageTitle = `每${rule}，${getTitle('一件打', '折', '折', '元', '一件')}`;
        isShowInMyCampaign = true;
        isAdditionalDiscount = true;
        break;

      case 'ADD': // D16 超商現折券-可折上折【ADD】
        discount = data.offerContents.v.discount;
        digitalType = 'd16';
        title = `超取現${getTitle('', '', '折', '元')}`;
        campaignEndTime = `最晚${endTime}使用`;
        campaignPageTitle = `超商取貨 ${getTitle('', '', '折', '元')}`;
        isShowInMyCampaign = true;
        isAdditionalDiscount = true;
        isAnti = true;
        if (data.offerContents.v.minAmount) {
          rule = `滿${data.offerContents.v.minAmount}元可折`;
          campaignPageTitle = `超商取貨 滿${data.offerContents.v.minAmount}元 ${getTitle('', '', '折', '元')}`;
        }
        break;

      case 'ASC': // D26 賣的折價序號【ASC】
        discount = d26?.discount;
        digitalType = 'd26';
        title = getTitle('折價序號 打', '折', '折價序號 折', '元');
        campaignEndTime = `最晚${endTime}使用`;
        isShowInMyCampaign = true;
        isAdditionalDiscount = true;
        if (d26?.minAmount) {
          rule = `滿${d26?.minAmount}元可折`;
          campaignPageTitle = `輸入折價序號,結帳滿${d26?.minAmount}元${getTitle(
            '打',
            '折',
            '折',
            '元'
          )}`;
        }
        break;
    }

    // if (/localhost/i.test(location.hostname)) {
    //   console.log('劵與CampaignId: ', 'tag: ' + tag, 'title: ' + title, 'id: ' + data.campaignId);
    // }

    campaignUrl = '/campaign/' + data.campaignId;
    // B 網加前綴
    if (window.siteData) {
      campaignUrl = '/' + window.siteData.urlSuffix + campaignUrl;
    }

    return {
      digitalType, // 活動類型
      discountAmount, // 折抵面額
      discountCode, // 折扣碼
      isAnti, // 是否帶鋸齒圖片
      isGeted, // 是否已領取
      title, // 折什麼 or 送什麼
      campaignPageTitle, // 給活動頁使用 中間標題
      rule, // 條件
      campaignId: data.campaignId, // 活動ID
      campaignName: data.campaignName, // 活動名稱
      campaignEndTime, // 活動期限
      couponExpireTime, // 折價卷使用期限
      listCampaignEndTime: `最晚${endTime}使用`, // 我的優惠、領劵頁 最晚使用日期
      campaignUrl, // 活動連結
      isShowInMyCampaign, // 是否顯示在“我的優惠“清單
      isAdditionalDiscount, // 是否顯示折上折文案
    };
  },
};

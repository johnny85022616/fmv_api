const isMobile = /mobile/i.test(navigator.userAgent);

module.exports = {
  isAlertExist: false, // 用於檢查提示框是否已顯示
  currentAlertContent: [], // 保存當前顯示提示框內容

  getFadeAlert(str = '') {
    if (!this.isAlertExist) {
      this.isAlertExist = true; // 設置提示框為顯示狀態
      this.composeElements(str);
    } else {
      // 檢查陣列中是否有相同的文字
      const isExist = this.currentAlertContent && this.currentAlertContent.some(t => t === str);
      if (isExist) {
        return
      }
      this.composeElements(str, true);
    }
  },
  // 組合fadeAlert內容
  composeElements(v, isAfter = false) {
    this.currentAlertContent.push(v);

    // 創建新節點
    const temp = document.createElement('section');
    temp.className = 'fadeAlert';

    const wrap = document.createElement('div');
    // phone/desktop 使用不同 class
    wrap.className = isMobile
      ? 'fadeAlert__wrap-phone fade-down'
      : 'fadeAlert__wrap-desktop fade-right';

    // 文字內容
    const para = document.createElement('p');
    para.textContent = v;

    wrap.appendChild(para);

    if (isAfter) { // 新增alert的位置：小網從上面加 大網從下面加
      isMobile ? document.querySelector('.fadeAlert').prepend(wrap) : document.querySelector('.fadeAlert').appendChild(wrap)
    } else { // 第一次show
      temp.append(wrap);
      document.body.append(temp);
    }
    
    setTimeout(() => {
      document.querySelector('.fadeAlert').removeChild(wrap) // 三秒後移除節點
      this.currentAlertContent.shift(); // 刪除陣列中第一位的值
      if (this.currentAlertContent.length === 0) { // 當陣列值為空時初始化
        document.body.removeChild(document.querySelector('.fadeAlert'));
        this.isAlertExist = false;
      }
    }, 3000);
  }
};

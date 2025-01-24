/**
 * 商品共用函式
 */
module.exports = {
  /**
   * 
   * @param {Array} items 組合API資料
   * @returns Array 初始化加入購物車需要的陣列
   */
  getCartComboData: (items) => {
    return items.map((p) => {
      const product = p.refProduct; // 商品資料
        
      return {
        comboId: p.comboId, // 組合ID
        pid: product.pid, // 商品ID
        specId: null, // 規格ID
        qty: p.comboQty, // 可接單量 = 1個Item至少要買多少個Pieces
        isSelected: false, // 是否已選擇
      };
    });
  },
  /**
   * 
   * @param {Array} items 組合API資料
   * @returns Object 初始化UI長下拉選單需要的陣列 及 主商品安全購買量
   */
  getUiComboData: (items) => {
    const output = {
      itemData: [],
      saveComboPurchaseQty: 0
    }
    const qtyPool = [];
    
    //console.log('getUiComboData', JSON.stringify(items, 0, 2));
    output.itemData = items.map(p => {
      const product = p.refProduct; // 商品資料
      return {
        pid: product.pid,
        name: product.name,
        image_url: product.images[0],
        comboQty: p.comboQty,
        variants: product.variants.filter(v1 => {
          // 過濾售完
          if (v1.isSoldOut) return false;
          
          // 計算 庫存 / 可接單量 = 實際可以購買量
          if (v1.qty) {
            // 不限制- 看庫存 qty
            if (v1.qtyMax === 999) {
              qtyPool.push(Math.floor(v1.qty / p.comboQty));
            } else {
              // 限制- 看qty 或 qtyMax 最小值
              qtyPool.push(Math.min(Math.floor(v1.qty / p.comboQty), v1.qtyMax));
            }
          }
          
          const { subVariants } = v1;
          return { 
            id: v1.id, 
            name: v1.name, 
            isSoldOut: v1.isSoldOut,
            subVariants: subVariants ? subVariants.filter(v2 => {
              // 過濾售完
              if (v2.isSoldOut) return false;

              const { id, name, isSoldOut } = v2;

              // 不限制- 看庫存 qty
              if (v2.qtyMax === 999) {
                qtyPool.push(Math.floor(v2.qty / p.comboQty));
              } else {
                // 限制- 看qty 或 qtyMax 最小值
                qtyPool.push(Math.min(Math.floor(v2.qty / p.comboQty), v2.qtyMax));
              }
              return { id, name, isSoldOut };
            }) : null
          }
        })
      }
    });

    output.saveComboPurchaseQty = Math.min(...qtyPool);

    return output;
  }
};

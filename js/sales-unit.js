(function(){
  const PACK_ITEMS=new Set(['8881','8882']);
  const clean=value=>String(value||'').trim().toUpperCase().replace(/^[SBI](?:[-_\s]+|(?=\d))/,'');
  const isPackItem=value=>PACK_ITEMS.has(clean(value));
  const isPackedOrder=item=>Number(item?.sales_pack_size)===10;
  function toStored(itemNumber,inputQty,bundlePrice){
    const packs=Math.max(0,Math.floor(Number(inputQty)||0));
    const price=Math.max(0,Number(bundlePrice)||0);
    if(!isPackItem(itemNumber))return{qty:packs,price,total:packs*price,packSize:1,packQty:packs,packPrice:price};
    return{qty:packs*10,price:price/10,total:packs*price,packSize:10,packQty:packs,packPrice:price};
  }
  function fromStored(item){
    const qty=Math.max(0,Number(item?.qty)||0),price=Math.max(0,Number(item?.price)||0);
    if(!isPackedOrder(item))return{qty,price,total:qty*price,packSize:1,actualQty:qty};
    return{qty:qty/10,price:price*10,total:qty*price,packSize:10,actualQty:qty};
  }
  function quantityText(itemNumber,actualQty){return isPackItem(itemNumber)?`${Number(actualQty||0).toLocaleString()}개`:`${Number(actualQty||0).toLocaleString()}죽`}
  function badge(itemNumber){return isPackItem(itemNumber)?'<small class="sales-pack-badge">10개 묶음 · 주문 1 = 실제 10개</small>':''}
  window.DesignSocksSalesUnit={clean,isPackItem,isPackedOrder,toStored,fromStored,quantityText,badge,PACK_ITEMS};
})();

export type CreemSeatState = {
  id:string; customerId:string; productId:string; itemId:string; priceId:string | null;
  units:number; mode:string; status:string; updatedAt:string | null;
};
/** Creem GET /subscriptions can return either a root object or a subscription envelope. */
export function parseCreemSeatState(
  value:unknown,
  expected: { subscriptionId:string; customerId:string; productId:string; mode:'test'|'prod' },
):CreemSeatState {
  const raw:any=(value as any)?.subscription ?? value;
  const customerId=typeof raw?.customer==='string'?raw.customer:raw?.customer?.id;
  const productId=typeof raw?.product==='string'?raw.product:raw?.product?.id;
  const items=raw?.items;
  if (raw?.id!==expected.subscriptionId || customerId!==expected.customerId ||
    productId!==expected.productId || raw?.mode!==expected.mode)
    throw new SeatValidationError('IDENTITY_MISMATCH');
  if (!Array.isArray(items) || items.length!==1) throw new SeatValidationError('ITEM_MISMATCH');
  const item=items[0];
  // Creem update requires an existing subscription item ID and units.
  // The API sometimes omits price_id from GET; it is not mandatory for a
  // quantity-only update. Do not invent a price ID or reject valid subscriptions.
  if(typeof item?.id!=='string' || !item.id.startsWith('sitem_') ||
     item.product_id!==expected.productId)
    throw new SeatValidationError('ITEM_MISMATCH');
  const units=Number(item.units);
  if(!Number.isSafeInteger(units)||units<1||units>500)throw new SeatValidationError('INVALID_UNITS');
  return {id:raw.id,customerId,productId,itemId:item.id,priceId:typeof item.price_id==='string'?item.price_id:null,units,mode:raw.mode,status:String(raw.status??''),updatedAt:typeof raw.updated_at==='string'?raw.updated_at:null};
}
export class SeatValidationError extends Error {
  constructor(public readonly code:'IDENTITY_MISMATCH'|'ITEM_MISMATCH'|'INVALID_UNITS'|'STALE_SEAT_STATE'|'NOT_ACTIVE') {
    super('Unable to verify current subscription seat state');
    this.name='SeatValidationError';
  }
}
/** Downshifts are immediate unless Creem independently supports a scheduled change. */
export function seatUpdatePayload(
  item: Pick<CreemSeatState,'itemId'|'productId'|'priceId'>,
  seats:number,
  behavior:'proration-charge-immediately'|'proration-none',
) {
  if(!item.itemId.startsWith('sitem_') || !item.productId.startsWith('prod_'))
    throw new SeatValidationError('ITEM_MISMATCH');
  if(!Number.isSafeInteger(seats) || seats<1 || seats>500)
    throw new SeatValidationError('INVALID_UNITS');
  // Creem's detailed update reference includes product_id and price_id, while
  // its condensed reference only includes id and units. Reuse real IDs if present
  // in the verified subscription item. Never invent a price or require its prefix.
  return {items:[{
    id:item.itemId,product_id:item.productId,
    ...(typeof (item as CreemSeatState).priceId==='string' &&
         (item as CreemSeatState).priceId!.length>0
      ? {price_id:(item as CreemSeatState).priceId} : {}),
    units:seats,
  }],update_behavior:behavior};
}

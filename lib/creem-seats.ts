import { creemResponseMode, type CreemConfig } from '@/lib/creem-config';

export type CreemSeatState = {
  id:string; customerId:string; productId:string; itemId:string;
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
  if(typeof item?.id!=='string' || !item.id.startsWith('sitem_') ||
     (item.product_id && item.product_id!==expected.productId))
    throw new SeatValidationError('ITEM_MISMATCH');
  const units=Number(item.units);
  if(!Number.isSafeInteger(units)||units<1||units>500)throw new SeatValidationError('INVALID_UNITS');
  return {id:raw.id,customerId,productId,itemId:item.id,units,mode:raw.mode,status:String(raw.status??''),updatedAt:typeof raw.updated_at==='string'?raw.updated_at:null};
}
export class SeatValidationError extends Error {
  constructor(public readonly code:'IDENTITY_MISMATCH'|'ITEM_MISMATCH'|'INVALID_UNITS'|'STALE_SEAT_STATE'|'NOT_ACTIVE') {
    super('Unable to verify current subscription seat state');
    this.name='SeatValidationError';
  }
}
/** Downshifts are immediate unless Creem independently supports a scheduled change. */
export function seatUpdatePayload(itemId:string,seats:number,behavior:'proration-charge-immediately'|'proration-none') {
  if(!itemId.startsWith('sitem_') || !Number.isSafeInteger(seats) || seats<1 || seats>500)
    throw new SeatValidationError('INVALID_UNITS');
  return {items:[{id:itemId,units:seats}],update_behavior:behavior};
}

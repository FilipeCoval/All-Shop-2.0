import type { AdminOrder } from './adminTypes';

export const isPreorderWorkflowOrder = (order: Pick<AdminOrder, 'preorder'>) =>
  order.preorder?.kind === 'PREORDER' && order.preorder.status !== 'FULFILLED';

export const isPreorderStatusManaged = (order: Pick<AdminOrder, 'preorder'>) =>
  order.preorder?.kind === 'PREORDER' && order.preorder.status !== 'FULFILLED';


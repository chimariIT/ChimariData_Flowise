export type PaidStatusSource = {
  isPaid?: boolean | null;
  paymentStatus?: string | null;
  paidAt?: string | Date | null;
  journeyProgress?: {
    isPaid?: boolean | null;
    paymentStatus?: string | null;
    paidAt?: string | Date | null;
  } | null;
};

export function isProjectPaid(
  project?: PaidStatusSource | null,
  journeyProgress?: PaidStatusSource['journeyProgress'] | null
): boolean {
  const jp = journeyProgress ?? project?.journeyProgress ?? {};

  return project?.isPaid === true ||
    jp?.isPaid === true ||
    project?.paymentStatus === 'completed' ||
    jp?.paymentStatus === 'completed' ||
    !!project?.paidAt ||
    !!jp?.paidAt;
}

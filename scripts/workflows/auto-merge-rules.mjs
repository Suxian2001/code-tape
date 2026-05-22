export function shouldDeferAutoMergeForForkReview(event, pr) {
  const isReviewEvent = Boolean(event?.review);
  const isForkPr =
    pr?.headRepoFullName &&
    pr?.baseRepoFullName &&
    pr.headRepoFullName !== pr.baseRepoFullName;

  return Boolean(isReviewEvent && isForkPr);
}

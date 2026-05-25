export function shouldDeferAutoMergeForForkReview(event, pr) {
  const isReviewEvent = Boolean(event?.review);
  const isForkPr =
    pr?.headRepoFullName &&
    pr?.baseRepoFullName &&
    pr.headRepoFullName !== pr.baseRepoFullName;

  return Boolean(isReviewEvent && isForkPr);
}

function commentLogin(comment) {
  return comment?.user?.login;
}

function commentCreatedAt(comment) {
  return comment?.created_at || comment?.createdAt;
}

export function findMaintainerMergeConfirmation({ comments = [], maintainerLogin, latestCommitAt }) {
  if (!maintainerLogin) {
    return null;
  }

  const latestCommitTime = Date.parse(latestCommitAt || '1970-01-01T00:00:00.000Z');
  const confirmation = comments.find((comment) => {
    const createdAt = commentCreatedAt(comment);
    return (
      commentLogin(comment) === maintainerLogin &&
      comment?.body?.trim() === '确认合并' &&
      Date.parse(createdAt) >= latestCommitTime
    );
  });

  return commentLogin(confirmation) ?? null;
}

export function shouldWaitForRequiredChecks({ requiredChecks, checkRuns }) {
  const byName = new Map((checkRuns ?? []).map((check) => [check.name, check]));
  const missing = [];
  const pending = [];
  const failed = [];

  for (const name of requiredChecks) {
    const check = byName.get(name);
    if (!check) {
      missing.push(name);
    } else if (check.status !== 'completed') {
      pending.push(name);
    } else if (check.conclusion !== 'success') {
      failed.push(name);
    }
  }

  return {
    wait: missing.length > 0 || pending.length > 0 || failed.length > 0,
    missing,
    pending,
    failed,
  };
}

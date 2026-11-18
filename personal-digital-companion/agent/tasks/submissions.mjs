export const isSubmissionId = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

export async function issueTaskSubmission(DB, ownerId) {
  const submissionId = crypto.randomUUID();
  await DB.prepare('INSERT INTO task_submissions (submission_id, owner_id) VALUES (?, ?)')
    .bind(submissionId, ownerId).run();
  return { submission_id: submissionId };
}

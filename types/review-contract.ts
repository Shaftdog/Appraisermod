export interface SubmitRevisionsRequest {
  accept: boolean;         // true = submit, false = withdraw/cancel
  reason?: string;         // optional note
}
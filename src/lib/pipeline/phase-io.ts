export interface PhaseIO<I = unknown, O = unknown> {
  input: I;
  output: O;
  processing: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

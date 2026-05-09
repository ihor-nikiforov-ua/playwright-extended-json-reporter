export interface InvariantResult {
  name: string;
  ok: boolean;
  message: string;
}

export function checkInvariants(repoRoot: string): Promise<InvariantResult[]>;

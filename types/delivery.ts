export interface ClientProfile {
  id: string;
  name: string;
  channel: 'download'|'sftp'|'email';   // implement download now; stub others
  email?: string;
  sftp?: { host: string; path: string; user: string }; // stub only
  requiresUAD: boolean;                 // if true → MISMO UAD validation
  watermark?: 'CONFIDENTIAL'|'DRAFT'|null;
}

export interface MismoExportMeta {
  orderId: string;
  version: '2.6';
  generatedAt: string;
  path: string;         // file path for XML
  warnings: string[];   // non-fatal notes (e.g., missing APN)
  errors: string[];     // fatal blocks (XML not emitted if present)
}

export interface WorkfileBundleMeta {
  orderId: string;
  generatedAt: string;
  zipPath: string;
  manifestPath: string;
  sha256: string;       // checksum of ZIP
  items: Array<{ path: string; sha256: string; bytes: number; kind: string }>;
}

export interface DeliveryRequest {
  clientProfileId: string;
  includeWorkfile: boolean;
  includeMismo: boolean;
  finalize: boolean;     // mark delivered in ledger
}

export interface DeliveryRecord {
  orderId: string;
  request: DeliveryRequest;
  mismo?: MismoExportMeta;
  workfile?: WorkfileBundleMeta;
  deliveredAt?: string;
  status: 'success'|'warning'|'failed';
  messages: string[];
}

// Type aliases for backward compatibility
export type DeliveryClient = ClientProfile;
export type DeliveryPackage = DeliveryRecord;

// Validation schemas
import { z } from "zod";

export const deliveryRequestSchema = z.object({
  orderId: z.string().min(1),
  clientProfileId: z.string().min(1),
  includeWorkfile: z.boolean(),
  includeMismo: z.boolean(),
  finalize: z.boolean(),
  formats: z.array(z.string()).optional().default(['uad_xml', 'workfile_zip'])
});

export type ValidatedDeliveryRequest = z.infer<typeof deliveryRequestSchema>;
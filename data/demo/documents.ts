import registry from "./documents.json";

export interface DemoDocument {
  id: string;
  name: string;
  type: string;
  supplierId: string | null;
  lines: string[];
}

export const DOC_REGISTRY: DemoDocument[] = registry as DemoDocument[];
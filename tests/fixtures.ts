import { DEMO_INCIDENT } from "@/data/demo/pacific-components";
import { Incident } from "@/schemas/core";

export function fixture(): Incident {
  return structuredClone(DEMO_INCIDENT);
}
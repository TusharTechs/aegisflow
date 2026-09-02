export interface DemoFlags {
  serpapi: boolean;
  nutrient: boolean;
  doctavian: boolean;
  foxit: boolean;
  namecom: boolean;
  gemini: boolean;
}

const DEFAULTS: DemoFlags = {
  serpapi: false,
  nutrient: false,
  doctavian: false,
  foxit: false,
  namecom: false,
  gemini: false,
};

const globalFlags = globalThis as unknown as { __aegisDemoFlags?: DemoFlags };

export function getDemoFlags(): DemoFlags {
  return globalFlags.__aegisDemoFlags ?? { ...DEFAULTS };
}

export function setDemoFlag(key: keyof DemoFlags, value: boolean): void {
  globalFlags.__aegisDemoFlags = { ...getDemoFlags(), [key]: value };
}
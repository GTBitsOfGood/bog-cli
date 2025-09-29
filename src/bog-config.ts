export interface BogConfig {
  "design-system": {
    path: string;
    components: {
      [componentName: string]: {
        version: string;
      };
    };
  };
}

export const DEFAULT_CONFIG: BogConfig = {
  "design-system": {
    path: "src/components",
    components: {},
  },
};

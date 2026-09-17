import type { PlopTypes } from "@turbo/gen";

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setHelper("pascalCase", (value: string) =>
    value
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`)
      .join(""),
  );
  plop.setHelper("camelCase", (value: string) => {
    const pascal = value
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`)
      .join("");
    return `${pascal[0]?.toLowerCase()}${pascal.slice(1)}`;
  });

  plop.setGenerator("module", {
    description: "Create a tenant-guarded RexOps resource module",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Module name (plural, kebab-case)",
        validate(value: string) {
          return /^[a-z][a-z0-9-]*$/.test(value) || "Use lower-case kebab-case.";
        },
      },
      {
        type: "list",
        name: "surface",
        message: "Primary web surface",
        choices: ["agency", "client", "admin"],
        default: "agency",
      },
    ],
    actions: [
      {
        type: "add",
        path: "apps/api/src/modules/{{name}}/{{name}}.service.ts",
        templateFile: "templates/module/service.hbs",
      },
      {
        type: "add",
        path: "apps/api/src/modules/{{name}}/{{name}}.routes.ts",
        templateFile: "templates/module/routes.hbs",
      },
      {
        type: "add",
        path: "apps/api/src/modules/{{name}}/{{name}}.test.ts",
        templateFile: "templates/module/test.hbs",
      },
      {
        type: "add",
        path: "packages/validators/src/{{name}}.ts",
        templateFile: "templates/module/validator.hbs",
      },
      {
        type: "add",
        path: "apps/web/src/routes/{{surface}}/{{name}}.tsx",
        templateFile: "templates/module/web-route.hbs",
      },
      {
        type: "add",
        path: "apps/api/src/modules/{{name}}/SCHEMA.md",
        templateFile: "templates/module/schema-note.hbs",
      },
      {
        type: "modify",
        path: "apps/api/src/app.ts",
        pattern: /(\/\/ generator-imports)/,
        template:
          'import { {{camelCase name}}Routes } from "./modules/{{name}}/{{name}}.routes";\n$1',
      },
      {
        type: "modify",
        path: "apps/api/src/app.ts",
        pattern: /( {2}\.use\(deliverablesRoutes\))/,
        template: "$1\n  .use({{camelCase name}}Routes)",
      },
      {
        type: "modify",
        path: "packages/validators/src/index.ts",
        pattern: /(\/\/ generator-exports)/,
        template: 'export * from "./{{name}}";\n$1',
      },
    ],
  });
}

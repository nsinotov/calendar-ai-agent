import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/scripts/add-user.ts", "src/scripts/set-balance.ts"],
  format: ["esm"],
  // node:sqlite only exists with its prefix; stripping it would import a missing "sqlite" package.
  removeNodeProtocol: false,
});

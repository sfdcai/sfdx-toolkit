require("@rushstack/eslint-patch/modern-module-resolution");
const nextConfig = require("eslint-config-next");
const nextVitals = require("eslint-config-next/core-web-vitals");

module.exports = [
  nextConfig,
  nextVitals,
  {
    ignorePatterns: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

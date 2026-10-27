# ⚡ SFDX DevOps Platform (Next.js 14)

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4+-38bdf8?logo=tailwind-css)](https://tailwindcss.com/)
[![Salesforce CLI](https://img.shields.io/badge/Salesforce_CLI-sf-00a1e0?logo=salesforce)](https://developer.salesforce.com/tools/salesforcecli)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A modern, high-performance web platform for Salesforce DevOps and Org lifecycle management built on **Next.js 14 App Router**, **TypeScript**, and **Tailwind CSS**. Designed for synchronous, reliable Salesforce CLI (`sf`) workflows with an intuitive, developer-first user interface.

---

## 🎯 Architecture & Capabilities

- **Direct SF CLI Integration**: Resolves the native Salesforce CLI binary via `SF_CLI_PATH` with isolated command execution buffers.
- **Isolated User Workspaces**: Secure user scoping where all operations, org authentications, and temporary artifacts are sandboxed under `userdata/<userId>`.
- **Synchronous Execution Pipeline**: Streamlined CLI execution providing instant terminal log streaming without requiring external job broker overhead.
- **Metadata Inspection & Diffing**: Built-in visual inspectors for Apex classes, triggers, Lightning Web Components, and Custom Objects.
- **Org Authentication Manager**: Web-based org management supporting OAuth Web Login, JWT Bearer token flow, and DevHub scratch org creation.

---

## 📂 Deep Documentation

Comprehensive architectural and implementation runbooks are located in [`docs/`](docs/):
- [`docs/overview.md`](docs/overview.md) — Platform vision and core value proposition
- [`docs/architecture.md`](docs/architecture.md) — System boundaries, data isolation, and execution design
- [`docs/features.md`](docs/features.md) — Detailed feature inventory and user workflows
- [`docs/flows.md`](docs/flows.md) — Sequence diagrams of CLI command lifecycles
- [`docs/api.md`](docs/api.md) — REST API endpoints and payload specifications
- [`docs/security.md`](docs/security.md) — Sandbox boundaries and secret store specifications
- [`docs/setup.md`](docs/setup.md) — Step-by-step production and local installation guide
- [`docs/lessons.md`](docs/lessons.md) — Engineering learnings and operational invariants

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v18.17 or higher
- **Salesforce CLI**: Installed and accessible on host (`sf --version`)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/sfdcai/sfdx-toolkit.git
cd sfdx-toolkit

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### 3. Environment Configuration
Create a `.env.local` file:
```env
# Path to Salesforce CLI binary
SF_CLI_PATH=/usr/local/bin/sf

# Optional: Port configuration
PORT=3000
```

---

## 🛠️ Tech Stack

- **Framework**: Next.js 14 (App Router, Server Actions, API routes)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS, PostCSS
- **CLI Bridge**: Node child_process with async streaming

---

## 📄 License

This project is licensed under the MIT License.

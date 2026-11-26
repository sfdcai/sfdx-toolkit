"use client";

import { AuthCard } from "@/components/auth-card";
import { ServerVersionBadge } from "@/components/server-version-badge";
import { OrchestratorFlow } from "@/components/orchestrator-flow";
import { ModernNav, NavTab } from "@/components/modern-nav";
import { OneClickSyncPanel } from "@/components/views/one-click-sync-panel";
import { ParityPanel } from "@/components/views/parity-panel";
import { GitDiffPanel } from "@/components/views/git-diff-panel";
import { ManifestRetrievePanel } from "@/components/views/manifest-retrieve-panel";
import { HistoryPanel } from "@/components/views/history-panel";
import { SettingsPanel } from "@/components/views/settings-panel";

import { useEffect, useMemo, useRef, useState } from "react";
import { translateError } from "@/lib/error-help";

const defaultState = {
  token: "",
  user: null as null | { id: string; email: string; role: string },
  projects: [] as { id: string; name: string; sourceOrg?: string; destinationOrg?: string }[],
  orgs: [] as { alias: string }[],
  activeProject: null as null | { id: string; name: string; sourceOrg?: string; destinationOrg?: string },
  diffChanges: [] as any[],
  lastDeploy: null as any,
};

const SESSION_STORAGE_KEY = "sfdx.session";
const ACTIVE_SECTION_STORAGE_KEY = "sfdx.activeSection";

type SectionGuide = {
  eyebrow: string;
  title: string;
  summary: string;
  steps: string[];
  success: string;
};

type ReadinessIssue = {
  id: string;
  label: string;
  detail: string;
  section: string;
  cta: string;
};

const sectionGuides: Record<string, SectionGuide> = {

  dashboardSection: {
    eyebrow: "Start Here",
    title: "Read the workspace before you change anything",
    summary: "Use the dashboard to verify project, org, diff, and deploy status before starting a new run.",
    steps: [
      "Check that the correct project is active.",
      "Confirm source and destination orgs are set.",
      "Review latest diff and deploy status before starting another operation."
    ],
    success: "You know whether the workspace is ready or whether setup work is still missing."
  },
  profileSection: {
    eyebrow: "Account Guide",
    title: "Keep your account details current",
    summary: "Use this section to update profile metadata and change your password without affecting project data.",
    steps: [
      "Update your name, company, and links if this workspace is shared with admins.",
      "Use the password form when you want to rotate credentials.",
      "Refresh if account metadata was changed from an admin console."
    ],
    success: "Your identity data is current and your account remains secure."
  },
  projectSection: {
    eyebrow: "Setup Guide",
    title: "Create the workspace foundation",
    summary: "Projects and org bindings drive everything else. If this section is incomplete, downstream workflows will fail.",
    steps: [
      "Create or select the project you want to work in.",
      "Add orgs using a valid sfdxAuthUrl and clear aliases.",
      "Bind one source org and one destination org to the active project."
    ],
    success: "The active project shows both source and destination orgs as ready."
  },
  manifestSection: {
    eyebrow: "Manifest Guide",
    title: "Control what metadata enters the workflow",
    summary: "Manifests define retrieve and compare scope. Keep them intentional rather than retrieving entire orgs blindly.",
    steps: [
      "Generate the source and destination manifests from the bound orgs or paste your own XML.",
      "Review the metadata types before saving.",
      "Use compare settings if you want merge, scope, custom, or delta strategies."
    ],
    success: "Saved manifests match the exact scope you want to retrieve and compare."
  },
  retrieveSection: {
    eyebrow: "Retrieve Guide",
    title: "Pull metadata in stable chunks",
    summary: "Retrieves run per metadata type so the app can isolate failures and show you what actually completed.",
    steps: [
      "Start with source, then retrieve destination.",
      "Watch chunk and type status pills to spot failures quickly.",
      "Click a type to inspect members when troubleshooting gaps."
    ],
    success: "Both source and destination retrieves complete with the metadata you expect."
  },
  orchestratorSection: {
    eyebrow: "Job Guide",
    title: "Run the workflow as one coordinated operation",
    summary: "Use the orchestrator when you want the system to handle manifest, retrieve, compare, and reporting in sequence.",
    steps: [
      "Confirm project and org bindings first.",
      "Choose the compare strategy that matches your release intent.",
      "Watch the stage tracker instead of guessing where the run is stuck."
    ],
    success: "A single job produces a reportable comparison without manual section hopping."
  },
  diffSection: {
    eyebrow: "Diff Guide",
    title: "Turn retrieved metadata into a deployable delta",
    summary: "This is where you inspect change volume, filter noise, and decide what actually ships.",
    steps: [
      "Generate the diff after both retrieves finish.",
      "Filter by status, metadata type, or search text to narrow scope.",
      "Select only the changes you intend to promote, then build the delta manifest."
    ],
    success: "Your selected delta reflects deliberate release scope rather than raw org drift."
  },
  reportSection: {
    eyebrow: "Report Guide",
    title: "Review the diff as an audit artifact",
    summary: "Use the report for deeper review, stakeholder discussion, and traceability after comparison runs.",
    steps: [
      "Open the latest report after a comparison completes.",
      "Use it to explain change scope and risk to reviewers.",
      "Return to Diff if the report shows too much unintended drift."
    ],
    success: "You have a readable artifact for review, approval, or handoff."
  },
  jobSection: {
    eyebrow: "Activity Guide",
    title: "Watch long-running jobs instead of guessing",
    summary: "Job activity shows where automation is currently working and where it failed.",
    steps: [
      "Open this section when a compare job is running.",
      "Use stage status to identify bottlenecks.",
      "Check CLI Console for command-level detail if a job errors."
    ],
    success: "You can explain job state without reading raw logs first."
  },
  deploySection: {
    eyebrow: "Deploy Guide",
    title: "Promote only the validated delta",
    summary: "Deploy should be the final step after diff review, not the place where scope is guessed.",
    steps: [
      "Review or edit the delta manifest before deployment.",
      "Pick the right test level and set check-only when validating.",
      "Use retry without failed only after reviewing what was excluded."
    ],
    success: "The deployment matches the reviewed delta and the test strategy is intentional."
  },
  historySection: {
    eyebrow: "History Guide",
    title: "Use past runs to debug and audit",
    summary: "History is the operational memory of the project. It is useful for repeatability, troubleshooting, and proving what happened.",
    steps: [
      "Review recent comparisons, retrieves, and deployments for the active project.",
      "Open old reports to compare current drift with earlier runs.",
      "Use timestamps to trace when a workspace changed state."
    ],
    success: "You can reconstruct the project timeline without relying on memory."
  },
  cliConsoleSection: {
    eyebrow: "Console Guide",
    title: "Use raw logs only when you need depth",
    summary: "The console is the lowest-level view. Start with workflow guides and status indicators, then drop here for precise failures.",
    steps: [
      "Check the current process label before reading logs.",
      "Use this output when API messages are too high-level.",
      "Clear the console when you want to isolate the next run."
    ],
    success: "You can troubleshoot CLI failures with direct evidence."
  },
  agentSection: {
    eyebrow: "Autonomous AI Agent",
    title: "AI Self-Healing Deployment Diagnostics & Audit logs",
    summary: "Configure the Gemini LLM agent settings, manage the API key, and view healed deployment runs.",
    steps: [
      "Enable or disable the AI self-healing agent.",
      "Enter a project-specific Gemini API Key (or rely on the global key if configured).",
      "Inspect the audit logs of healed deployments to trace exactly what modifications were applied to metadata elements."
    ],
    success: "The AI agent is configured and its diagnostic run history is visible."
  }
};

export default function Home() {
  const [state, setState] = useState(defaultState);
  const [consoleOutput, setConsoleOutput] = useState<string>("CLI output will appear here.");
  const [retrieveEntries, setRetrieveEntries] = useState<any[]>([]);
  const [retrieveChunks, setRetrieveChunks] = useState<{ type: string; types?: string[]; label?: string; mode?: "chunked" | "grouped"; path: string }[]>([]);
  const [retrieveOutputs, setRetrieveOutputs] = useState<any[]>([]);
  const [retrieveRunning, setRetrieveRunning] = useState<string | null>(null);
  const [retrievePlanned, setRetrievePlanned] = useState<string[]>([]);
  const [retrieveMode, setRetrieveMode] = useState<"chunked" | "grouped">("chunked");
  const retrieveTimerRef = useRef<any>(null);
  const retrieveStatusHashRef = useRef<string>("");
  const compareTimerRef = useRef<any>(null);
  const deployTimerRef = useRef<any>(null);
  const logOffsetsRef = useRef<Record<string, number>>({});
  const [diffFile, setDiffFile] = useState<string>("");
  const [sourceDiff, setSourceDiff] = useState<string[]>([]);
  const [destDiff, setDestDiff] = useState<string[]>([]);
  const [logTimers, setLogTimers] = useState<Record<string, any>>({});
  const [activeSection, setActiveSection] = useState<string>("projectSection");
  const [diffFilter, setDiffFilter] = useState<string>("all");
  const [diffTypeFilter, setDiffTypeFilter] = useState<string>("all");
  const [diffSearch, setDiffSearch] = useState<string>("");
  const [diffSelected, setDiffSelected] = useState<Record<string, boolean>>({});
  const [diffReportPath, setDiffReportPath] = useState<string>("");
  const [compareJobId, setCompareJobId] = useState<string>("");
  const [compareStatus, setCompareStatus] = useState<any>(null);
  const [deployJobId, setDeployJobId] = useState<string>("");
  const [deployStatus, setDeployStatus] = useState<any>(null);
  const [destructivePreview, setDestructivePreview] = useState<{ count: number; components: { name: string; members: string[] }[] }>({ count: 0, components: [] });
  const [includeDeletions, setIncludeDeletions] = useState<boolean>(true);
  const [showDeletionDetails, setShowDeletionDetails] = useState<boolean>(false);
  const [compareStrategy, setCompareStrategy] = useState<
    "existing" | "auto" | "custom" | "merge" | "scope" | "delta"
  >("existing");
  const [compareManifestXml, setCompareManifestXml] = useState<string>("");
  const [compareMergeXml, setCompareMergeXml] = useState<string>("");
  const [compareScopeInclude, setCompareScopeInclude] = useState<string>("");
  const [compareScopeExclude, setCompareScopeExclude] = useState<string>("");
  const [compareScopeExcludeProfiles, setCompareScopeExcludeProfiles] = useState<boolean>(true);
  const [compareScopeCustomOnly, setCompareScopeCustomOnly] = useState<boolean>(false);
  const [compareScopeBusinessOnly, setCompareScopeBusinessOnly] = useState<boolean>(false);
  const [compareContextBranch, setCompareContextBranch] = useState<string>("");
  const [compareContextRelease, setCompareContextRelease] = useState<string>("");
  const [compareContextReason, setCompareContextReason] = useState<string>("");
  const [compareSettingsOpen, setCompareSettingsOpen] = useState<boolean>(true);
  const [sourceManifestValue, setSourceManifestValue] = useState<string>("");
  const [destManifestValue, setDestManifestValue] = useState<string>("");
  const [activeRetrieveType, setActiveRetrieveType] = useState<string | null>(null);
  const [activeRetrieveMembers, setActiveRetrieveMembers] = useState<string[]>([]);
  const [activeRetrieveStatus, setActiveRetrieveStatus] = useState<string>("Queued");
  const [membersLoading, setMembersLoading] = useState<boolean>(false);
  const [membersError, setMembersError] = useState<string>("");
  const [reportContent, setReportContent] = useState<string>("");
  const [reportError, setReportError] = useState<string>("");
  const [reportLoading, setReportLoading] = useState<boolean>(false);
  const [currentProcess, setCurrentProcess] = useState<string>("");
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot" | "mfa">("login");
  const [theme, setTheme] = useState<"light" | "mint" | "dark" | "sand" | "slate">("dark");
  const [viewMode, setViewMode] = useState<"simple" | "advanced">("simple");
  const [activeTab, setActiveTab] = useState<NavTab>("sync");
  const [isClassicView, setIsClassicView] = useState<boolean>(false);
  const [projectEdits, setProjectEdits] = useState<Record<string, string>>({});
  const [selectedOrgAlias, setSelectedOrgAlias] = useState<string>("");
  const [orgDetails, setOrgDetails] = useState<any>(null);
  const [orgAuthInput, setOrgAuthInput] = useState<string>("");
  const [orgAliasInput, setOrgAliasInput] = useState<string>("");
  const [orgAuthVisible, setOrgAuthVisible] = useState<boolean>(false);
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [confirmMessage, setConfirmMessage] = useState<string>("");
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [deltaManifest, setDeltaManifest] = useState<string>("");
  const [usageInfo, setUsageInfo] = useState<any>(null);
  const [historyData, setHistoryData] = useState<{ retrievals: any[]; comparisons: any[]; deployments: any[] }>({
    retrievals: [],
    comparisons: [],
    deployments: []
  });
  const [appVersion, setAppVersion] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");
  const [uiNotice, setUiNotice] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [uiErrorHelp, setUiErrorHelp] = useState<null | { title: string; message: string; actions: string[]; category: string }>(null);
  const [profileData, setProfileData] = useState<{ name: string; company: string; social: Record<string, string>; mfaEnabled?: boolean } | null>(null);
  const [profileMessage, setProfileMessage] = useState<string>("");
  const [mfaChallengeToken, setMfaChallengeToken] = useState<string>("");
  const [mfaCode, setMfaCode] = useState<string>("");
  const [mfaSetupSecret, setMfaSetupSecret] = useState<string>("");
  const [mfaSetupQr, setMfaSetupQr] = useState<string>("");

  const [deployType, setDeployType] = useState<"delta" | "full" | "manifest">("delta");
  const [customManifestXml, setCustomManifestXml] = useState<string>("");
  const [agentConfig, setAgentConfig] = useState<{ enabled: boolean; maxRetries: number; hasApiKey: boolean; hasGlobalApiKey: boolean } | null>(null);
  const [agentHistory, setAgentHistory] = useState<any[]>([]);
  const [agentConfigLoading, setAgentConfigLoading] = useState<boolean>(false);
  const [agentApiKeyInput, setAgentApiKeyInput] = useState<string>("");
  const [mfaSetupCode, setMfaSetupCode] = useState<string>("");
  const [mfaMessage, setMfaMessage] = useState<string>("");
  const [currentPassword, setCurrentPassword] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [guideVisibility, setGuideVisibility] = useState<Record<string, boolean>>({
    dashboardSection: true,
    profileSection: true,
    projectSection: true,
    manifestSection: true,
    retrieveSection: true,
    orchestratorSection: true,
    diffSection: true,
    reportSection: true,
    jobSection: true,
    deploySection: true,
    historySection: true,
    agentSection: true,
    cliConsoleSection: false
  });
  const [checklistCollapsed, setChecklistCollapsed] = useState<boolean>(false);
  const [enabledFeatures, setEnabledFeatures] = useState<Record<string, boolean>>({});
  const [insights, setInsights] = useState<any[]>([]);
  const [scans, setScans] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [navGroupState, setNavGroupState] = useState<Record<string, boolean>>({
    workflow: true,
    insights: true,
    premium: true,
    account: false
  });

  const isSignedIn = Boolean(state.token);
  const jobRunning = compareStatus?.status === "running";
  const manifestReady = Boolean(sourceManifestValue.trim() && destManifestValue.trim());
  const canRunCompare = Boolean(state.activeProject?.id && state.activeProject?.sourceOrg && state.activeProject?.destinationOrg);
  const activeGuide = sectionGuides[activeSection] || sectionGuides.projectSection;
  const premiumGroup = useMemo(() => {
    const items = [];
    if (enabledFeatures.ai_insights) {
      items.push({ id: "aiInsightsSection", label: "AI Insights" });
    }
    if (enabledFeatures.static_scans) {
      items.push({ id: "staticScansSection", label: "Static Scans" });
    }
    if (enabledFeatures.org_design_docs) {
      items.push({ id: "orgDocsSection", label: "Org Docs" });
    }
    if (enabledFeatures.autonomous_healing) {
      items.push({ id: "agentSection", label: "Autonomous Agent" });
    }
    if (items.length === 0) return null;
    return {
      id: "premium",
      label: "AI & Insights",
      items
    };
  }, [enabledFeatures]);

  const navGroups = useMemo(
    () => {
      const groups = [
        {
          id: "workflow",
          label: "Workflow",
          items: [
            { id: "dashboardSection", label: "Dashboard" },
            { id: "projectSection", label: "Project & Orgs" },
            { id: "manifestSection", label: "Manifests" },
            { id: "retrieveSection", label: "Retrieve" },
            { id: "orchestratorSection", label: "Orchestrator", badge: jobRunning }
          ]
        },
        {
          id: "insights",
          label: "Insights & Deploy",
          items: [
            { id: "diffSection", label: "Diff" },
            { id: "reportSection", label: "Reports" },
            { id: "jobSection", label: "Job Activity", badge: jobRunning },
            { id: "deploySection", label: "Deploy" },
            { id: "historySection", label: "History" }
          ]
        }
      ];
      if (premiumGroup) {
        groups.push(premiumGroup);
      }
      groups.push({
        id: "account",
        label: "Account & Console",
        items: [
          { id: "profileSection", label: "Profile" },
          { id: "cliConsoleSection", label: "CLI Console" }
        ]
      });
      return groups;
    },
    [jobRunning, premiumGroup]
  );
  const hasSourceRetrieve = useMemo(
    () => historyData.retrievals.some((item: any) => item.target === "source"),
    [historyData.retrievals]
  );
  const hasDestinationRetrieve = useMemo(
    () => historyData.retrievals.some((item: any) => item.target === "destination"),
    [historyData.retrievals]
  );
  const selectedDiffCount = useMemo(
    () => state.diffChanges.filter((item: any) => diffSelected[item.relPath]).length,
    [state.diffChanges, diffSelected]
  );
  const compareReadinessIssues = useMemo(() => {
    const issues: ReadinessIssue[] = [];
    if (!state.activeProject?.id) {
      issues.push({
        id: "project",
        label: "No active project selected",
        detail: "Comparison needs a project context so it knows which workspaces to read and write.",
        section: "projectSection",
        cta: "Open project setup"
      });
    }
    if (!state.activeProject?.sourceOrg) {
      issues.push({
        id: "source-org",
        label: "Source org is not bound",
        detail: "Bind a source org to tell the app where to retrieve source metadata from.",
        section: "projectSection",
        cta: "Bind source org"
      });
    }
    if (!state.activeProject?.destinationOrg) {
      issues.push({
        id: "destination-org",
        label: "Destination org is not bound",
        detail: "Bind a destination org so the compare can measure drift against the target environment.",
        section: "projectSection",
        cta: "Bind destination org"
      });
    }
    if (!sourceManifestValue.trim()) {
      issues.push({
        id: "source-manifest",
        label: "Source manifest is empty",
        detail: "Generate or save a source manifest before running compare from the current workspace.",
        section: "manifestSection",
        cta: "Open manifests"
      });
    }
    if (!destManifestValue.trim()) {
      issues.push({
        id: "destination-manifest",
        label: "Destination manifest is empty",
        detail: "Generate or save a destination manifest so compare scope is explicit.",
        section: "manifestSection",
        cta: "Open manifests"
      });
    }
    if (!hasSourceRetrieve) {
      issues.push({
        id: "source-retrieve",
        label: "Source metadata has not been retrieved",
        detail: "The workspace compare uses retrieved files. Run a source retrieve first.",
        section: "retrieveSection",
        cta: "Go to retrieve"
      });
    }
    if (!hasDestinationRetrieve) {
      issues.push({
        id: "destination-retrieve",
        label: "Destination metadata has not been retrieved",
        detail: "The diff needs a destination workspace before it can compare environments.",
        section: "retrieveSection",
        cta: "Go to retrieve"
      });
    }
    return issues;
  }, [
    destManifestValue,
    hasDestinationRetrieve,
    hasSourceRetrieve,
    sourceManifestValue,
    state.activeProject?.destinationOrg,
    state.activeProject?.id,
    state.activeProject?.sourceOrg
  ]);
  const orchestratorReadinessIssues = useMemo(() => {
    const issues: ReadinessIssue[] = [];
    if (!state.activeProject?.id) {
      issues.push({
        id: "orch-project",
        label: "No active project selected",
        detail: "The orchestrator needs a project context before it can create logs, snapshots, and outputs.",
        section: "projectSection",
        cta: "Open project setup"
      });
    }
    if (!state.activeProject?.sourceOrg) {
      issues.push({
        id: "orch-source",
        label: "Source org is not bound",
        detail: "The orchestrator cannot retrieve source metadata until a source org is attached.",
        section: "projectSection",
        cta: "Bind source org"
      });
    }
    if (!state.activeProject?.destinationOrg) {
      issues.push({
        id: "orch-destination",
        label: "Destination org is not bound",
        detail: "The orchestrator cannot compare environments until a destination org is attached.",
        section: "projectSection",
        cta: "Bind destination org"
      });
    }
    if (compareStrategy === "custom" && !compareManifestXml.trim()) {
      issues.push({
        id: "orch-custom-manifest",
        label: "Custom strategy is selected without a manifest",
        detail: "Paste a valid package.xml before starting the job.",
        section: "orchestratorSection",
        cta: "Add custom manifest"
      });
    }
    if (compareStrategy === "merge" && !compareMergeXml.trim()) {
      issues.push({
        id: "orch-merge-manifests",
        label: "Merge strategy is selected without source manifests",
        detail: "Paste one or more manifests separated by --- before starting the job.",
        section: "orchestratorSection",
        cta: "Add merge manifests"
      });
    }
    return issues;
  }, [
    compareManifestXml,
    compareMergeXml,
    compareStrategy,
    state.activeProject?.destinationOrg,
    state.activeProject?.id,
    state.activeProject?.sourceOrg
  ]);
  const deployReadinessIssues = useMemo(() => {
    const issues: ReadinessIssue[] = [];
    if (!state.activeProject?.id) {
      issues.push({
        id: "deploy-project",
        label: "No active project selected",
        detail: "Deployment must target a specific project and deploy workspace.",
        section: "projectSection",
        cta: "Open project setup"
      });
    }
    if (!state.activeProject?.destinationOrg) {
      issues.push({
        id: "deploy-destination-org",
        label: "Destination org is not bound",
        detail: "Deployment needs a bound destination org to know where to send the package.",
        section: "projectSection",
        cta: "Bind destination org"
      });
    }
    if (deployType === "delta") {
      if (!state.diffChanges.length) {
        issues.push({
          id: "deploy-diff",
          label: "No diff has been generated",
          detail: "Generate a diff so the delta manifest is based on reviewed change scope.",
          section: "diffSection",
          cta: "Open diff"
        });
      }
      if (!selectedDiffCount) {
        issues.push({
          id: "deploy-selection",
          label: "No changes are selected for the delta",
          detail: "Select the changes you want to deploy before building or reviewing the delta manifest.",
          section: "diffSection",
          cta: "Review selections"
        });
      }
      if (!deltaManifest.trim()) {
        issues.push({
          id: "deploy-manifest",
          label: "Delta manifest is empty",
          detail: "Build the delta manifest from the selected changes before deployment.",
          section: "diffSection",
          cta: "Build delta"
        });
      }
    } else if (deployType === "manifest") {
      if (!customManifestXml.trim()) {
        issues.push({
          id: "deploy-manifest-empty",
          label: "Custom manifest is empty",
          detail: "Please provide a valid package.xml manifest content in the textarea before deploying.",
          section: "diffSection",
          cta: "Edit manifest"
        });
      }
    }
    return issues;
  }, [deltaManifest, selectedDiffCount, state.activeProject?.destinationOrg, state.activeProject?.id, state.diffChanges.length, deployType, customManifestXml]);
  const canRunWorkspaceDiff = compareReadinessIssues.length === 0;
  const canRunOrchestrator = orchestratorReadinessIssues.length === 0;
  const canRunDeployFlow = deployReadinessIssues.length === 0;
  const checklistItems = useMemo(() => {
    const hasProject = Boolean(state.projects.length);
    const hasActiveProject = Boolean(state.activeProject?.id);
    const hasOrg = Boolean(state.orgs.length);
    const sourceBound = Boolean(state.activeProject?.sourceOrg);
    const destinationBound = Boolean(state.activeProject?.destinationOrg);
    const sourceRetrieved = historyData.retrievals.some((item: any) => item.target === "source");
    const destinationRetrieved = historyData.retrievals.some((item: any) => item.target === "destination");
    const hasDiff = Boolean(historyData.comparisons.length);
    const hasDeploy = Boolean(historyData.deployments.length);

    return [
      {
        id: "create-project",
        label: "Create a project",
        detail: "Projects hold source, destination, and deploy workspaces.",
        done: hasProject,
        section: "projectSection"
      },
      {
        id: "select-project",
        label: "Select the active project",
        detail: "All workflow actions run against the currently active project.",
        done: hasActiveProject,
        section: "projectSection"
      },
      {
        id: "add-org",
        label: "Add at least one org",
        detail: "Save org auth using an alias and sfdxAuthUrl.",
        done: hasOrg,
        section: "projectSection"
      },
      {
        id: "bind-orgs",
        label: "Bind source and destination",
        detail: "The project needs both orgs before compare can run.",
        done: sourceBound && destinationBound,
        section: "projectSection"
      },
      {
        id: "prepare-manifests",
        label: "Prepare manifests",
        detail: "Generate or edit source and destination manifests.",
        done: manifestReady,
        section: "manifestSection"
      },
      {
        id: "retrieve-source",
        label: "Retrieve source metadata",
        detail: "Run the source retrieve to populate the source workspace.",
        done: sourceRetrieved,
        section: "retrieveSection"
      },
      {
        id: "retrieve-destination",
        label: "Retrieve destination metadata",
        detail: "Run the destination retrieve to populate the destination workspace.",
        done: destinationRetrieved,
        section: "retrieveSection"
      },
      {
        id: "run-diff",
        label: "Generate diff and delta",
        detail: "Review the change set before deployment.",
        done: hasDiff,
        section: "diffSection"
      },
      {
        id: "deploy",
        label: "Deploy reviewed delta",
        detail: "Deploy only after reviewing the generated delta manifest.",
        done: hasDeploy,
        section: "deploySection"
      }
    ];
  }, [historyData.comparisons, historyData.deployments, historyData.retrievals, manifestReady, state.activeProject?.destinationOrg, state.activeProject?.id, state.activeProject?.sourceOrg, state.orgs.length, state.projects.length]);
  const checklistCompleted = checklistItems.filter((item) => item.done).length;

  const projectOptions = useMemo(
    () => [{ id: "", name: "Select project" }, ...state.projects],
    [state.projects]
  );

  function safeTranslateError(input: unknown) {
    try {
      return typeof translateError === "function" ? translateError(input) : null;
    } catch {
      return null;
    }
  }

  async function api(path: string, options: RequestInit = {}) {
    const headers = options.headers ? new Headers(options.headers) : new Headers();
    if (state.token) headers.set("Authorization", `Bearer ${state.token}`);
    if (!headers.has("Content-Type") && options.body) {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(path, { ...options, headers });
    if (res.status === 401) {
      handleLogout();
      setUiNotice({ type: "error", message: "Session expired. Please sign in again." });
      setUiErrorHelp(safeTranslateError("Session expired. Please sign in again."));
      throw new Error("Session expired. Please sign in again.");
    }
    if (!res.ok) {
      const payload = await res.json().catch(() => ({ message: "Request failed" }));
      const details = payload.details ? `\n${payload.details}` : "";
      const finalMessage = payload.message || payload.error || "Request failed";
      setUiNotice({ type: "error", message: finalMessage });
      setUiErrorHelp(safeTranslateError(`${finalMessage}${details}`));
      throw new Error(`${finalMessage}${details}`);
    }
    setUiErrorHelp(null);
    return res.json();
  }

  function extractManifestVersion(xml: string) {
    const match = xml.match(/<version>\s*([^<]+)\s*<\/version>/i);
    return match?.[1]?.trim() || "";
  }

  function resolveValidationVersion(xml: string) {
    const active = state.activeProject;
    if (!active) return extractManifestVersion(xml) || undefined;
    const preferredAlias = active.destinationOrg || active.sourceOrg || "";
    const orgAlias = String(orgDetails?.alias || "");
    const orgApiVersion = String(orgDetails?.info?.apiVersion || orgDetails?.info?.apiVersionNumber || "").trim();
    if (preferredAlias && orgAlias === preferredAlias && orgApiVersion) {
      return orgApiVersion;
    }
    return extractManifestVersion(xml) || undefined;
  }

  async function validateManifestForProject(projectId: string, xml: string) {
    const version = resolveValidationVersion(xml);
    const data = await api(`/api/projects/${projectId}/manifests/validate`, {
      method: "POST",
      body: JSON.stringify({
        xml,
        channel: "metadataApi",
        ...(version ? { version } : {})
      }),
    });
    return {
      xml: String(data?.xml || ""),
      warnings: Array.isArray(data?.warnings) ? data.warnings : [],
      version: String(data?.version || "")
    };
  }

  function setOutput(output: any) {
    if (output && typeof output === "object" && "error" in output) {
      setUiErrorHelp(safeTranslateError(String(output.error || "")));
    }
    setConsoleOutput(typeof output === "string" ? output : JSON.stringify(output, null, 2));
  }

  function confirmActionWith(message: string, action: () => void) {
    setConfirmMessage(message);
    setConfirmAction(() => action);
    setConfirmOpen(true);
  }

  function safeOrgField(info: Record<string, any> | null | undefined, keys: string[]) {
    if (!info) return "unknown";
    for (const key of keys) {
      const value = info[key];
      if (value !== undefined && value !== null && value !== "") {
        return String(value);
      }
    }
    return "unknown";
  }

  function startLogStream(relPath: string, key: string) {
    if (!state.activeProject || !relPath) return;
    if (logTimers[key]) {
      clearInterval(logTimers[key]);
    }
    delete logOffsetsRef.current[key];
    const fetchLog = async () => {
      try {
        const offset = logOffsetsRef.current[key];
        const query = offset === undefined
          ? `relPath=${encodeURIComponent(relPath)}&limitBytes=8192`
          : `relPath=${encodeURIComponent(relPath)}&offset=${offset}&limitBytes=8192`;
        const data = await api(`/api/projects/${state.activeProject?.id}/logs?${query}`);
        const content = String(data.content || "");
        logOffsetsRef.current[key] = Number(data.nextOffset || 0);
        setConsoleOutput((prev) => {
          if (offset === undefined) {
            return content;
          }
          if (!content) {
            return prev;
          }
          return `${prev}${content}`;
        });
      } catch (err: any) {
        setOutput({ error: err.message });
      }
    };
    fetchLog();
    const timer = setInterval(fetchLog, 2500);
    setLogTimers((prev) => ({ ...prev, [key]: timer }));
  }

  function clearConsole() {
    setConsoleOutput("");
    logOffsetsRef.current = {};
  }

  function toggleGuide(sectionId: string) {
    setGuideVisibility((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  }

  function renderGuide(sectionId: string) {
    const guide = sectionGuides[sectionId];
    if (!guide) return null;
    const open = guideVisibility[sectionId] !== false;
    return (
      <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/80 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-sky-700">{guide.eyebrow}</div>
            <div className="mt-1 text-sm font-semibold text-sky-950">{guide.title}</div>
            <div className="mt-1 text-sm text-sky-900/80">{guide.summary}</div>
          </div>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-300 bg-white text-sm font-semibold text-sky-700"
            onClick={() => toggleGuide(sectionId)}
            title={open ? "Hide guide" : "Show guide"}
            aria-label={open ? "Hide guide" : "Show guide"}
          >
            i
          </button>
        </div>
        {open ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-sky-700">How To Use This Section</div>
              <div className="mt-2 grid gap-2">
                {guide.steps.map((step, index) => (
                  <div key={`${sectionId}-${index}`} className="flex items-start gap-3 rounded-xl border border-sky-100 bg-white/80 px-3 py-2 text-sm text-slate-700">
                    <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-[11px] font-semibold text-sky-700">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-white/80 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-sky-700">Done Looks Like</div>
              <div className="mt-2 text-sm text-slate-700">{guide.success}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-full border border-sky-200 px-3 py-1 text-xs text-sky-700"
                  onClick={() => window.open("/docs", "_blank")}
                >
                  Open docs
                </button>
                <button
                  className="rounded-full border border-sky-200 px-3 py-1 text-xs text-sky-700"
                  onClick={() => toggleGuide(sectionId)}
                >
                  {open ? "Collapse guide" : "Expand guide"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function renderReadinessPanel(title: string, issues: ReadinessIssue[], successMessage: string) {
    if (!issues.length) {
      return (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      );
    }
    return (
      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="text-xs uppercase tracking-[0.2em] text-amber-700">{title}</div>
        <div className="mt-2 text-sm text-amber-900">
          This action is blocked until the following prerequisites are completed.
        </div>
        <div className="mt-3 grid gap-3">
          {issues.map((issue) => (
            <div key={issue.id} className="rounded-xl border border-amber-100 bg-white/80 px-3 py-3">
              <div className="text-sm font-semibold text-slate-800">{issue.label}</div>
              <div className="mt-1 text-xs text-slate-600">{issue.detail}</div>
              <div className="mt-3">
                <button
                  className="rounded-full border border-amber-200 px-3 py-1 text-xs text-amber-700"
                  onClick={() => setActiveSection(issue.section)}
                >
                  {issue.cta}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  async function loadReport(relPath?: string) {
    const legacyPath = "deploy/logs/comparison-report.html";
    const nextPath = relPath || diffReportPath || legacyPath;
    if (!state.activeProject || !nextPath) {
      setReportContent("");
      setReportError("Generate a diff to create the report.");
      return;
    }
    if (relPath) {
      setDiffReportPath(relPath);
    }
    setReportLoading(true);
    setReportError("");
    try {
      const res = await fetch(
        `/api/projects/${state.activeProject.id}/report?relPath=${encodeURIComponent(nextPath)}`,
        { headers: { Authorization: `Bearer ${state.token}` } }
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({ message: "Request failed" }));
        throw new Error(payload.message || payload.error || "Request failed");
      }
      const html = await res.text();
      setReportContent(html);
    } catch (err: any) {
      setReportError(err.message);
      setReportContent("");
    } finally {
      setReportLoading(false);
    }
  }

  function startComparePoll(jobId: string) {
    if (!state.activeProject) return;
    if (compareTimerRef.current) {
      clearInterval(compareTimerRef.current);
    }
    const poll = async () => {
      try {
        const res = await fetch(`/api/projects/${state.activeProject?.id}/compare/job/${jobId}`, {
          headers: { Authorization: `Bearer ${state.token}` }
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({ message: "Request failed" }));
          throw new Error(payload.message || payload.error || "Request failed");
        }
        const status = await res.json();
        setCompareStatus(status);
        const currentStage =
          Array.isArray(status.stages) && status.stages.length
            ? status.stages.find((stage: any) => stage.status === "running")?.name || "comparison"
            : "comparison";
        setCurrentProcess(`Comparison job: ${currentStage}`);
        if (status.status === "done") {
          if (compareTimerRef.current) {
            clearInterval(compareTimerRef.current);
            compareTimerRef.current = null;
          }
          setCurrentProcess("");
          refreshHistory();
          const outputs = status.outputs || {};
          const changes = outputs.changes || [];
          const selected: Record<string, boolean> = {};
          changes.forEach((item: any) => {
            if (item.status === "Added" || item.status === "Changed") {
              selected[item.relPath] = true;
            }
          });
          setDiffSelected(selected);
          setState((prev) => ({ ...prev, diffChanges: changes }));
          setDeltaManifest(outputs.deltaXml || "");
          setDiffReportPath(outputs.reportRelPath || "");
          const deltaEl = document.getElementById("deltaManifest") as HTMLTextAreaElement | null;
          if (deltaEl) deltaEl.value = outputs.deltaXml || "";
          setCompareJobId("");
          setIncludeDeletions(true);
          loadDestructivePreview();
        }
        if (status.status === "failed") {
          if (compareTimerRef.current) {
            clearInterval(compareTimerRef.current);
            compareTimerRef.current = null;
          }
          setCurrentProcess("");
          setCompareJobId("");
          refreshHistory();
        }
      } catch (err: any) {
        setOutput({ error: err.message });
      }
    };
    poll();
    compareTimerRef.current = setInterval(poll, 3000);
  }

  function startRetrieveStatusPoll(target: "source" | "destination") {
    if (retrieveTimerRef.current) {
      clearInterval(retrieveTimerRef.current);
    }
    const poll = async () => {
      try {
        if (!state.activeProject) return;
        const status = await api(`/api/projects/${state.activeProject.id}/retrieve/${target}/status`);
        const nextHash = JSON.stringify({
          entries: status.entries || [],
          outputs: status.outputs || [],
          chunks: status.chunkManifests || [],
          done: status.done
        });
        if (nextHash !== retrieveStatusHashRef.current) {
          retrieveStatusHashRef.current = nextHash;
          setRetrieveEntries(status.entries || []);
          setRetrieveOutputs(status.outputs || []);
          setRetrieveChunks(status.chunkManifests || []);
          if (status.retrieveMode === "grouped" || status.retrieveMode === "chunked") {
            setRetrieveMode(status.retrieveMode);
          }
        }
        if (status.done) {
          setRetrieveRunning(null);
          setCurrentProcess("");
          if (retrieveTimerRef.current) {
            clearInterval(retrieveTimerRef.current);
            retrieveTimerRef.current = null;
          }
        }
      } catch (err: any) {
        setOutput({ error: err.message });
      }
    };
    poll();
    retrieveTimerRef.current = setInterval(poll, 3000);
  }

  function startDeployStatusPoll(jobId: string) {
    if (deployTimerRef.current) {
      clearInterval(deployTimerRef.current);
    }
    const poll = async () => {
      try {
        if (!state.activeProject) return;
        const status = await api(`/api/projects/${state.activeProject.id}/deploy/${jobId}`);
        setDeployStatus(status);
        if (status.record) {
          setState((prev) => ({ ...prev, lastDeploy: status.record }));
        }
        if (status.status === "done" || status.status === "failed") {
          setCurrentProcess("");
          setDeployJobId("");
          if (deployTimerRef.current) {
            clearInterval(deployTimerRef.current);
            deployTimerRef.current = null;
          }
          refreshHistory();
        }
      } catch (err: any) {
        setOutput({ error: err.message });
      }
    };
    poll();
    deployTimerRef.current = setInterval(poll, 3000);
  }

  async function loadProjects() {
    const projects = await api("/api/projects");
    setState((prev) => {
      const active = prev.activeProject
        ? projects.find((project: any) => project.id === prev.activeProject?.id) || projects[0] || null
        : projects[0] || null;
      return { ...prev, projects, activeProject: active };
    });
  }

  async function loadOrgs() {
    const orgs = await api("/api/orgs");
    setState((prev) => ({ ...prev, orgs }));
  }

  async function loadUsage() {
    try {
      const data = await api("/api/usage");
      setUsageInfo(data);
    } catch (err: any) {
      setUsageInfo({ error: err.message });
    }
  }

  async function loadOrgDetails(alias: string) {
    if (!alias) {
      setOrgDetails(null);
      return;
    }
    const details = await api(`/api/orgs/${encodeURIComponent(alias)}`);
    setOrgDetails(details);
  }

  async function refreshManifests() {
    if (!state.activeProject) return;
    const data = await api(`/api/projects/${state.activeProject.id}/manifests`);
    const sourceEl = document.getElementById("sourceManifest") as HTMLTextAreaElement | null;
    const destEl = document.getElementById("destManifest") as HTMLTextAreaElement | null;
    const deltaEl = document.getElementById("deltaManifest") as HTMLTextAreaElement | null;
    if (sourceEl) sourceEl.value = data.source || "";
    if (destEl) destEl.value = data.destination || "";
    setSourceManifestValue(data.source || "");
    setDestManifestValue(data.destination || "");
    setDeltaManifest(data.delta || "");
    if (deltaEl) deltaEl.value = data.delta || "";
  }

  async function refreshHistory() {
    if (!state.activeProject) return;
    const history = await api(`/api/projects/${state.activeProject.id}/history`);
    const comparisons = history.comparisons || [];
    setHistoryData({
      retrievals: history.retrievals || [],
      comparisons,
      deployments: history.deployments || []
    });
    const latest = comparisons[0];
    if (latest?.id) {
      setCompareJobId(latest.id);
      if (latest.jobStatus) {
        setCompareStatus(latest.jobStatus);
        if (latest.jobStatus.status === "running") {
          startComparePoll(latest.id);
        }
      } else if (latest.completedAt) {
        setCompareStatus({
          status: "done",
          updatedAt: latest.completedAt,
          stages: []
        });
      }
    } else {
      setCompareJobId("");
      setCompareStatus(null);
    }
  }

  async function loadFeatureFlags() {
    try {
      const data = await api("/api/company-admin/feature-flags");
      const flags: Record<string, boolean> = {};
      if (data.features) {
        data.features.forEach((f: any) => {
          flags[f.featureKey] = f.enabled;
        });
      }
      setEnabledFeatures(flags);
    } catch (err) {
      console.error("Failed to load feature flags:", err);
    }
  }

  async function loadInsights() {
    const data = await api("/api/company-admin/ai-insights");
    setInsights(data.insights || []);
  }

  async function loadScans() {
    const data = await api("/api/company-admin/static-scans");
    setScans(data.scans || []);
  }

  async function loadDocs() {
    const data = await api("/api/company-admin/org-docs");
    setDocs(data.docs || []);
  }

  async function loadProfile() {
    const data = await api("/api/profile");
    setProfileData({
      name: data.profile?.name || "",
      company: data.profile?.company || "",
      social: data.profile?.social || {},
      mfaEnabled: Boolean(data.profile?.mfaEnabled)
    });
  }

  function persistSession(token: string, user: typeof defaultState.user) {
    localStorage.setItem("token", token);
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        token,
        user,
        savedAt: new Date().toISOString()
      })
    );
  }

  useEffect(() => {
    const savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
    const savedSection = localStorage.getItem(ACTIVE_SECTION_STORAGE_KEY);
    let token = "";
    let user = null;
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        token = parsed?.token || "";
        user = parsed?.user || null;
      } catch {
        token = "";
        user = null;
      }
    }
    if (!token) {
      token = localStorage.getItem("token") || "";
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split(".")[1] || ""));
          user = { id: payload.id, email: payload.email, role: payload.role };
        } catch {
          user = null;
        }
      }
    }
    if (token) {
      setState((prev) => ({ ...prev, token, user }));
    }
    if (savedSection) {
      setActiveSection(savedSection);
    }
    return undefined;
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = saved === "dark" || saved === "mint" || saved === "sand" || saved === "slate" ? saved : prefersDark ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/services/status")
      .then((res) => res.json())
      .then((data) => {
        if (!alive) return;
        setAppVersion(typeof data?.app?.details === "string" ? data.app.details : "");
      })
      .catch(() => {
        if (!alive) return;
        setAppVersion("");
      });
    return () => {
      alive = false;
    };
  }, []);

  function handleThemeChange(next: "light" | "mint" | "dark" | "sand" | "slate") {
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.dataset.theme = next;
  }

  useEffect(() => {
    if (!isSignedIn) {
      setActiveSection("projectSection");
    } else if (activeSection === "projectSection" || !activeSection) {
      setActiveSection("dashboardSection");
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;
    localStorage.setItem(ACTIVE_SECTION_STORAGE_KEY, activeSection);
  }, [activeSection, isSignedIn]);

  useEffect(() => {
    if (!state.token) return;
    loadProjects();
    loadOrgs();
    loadUsage();
    loadFeatureFlags();
  }, [state.token]);

  useEffect(() => {
    if (!state.orgs.length) {
      setSelectedOrgAlias("");
      setOrgDetails(null);
      return;
    }
    if (!selectedOrgAlias || !state.orgs.find((org) => org.alias === selectedOrgAlias)) {
      const next = state.orgs[0]?.alias || "";
      setSelectedOrgAlias(next);
      if (next) {
        loadOrgDetails(next).catch((err) => setOutput({ error: err.message }));
      }
    }
  }, [state.orgs]);

  useEffect(() => {
    if (state.activeProject) {
      refreshManifests();
      refreshHistory();
      loadAgentConfig(state.activeProject.id);
      loadAgentHistory(state.activeProject.id);
      loadDestructivePreview();
      setDiffReportPath("");
      setReportContent("");
      setReportError("");
    }
  }, [state.activeProject]);

  useEffect(() => {
    if (isSignedIn && activeSection === "profileSection") {
      loadProfile().catch((err) => setOutput({ error: err.message }));
    }
  }, [activeSection, isSignedIn]);

  useEffect(() => {
    if (isSignedIn && activeSection === "reportSection") {
      loadReport();
    }
  }, [activeSection, diffReportPath, state.activeProject?.id, isSignedIn]);

  useEffect(() => {
    if (isSignedIn && activeSection === "historySection") {
      refreshHistory();
    }
  }, [activeSection, state.activeProject?.id, isSignedIn]);

  useEffect(() => {
    if (isSignedIn && activeSection === "aiInsightsSection") {
      loadInsights().catch((err: any) => setOutput({ error: err.message }));
    }
  }, [activeSection, isSignedIn]);

  useEffect(() => {
    if (isSignedIn && activeSection === "staticScansSection") {
      loadScans().catch((err: any) => setOutput({ error: err.message }));
    }
  }, [activeSection, isSignedIn]);

  useEffect(() => {
    if (isSignedIn && activeSection === "orgDocsSection") {
      loadDocs().catch((err: any) => setOutput({ error: err.message }));
    }
  }, [activeSection, isSignedIn]);

  useEffect(() => {
    if (isSignedIn && activeSection === "agentSection" && state.activeProject?.id) {
      loadAgentConfig(state.activeProject.id);
      loadAgentHistory(state.activeProject.id);
    }
  }, [activeSection, state.activeProject?.id, isSignedIn]);

  useEffect(() => {
    if (!isSignedIn || !state.activeProject?.id) return;
    refreshHistory().catch((err) => setOutput({ error: err.message }));
  }, [state.activeProject?.id, isSignedIn]);

  useEffect(() => {
    return () => {
      if (retrieveTimerRef.current) {
        clearInterval(retrieveTimerRef.current);
        retrieveTimerRef.current = null;
      }
      if (compareTimerRef.current) {
        clearInterval(compareTimerRef.current);
        compareTimerRef.current = null;
      }
      if (deployTimerRef.current) {
        clearInterval(deployTimerRef.current);
        deployTimerRef.current = null;
      }
    };
  }, []);

  async function handleRegister() {
    try {
      setAuthError("");
      const email = (document.getElementById("registerEmail") as HTMLInputElement).value;
      const password = (document.getElementById("registerPassword") as HTMLInputElement).value;
      const data = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      persistSession(data.token, data.user);
      setState((prev) => ({ ...prev, token: data.token, user: data.user }));
      setActiveSection("dashboardSection");
      setOutput("Registered and signed in.");
    } catch (err: any) {
      setAuthError(err.message);
      setOutput({ error: err.message });
    }
  }

  async function handleLogin() {
    try {
      setAuthError("");
      const email = (document.getElementById("loginEmail") as HTMLInputElement).value;
      const password = (document.getElementById("loginPassword") as HTMLInputElement).value;
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (data.mfaRequired) {
        setMfaChallengeToken(data.challengeToken || "");
        setMfaCode("");
        setAuthMode("mfa");
        setOutput("MFA code required.");
        return;
      }
      persistSession(data.token, data.user);
      setState((prev) => ({ ...prev, token: data.token, user: data.user }));
      setActiveSection("dashboardSection");
      setOutput("Signed in.");
    } catch (err: any) {
      setAuthError(err.message);
      setOutput({ error: err.message });
    }
  }

  async function handleMfaLogin() {
    try {
      setAuthError("");
      const data = await api("/api/auth/mfa/verify", {
        method: "POST",
        body: JSON.stringify({ challengeToken: mfaChallengeToken, code: mfaCode }),
      });
      persistSession(data.token, data.user);
      setState((prev) => ({ ...prev, token: data.token, user: data.user }));
      setMfaChallengeToken("");
      setMfaCode("");
      setAuthMode("login");
      setActiveSection("dashboardSection");
      setOutput("Signed in.");
    } catch (err: any) {
      setAuthError(err.message);
      setOutput({ error: err.message });
    }
  }

  async function handleForgotPassword() {
    try {
      const email = (document.getElementById("forgotEmail") as HTMLInputElement).value;
      const data = await api("/api/auth/forgot", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setOutput(data.message || "If an account exists, a reset link has been sent.");
      setAuthMode("login");
    } catch (err: any) {
      setOutput({ error: err.message });
    }
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(ACTIVE_SECTION_STORAGE_KEY);
    setState(defaultState);
    setOutput("Signed out.");
  }

  async function handleCreateProject() {
    try {
      const name = (document.getElementById("projectName") as HTMLInputElement).value.trim();
      if (!name) return;
      const project = await api("/api/projects", { method: "POST", body: JSON.stringify({ name }) });
      setOutput(project);
      await loadProjects();
    } catch (err: any) {
      setOutput({ error: err.message });
    }
  }

  async function handleUpdateProject(projectId: string) {
    try {
      const name = projectEdits[projectId]?.trim();
      if (!name) return;
      const data = await api(`/api/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ name }) });
      setOutput(data);
      await loadProjects();
    } catch (err: any) {
      setOutput({ error: err.message });
    }
  }

  async function handleDeleteProject(projectId: string) {
    try {
      const data = await api(`/api/projects/${projectId}`, { method: "DELETE" });
      setOutput(data);
      await loadProjects();
    } catch (err: any) {
      setOutput({ error: err.message });
    }
  }

  async function handleAttachOrgs() {
    try {
      if (!state.activeProject) return;
      const sourceOrg = (document.getElementById("sourceOrgSelect") as HTMLSelectElement).value;
      const destinationOrg = (document.getElementById("destOrgSelect") as HTMLSelectElement).value;
      const project = await api(`/api/projects/${state.activeProject.id}/orgs`, {
        method: "POST",
        body: JSON.stringify({ sourceOrg, destinationOrg }),
      });
      setOutput(project);
      setState((prev) => ({ ...prev, activeProject: project }));
    } catch (err: any) {
      setOutput({ error: err.message });
    }
  }

  async function handleAddOrg() {
    try {
      const alias = (document.getElementById("orgAlias") as HTMLInputElement).value.trim();
      const sfdxAuthUrl = (document.getElementById("orgAuthUrl") as HTMLTextAreaElement).value.trim();
      if (!alias || !sfdxAuthUrl) return;
      const org = await api("/api/orgs", { method: "POST", body: JSON.stringify({ alias, sfdxAuthUrl }) });
      setOutput(org);
      await loadOrgs();
    } catch (err: any) {
      setOutput({ error: err.message });
    }
  }

  async function handleUpdateOrg() {
    try {
      if (!selectedOrgAlias) return;
      const sfdxAuthUrl = orgAuthInput.trim();
      if (!sfdxAuthUrl) {
        setOutput({ error: "sfdxAuthUrl is required to refresh org details." });
        return;
      }
      const payload: Record<string, string> = { sfdxAuthUrl };
      if (orgAliasInput.trim()) {
        payload.alias = orgAliasInput.trim();
      }
      const data = await api(`/api/orgs/${encodeURIComponent(selectedOrgAlias)}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      setOutput(data);
      setOrgAuthInput("");
      setOrgAliasInput("");
      await loadOrgs();
      if (data.alias) {
        setSelectedOrgAlias(data.alias);
        await loadOrgDetails(data.alias);
      }
    } catch (err: any) {
      setOutput({ error: err.message });
    }
  }

  async function handleDeleteOrg() {
    try {
      if (!selectedOrgAlias) return;
      const data = await api(`/api/orgs/${encodeURIComponent(selectedOrgAlias)}`, { method: "DELETE" });
      setOutput(data);
      setSelectedOrgAlias("");
      await loadOrgs();
    } catch (err: any) {
      setOutput({ error: err.message });
    }
  }

  async function handleSelectOrg(alias: string) {
    setSelectedOrgAlias(alias);
    setOrgAliasInput(alias);
    setOrgAuthInput("");
    setOrgAuthVisible(false);
    try {
      await loadOrgDetails(alias);
    } catch (err: any) {
      setOutput({ error: err.message });
    }
  }

  async function handleRevealOrgAuth() {
    try {
      if (!selectedOrgAlias) return;
      if (!orgAuthVisible) {
        const data = await api(`/api/orgs/${encodeURIComponent(selectedOrgAlias)}/auth`);
        setOrgAuthInput(data.sfdxAuthUrl || "");
        setOrgAuthVisible(true);
      } else {
        setOrgAuthInput("");
        setOrgAuthVisible(false);
      }
    } catch (err: any) {
      setOutput({ error: err.message });
    }
  }

  async function handleGenerateManifest(type: "source" | "destination") {
    try {
      if (!state.activeProject) return;
      setCurrentProcess(`Generating ${type} manifest`);
      const data = await api(`/api/projects/${state.activeProject.id}/manifests/${type}/generate`, { method: "POST" });
      if (type === "source") {
        (document.getElementById("sourceManifest") as HTMLTextAreaElement).value = data.xml;
        setSourceManifestValue(data.xml || "");
      } else {
        (document.getElementById("destManifest") as HTMLTextAreaElement).value = data.xml;
        setDestManifestValue(data.xml || "");
      }
      setOutput(data);
      if (data.logPath) startLogStream(data.logPath, `manifest-${type}`);
    } catch (err: any) {
      setOutput({ error: err.message });
    } finally {
      setCurrentProcess("");
    }
  }

  async function loadDestructivePreview() {
    try {
      if (!state.activeProject) return;
      const data = await api(`/api/projects/${state.activeProject.id}/destructive`);
      setDestructivePreview({ count: data?.count || 0, components: Array.isArray(data?.components) ? data.components : [] });
    } catch {
      // Non-fatal: leave the previous preview in place if the lookup fails.
    }
  }

  async function handleSaveManifest(type: "source" | "destination" | "delta") {
    try {
      if (!state.activeProject) return;
      const textarea = document.getElementById(`${type}Manifest`) as HTMLTextAreaElement;
      const xml = textarea.value;
      const validated = await validateManifestForProject(state.activeProject.id, xml);
      const data = await api(`/api/projects/${state.activeProject.id}/manifests/${type}`, {
        method: "POST",
        body: JSON.stringify({ xml: validated.xml }),
      });
      textarea.value = validated.xml;
      if (type === "source") setSourceManifestValue(validated.xml);
      if (type === "destination") setDestManifestValue(validated.xml);
      if (type === "delta") setDeltaManifest(validated.xml);
      setOutput(data);
      const clearedDeletions = Array.isArray(data?.cleared) && data.cleared.includes("destructiveChanges.xml");
      if (clearedDeletions) {
        setUiNotice({
          type: "success",
          message: "Saved. Pending destructive deletions were cleared — this manifest will deploy additively. Re-run Compare to re-arm deletions.",
        });
      } else if (validated.warnings.length) {
        setUiNotice({ type: "success", message: validated.warnings[0] });
      }
      if (type === "delta") loadDestructivePreview();
    } catch (err: any) {
      setOutput({ error: err.message });
    }
  }

  async function handleRetrieve(target: "source" | "destination") {
    try {
      if (!state.activeProject) return;
      setRetrieveRunning(target);
      setCurrentProcess(`Retrieving ${target} metadata`);
      setActiveRetrieveType(null);
      setActiveRetrieveMembers([]);
      setMembersError("");
      const manifestField = target === "source" ? "sourceManifest" : "destManifest";
      const manifestXml = (document.getElementById(manifestField) as HTMLTextAreaElement | null)?.value || "";
      const plannedTypes = extractManifestTypes(manifestXml);
      setRetrievePlanned(plannedTypes);
      if (plannedTypes.length) {
        setRetrieveEntries(plannedTypes.map((type) => ({ type, member: "*", status: "Queued" })));
      }
      const data = await api(`/api/projects/${state.activeProject.id}/retrieve/${target}`, {
        method: "POST",
        body: JSON.stringify({ manifestXml, retrieveMode }),
      });
      setRetrieveEntries(data.entries || []);
      setRetrieveChunks(data.chunkManifests || []);
      setRetrieveOutputs(data.outputs || []);
      setOutput({
        message: data.message,
        retrieveMode: data.retrieveMode || retrieveMode,
        logPath: data.logPath,
        entries: data.entries?.length || 0,
        chunks: data.chunkManifests?.length || 0
      });
      if (data.logPath) startLogStream(data.logPath, `retrieve-${target}`);
      startRetrieveStatusPoll(target);
    } catch (err: any) {
      setOutput({ error: err.message });
    } finally {
      if (!retrieveTimerRef.current) {
        setRetrieveRunning(null);
        setCurrentProcess("");
      }
    }
  }

  async function handleStopRetrieve(target: "source" | "destination") {
    try {
      if (!state.activeProject) return;
      setCurrentProcess(`Stopping ${target} retrieve`);
      const data = await api(`/api/projects/${state.activeProject.id}/retrieve/${target}/stop`, { method: "POST" });
      setOutput(data);
      startRetrieveStatusPoll(target);
    } catch (err: any) {
      setOutput({ error: err.message });
    }
  }

  async function handleTypeMembers(target: "source" | "destination", typeName: string, status: string, refresh?: boolean) {
    try {
      if (!state.activeProject) return;
      setMembersLoading(true);
      setMembersError("");
      setActiveRetrieveType(typeName);
      setActiveRetrieveStatus(status);
      const data = await api(
        `/api/projects/${state.activeProject.id}/retrieve/${target}/members?type=${encodeURIComponent(typeName)}${
          refresh ? "&refresh=true" : ""
        }`
      );
      setActiveRetrieveMembers(data.members || []);
    } catch (err: any) {
      setMembersError(err.message);
    } finally {
      setMembersLoading(false);
    }
  }

  function extractManifestTypes(xml: string) {
    const types = new Set<string>();
    if (!xml) return [];
    const blocks = xml.match(/<types>[\s\S]*?<\/types>/g) || [];
    blocks.forEach((block) => {
      const match = block.match(/<name>([^<]+)<\/name>/);
      if (match?.[1]) {
        types.add(match[1].trim());
      }
    });
    return Array.from(types);
  }

  async function handleCompare(strategyOverride?: typeof compareStrategy) {
    try {
      if (!state.activeProject) return;
      setCurrentProcess("Starting comparison job");
      const effectiveStrategy = strategyOverride || compareStrategy;
      let validatedManifestXml = compareManifestXml || null;
      let mergeManifests = compareMergeXml
        ? compareMergeXml.split("---").map((block) => block.trim()).filter(Boolean)
        : [];
      if (effectiveStrategy === "custom" && validatedManifestXml?.trim()) {
        const normalized = await validateManifestForProject(state.activeProject.id, validatedManifestXml);
        validatedManifestXml = normalized.xml;
        setCompareManifestXml(normalized.xml);
      }
      if (effectiveStrategy === "merge" && mergeManifests.length) {
        const validated = await Promise.all(
          mergeManifests.map((manifest) => validateManifestForProject(state.activeProject!.id, manifest))
        );
        mergeManifests = validated.map((item) => item.xml);
        setCompareMergeXml(mergeManifests.join("\n---\n"));
      }
      const scope = {
        includeTypes: compareScopeInclude.split(",").map((item) => item.trim()).filter(Boolean),
        excludeTypes: compareScopeExclude.split(",").map((item) => item.trim()).filter(Boolean),
        excludeProfiles: compareScopeExcludeProfiles,
        customOnly: compareScopeCustomOnly,
        businessOnly: compareScopeBusinessOnly
      };
      const payload = {
        manifestStrategy: effectiveStrategy,
        manifestXml: validatedManifestXml,
        mergeManifests,
        scope,
        context: {
          branch: compareContextBranch || null,
          release: compareContextRelease || null,
          reason: compareContextReason || null
        }
      };
      const res = await fetch(`/api/projects/${state.activeProject.id}/compare/job`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${state.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const raw = await res.text();
        let message = "Request failed";
        try {
          const parsed = JSON.parse(raw);
          message = parsed.message || parsed.error || message;
        } catch {
          if (raw) message = raw;
        }
        throw new Error(message);
      }
      const data = await res.json();
      setCompareJobId(data.jobId || "");
      setCompareStatus({
        status: "running",
        updatedAt: new Date().toISOString(),
        stages: [{ name: "context", status: "running" }]
      });
      setOutput(data);
      if (data.jobId) {
        startComparePoll(data.jobId);
        refreshHistory();
      }
    } catch (err: any) {
      setOutput({ error: err.message });
    } finally {
      // currentProcess is cleared by polling when job completes
    }
  }

  async function handleGenerateDiffOnly() {
    try {
      if (!state.activeProject) return;
      setCurrentProcess("Generating diff from workspace");
      const data = await api(`/api/projects/${state.activeProject.id}/compare`, { method: "POST" });
      setState((prev) => ({ ...prev, diffChanges: data.changes || [] }));
      const selected: Record<string, boolean> = {};
      (data.changes || []).forEach((item: any) => {
        if (item.status === "Added" || item.status === "Changed") {
          selected[item.relPath] = true;
        }
      });
      setDiffSelected(selected);
      setDiffReportPath(data.reportRelPath || "");
      setDeltaManifest(data.deltaXml || "");
      const deltaEl = document.getElementById("deltaManifest") as HTMLTextAreaElement | null;
      if (deltaEl) deltaEl.value = data.deltaXml || "";
      setOutput({
        message: data.message,
        changes: (data.changes || []).length,
        report: data.reportRelPath
      });
      refreshHistory();
    } catch (err: any) {
      setOutput({ error: err.message });
    } finally {
      setCurrentProcess("");
    }
  }

  async function handleBuildDeltaFromSelection() {
    try {
      if (!state.activeProject) return;
      const selected = state.diffChanges.filter((item: any) => diffSelected[item.relPath]);
      if (!selected.length) {
        setOutput({ error: "No changes selected for delta." });
        return;
      }
      setCurrentProcess("Building delta manifest");
      const data = await api(`/api/projects/${state.activeProject.id}/delta`, {
        method: "POST",
        body: JSON.stringify({ changes: selected }),
      });
      setDeltaManifest(data.deltaXml || "");
      const deltaEl = document.getElementById("deltaManifest") as HTMLTextAreaElement | null;
      if (deltaEl) deltaEl.value = data.deltaXml || "";
      setOutput({
        message: data.message,
        selectedCount: selected.length,
        includedCount: data.selectionCount,
        deltaLength: (data.deltaXml || "").length
      });
      setIncludeDeletions(true);
      loadDestructivePreview();
    } catch (err: any) {
      setOutput({ error: err.message });
    } finally {
      setCurrentProcess("");
    }
  }

  function toggleAllFiltered(select: boolean, items: any[]) {
    const next = { ...diffSelected };
    items.forEach((item) => {
      next[item.relPath] = select;
    });
    setDiffSelected(next);
  }

  const filteredChanges = useMemo(() => {
    return state.diffChanges.filter((item: any) => {
      if (diffFilter !== "all" && item.status !== diffFilter) return false;
      if (diffTypeFilter !== "all" && item.type !== diffTypeFilter) return false;
      if (diffSearch && !`${item.type} ${item.name} ${item.relPath}`.toLowerCase().includes(diffSearch.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [state.diffChanges, diffFilter, diffTypeFilter, diffSearch]);

  const diffTypes = useMemo(() => {
    const types = new Set<string>();
    state.diffChanges.forEach((item: any) => types.add(item.type));
    return Array.from(types);
  }, [state.diffChanges]);

  const projectStatus = useMemo(() => {
    if (!state.activeProject) return "No project";
    if (!state.activeProject.sourceOrg || !state.activeProject.destinationOrg) return "Orgs not bound";
    if (!manifestReady) return "Auto manifest";
    if (retrieveEntries.some((entry) => entry.status === "Retrieved")) return "Retrieved";
    return "Ready";
  }, [state.activeProject, retrieveEntries, manifestReady]);

  const toggleNavGroup = (groupId: string) => {
    setNavGroupState((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  useEffect(() => {
    const matching = navGroups.find((group) => group.items.some((item) => item.id === activeSection));
    if (!matching) return;
    setNavGroupState((prev) => (prev[matching.id] ? prev : { ...prev, [matching.id]: true }));
  }, [activeSection, navGroups]);

  async function handleDiffFile(relPath: string) {
    try {
      if (!state.activeProject || !relPath) return;
      const source = await api(
        `/api/projects/${state.activeProject.id}/files?target=source&relPath=${encodeURIComponent(relPath)}&allowMissing=true`
      );
      const dest = await api(
        `/api/projects/${state.activeProject.id}/files?target=destination&relPath=${encodeURIComponent(relPath)}&allowMissing=true`
      );
      const sourceLines = (source.content || "").split("\n");
      const destLines = (dest.content || "").split("\n");
      setSourceDiff(sourceLines);
      setDestDiff(destLines);
    } catch (err: any) {
      setOutput({ error: err.message });
    }
  }

  async function triggerOrchestratedDeploy(options: { checkOnly?: boolean; autoRetry?: boolean }) {
    if (!state.activeProject) return;
    try {
      const checkOnly = options.checkOnly ?? false;
      const autoRetry = options.autoRetry ?? true;
      setCurrentProcess(checkOnly ? "Validating metadata in Salesforce target org..." : "Deploying metadata to Salesforce target org...");
      setDeployStatus({
        status: "running",
        phase: checkOnly ? "validating" : "staging",
        progressPercent: 20,
        summary: checkOnly ? "Running pre-flight dry-run validation..." : "Staging metadata files and delta package..."
      });
      const data = await api(`/api/projects/${state.activeProject.id}/deploy`, {
        method: "POST",
        body: JSON.stringify({
          checkOnly,
          autoRetry,
          retryLimit: 3,
          testLevel: "NoTestRun",
          deployType: "delta"
        })
      });
      setDeployJobId(data.jobId || "");
      if (data.deployLog) startLogStream(data.deployLog, `deploy-${data.jobId || "active"}`);
      if (data.jobId) startDeployStatusPoll(data.jobId);
    } catch (err: any) {
      setOutput({ error: err.message });
      setDeployStatus({ status: "failed", error: err.message });
    }
  }

  async function handleDeploy() {
    try {
      if (!state.activeProject) return;
      setCurrentProcess("Deploying...");
      const testLevel = (document.getElementById("testLevel") as HTMLSelectElement).value;
      const runTestsRaw = (document.getElementById("runTests") as HTMLInputElement).value.trim();
      const runTests = runTestsRaw ? runTestsRaw.split(",").map((item) => item.trim()).filter(Boolean) : [];
      const checkOnly = (document.getElementById("checkOnly") as HTMLSelectElement).value === "true";
      const autoRetry = (document.getElementById("autoRetry") as HTMLSelectElement).value === "true";
      const retryLimit = Number((document.getElementById("retryLimit") as HTMLSelectElement).value || "3");
      // Deletions apply only to delta deploys, and only when explicitly included.
      // manifest/full deploys are always additive (enforced server-side too).
      const ignoreDestructive = deployType === "delta" ? !includeDeletions : true;
      const componentsRaw = (document.getElementById("componentOverrides") as HTMLInputElement).value.trim();
      const components = componentsRaw ? componentsRaw.split(",").map((item) => item.trim()).filter(Boolean) : [];
      const data = await api(`/api/projects/${state.activeProject.id}/deploy`, {
        method: "POST",
        body: JSON.stringify({ 
          testLevel, 
          runTests, 
          checkOnly, 
          autoRetry, 
          retryLimit, 
          components, 
          ignoreDestructive,
          deployType,
          manifestContent: customManifestXml
        }),
      });
      setDeployJobId(data.jobId || "");
      setDeployStatus({ status: "running", startedAt: new Date().toISOString() });
      setOutput({ message: data.message, jobId: data.jobId, deployLog: data.deployLog });
      if (data.deployLog) startLogStream(data.deployLog, `deploy-${data.jobId || "active"}`);
      if (data.jobId) startDeployStatusPoll(data.jobId);
    } catch (err: any) {
      setOutput({ error: err.message });
    }
  }

  async function handleRetryDeploy() {
    try {
      if (!state.activeProject || !state.lastDeploy) return;
      const failed = state.lastDeploy.failedComponents || [];
      const retryComponents = (state.lastDeploy.manifestComponents || []).filter((item: string) => !failed.includes(item));
      const data = await api(`/api/projects/${state.activeProject.id}/deploy`, {
        method: "POST",
        body: JSON.stringify({ components: retryComponents, autoRetry: false }),
      });
      setDeployJobId(data.jobId || "");
      setDeployStatus({ status: "running", startedAt: new Date().toISOString() });
      setOutput({ message: data.message, jobId: data.jobId, deployLog: data.deployLog });
      if (data.deployLog) startLogStream(data.deployLog, `deploy-retry-${data.jobId || "active"}`);
      if (data.jobId) startDeployStatusPoll(data.jobId);
    } catch (err: any) {
      setOutput({ error: err.message });
    }
  }

  async function loadAgentConfig(projectId: string) {
    try {
      setAgentConfigLoading(true);
      const data = await api(`/api/projects/${projectId}/agents/config`);
      setAgentConfig(data);
    } catch (err: any) {
      console.error("Failed to load agent config:", err);
    } finally {
      setAgentConfigLoading(false);
    }
  }

  async function loadAgentHistory(projectId: string) {
    try {
      const data = await api(`/api/projects/${projectId}/agents/history`);
      setAgentHistory(data.runs || []);
    } catch (err: any) {
      console.error("Failed to load agent history:", err);
    }
  }

  async function handleSaveAgentConfig() {
    if (!state.activeProject) return;
    try {
      setAgentConfigLoading(true);
      const enabled = (document.getElementById("agentEnabled") as HTMLSelectElement).value === "true";
      const maxRetries = Number((document.getElementById("agentMaxRetries") as HTMLInputElement).value || "3");
      const geminiApiKey = agentApiKeyInput;
      
      const data = await api(`/api/projects/${state.activeProject.id}/agents/config`, {
        method: "POST",
        body: JSON.stringify({ enabled, maxRetries, geminiApiKey }),
      });
      setAgentConfig(data);
      setAgentApiKeyInput("");
      setUiNotice({ type: "success", message: "Autonomous AI Agent settings saved successfully!" });
      loadAgentHistory(state.activeProject.id);
    } catch (err: any) {
      setUiNotice({ type: "error", message: `Failed to save agent config: ${err.message}` });
    } finally {
      setAgentConfigLoading(false);
    }
  }

  if (!isSignedIn) {
    return <AuthCard />;
  }

  if (!isClassicView) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
        <ModernNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          activeProject={state.activeProject}
          projects={state.projects}
          onSelectProject={(projectId) => {
            const project = state.projects.find((p) => p.id === projectId);
            if (project) {
              setState((prev) => ({ ...prev, activeProject: project }));
            }
          }}
          sourceOrg={state.activeProject?.sourceOrg}
          destOrg={state.activeProject?.destinationOrg}
          isSyncing={currentProcess.includes("sync") || Boolean(deployJobId) || Boolean(compareJobId)}
          theme={theme}
          onThemeChange={handleThemeChange}
          user={state.user}
          onLogout={handleLogout}
        />

        <main className="mx-auto max-w-7xl px-6 py-8 flex flex-col gap-6">
          {uiNotice ? (
            <section
              className={`rounded-2xl border px-4 py-3 text-sm flex items-center justify-between ${
                uiNotice.type === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
              }`}
            >
              <div>{uiNotice.message}</div>
              <button
                className="text-xs font-semibold opacity-75 hover:opacity-100"
                onClick={() => setUiNotice(null)}
              >
                ✕ Dismiss
              </button>
            </section>
          ) : null}

          {/* Active Tab View */}
          {activeTab === "sync" && (
            <OneClickSyncPanel
              activeProject={state.activeProject}
              orgs={state.orgs}
              onNavigateTab={setActiveTab}
            />
          )}

          {activeTab === "parity" && (
            <ParityPanel
              activeProject={state.activeProject}
              orgs={state.orgs}
            />
          )}

          {activeTab === "diff" && (
            <GitDiffPanel
              activeProject={state.activeProject}
              onNavigateTab={setActiveTab}
            />
          )}

          {activeTab === "manifest" && (
            <ManifestRetrievePanel
              activeProject={state.activeProject}
              sourceManifest={sourceManifestValue}
              destManifest={destManifestValue}
              onSourceManifestChange={setSourceManifestValue}
              onDestManifestChange={setDestManifestValue}
              onGenerateManifest={handleGenerateManifest}
              onSaveManifest={handleSaveManifest}
              onReloadManifests={refreshManifests}
              compareStrategy={compareStrategy}
              onCompareStrategyChange={setCompareStrategy}
              retrieveMode={retrieveMode}
              onRetrieveModeChange={setRetrieveMode}
              retrieveRunning={retrieveRunning}
              onRetrieve={handleRetrieve}
              onStopRetrieve={handleStopRetrieve}
              retrieveEntries={retrieveEntries}
            />
          )}

          {activeTab === "history" && (
            <HistoryPanel
              activeProject={state.activeProject}
              onNavigateTab={setActiveTab}
            />
          )}

          {activeTab === "settings" && (
            <SettingsPanel
              activeProject={state.activeProject}
              projects={state.projects}
              orgs={state.orgs}
              onSelectProject={(projectId) => {
                const project = state.projects.find((p) => p.id === projectId);
                if (project) {
                  setState((prev) => ({ ...prev, activeProject: project }));
                }
              }}
              onCreateProject={async (name) => {
                const project = await api("/api/projects", { method: "POST", body: JSON.stringify({ name }) });
                setOutput(project);
                await loadProjects();
              }}
              onDeleteProject={handleDeleteProject}
              onAttachOrgs={async (sourceOrg, destinationOrg) => {
                if (!state.activeProject) return;
                const project = await api(`/api/projects/${state.activeProject.id}/orgs`, {
                  method: "POST",
                  body: JSON.stringify({ sourceOrg, destinationOrg }),
                });
                setOutput(project);
                setState((prev) => ({ ...prev, activeProject: project }));
              }}
              onAddOrg={async (alias, sfdxAuthUrl) => {
                const org = await api("/api/orgs", { method: "POST", body: JSON.stringify({ alias, sfdxAuthUrl }) });
                setOutput(org);
                await loadOrgs();
              }}
              onDeleteOrg={handleDeleteOrg}
              user={state.user}
              theme={theme}
              onThemeChange={handleThemeChange}
            />
          )}

          {/* Minimal Modern Footer */}
          <footer className="mt-12 border-t border-slate-200/80 pt-6 pb-12 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700 dark:text-slate-300">SFDX DevOps Platform</span>
              <span>· Enterprise Multi-Org Parity Engine</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsClassicView(true)}
                className="hover:text-sky-600 dark:hover:text-sky-400 font-medium transition"
              >
                Switch to Classic Console
              </button>
              <a href="/docs" target="_blank" className="hover:text-sky-600 dark:hover:text-sky-400 transition">
                Documentation
              </a>
              <a href="https://github.com/sfdcai/sfdx-toolkit" target="_blank" className="hover:text-sky-600 dark:hover:text-sky-400 transition">
                GitHub
              </a>
            </div>
          </footer>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {isClassicView ? (
        <div className="sticky top-0 z-50 flex items-center justify-between bg-sky-900 px-4 py-2 text-xs font-semibold text-white shadow-md">
          <span>You are viewing the legacy Classic Console.</span>
          <button
            onClick={() => setIsClassicView(false)}
            className="rounded-lg bg-sky-600 px-3 py-1 font-bold text-white hover:bg-sky-500 transition shadow-sm"
          >
            ⚡ Switch to Modern DevOps Hub
          </button>
        </div>
      ) : null}

      {isSignedIn && viewMode === "advanced" ? (
      <aside
        className="z-10 w-full overflow-y-auto overscroll-y-contain border-b border-[var(--line)] bg-white/80 p-4 md:fixed md:left-0 md:top-0 md:h-screen md:w-64 md:border-b-0 md:border-r"
      >
        <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Workflow</div>
        <div className="mt-4 space-y-4">
          {navGroups.map((group) => {
            const expanded = Boolean(navGroupState[group.id]);
            return (
              <div key={group.id} className="space-y-2">
                <button
                  className="flex w-full items-center justify-between rounded-2xl border border-[var(--line)] px-3 py-2 text-xs uppercase tracking-[0.3em] text-[var(--muted)]"
                  onClick={() => toggleNavGroup(group.id)}
                  aria-expanded={expanded}
                >
                  <span>{group.label}</span>
                  <span className="text-base">{expanded ? "−" : "+"}</span>
                </button>
                {expanded ? (
                  <div className="space-y-2 px-1">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        className={`block w-full rounded-2xl border px-3 py-2 text-sm transition ${
                          activeSection === item.id
                            ? "border-sky-400/80 bg-slate-800 text-sky-400 font-bold shadow-sm ring-1 ring-sky-400/30"
                            : "border-transparent text-slate-400 hover:text-white hover:bg-slate-900"
                        }`}
                        onClick={() => setActiveSection(item.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span>{item.label}</span>
                          {item.badge ? <span className="h-2 w-2 rounded-full bg-emerald-500"></span> : null}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-3 text-xs text-[var(--muted)]">
          This workflow is linear: add orgs, generate manifests, retrieve, compare, deploy.
        </div>
        <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">Current guide: {activeGuide.eyebrow}</span>
            <button
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-sky-300 bg-white text-sm font-semibold text-sky-700"
              onClick={() => toggleGuide(activeSection)}
              title="Toggle current section guide"
            >
              i
            </button>
          </div>
          <div className="mt-2">{activeGuide.summary}</div>
        </div>
      </aside>
      ) : null}

      <div className={isSignedIn && viewMode === "advanced" ? "md:ml-64" : ""}>
        <header className="glass sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/25">
                <span className="text-lg font-bold">⚡</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold tracking-tight text-white">Salesforce DevOps Hub</span>
                  <span className="rounded bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-400 border border-sky-500/20">
                    ENTERPRISE
                  </span>
                </div>
                <div className="text-[11px] font-medium text-slate-400">
                  Automated Metadata Healing & Multi-Pass Deployment Platform
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {isSignedIn ? (
                <div className="flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/90 p-1 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setViewMode("simple")}
                    className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                      viewMode === "simple"
                        ? "bg-sky-400 text-slate-950 shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Simple
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("advanced")}
                    className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                      viewMode === "advanced"
                        ? "bg-slate-800 text-sky-400 border border-sky-500/50 shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Advanced
                  </button>
                </div>
              ) : null}
              <ServerVersionBadge />
              <select
                className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs"
                value={theme}
                onChange={(event) => handleThemeChange(event.target.value as "light" | "mint" | "dark" | "sand" | "slate")}
              >
                <option value="light">⛅ Sky &amp; Slate</option>
                <option value="mint">🌿 Cloud Mint</option>
                <option value="dark">🌙 Twilight Dim</option>
              </select>
              <button
                className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs text-[var(--muted)]"
                onClick={() => {
                  if (!isSignedIn) return;
                  setActiveSection("profileSection");
                }}
              >
                {state.user ? `Signed in: ${state.user.email}` : "Not signed in"}
              </button>
              {isSignedIn && state.user?.role === "super_admin" ? (
                <button
                  className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                  onClick={() => window.location.assign("/super-admin")}
                >
                  Super Admin
                </button>
              ) : null}
              {isSignedIn && state.user?.role === "company_admin" ? (
                <button
                  className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                  onClick={() => window.location.assign("/admin")}
                >
                  Admin
                </button>
              ) : null}
              <button
                className="rounded-full border border-sky-400/50 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                onClick={() => window.location.assign("/")}
                title="Open comprehensive SFDX DevOps Hub & Feature Showcase"
              >
                🌟 Product Hub
              </button>
              <button
                className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                onClick={() => window.open("/docs", "_blank")}
              >
                Docs
              </button>
              {isSignedIn ? (
                <button className="rounded-full border border-[var(--line)] px-3 py-1 text-xs" onClick={handleLogout}>
                  Logout
                </button>
              ) : null}
            </div>
          </div>
          {isSignedIn ? (
            <div className="border-t border-[var(--line)] bg-white/80 px-6 py-2">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
                <span className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-700">
                  <span className={`h-2 w-2 rounded-full ${state.activeProject?.id ? "bg-emerald-500" : "bg-amber-400"}`}></span>
                  Project: {state.activeProject?.name || "none"}
                </span>
                <span className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-amber-700">
                  <span className={`h-2 w-2 rounded-full ${state.activeProject?.sourceOrg ? "bg-emerald-500" : "bg-amber-400"}`}></span>
                  Source: {state.activeProject?.sourceOrg || "unset"}
                </span>
                <span className="flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-sky-700">
                  <span className={`h-2 w-2 rounded-full ${state.activeProject?.destinationOrg ? "bg-emerald-500" : "bg-amber-400"}`}></span>
                  Destination: {state.activeProject?.destinationOrg || "unset"}
                </span>
                <span className="flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-violet-700">
                  <span className={`h-2 w-2 rounded-full ${manifestReady ? "bg-emerald-500" : "bg-amber-400"}`}></span>
                  Manifest: {manifestReady ? "ready" : "needed"}
                </span>
                {state.user?.role === "super_admin" ? (
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-rose-700">
                    Super Admin
                  </span>
                ) : null}
                <button
                  className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                    canRunCompare
                      ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                      : "border-slate-200 bg-slate-50 text-slate-400"
                  }`}
                  disabled={!canRunCompare}
                  onClick={() => {
                    if (!canRunCompare) return;
                    setActiveSection("jobSection");
                    handleCompare("auto");
                  }}
                  title={
                    canRunCompare
                      ? "Start one-click comparison job"
                      : "Resolve readiness issues before comparison"
                  }
                >
                  One Click Compare
                </button>
              </div>
            </div>
          ) : null}
          {currentProcess ? (
            <div className="border-t border-[var(--line)] bg-[var(--surface)] px-6 py-2 text-xs text-[var(--muted)]">
              Running: {currentProcess}
              {deployJobId ? ` · Job ${deployJobId.slice(0, 6)}` : compareJobId ? ` · Job ${compareJobId.slice(0, 6)}` : ""}
            </div>
          ) : null}
        </header>
        <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-6">
          {isSignedIn ? (
            <OrchestratorFlow
              activeProject={state.activeProject}
              projects={state.projects}
              orgs={state.orgs}
              hasSourceRetrieve={hasSourceRetrieve}
              hasDestinationRetrieve={hasDestinationRetrieve}
              diffCount={state.diffChanges.length}
              selectedDiffCount={selectedDiffCount}
              manifestReady={manifestReady}
              deltaManifest={deltaManifest}
              deployStatus={deployStatus}
              deployJobId={deployJobId}
              currentProcess={currentProcess}
              onNavigateSection={(sec) => {
                setActiveSection(sec);
                setViewMode("advanced");
              }}
              onRetrieve={(target) => handleRetrieve(target)}
              onCompare={(strategy) => handleCompare((strategy || "auto") as any)}
              onBuildDelta={handleBuildDeltaFromSelection}
              onDeploy={(options) => triggerOrchestratedDeploy(options)}
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
            />
          ) : null}
        {uiNotice ? (
          <section
            className={`rounded-2xl border px-4 py-3 text-sm ${
              uiNotice.type === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>{uiNotice.message}</div>
              <button
                className="rounded-full border border-transparent px-2 py-1 text-xs hover:border-[var(--line)]"
                onClick={() => setUiNotice(null)}
              >
                Dismiss
              </button>
            </div>
          </section>
        ) : null}
        {uiErrorHelp && uiNotice?.type === "error" ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-slate-800">
            <div className="text-[10px] uppercase tracking-[0.22em] text-amber-700">Recovery Guidance</div>
            <div className="mt-1 font-semibold">{uiErrorHelp.title}</div>
            <div className="mt-1 text-sm text-slate-700">{uiErrorHelp.message}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {uiErrorHelp.actions.map((action, index) => (
                <span
                  key={`${uiErrorHelp.category}-${index}`}
                  className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs text-amber-800"
                >
                  {action}
                </span>
              ))}
            </div>
          </section>
        ) : null}
        {isSignedIn ? (
          <section className="rounded-3xl border border-sky-200 bg-sky-50/70 p-4 text-slate-800 shadow-[var(--card-shadow)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-sky-700">Guided Workflow</div>
                <div className="mt-1 text-sm font-semibold">{activeGuide.title}</div>
                <div className="mt-1 text-sm text-slate-600">{activeGuide.summary}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs text-sky-700"
                  onClick={() => toggleGuide(activeSection)}
                >
                  {guideVisibility[activeSection] !== false ? "Hide section guide" : "Show section guide"}
                </button>
                <button
                  className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs text-sky-700"
                  onClick={() => window.open("/docs", "_blank")}
                >
                  Open user docs
                </button>
              </div>
            </div>
          </section>
        ) : null}
        {isSignedIn && activeSection === "dashboardSection" ? (
        <section id="dashboardSection" className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">User Dashboard</h2>
              <p className="text-sm text-[var(--muted)]">Quick overview of your workspace and recent actions.</p>
            </div>
            <button className="rounded-full border border-[var(--line)] px-3 py-2 text-xs" onClick={() => { loadProjects(); loadOrgs(); loadUsage(); }}>
              Refresh
            </button>
          </div>
          {renderGuide("dashboardSection")}
          <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Onboarding Checklist</div>
                <div className="mt-1 text-sm text-[var(--muted)]">
                  {checklistCompleted} of {checklistItems.length} workflow milestones completed
                </div>
              </div>
              <button
                className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                onClick={() => setChecklistCollapsed((prev) => !prev)}
              >
                {checklistCollapsed ? "Show checklist" : "Hide checklist"}
              </button>
            </div>
            {!checklistCollapsed ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {checklistItems.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-2xl border px-4 py-3 ${
                      item.done
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-[var(--line)] bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold">{item.label}</div>
                        <div className="mt-1 text-xs text-[var(--muted)]">{item.detail}</div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
                          item.done
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {item.done ? "Done" : "Next"}
                      </span>
                    </div>
                    {!item.done ? (
                      <div className="mt-3">
                        <button
                          className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                          onClick={() => setActiveSection(item.section)}
                        >
                          Open section
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-4">
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Projects</div>
              <div className="mt-2 text-2xl font-semibold">{state.projects.length}</div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Orgs</div>
              <div className="mt-2 text-2xl font-semibold">{state.orgs.length}</div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Active Project</div>
              <div className="mt-2 text-sm font-semibold">{state.activeProject?.name || "none"}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">{projectStatus}</div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Last Deploy</div>
              <div className="mt-2 text-sm font-semibold">{state.lastDeploy?.status || "none"}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                Attempts: {state.lastDeploy?.attempts ?? 0}
              </div>
            </div>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Latest Diff</div>
              <div className="mt-2 text-sm text-[var(--muted)]">
                {historyData.comparisons.length
                  ? `${historyData.comparisons[0]?.changes?.length ?? 0} changes in latest diff`
                  : "No diff generated yet."}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Retrieve Status</div>
              <div className="mt-2 text-sm text-[var(--muted)]">
                {retrieveEntries.some((entry) => entry.status === "Running")
                  ? "Retrieve running"
                  : historyData.retrievals.length
                    ? "Latest retrieve completed"
                    : "No retrieve yet"}
              </div>
            </div>
          </div>
          {usageInfo && !usageInfo.error ? (
            <div className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Usage & Plan</div>
                  <div className="text-sm font-semibold">Plan: {usageInfo.plan}</div>
                </div>
                {usageInfo.plan === "free" ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                      onClick={async () => {
                        try {
                          const data = await api("/api/upgrade/request", {
                            method: "POST",
                            body: JSON.stringify({ plan: "pro" })
                          });
                          setOutput(data);
                        } catch (err: any) {
                          setOutput({ error: err.message });
                        }
                      }}
                    >
                      Request Pro
                    </button>
                    <button
                      className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                      onClick={async () => {
                        try {
                          const data = await api("/api/upgrade/request", {
                            method: "POST",
                            body: JSON.stringify({ plan: "enterprise" })
                          });
                          setOutput(data);
                        } catch (err: any) {
                          setOutput({ error: err.message });
                        }
                      }}
                    >
                      Request Enterprise
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs text-rose-700"
                      onClick={async () => {
                        try {
                          const data = await api("/api/upgrade/request", {
                            method: "POST",
                            body: JSON.stringify({ plan: "free" })
                          });
                          setOutput(data);
                        } catch (err: any) {
                          setOutput({ error: err.message });
                        }
                      }}
                    >
                      Request Downgrade (Free)
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-4 grid gap-3 text-xs lg:grid-cols-3">
                <div className="rounded-xl border border-[var(--line)] bg-white p-3">
                  <div className="text-[var(--muted)]">Users</div>
                  <div className="mt-1 font-semibold">
                    {usageInfo.usage.users} / {usageInfo.limits.maxUsers}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-white p-3">
                  <div className="text-[var(--muted)]">Projects</div>
                  <div className="mt-1 font-semibold">
                    {usageInfo.usage.projects} / {usageInfo.limits.maxProjects}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-white p-3">
                  <div className="text-[var(--muted)]">Orgs</div>
                  <div className="mt-1 font-semibold">
                    {usageInfo.usage.orgs} / {usageInfo.limits.maxOrgs}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-white p-3">
                  <div className="text-[var(--muted)]">Storage (GB)</div>
                  <div className="mt-1 font-semibold">
                    {(usageInfo.usage.storageBytes / (1024 * 1024 * 1024)).toFixed(1)} / {(usageInfo.limits.maxStorageBytes / (1024 * 1024 * 1024)).toFixed(1)}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-white p-3">
                  <div className="text-[var(--muted)]">Retrieves</div>
                  <div className="mt-1 font-semibold">
                    {usageInfo.usage.retrieves} / {usageInfo.limits.maxRetrieves}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-white p-3">
                  <div className="text-[var(--muted)]">Deploys</div>
                  <div className="mt-1 font-semibold">
                    {usageInfo.usage.deploys} / {usageInfo.limits.maxDeploys}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>
        ) : null}

        {isSignedIn && activeSection === "profileSection" ? (
        <section id="profileSection" className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">User Profile</h2>
              <p className="text-sm text-[var(--muted)]">Your account details and workspace status.</p>
            </div>
            <button className="rounded-full border border-[var(--line)] px-3 py-2 text-xs" onClick={() => { loadProjects(); loadOrgs(); loadProfile(); }}>
              Refresh
            </button>
          </div>
          {renderGuide("profileSection")}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Account</div>
              <div className="mt-3 text-sm">
                <div>Email: {state.user?.email}</div>
                <div>Role: {state.user?.role}</div>
                <div>User ID: {state.user?.id}</div>
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Workspace</div>
              <div className="mt-3 text-sm text-[var(--muted)]">
                <div>Projects: {state.projects.length}</div>
                <div>Orgs: {state.orgs.length}</div>
                <div>Active project: {state.activeProject?.name || "none"}</div>
                <div>MFA: {profileData?.mfaEnabled ? "enabled" : "disabled"}</div>
              </div>
            </div>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Profile Details</div>
              <div className="mt-3 space-y-3 text-sm">
                <input
                  className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                  placeholder="Full name"
                  value={profileData?.name || ""}
                  onChange={(event) =>
                    setProfileData((prev) => ({ ...(prev || { name: "", company: "", social: {} }), name: event.target.value }))
                  }
                />
                <input
                  className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                  placeholder="Company"
                  value={profileData?.company || ""}
                  onChange={(event) =>
                    setProfileData((prev) => ({ ...(prev || { name: "", company: "", social: {} }), company: event.target.value }))
                  }
                />
                <input
                  className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                  placeholder="LinkedIn URL"
                  value={profileData?.social?.linkedin || ""}
                  onChange={(event) =>
                    setProfileData((prev) => ({
                      ...(prev || { name: "", company: "", social: {} }),
                      social: { ...(prev?.social || {}), linkedin: event.target.value }
                    }))
                  }
                />
                <input
                  className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                  placeholder="X/Twitter URL"
                  value={profileData?.social?.twitter || ""}
                  onChange={(event) =>
                    setProfileData((prev) => ({
                      ...(prev || { name: "", company: "", social: {} }),
                      social: { ...(prev?.social || {}), twitter: event.target.value }
                    }))
                  }
                />
                <input
                  className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                  placeholder="GitHub URL"
                  value={profileData?.social?.github || ""}
                  onChange={(event) =>
                    setProfileData((prev) => ({
                      ...(prev || { name: "", company: "", social: {} }),
                      social: { ...(prev?.social || {}), github: event.target.value }
                    }))
                  }
                />
                <input
                  className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                  placeholder="Website"
                  value={profileData?.social?.website || ""}
                  onChange={(event) =>
                    setProfileData((prev) => ({
                      ...(prev || { name: "", company: "", social: {} }),
                      social: { ...(prev?.social || {}), website: event.target.value }
                    }))
                  }
                />
                <button
                  className="rounded-full bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white"
                  onClick={async () => {
                    try {
                      const data = await api("/api/profile", {
                        method: "PATCH",
                        body: JSON.stringify({
                          name: profileData?.name || "",
                          company: profileData?.company || "",
                          social: profileData?.social || {}
                        })
                      });
                      setProfileMessage(data.message || "Profile saved.");
                    } catch (err: any) {
                      setProfileMessage(err.message);
                    }
                  }}
                >
                  Save profile
                </button>
                {profileMessage ? <div className="text-xs text-[var(--muted)]">{profileMessage}</div> : null}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Reset Password</div>
              <div className="mt-3 space-y-3 text-sm">
                <input
                  type="password"
                  className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                  placeholder="Current password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
                <input
                  type="password"
                  className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                  placeholder="New password (min 8)"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
                <input
                  type="password"
                  className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
                <button
                  className="rounded-full border border-[var(--line)] px-3 py-2 text-xs"
                  onClick={async () => {
                    if (!newPassword || newPassword !== confirmPassword) {
                      setProfileMessage("New passwords do not match.");
                      return;
                    }
                    try {
                      const data = await api("/api/profile/password", {
                        method: "POST",
                        body: JSON.stringify({ currentPassword, newPassword })
                      });
                      setProfileMessage(data.message || "Password updated.");
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    } catch (err: any) {
                      setProfileMessage(err.message);
                    }
                  }}
                >
                  Update password
                </button>
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Multi-factor Authentication</div>
              <div className="mt-3 space-y-3 text-sm">
                <div className="text-[var(--muted)]">
                  {profileData?.mfaEnabled
                    ? "Your account requires a 6-digit authenticator code at login."
                    : "MFA is optional. Enable it to require a 6-digit authenticator code during login."}
                </div>
                {!profileData?.mfaEnabled ? (
                  <button
                    className="rounded-full bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white"
                    onClick={async () => {
                      try {
                        const data = await api("/api/auth/mfa/setup", { method: "POST" });
                        setMfaSetupSecret(data.secret || "");
                        setMfaSetupQr(data.qrCodeDataUrl || "");
                        setMfaSetupCode("");
                        setMfaMessage(data.message || "Scan the QR code and verify the setup code.");
                      } catch (err: any) {
                        setMfaMessage(err.message);
                      }
                    }}
                  >
                    Generate MFA setup
                  </button>
                ) : (
                  <button
                    className="rounded-full border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700"
                    onClick={async () => {
                      try {
                        const data = await api("/api/auth/mfa/setup", { method: "DELETE" });
                        setProfileData((prev) => (prev ? { ...prev, mfaEnabled: false } : prev));
                        setMfaSetupSecret("");
                        setMfaSetupQr("");
                        setMfaSetupCode("");
                        setMfaMessage(data.message || "MFA disabled.");
                      } catch (err: any) {
                        setMfaMessage(err.message);
                      }
                    }}
                  >
                    Disable MFA
                  </button>
                )}
                {mfaSetupQr ? (
                  <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3">
                    <img src={mfaSetupQr} alt="MFA QR code" className="h-44 w-44 rounded-xl border border-[var(--line)] bg-white p-2" />
                    <div className="text-xs text-[var(--muted)]">Manual key: {mfaSetupSecret}</div>
                    <input
                      className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                      placeholder="Enter 6-digit code to enable MFA"
                      value={mfaSetupCode}
                      onChange={(event) => setMfaSetupCode(event.target.value.replace(/\D+/g, "").slice(0, 6))}
                    />
                    <button
                      className="rounded-full border border-[var(--line)] px-3 py-2 text-xs"
                      onClick={async () => {
                        try {
                          const data = await api("/api/auth/mfa/verify", {
                            method: "POST",
                            body: JSON.stringify({ code: mfaSetupCode })
                          });
                          setProfileData((prev) => (prev ? { ...prev, mfaEnabled: Boolean(data.mfaEnabled) } : prev));
                          setMfaSetupQr("");
                          setMfaSetupSecret("");
                          setMfaSetupCode("");
                          setMfaMessage(data.message || "MFA enabled.");
                        } catch (err: any) {
                          setMfaMessage(err.message);
                        }
                      }}
                    >
                      Verify and enable
                    </button>
                  </div>
                ) : null}
                {mfaMessage ? <div className="text-xs text-[var(--muted)]">{mfaMessage}</div> : null}
              </div>
            </div>
          </div>
        </section>
        ) : null}

        {isSignedIn && activeSection === "projectSection" ? (
        <section id="projectSection" className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
          <div>
            <h2 className="text-lg font-semibold">Project & Orgs</h2>
            <p className="text-sm text-[var(--muted)]">Create a project, add orgs, and bind source/destination.</p>
          </div>
          {renderGuide("projectSection")}
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-white p-4">
              <h3 className="text-sm font-semibold">Project</h3>
              <input id="projectName" className="w-full rounded-xl border border-[var(--line)] px-3 py-2" placeholder="Project name" />
              <button className="rounded-full bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white" onClick={handleCreateProject}>
                Create project
              </button>
              <select
                className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                value={state.activeProject?.id || ""}
                onChange={(event) => {
                  const project = state.projects.find((item) => item.id === event.target.value) || null;
                  setState((prev) => ({ ...prev, activeProject: project }));
                }}
              >
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-white p-4">
              <h3 className="text-sm font-semibold">Add Org</h3>
              <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
                Run: <span className="font-mono">sf org display --target-org dev --verbose --json</span>
              </div>
              <input id="orgAlias" className="w-full rounded-xl border border-[var(--line)] px-3 py-2" placeholder="Org alias" />
              <textarea id="orgAuthUrl" className="h-24 w-full rounded-xl border border-[var(--line)] px-3 py-2" placeholder="sfdxAuthUrl"></textarea>
              <button className="rounded-full bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white" onClick={handleAddOrg}>
                Save org
              </button>
            </div>

            <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-white p-4">
              <h3 className="text-sm font-semibold">Bind Orgs</h3>
              <select id="sourceOrgSelect" className="w-full rounded-xl border border-[var(--line)] px-3 py-2">
                <option value="">Source org</option>
                {state.orgs.map((org, idx) => (
                  <option key={`${org.alias}-${idx}`} value={org.alias}>
                    {org.alias}
                  </option>
                ))}
              </select>
              <select id="destOrgSelect" className="w-full rounded-xl border border-[var(--line)] px-3 py-2">
                <option value="">Destination org</option>
                {state.orgs.map((org, idx) => (
                  <option key={`${org.alias}-${idx}`} value={org.alias}>
                    {org.alias}
                  </option>
                ))}
              </select>
              <button className="rounded-full bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white" onClick={handleAttachOrgs}>
                Attach orgs
              </button>
            </div>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Projects overview</h3>
                <span className="text-xs text-[var(--muted)]">{state.projects.length} total</span>
              </div>
              <div className="mt-3 overflow-auto">
                {state.projects.length ? (
                  <table className="min-w-full text-xs">
                    <thead className="text-left text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
                      <tr>
                        <th className="px-2 py-1">Name</th>
                        <th className="px-2 py-1">Source</th>
                        <th className="px-2 py-1">Destination</th>
                        <th className="px-2 py-1">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.projects.map((project) => (
                        <tr key={project.id} className="border-t">
                          <td className="px-2 py-2">
                            <input
                              className="w-full rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                              value={projectEdits[project.id] ?? project.name}
                              onChange={(event) =>
                                setProjectEdits((prev) => ({ ...prev, [project.id]: event.target.value }))
                              }
                            />
                          </td>
                          <td className="px-2 py-2">{project.sourceOrg || "unset"}</td>
                          <td className="px-2 py-2">{project.destinationOrg || "unset"}</td>
                          <td className="px-2 py-2">
                            <button
                              className="rounded-full border border-[var(--line)] px-2 py-1 text-[10px]"
                              onClick={() => setState((prev) => ({ ...prev, activeProject: project }))}
                            >
                              Select
                            </button>
                            <button
                              className="ml-2 rounded-full border border-[var(--line)] px-2 py-1 text-[10px]"
                              onClick={() => handleUpdateProject(project.id)}
                            >
                              Save
                            </button>
                            <button
                              className="ml-2 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-700"
                              onClick={() =>
                                confirmActionWith(`Delete project "${project.name}"?`, () => handleDeleteProject(project.id))
                              }
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-xs text-[var(--muted)]">No projects yet.</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Org details</h3>
                <span className="text-xs text-[var(--muted)]">{state.orgs.length} orgs</span>
              </div>
              <div className="mt-3 grid gap-3">
                <select
                  className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
                  value={selectedOrgAlias}
                  onChange={(event) => handleSelectOrg(event.target.value)}
                >
                  <option value="">Select org</option>
                  {state.orgs.map((org, idx) => (
                    <option key={`${org.alias}-${idx}`} value={org.alias}>
                      {org.alias}
                    </option>
                  ))}
                </select>
                {orgDetails ? (
                  <div className="rounded-xl border border-[var(--line)] bg-slate-50 p-3 text-xs text-[var(--muted)]">
                    <div>Alias: {orgDetails.alias}</div>
                    <div>API Version: {safeOrgField(orgDetails.info, ["apiVersion", "apiVersionNumber"])}</div>
                    <div>Username: {safeOrgField(orgDetails.info, ["username", "userName", "connectedStatus"])}</div>
                    <div>Org ID: {safeOrgField(orgDetails.info, ["id", "orgId", "organizationId"])}</div>
                    <div>Instance: {safeOrgField(orgDetails.info, ["instanceUrl", "instance", "loginUrl"])}</div>
                    <div>Sandbox: {safeOrgField(orgDetails.info, ["isSandbox", "sandbox"])}</div>
                  </div>
                ) : (
                  <div className="text-xs text-[var(--muted)]">Select an org to see details.</div>
                )}
                {orgDetails?.info ? (
                  <div className="rounded-xl border border-[var(--line)] bg-white p-3 text-[10px] text-[var(--muted)]">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">Raw org info</div>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[10px]">
                      {JSON.stringify(orgDetails.info, null, 2)}
                    </pre>
                  </div>
                ) : null}
                <div className="rounded-xl border border-[var(--line)] bg-white p-3 text-xs">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">Edit org</div>
                  <input
                    className="mt-2 w-full rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                    placeholder="Alias"
                    value={orgAliasInput}
                    onChange={(event) => setOrgAliasInput(event.target.value)}
                  />
                  <textarea
                    className="mt-2 h-24 w-full rounded-lg border border-[var(--line)] px-2 py-1 text-xs"
                    placeholder="sfdxAuthUrl (required to refresh)"
                    value={orgAuthInput}
                    onChange={(event) => setOrgAuthInput(event.target.value)}
                  />
                  <div className="mt-2 text-[10px] text-[var(--muted)]">
                    Paste a fresh sfdxAuthUrl to refresh org details and apply alias changes.
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                      onClick={handleRevealOrgAuth}
                    >
                      {orgAuthVisible ? "Hide saved auth URL" : "Reveal saved auth URL"}
                    </button>
                    <button className="rounded-full border border-[var(--line)] px-3 py-1 text-xs" onClick={handleUpdateOrg}>
                      Save & refresh
                    </button>
                    <button
                      className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs text-rose-700"
                      onClick={() =>
                        confirmActionWith(`Delete org "${selectedOrgAlias}"?`, () => handleDeleteOrg())
                      }
                    >
                      Delete org
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        ) : null}

        {isSignedIn && activeSection === "manifestSection" ? (
        <section id="manifestSection" className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Manifest Generation</h2>
              <p className="text-sm text-[var(--muted)]">Generate from org or paste a custom manifest.</p>
            </div>
            <button className="rounded-full border border-[var(--line)] px-3 py-2 text-xs" onClick={refreshManifests}>
              Reload manifests
            </button>
          </div>
          {renderGuide("manifestSection")}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Source manifest</h3>
                <div className="flex gap-2">
                  <button className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs text-white" onClick={() => handleGenerateManifest("source")}>
                    Generate
                  </button>
                  <button className="rounded-full border border-[var(--line)] px-3 py-1 text-xs" onClick={() => handleSaveManifest("source")}>
                    Save
                  </button>
                </div>
              </div>
              <textarea
                id="sourceManifest"
                className="h-52 w-full rounded-2xl border border-[var(--line)] px-3 py-2 font-mono text-xs"
                value={sourceManifestValue}
                onChange={(event) => setSourceManifestValue(event.target.value)}
              ></textarea>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Destination manifest</h3>
                <div className="flex gap-2">
                  <button className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs text-white" onClick={() => handleGenerateManifest("destination")}>
                    Generate
                  </button>
                  <button className="rounded-full border border-[var(--line)] px-3 py-1 text-xs" onClick={() => handleSaveManifest("destination")}>
                    Save
                  </button>
                </div>
              </div>
              <textarea
                id="destManifest"
                className="h-52 w-full rounded-2xl border border-[var(--line)] px-3 py-2 font-mono text-xs"
                value={destManifestValue}
                onChange={(event) => setDestManifestValue(event.target.value)}
              ></textarea>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
              onClick={() => setCompareSettingsOpen((prev) => !prev)}
            >
              {compareSettingsOpen ? "Hide comparison strategy" : "Show comparison strategy"}
            </button>
          </div>
          {compareSettingsOpen ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Manifest strategy</div>
                <div className="mt-3 grid gap-3">
                  <label className="text-xs text-[var(--muted)]">Comparison manifest strategy</label>
                  <select
                    className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                    value={compareStrategy}
                    onChange={(event) => setCompareStrategy(event.target.value as typeof compareStrategy)}
                  >
                    <option value="existing">Use existing manifests</option>
                    <option value="auto">Auto-generate from orgs</option>
                    <option value="custom">Use custom manifest</option>
                    <option value="merge">Merge multiple manifests</option>
                    <option value="scope">Scope-filtered manifest</option>
                    <option value="delta">Delta from last release</option>
                  </select>
                  {compareStrategy === "custom" ? (
                    <textarea
                      className="min-h-[120px] rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-mono"
                      placeholder="Paste package.xml"
                      value={compareManifestXml}
                      onChange={(event) => setCompareManifestXml(event.target.value)}
                    />
                  ) : null}
                  {compareStrategy === "merge" ? (
                    <textarea
                      className="min-h-[120px] rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-mono"
                      placeholder="Paste manifests separated by ---"
                      value={compareMergeXml}
                      onChange={(event) => setCompareMergeXml(event.target.value)}
                    />
                  ) : null}
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Scope & context</div>
                <div className="mt-3 grid gap-3">
                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-xs"
                      placeholder="Include types (comma)"
                      value={compareScopeInclude}
                      onChange={(event) => setCompareScopeInclude(event.target.value)}
                    />
                    <input
                      className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-xs"
                      placeholder="Exclude types (comma)"
                      value={compareScopeExclude}
                      onChange={(event) => setCompareScopeExclude(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={compareScopeExcludeProfiles}
                        onChange={(event) => setCompareScopeExcludeProfiles(event.target.checked)}
                      />
                      Exclude profiles
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={compareScopeCustomOnly}
                        onChange={(event) => setCompareScopeCustomOnly(event.target.checked)}
                      />
                      Custom only
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={compareScopeBusinessOnly}
                        onChange={(event) => setCompareScopeBusinessOnly(event.target.checked)}
                      />
                      Business metadata only
                    </label>
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <input
                      className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-xs"
                      placeholder="Branch"
                      value={compareContextBranch}
                      onChange={(event) => setCompareContextBranch(event.target.value)}
                    />
                    <input
                      className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-xs"
                      placeholder="Release"
                      value={compareContextRelease}
                      onChange={(event) => setCompareContextRelease(event.target.value)}
                    />
                    <input
                      className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-xs"
                      placeholder="Reason"
                      value={compareContextReason}
                      onChange={(event) => setCompareContextReason(event.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>
        ) : null}

        {isSignedIn && activeSection === "retrieveSection" ? (
        <section id="retrieveSection" className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
          <h2 className="text-lg font-semibold">Retrieve</h2>
          <p className="text-sm text-[var(--muted)]">Use chunked mode for stability or grouped mode to reduce CLI round trips and speed up larger retrieves.</p>
          {renderGuide("retrieveSection")}
          <div className="mt-4 max-w-sm">
            <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Retrieve Mode</label>
            <select
              className="w-full rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
              value={retrieveMode}
              onChange={(event) => setRetrieveMode(event.target.value === "grouped" ? "grouped" : "chunked")}
            >
              <option value="chunked">Chunked per type</option>
              <option value="grouped">Grouped manifest batches</option>
            </select>
            <div className="mt-2 text-xs text-[var(--muted)]">
              {retrieveMode === "grouped"
                ? "Combines multiple metadata types into shared retrieve batches, while keeping heavy types isolated."
                : "Uses one temporary manifest per metadata type. Slower, but safest when grouped retrieves are unstable."}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="rounded-full bg-[var(--accent)] px-3 py-2 text-xs text-white" onClick={() => handleRetrieve("source")}>
              {retrieveRunning === "source" ? "Retrieving source..." : "Retrieve source"}
            </button>
            <button className="rounded-full border border-[var(--line)] px-3 py-2 text-xs" onClick={() => handleRetrieve("destination")}>
              {retrieveRunning === "destination" ? "Retrieving destination..." : "Retrieve destination"}
            </button>
            {retrieveRunning ? (
              <button className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" onClick={() => handleStopRetrieve(retrieveRunning as "source" | "destination")}>
                Stop retrieve
              </button>
            ) : null}
          </div>
          {retrieveRunning ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
              Running retrieve for {retrieveRunning} using {retrieveMode} mode.
            </div>
          ) : null}
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Step 1: Retrieve Manifests</div>
              <div className="mt-3 space-y-2 text-xs text-[var(--muted)]">
                {retrieveChunks.length ? (
                  <div>{retrieveChunks.length} {retrieveMode === "grouped" ? "grouped" : "chunk"} manifests created.</div>
                ) : retrievePlanned.length ? (
                  <div>{retrievePlanned.length} types queued for retrieval.</div>
                ) : (
                  <div>No retrieve manifests yet.</div>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Step 2: Retrieve Start</div>
              <div className="mt-3 space-y-2 text-xs text-[var(--muted)]">
                {retrieveEntries.length ? (
                  <div className="flex flex-wrap gap-2">
                    {retrieveEntries.map((entry, idx) => (
                      <button
                        key={`${entry.type}-${idx}`}
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs hover:border-[var(--accent)] hover:text-[var(--accent-strong)]"
                        onClick={() =>
                          handleTypeMembers(retrieveRunning === "destination" ? "destination" : "source", entry.type, entry.status)
                        }
                      >
                        <span
                          className={`inline-flex h-2 w-2 rounded-full ${
                            entry.status === "Retrieved"
                              ? "bg-emerald-500"
                              : entry.status === "Running"
                                ? "bg-amber-400"
                                : entry.status === "Queued"
                                  ? "bg-slate-300"
                                  : entry.status === "Canceled"
                                    ? "bg-slate-400"
                                    : "bg-rose-500"
                          }`}
                        ></span>
                        {entry.type}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div>No retrieve runs yet.</div>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Type Members</div>
                {activeRetrieveType ? (
                  <button
                    className="rounded-full border border-[var(--line)] px-3 py-1 text-[10px]"
                    onClick={() =>
                      handleTypeMembers(retrieveRunning === "destination" ? "destination" : "source", activeRetrieveType, activeRetrieveStatus, true)
                    }
                  >
                    Refresh
                  </button>
                ) : null}
              </div>
              <div className="mt-3 text-xs text-[var(--muted)]">
                {membersLoading ? (
                  <div>Loading members...</div>
                ) : membersError ? (
                  <div className="text-rose-600">{membersError}</div>
                ) : activeRetrieveType ? (
                  <div className="space-y-2">
                    <div className="text-[var(--muted)]">{activeRetrieveMembers.length} members</div>
                    <div className="max-h-48 overflow-auto rounded-xl border border-[var(--line)] bg-slate-50 p-2">
                      {activeRetrieveMembers.length ? (
                        activeRetrieveMembers.map((member, idx) => (
                          <div key={`${member}-${idx}`} className="flex items-center gap-2 py-1">
                            <span
                              className={`inline-flex h-2 w-2 rounded-full ${
                                activeRetrieveStatus === "Retrieved"
                                  ? "bg-emerald-500"
                                  : activeRetrieveStatus === "Running"
                                    ? "bg-amber-400"
                                    : activeRetrieveStatus === "Queued"
                                      ? "bg-slate-300"
                                      : activeRetrieveStatus === "Canceled"
                                        ? "bg-slate-400"
                                        : "bg-rose-500"
                              }`}
                            ></span>
                            <span className="font-mono text-[10px]">{member}</span>
                          </div>
                        ))
                      ) : (
                        <div>No members found.</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>Select a type to view members.</div>
                )}
              </div>
            </div>
          </div>
        </section>
        ) : null}

        {isSignedIn && activeSection === "diffSection" ? (
        <section id="diffSection" className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Diff & Delta</h2>
              <p className="text-sm text-[var(--muted)]">Compare source and destination for added/changed/removed metadata.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className={`rounded-full px-3 py-2 text-xs ${
                  canRunWorkspaceDiff
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--line)] bg-white text-[var(--muted)]"
                }`}
                onClick={handleGenerateDiffOnly}
                disabled={!canRunWorkspaceDiff}
                title="Generate diff from current source/destination files"
              >
                Generate diff
              </button>
              {state.activeProject ? (
                <button
                  className="rounded-full border border-[var(--line)] px-3 py-2 text-xs"
                  onClick={() => {
                    const projectId = state.activeProject?.id;
                    if (!projectId) return;
                    const first = state.diffChanges[0]?.relPath || "";
                    const url = `/diff?projectId=${projectId}&relPath=${encodeURIComponent(first)}`;
                    window.open(url, "_blank");
                  }}
                >
                  Open full diff
                </button>
              ) : null}
              {diffReportPath && state.activeProject ? (
                <button
                  className="rounded-full bg-[var(--accent-strong)] px-3 py-2 text-xs text-white"
                  onClick={() => {
                    setActiveSection("reportSection");
                    loadReport();
                  }}
                >
                  Open report
                </button>
              ) : null}
            </div>
          </div>
          {renderGuide("diffSection")}
          {renderReadinessPanel(
            "Diff Readiness",
            compareReadinessIssues,
            "Diff can run. The project, manifests, and retrieved workspaces are ready."
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <select
              className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
              value={diffFilter}
              onChange={(event) => setDiffFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="Added">Added</option>
              <option value="Changed">Changed</option>
              <option value="Removed">Removed</option>
            </select>
            <select
              className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
              value={diffTypeFilter}
              onChange={(event) => setDiffTypeFilter(event.target.value)}
            >
              <option value="all">All types</option>
              {diffTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <input
              className="min-w-[180px] flex-1 rounded-full border border-[var(--line)] px-3 py-1 text-xs"
              placeholder="Search by type/name/path"
              value={diffSearch}
              onChange={(event) => setDiffSearch(event.target.value)}
            />
            <button className="rounded-full border border-[var(--line)] px-3 py-1 text-xs" onClick={() => toggleAllFiltered(true, filteredChanges)}>
              Select all filtered
            </button>
            <button className="rounded-full border border-[var(--line)] px-3 py-1 text-xs" onClick={() => toggleAllFiltered(false, filteredChanges)}>
              Clear filtered
            </button>
            <button
              className={`rounded-full px-3 py-1 text-xs ${
                selectedDiffCount
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--line)] bg-white text-[var(--muted)]"
              }`}
              onClick={handleBuildDeltaFromSelection}
              disabled={!selectedDiffCount}
            >
              Build delta from selection
            </button>
          </div>
          {!selectedDiffCount && state.diffChanges.length ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              Select at least one change before building the delta manifest.
            </div>
          ) : null}
          <div className="mt-6 overflow-auto rounded-2xl border border-[var(--line)]">
            <table className="min-w-[980px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-2">Select</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2">Destination</th>
                  <th className="px-4 py-2">Path</th>
                </tr>
              </thead>
              <tbody>
                {filteredChanges.map((change, idx) => (
                  <tr key={`${change.relPath}-${idx}`} className="border-t">
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={Boolean(diffSelected[change.relPath])}
                        onChange={(event) => {
                          setDiffSelected((prev) => ({ ...prev, [change.relPath]: event.target.checked }));
                        }}
                      />
                    </td>
                    <td className="px-4 py-2">{change.type}</td>
                    <td className="px-4 py-2">{change.name}</td>
                    <td className="px-4 py-2">{change.status}</td>
                    <td className="px-4 py-2">{change.status === "Removed" ? "No" : "Yes"}</td>
                    <td className="px-4 py-2">{change.status === "Added" ? "No" : "Yes"}</td>
                    <td className="px-4 py-2 text-xs font-mono">{change.relPath}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        ) : null}

        {isSignedIn && activeSection === "reportSection" ? (
        <section id="reportSection" className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Comparison Report</h2>
              <p className="text-sm text-[var(--muted)]">Deep analysis with risk scoring, drift signals, and role-based views.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="rounded-full border border-[var(--line)] px-3 py-2 text-xs" onClick={() => loadReport()}>
                Refresh report
              </button>
              {diffReportPath && state.activeProject ? (
                <button
                  className="rounded-full border border-[var(--line)] px-3 py-2 text-xs"
                  onClick={() => {
                    const projectId = state.activeProject?.id;
                    if (!projectId) return;
                    window.open(
                      `/api/projects/${projectId}/report?relPath=${encodeURIComponent(diffReportPath)}`,
                      "_blank"
                    );
                  }}
                >
                  Open in new tab
                </button>
              ) : null}
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
            {reportLoading ? (
              <div className="text-sm text-[var(--muted)]">Loading report...</div>
            ) : reportError ? (
              <div className="text-sm text-rose-600">{reportError}</div>
            ) : reportContent ? (
              <iframe
                title="Comparison report"
                className="h-[70vh] w-full rounded-xl border-0"
                sandbox="allow-same-origin allow-popups"
                srcDoc={reportContent}
              />
            ) : (
              <div className="text-sm text-[var(--muted)]">Run “Generate diff” to create the report.</div>
            )}
          </div>
        </section>
        ) : null}

        {isSignedIn && activeSection === "orchestratorSection" ? (
        <section id="orchestratorSection" className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Orchestrator</h2>
              <p className="text-sm text-[var(--muted)]">One click runs the full comparison job with auto-generated manifests.</p>
            </div>
            <button
              className={`rounded-full px-3 py-2 text-xs ${
                canRunOrchestrator ? "bg-[var(--accent)] text-white" : "border border-[var(--line)] text-[var(--muted)]"
              }`}
              disabled={!canRunOrchestrator}
              onClick={() => {
                if (!canRunOrchestrator) return;
                setActiveSection("jobSection");
                handleCompare(compareStrategy);
              }}
            >
              Start orchestrated comparison
            </button>
          </div>
          {renderReadinessPanel(
            "Orchestrator Readiness",
            orchestratorReadinessIssues,
            "Orchestrator can run. Project bindings and strategy inputs are ready."
          )}
          <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-xs text-[var(--muted)]">
            Requirements: project selected, source org bound, destination org bound. Manifests are auto-generated unless a manual strategy is selected.
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Choose Strategy</div>
              <div className="mt-3 grid gap-3">
                <label className="text-xs text-[var(--muted)]">Manifest strategy</label>
                <select
                  className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
                  value={compareStrategy}
                  onChange={(event) => setCompareStrategy(event.target.value as typeof compareStrategy)}
                >
                  <option value="auto">Auto-generate from orgs</option>
                  <option value="existing">Use existing manifests</option>
                  <option value="custom">Use custom manifest</option>
                  <option value="merge">Merge multiple manifests</option>
                  <option value="scope">Scope-filtered manifest</option>
                  <option value="delta">Delta from last release</option>
                </select>
                {compareStrategy === "custom" ? (
                  <textarea
                    className="min-h-[120px] rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-mono"
                    placeholder="Paste package.xml"
                    value={compareManifestXml}
                    onChange={(event) => setCompareManifestXml(event.target.value)}
                  />
                ) : null}
                {compareStrategy === "merge" ? (
                  <textarea
                    className="min-h-[120px] rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-mono"
                    placeholder="Paste manifests separated by ---"
                    value={compareMergeXml}
                    onChange={(event) => setCompareMergeXml(event.target.value)}
                  />
                ) : null}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Scope & Context</div>
              <div className="mt-3 grid gap-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <input
                    className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-xs"
                    placeholder="Include types (comma)"
                    value={compareScopeInclude}
                    onChange={(event) => setCompareScopeInclude(event.target.value)}
                  />
                  <input
                    className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-xs"
                    placeholder="Exclude types (comma)"
                    value={compareScopeExclude}
                    onChange={(event) => setCompareScopeExclude(event.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={compareScopeExcludeProfiles}
                      onChange={(event) => setCompareScopeExcludeProfiles(event.target.checked)}
                    />
                    Exclude profiles
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={compareScopeCustomOnly}
                      onChange={(event) => setCompareScopeCustomOnly(event.target.checked)}
                    />
                    Custom only
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={compareScopeBusinessOnly}
                      onChange={(event) => setCompareScopeBusinessOnly(event.target.checked)}
                    />
                    Business metadata only
                  </label>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <input
                    className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-xs"
                    placeholder="Branch"
                    value={compareContextBranch}
                    onChange={(event) => setCompareContextBranch(event.target.value)}
                  />
                  <input
                    className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-xs"
                    placeholder="Release"
                    value={compareContextRelease}
                    onChange={(event) => setCompareContextRelease(event.target.value)}
                  />
                  <input
                    className="rounded-2xl border border-[var(--line)] bg-white px-3 py-2 text-xs"
                    placeholder="Reason"
                    value={compareContextReason}
                    onChange={(event) => setCompareContextReason(event.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Manifest Strategies</div>
              <div className="mt-3 space-y-2 text-xs text-[var(--muted)]">
                <div className="flex items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2">
                  <span>Auto-generate from orgs</span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
                    {compareStrategy === "auto" ? "Selected" : "Default"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2">
                  <span>Use existing package.xml</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                    {compareStrategy === "existing" ? "Selected" : "Repo"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2">
                  <span>Custom manifest upload</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                    {compareStrategy === "custom" ? "Selected" : "Manual"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2">
                  <span>Merge multiple manifests</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                    {compareStrategy === "merge" ? "Selected" : "Teams"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2">
                  <span>Scope-filtered manifest</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                    {compareStrategy === "scope" ? "Selected" : "Architect"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2">
                  <span>Delta from last release</span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                    {compareStrategy === "delta" ? "Selected" : "Release"}
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-white p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Orchestrated Stages</div>
              <div className="mt-3 grid gap-2 text-xs text-[var(--muted)]">
                <div className="rounded-xl border border-[var(--line)] px-3 py-2">Context capture → strategy resolution</div>
                <div className="rounded-xl border border-[var(--line)] px-3 py-2">Retrieve source + destination</div>
                <div className="rounded-xl border border-[var(--line)] px-3 py-2">Normalize + dependency hints</div>
                <div className="rounded-xl border border-[var(--line)] px-3 py-2">Compare → risk + impact</div>
                <div className="rounded-xl border border-[var(--line)] px-3 py-2">Report generation + storage</div>
              </div>
            </div>
          </div>
        </section>
        ) : null}

        {isSignedIn && activeSection === "jobSection" ? (
        <section id="jobSection" className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Job Activity</h2>
              <p className="text-sm text-[var(--muted)]">Live progress for the most recent comparison job.</p>
            </div>
            <div className="text-xs text-[var(--muted)]">
              {compareStatus?.updatedAt ? `Updated ${new Date(compareStatus.updatedAt).toLocaleTimeString()}` : "Waiting for status"}
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
            {compareJobId ? (
              <>
                <div className="text-sm font-semibold">
                  Job {compareJobId.slice(0, 6)} · {compareStatus?.status || "queued"}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--muted)]">
                  {(compareStatus?.stages || []).map((stage: any) => (
                    <span key={stage.name} className="flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-1">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          stage.status === "done"
                            ? "bg-emerald-500"
                            : stage.status === "failed"
                              ? "bg-rose-500"
                              : "bg-amber-400"
                        }`}
                      ></span>
                      {stage.name}
                    </span>
                  ))}
                </div>
                {compareStatus?.error ? (
                  <div className="mt-3 text-xs text-rose-600">{compareStatus.error}</div>
                ) : null}
              </>
            ) : (
              <div className="text-sm text-[var(--muted)]">Run “One Click Compare” or “Orchestrator” to start a comparison job.</div>
            )}
          </div>
          <div className="mt-4 rounded-2xl border border-[var(--line)] bg-black/90 p-4 font-mono text-[11px] text-emerald-100">
            {compareStatus?.logTail ? (
              <pre className="whitespace-pre-wrap">{compareStatus.logTail}</pre>
            ) : (
              <div>Waiting for job logs…</div>
            )}
          </div>
          <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Recent jobs</div>
            <div className="mt-3 space-y-2 text-xs text-[var(--muted)]">
              {historyData.comparisons.length ? (
                historyData.comparisons.slice(0, 5).map((item: any) => {
                  const status = item.jobStatus?.status || (item.completedAt ? "done" : "queued");
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2">
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            status === "done"
                              ? "bg-emerald-500"
                              : status === "failed"
                                ? "bg-rose-500"
                                : status === "running"
                                  ? "bg-amber-400"
                                  : "bg-slate-300"
                          }`}
                        ></span>
                        <span className="font-semibold">{item.id.slice(0, 6)}</span>
                        <span className="uppercase">{status}</span>
                      </div>
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                  );
                })
              ) : (
                <div>No comparison history yet.</div>
              )}
            </div>
          </div>
        </section>
        ) : null}

        {isSignedIn && activeSection === "deploySection" ? (
        <section id="deploySection" className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
          <h2 className="text-lg font-semibold">Deploy</h2>
          <p className="text-sm text-[var(--muted)]">Deploy metadata to destination Salesforce org using different modes.</p>
          {renderGuide("deploySection")}
          {renderReadinessPanel(
            "Deploy Readiness",
            deployReadinessIssues,
            "Deploy can run. Destination org, reviewed diff, and delta manifest are ready."
          )}
          
          <div className="mt-6">
            <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Deployment Mode</label>
            <select
              id="deployModeSelect"
              className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-2 bg-white"
              value={deployType}
              onChange={(e) => setDeployType(e.target.value as any)}
            >
              <option value="delta">Delta Selection (Only Selected Changes)</option>
              <option value="full">Full Source (All metadata in force-app)</option>
              <option value="manifest">Custom Manifest (Provide package.xml)</option>
            </select>
          </div>

          {deployType === "delta" && (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Delta manifest</h3>
                <button className="rounded-full border border-[var(--line)] px-3 py-1 text-xs" onClick={() => handleSaveManifest("delta")}>
                  Save delta
                </button>
              </div>
              <textarea
                id="deltaManifest"
                className="h-44 w-full rounded-2xl border border-[var(--line)] px-3 py-2 font-mono text-xs"
                value={deltaManifest}
                onChange={(event) => setDeltaManifest(event.target.value)}
              ></textarea>

              {destructivePreview.count > 0 && (
                <div className="rounded-2xl border border-red-300 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                      ⚠️ This deploy will DELETE {destructivePreview.count} component{destructivePreview.count === 1 ? "" : "s"} from {state.activeProject?.destinationOrg || "the target org"}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-xs underline text-red-700 dark:text-red-300"
                      onClick={() => setShowDeletionDetails((v) => !v)}
                    >
                      {showDeletionDetails ? "Hide" : "Show"} list
                    </button>
                  </div>
                  {showDeletionDetails && (
                    <ul className="mt-2 max-h-40 overflow-auto font-mono text-xs text-red-800 dark:text-red-300/90">
                      {destructivePreview.components.flatMap((component) =>
                        component.members.map((member) => (
                          <li key={`${component.name}:${member}`}>{component.name}: {member}</li>
                        ))
                      )}
                    </ul>
                  )}
                  <label className="mt-3 flex items-center gap-2 text-xs font-medium text-red-800 dark:text-red-300">
                    <input
                      type="checkbox"
                      checked={includeDeletions}
                      onChange={(event) => setIncludeDeletions(event.target.checked)}
                    />
                    Include these deletions in the deploy (uncheck to deploy additively)
                  </label>
                </div>
              )}
            </div>
          )}

          {deployType === "full" && (
            <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50/50 p-4 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200">
              <h3 className="font-semibold text-blue-800 dark:text-blue-300">Full Source Mode Active</h3>
              <p className="mt-1 text-xs text-blue-700/80 dark:text-blue-400/80">
                This mode deploys all metadata files from the source project&apos;s <code>force-app</code> directory directly.
                Any local adjustments or uncommitted files in the workspace will be bundled and deployed to the destination org.
              </p>
            </div>
          )}

          {deployType === "manifest" && (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Custom Manifest (package.xml)</h3>
              </div>
              <textarea
                id="customManifestXml"
                placeholder={`<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n    <types>\n        <members>MyApexClass</members>\n        <name>ApexClass</name>\n    </types>\n    <version>66.0</version>\n</Package>`}
                className="h-64 w-full rounded-2xl border border-[var(--line)] px-3 py-2 font-mono text-xs"
                value={customManifestXml}
                onChange={(event) => setCustomManifestXml(event.target.value)}
              ></textarea>
            </div>
          )}

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Test level</label>
              <select id="testLevel" className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-2">
                <option value="NoTestRun">NoTestRun</option>
                <option value="RunLocalTests">RunLocalTests</option>
                <option value="RunAllTestsInOrg">RunAllTestsInOrg</option>
                <option value="RunSpecifiedTests">RunSpecifiedTests</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Run tests</label>
              <input id="runTests" className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-2" placeholder="TestClass1,TestClass2" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Check only</label>
              <select id="checkOnly" className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-2">
                <option value="false">False</option>
                <option value="true">True</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Auto retry</label>
              <select id="autoRetry" className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-2">
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Retry limit</label>
              <select id="retryLimit" className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-2" defaultValue="3">
                <option value="1">1 attempt</option>
                <option value="2">2 attempts</option>
                <option value="3">3 attempts</option>
                <option value="4">4 attempts</option>
                <option value="5">5 attempts</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Component overrides</label>
            <input id="componentOverrides" className="mt-2 w-full rounded-xl border border-[var(--line)] px-3 py-2" placeholder="ApexClass:MyClass" />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className={`rounded-full px-4 py-2 text-xs ${
                canRunDeployFlow
                  ? "bg-[var(--accent)] text-white"
                  : "border border-[var(--line)] bg-white text-[var(--muted)]"
              }`}
              onClick={handleDeploy}
              disabled={!canRunDeployFlow}
            >
              {deployType === "delta" ? "Deploy delta" : deployType === "full" ? "Deploy Full Source" : "Deploy Custom Manifest"}
            </button>
            <button
              className={`rounded-full px-4 py-2 text-xs ${
                canRunDeployFlow
                  ? "border border-[var(--line)]"
                  : "border border-[var(--line)] bg-white text-[var(--muted)]"
              }`}
              onClick={handleRetryDeploy}
              disabled={!canRunDeployFlow}
            >
              Retry without failed
            </button>
          </div>
          <div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Deploy Job</div>
                <div className="mt-1 text-sm font-semibold">
                  {deployJobId ? `${deployJobId.slice(0, 6)} · ${deployStatus?.status || "running"}` : "No active deploy job"}
                </div>
              </div>
              <div className="text-xs text-[var(--muted)]">
                {deployStatus?.updatedAt ? `Updated ${new Date(deployStatus.updatedAt).toLocaleTimeString()}` : "Idle"}
              </div>
            </div>
            {deployStatus?.result ? (
              <div className="mt-3 text-xs text-[var(--muted)]">
                Status: {deployStatus.result.status} · Attempts: {deployStatus.result.attempts} · Failed components: {(deployStatus.result.failedComponents || []).length}
              </div>
            ) : deployJobId ? (
              <div className="mt-3 text-xs text-[var(--muted)]">Deployment is running in the background. The console only shows a slim log tail.</div>
            ) : null}
            {Array.isArray(deployStatus?.record?.output?.unsupportedMetadataTypes) && deployStatus.record.output.unsupportedMetadataTypes.length ? (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Skipped unsupported metadata types: {deployStatus.record.output.unsupportedMetadataTypes.join(', ')}
              </div>
            ) : null}
            {deployStatus?.error ? (
              <div className="mt-3 text-xs text-rose-600">{deployStatus.error}</div>
            ) : null}
          </div>
        </section>
        ) : null}

        {isSignedIn && activeSection === "historySection" ? (
        <section id="historySection" className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">History</h2>
              <p className="text-sm text-[var(--muted)]">Retrievals, comparisons, and deployments for the active project.</p>
            </div>
            <button className="rounded-full border border-[var(--line)] px-3 py-2 text-xs" onClick={refreshHistory}>
              Refresh history
            </button>
          </div>
          {renderGuide("historySection")}
          <div className="mt-6 grid gap-4">
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Recent Comparison Jobs</div>
              {historyData.comparisons.length ? (
                <div className="mt-3 overflow-auto rounded-xl border border-[var(--line)]">
                  <table className="min-w-[720px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                      <tr>
                        <th className="px-4 py-2">Run</th>
                        <th className="px-4 py-2">Changes</th>
                        <th className="px-4 py-2">Strategy</th>
                        <th className="px-4 py-2">Report</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.comparisons.map((item) => (
                        <tr key={item.id} className="border-t">
                          <td className="px-4 py-2 text-xs">{new Date(item.createdAt).toLocaleString()}</td>
                          <td className="px-4 py-2 text-xs">{item.changes?.length ?? 0}</td>
                          <td className="px-4 py-2 text-xs">{item.manifestStrategy || "workspace_diff"}</td>
                          <td className="px-4 py-2 text-xs">
                            {item.reportRelPath ? (
                              <button
                                className="rounded-full border border-[var(--line)] px-3 py-1 text-[11px]"
                                onClick={() => {
                                  setActiveSection("reportSection");
                                  loadReport(item.reportRelPath);
                                }}
                              >
                                View report
                              </button>
                            ) : (
                              <span className="text-[var(--muted)]">Unavailable</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-3 text-sm text-[var(--muted)]">No comparison jobs yet.</div>
              )}
            </div>
          </div>
        </section>
        ) : null}

        {isSignedIn && activeSection === "aiInsightsSection" ? (
        <section id="aiInsightsSection" className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">AI Deployment Insights</h2>
              <p className="text-sm text-[var(--muted)]">Autogenerated recommendations for failed jobs.</p>
            </div>
            <button className="rounded-full border border-[var(--line)] px-3 py-2 text-xs" onClick={() => loadInsights().catch((err: any) => setOutput({ error: err.message }))}>
              Refresh insights
            </button>
          </div>
          <div className="mt-6 space-y-3">
            {insights.length ? (
              insights.map((insight) => (
                <div key={insight.id} className="rounded-2xl border border-[var(--line)] bg-white p-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{insight.summary}</span>
                    <span
                      className={`text-[10px] uppercase ${
                        insight.severity === "error"
                          ? "text-rose-600"
                          : insight.severity === "warning"
                          ? "text-orange-600"
                          : "text-slate-500"
                      }`}
                    >
                      {insight.severity || "info"}
                    </span>
                  </div>
                  <p className="mt-2 text-[var(--muted)]">{insight.recommendation}</p>
                  {insight.rawError ? (
                    <details className="mt-2 text-[var(--muted)]">
                      <summary className="cursor-pointer text-[10px]">Show raw error</summary>
                      <pre className="mt-1 whitespace-pre-wrap text-[10px]">{insight.rawError}</pre>
                    </details>
                  ) : null}
                  <div className="mt-2 text-[10px] text-[var(--muted)]">
                    Job: {insight.jobId || "n/a"} • Generated {new Date(insight.createdAt).toLocaleString()}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[var(--muted)] text-sm">No AI insights available yet. Run failing jobs and rerun the generator via `npm run ai:insights`.</div>
            )}
          </div>
        </section>
        ) : null}

        {isSignedIn && activeSection === "staticScansSection" ? (
        <section id="staticScansSection" className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Static Scan Reports</h2>
              <p className="text-sm text-[var(--muted)]">Automated code hygiene and quality reports ({scans.length} stored).</p>
            </div>
            <button className="rounded-full border border-[var(--line)] px-3 py-2 text-xs" onClick={() => loadScans().catch((err: any) => setOutput({ error: err.message }))}>
              Refresh scans
            </button>
          </div>
          <div className="mt-6 space-y-3">
            {scans.length ? (
              scans.map((scan) => (
                <div key={scan.id} className="rounded-2xl border border-[var(--line)] bg-white p-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Scan {scan.id}</span>
                    <span className="text-[10px] uppercase text-slate-500">{scan.status}</span>
                  </div>
                  <p className="mt-2 text-[var(--muted)]">{scan.summary}</p>
                  {scan.reportPath ? (
                    <div className="mt-2 text-[10px] text-[var(--muted)]">Report: {scan.reportPath}</div>
                  ) : null}
                  <div className="mt-2 text-[10px] text-[var(--muted)]">
                    Generated {new Date(scan.createdAt).toLocaleString()}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-[var(--muted)] text-sm">No scans have been executed yet. Run `npm run scan:static` to generate a fresh report.</div>
            )}
          </div>
        </section>
        ) : null}

        {isSignedIn && activeSection === "orgDocsSection" ? (
        <section id="orgDocsSection" className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Org Design Documents</h2>
              <p className="text-sm text-[var(--muted)]">AI-generated architecture briefs.</p>
            </div>
            <button className="rounded-full border border-[var(--line)] px-3 py-2 text-xs" onClick={() => loadDocs().catch((err: any) => setOutput({ error: err.message }))}>
              Refresh documents
            </button>
          </div>
          <div className="mt-6 space-y-3">
            {docs.length ? (
              docs.map((doc) => (
                <div key={doc.id} className="rounded-2xl border border-[var(--line)] bg-white p-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{doc.id}</span>
                    <span className="text-[10px] text-[var(--muted)]">{new Date(doc.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-2 text-[var(--muted)]">{doc.summary || "Generated org overview document."}</p>
                  <div className="mt-2 text-[10px] text-[var(--muted)]">Path: {doc.docPath}</div>
                </div>
              ))
            ) : (
              <div className="text-[var(--muted)] text-sm">No documents yet. Regenerate with `npm run doc:org`.</div>
            )}
          </div>
        </section>
        ) : null}

        {isSignedIn && activeSection === "agentSection" ? (
        <section id="agentSection" className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Autonomous AI Agent</h2>
              <p className="text-sm text-[var(--muted)]">Configure the AI self-healing agent and review deployment healing history.</p>
            </div>
            <button 
              className="rounded-full border border-[var(--line)] px-3 py-2 text-xs" 
              onClick={() => {
                if (state.activeProject?.id) {
                  loadAgentConfig(state.activeProject.id);
                  loadAgentHistory(state.activeProject.id);
                }
              }}
            >
              Refresh Details
            </button>
          </div>

          {renderGuide("agentSection")}

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* Settings Card */}
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
              <h3 className="text-sm font-semibold tracking-wide uppercase text-[var(--muted)] mb-4">Agent Configuration</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-[0.2em] text-[var(--muted)] mb-2">Auto-healing Status</label>
                  <select 
                    id="agentEnabled" 
                    className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm bg-white"
                    value={agentConfig?.enabled ? "true" : "false"}
                    onChange={(e) => {
                      const val = e.target.value === "true";
                      setAgentConfig(prev => prev ? { ...prev, enabled: val } : { enabled: val, maxRetries: 3, hasApiKey: false, hasGlobalApiKey: false });
                    }}
                  >
                    <option value="true">Enabled (Auto-heals failed deployments)</option>
                    <option value="false">Disabled (Manual healing runs only)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-[0.2em] text-[var(--muted)] mb-2">Max Retry Attempts ({agentConfig?.maxRetries ?? 3})</label>
                  <div className="flex items-center gap-4">
                    <input 
                      type="range" 
                      id="agentMaxRetries" 
                      min="1" 
                      max="5" 
                      className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-[var(--line)] accent-[var(--accent)]"
                      value={agentConfig?.maxRetries ?? 3}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setAgentConfig(prev => prev ? { ...prev, maxRetries: val } : { enabled: false, maxRetries: val, hasApiKey: false, hasGlobalApiKey: false });
                      }}
                    />
                    <span className="text-sm font-mono">{agentConfig?.maxRetries ?? 3}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">Attempts the agent will make to heal and redeploy before giving up.</p>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-[0.2em] text-[var(--muted)] mb-2">
                    Gemini API Key 
                    {agentConfig?.hasApiKey && <span className="ml-2 inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Saved</span>}
                    {agentConfig?.hasGlobalApiKey && <span className="ml-2 inline-flex items-center rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">Global Fallback Configured</span>}
                  </label>
                  <input 
                    type="password"
                    placeholder={agentConfig?.hasApiKey ? "••••••••••••••••" : "Enter project-specific Gemini API Key"}
                    className="w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm bg-white font-mono"
                    value={agentApiKeyInput}
                    onChange={(e) => setAgentApiKeyInput(e.target.value)}
                  />
                  <p className="mt-1 text-[10px] text-[var(--muted)]">
                    Stored encrypted. Leave blank to retain existing key, or to fallback to the global environment API key.
                  </p>
                </div>

                <div className="pt-2">
                  <button 
                    className="w-full rounded-full bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white px-4 py-2 text-xs font-semibold transition flex items-center justify-center gap-2"
                    disabled={agentConfigLoading || !state.activeProject}
                    onClick={handleSaveAgentConfig}
                  >
                    {agentConfigLoading ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              </div>
            </div>

            {/* Overview / Usage Stats Card */}
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold tracking-wide uppercase text-[var(--muted)] mb-4">Self-Healing Overview</h3>
                <div className="space-y-3 text-xs text-[var(--muted)]">
                  <p>
                    When auto-healing is <strong className="text-[var(--ink)]">Enabled</strong>, the toolkit intercepts failed deployment jobs and activates the Autonomous AI Agent.
                  </p>
                  <p>
                    The agent analyzes the deployment log output to classify the exact failure reason (e.g. invalid permissions, missing profile tags, outdated API versions), dynamically extracts the source code, runs automated XML and LLM healers to auto-repair issues, and initiates a retry deployment cycle.
                  </p>
                  <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3 text-sky-950 dark:border-sky-900/40 dark:bg-sky-950/20">
                    <span className="font-semibold text-xs block mb-1">Cost Alert</span>
                    Each auto-healing run costs <strong className="font-mono text-sky-700 dark:text-sky-400">$0.50</strong> against your tenant allowance. Failed healing retries are not double-billed within the same job cycle.
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-[var(--line)] flex justify-between text-xs">
                <div>
                  <span className="text-[var(--muted)]">Total Heals Executed</span>
                  <span className="block mt-1 text-lg font-bold text-[var(--ink)]">{agentHistory.length}</span>
                </div>
                <div>
                  <span className="text-[var(--muted)]">Success Rate</span>
                  <span className="block mt-1 text-lg font-bold text-emerald-600">
                    {agentHistory.length > 0 
                      ? `${Math.round((agentHistory.filter(h => h.status === 'healed').length / agentHistory.length) * 100)}%`
                      : "0%"
                    }
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)] mb-3">AI Agent Audit & Logs</div>
            {agentHistory.length ? (
              <div className="overflow-auto rounded-xl border border-[var(--line)]">
                <table className="min-w-[840px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-3">Date / Time</th>
                      <th className="px-4 py-3">Jobs</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Diagnostic Summary</th>
                      <th className="px-4 py-3">Healers & Modifications</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentHistory.map((run) => (
                      <tr key={run.id} className="border-t hover:bg-slate-50/40">
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {new Date(run.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div>
                            <span className="text-[var(--muted)]">Source:</span> <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">#{run.jobId.slice(0, 8)}</code>
                          </div>
                          {run.retryJobId && (
                            <div className="mt-1">
                              <span className="text-[var(--muted)]">Retry:</span> <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">#{run.retryJobId.slice(0, 8)}</code>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {run.status === 'healed' ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                              Healed & Deployed
                            </span>
                          ) : run.status === 'failed' ? (
                            <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/10">
                              Healing Failed
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20 animate-pulse">
                              In Progress
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs max-w-xs break-words">
                          {run.diagnosticSummary || <span className="text-[var(--muted)] font-italic">No failure diagnosis recorded.</span>}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {run.healersApplied && run.healersApplied.length > 0 ? (
                            <div className="mb-2">
                              <span className="font-semibold text-[10px] text-[var(--muted)] uppercase tracking-wide">Applied:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {run.healersApplied.map((h: string, idx: number) => (
                                  <span key={idx} className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] text-slate-800">{h}</span>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {run.filesModified && run.filesModified.length > 0 ? (
                            <div>
                              <span className="font-semibold text-[10px] text-[var(--muted)] uppercase tracking-wide">Modified:</span>
                              <div className="mt-1 space-y-1">
                                {run.filesModified.map((f: string, idx: number) => (
                                  <div key={idx} className="font-mono text-[10px] truncate max-w-xs" title={f}>
                                    {f.split('/').pop()}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            !(run.healersApplied && run.healersApplied.length > 0) && <span className="text-[var(--muted)]">None</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-[var(--muted)] text-sm py-4 text-center">No agent healing execution logs yet. Failed deployments with active AI healing will audit here.</div>
            )}
          </div>
        </section>
        ) : null}

        {isSignedIn ? (
        <section id="cliConsoleSection" className="rounded-3xl border border-[var(--line)] bg-white/90 p-6 shadow-[var(--card-shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">CLI Console</h2>
              <p className="text-sm text-[var(--muted)]">Live command output and log stream.</p>
            </div>
            <button className="rounded-full border border-[var(--line)] px-3 py-2 text-xs" onClick={clearConsole}>
              Clear
            </button>
          </div>
          <pre className="mt-4 max-h-80 overflow-auto rounded-2xl border border-[var(--line)] bg-slate-950/90 p-4 text-xs text-slate-100">
            {consoleOutput}
          </pre>
        </section>
        ) : null}
        </main>
        {confirmOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 text-[var(--ink)] shadow-[var(--card-shadow)]">
              <div className="text-sm font-semibold">Confirm action</div>
              <div className="mt-2 text-sm text-[var(--muted)]">{confirmMessage}</div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="rounded-full border border-[var(--line)] px-3 py-1 text-xs"
                  onClick={() => {
                    setConfirmOpen(false);
                    setConfirmAction(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs text-rose-700"
                  onClick={() => {
                    setConfirmOpen(false);
                    if (confirmAction) confirmAction();
                    setConfirmAction(null);
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

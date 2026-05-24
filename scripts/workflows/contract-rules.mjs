export const criticalContractRules = [
  {
    category: 'recording-schema',
    testPattern: /^apps\/web\/src\/shared\/recording-schema\/__tests__\//,
    matches: (file) => file.startsWith('apps/web/src/shared/recording-schema/'),
  },
  {
    category: 'runtime-preview',
    testPattern: /^apps\/web\/src\/features\/runtime-preview\/__tests__\//,
    matches: (file) => file.startsWith('apps/web/src/features/runtime-preview/'),
  },
  {
    category: 'recording-repository',
    testPattern: /^apps\/web\/src\/features\/library\/__tests__\//,
    matches: (file) => file.startsWith('apps/web/src/features/library/recordingStore'),
  },
  {
    category: 'replay-core',
    testPattern: /^apps\/web\/src\/features\/player\/__tests__\//,
    matches: (file) =>
      file.startsWith('apps/web/src/features/player/replay') ||
      file.startsWith('apps/web/src/features/player/packageLoader') ||
      file.startsWith('apps/web/src/features/player/timelineClock') ||
      file.startsWith('apps/web/src/features/player/mediaClockAdapter'),
  },
  {
    category: 'workflow-contract',
    testPattern: /^scripts\/tests\//,
    matches: (file) =>
      file.startsWith('.github/workflows/') ||
      file.startsWith('scripts/workflows/') ||
      file === '.github/PULL_REQUEST_TEMPLATE.md' ||
      file === '.github/CODEOWNERS',
  },
  {
    category: 'authority-docs',
    testPattern: /^docs\/contracts\/|^scripts\/tests\//,
    matches: (file) =>
      [
        'README.md',
        'AGENTS.md',
        'CLAUDE.md',
        'docs/PRD/代码讲解工具.md',
        'docs/技术方案.md',
        'docs/技术模块拆解.md',
        'docs/项目时间规划.md',
        'docs/规范工作流程.md',
        'docs/知识库契约.md',
      ].includes(file) ||
      file.startsWith('docs/contracts/') ||
      file.startsWith('docs/竞品分析/'),
  },
];

export function classifyContractPaths(files) {
  const critical = [];
  const nonCritical = [];
  for (const file of normalizeFiles(files)) {
    const rule = criticalContractRules.find((candidate) => candidate.matches(file));
    if (rule) {
      critical.push({ file, category: rule.category });
    } else {
      nonCritical.push(file);
    }
  }
  return { critical, nonCritical };
}

export function combineChangedFiles(changedFiles, untrackedFiles) {
  return normalizeFiles([...(changedFiles ?? []), ...(untrackedFiles ?? [])]);
}

export function evaluateGitNexusContract({ changedFiles, impactSummary = '' }) {
  const normalized = normalizeFiles(changedFiles);
  const classification = classifyContractPaths(normalized);
  const reasons = [];
  const warnings = [];
  const suggestions = [
    'Run GitNexus detect_changes to inspect current diff impact.',
    'Use query/context/impact for touched symbols before editing critical skeleton code.',
    'Summarize the GitNexus impact result in the PR self-check.',
  ];

  if (classification.critical.length === 0) {
    warnings.push('No critical contract surface changed; GitNexus analysis is advisory for this diff.');
    return { ok: true, reasons, warnings, suggestions, ...classification };
  }

  const touchedCategories = new Set(classification.critical.map((item) => item.category));
  for (const category of touchedCategories) {
    const rule = criticalContractRules.find((candidate) => candidate.category === category);
    if (!rule) continue;
    const hasMatchingTest = normalized.some((file) => rule.testPattern.test(file));
    if (!hasMatchingTest) {
      reasons.push(`Missing contract test for critical category: ${category}`);
    }
  }

  if (!hasMeaningfulImpactSummary(impactSummary)) {
    reasons.push('Missing GitNexus impact summary. Set GITNEXUS_IMPACT_SUMMARY locally or fill the PR template.');
  }

  return {
    ok: reasons.length === 0,
    reasons,
    warnings,
    suggestions,
    ...classification,
  };
}

function hasMeaningfulImpactSummary(value) {
  const normalized = value.trim();
  if (!normalized) return false;
  return !['-', '无', 'none', 'n/a', 'na', 'todo', '待补充'].includes(normalized.toLowerCase());
}

function normalizeFiles(files) {
  return [...new Set((files ?? []).map((file) => file.replaceAll('\\', '/')).filter(Boolean))];
}

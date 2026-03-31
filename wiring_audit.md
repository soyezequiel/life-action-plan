# Wiring Audit: LAP Life Planner

## AnnualCalendarMockup
**File:** `components/mockups/AnnualCalendarMockup.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `Class: text-slate-500` | Button | ❌ DEAD | No logic |
| `Class: text-slate-500` | Button | ❌ DEAD | No logic |
| `Class: text-slate-500` | Button | ❌ DEAD | No logic |
| `Icon/Empty` | Button | ❌ DEAD | No logic |

## AuthScreen
**File:** `components/mockups/AuthScreen.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `{t('mockups.auth.forgot')}` | Button | ❌ DEAD | No logic |
| `Icon/Empty` | Button | ❌ DEAD | No logic |
| `{mode === 'login' ? t('mockups` | Button | ❌ DEAD | No logic |
| `setMode(mode === 'login' ? 're` | Button | ✅ WIRED | Has onClick |
| `{t('mockups.auth.support')}` | Button | ❌ DEAD | No logic |
| `{t('mockups.auth.privacy')}` | Button | ❌ DEAD | No logic |
| `Input` | Form | ❌ DEAD | Uncontrolled/Default only |
| `Input` | Form | ❌ DEAD | Uncontrolled/Default only |
| `Input` | Form | ❌ DEAD | Uncontrolled/Default only |

## BackendSettingsMockup
**File:** `components/mockups/BackendSettingsMockup.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `Class: text-slate-500` | Button | ❌ DEAD | No logic |
| `Class: text-slate-500` | Button | ❌ DEAD | No logic |
| `{status === 'saving' ? 'Guarda` | Button | ✅ WIRED | Has onClick |
| `{t('mockups.settingsBackend.fo` | Button | ❌ DEAD | No logic |
| `Input` | Form | ❌ DEAD | Uncontrolled/Default only |
| `Input` | Form | ✅ WIRED | Controlled input |

## ConflictResolverMockup
**File:** `components/mockups/ConflictResolverMockup.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `Class: text-slate-500` | Button | ❌ DEAD | No logic |
| `Icon/Empty` | Button | ❌ DEAD | No logic |
| `<MockData>` | Data | ❌ DEAD | MockData tag present |
| `<MockData>` | Data | ❌ DEAD | MockData tag present |

## DailyCalendarMockup
**File:** `components/mockups/DailyCalendarMockup.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `Class: text-slate-500` | Button | ❌ DEAD | No logic |
| `Class: text-slate-500` | Button | ❌ DEAD | No logic |
| `{t('mockups.calendarDaily.quic` | Button | ❌ DEAD | No logic |
| `{t('mockups.calendarDaily.quic` | Button | ❌ DEAD | No logic |
| `{t('mockups.calendarDaily.quic` | Button | ❌ DEAD | No logic |

## DashboardMockup
**File:** `components/mockups/DashboardMockup.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `Icon/Empty` | Button | ❌ DEAD | No logic |
| `Icon/Empty` | Button | ❌ DEAD | No logic |

## IntakeMockup
**File:** `components/mockups/IntakeMockup.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `Icon/Empty` | Button | ❌ DEAD | No logic |
| `Icon/Empty` | Button | ❌ DEAD | No logic |
| `}` | Button | ✅ WIRED | Has onClick |
| `{t('mockups.intake.continue')}` | Button | ✅ WIRED | Has onClick |
| `{t('mockups.intake.help')}` | Button | ✅ WIRED | Has onClick |
| `Textarea` | Form | ✅ WIRED | Controlled input |

## MonthlyCalendarMockup
**File:** `components/mockups/MonthlyCalendarMockup.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `Class: text-slate-500` | Button | ❌ DEAD | No logic |
| `Class: text-slate-500` | Button | ❌ DEAD | No logic |
| `Class: text-slate-500` | Button | ❌ DEAD | No logic |
| `Icon/Empty` | Button | ❌ DEAD | No logic |
| `Icon/Empty` | Button | ❌ DEAD | No logic |

## RefinementMockup
**File:** `components/mockups/RefinementMockup.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `Icon/Empty` | Button | ❌ DEAD | No logic |
| `{t('mockups.refinement.previou` | Button | ❌ DEAD | No logic |
| `{t('mockups.refinement.save')}` | Button | ❌ DEAD | No logic |
| `{t('mockups.refinement.continu` | Button | ❌ DEAD | No logic |
| `Textarea` | Form | ❌ DEAD | Uncontrolled/Default only |
| `<MockData>` | Data | ❌ DEAD | MockData tag present |
| `<MockData>` | Data | ❌ DEAD | MockData tag present |
| `<MockData>` | Data | ❌ DEAD | MockData tag present |
| `<MockData>` | Data | ❌ DEAD | MockData tag present |
| `<MockData>` | Data | ❌ DEAD | MockData tag present |

## SimulationCostMockup
**File:** `components/mockups/SimulationCostMockup.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `Class: text-slate-500` | Button | ❌ DEAD | No logic |
| `Icon/Empty` | Button | ❌ DEAD | No logic |

## SpatialPrioritizationMockup
**File:** `components/mockups/SpatialPrioritizationMockup.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `Icon/Empty` | Button | ❌ DEAD | No logic |
| `Icon/Empty` | Button | ❌ DEAD | No logic |
| `Icon/Empty` | Button | ❌ DEAD | No logic |

## TaskManagementMockup
**File:** `components/mockups/TaskManagementMockup.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `Class: text-slate-500` | Button | ❌ DEAD | No logic |
| `handleToggle(task.id)}
      ` | Button | ✅ WIRED | Has onClick |
| `{t('mockups.flow.tasks.library` | Button | ❌ DEAD | No logic |
| `Icon/Empty` | Button | ❌ DEAD | No logic |

## WalletSettingsMockup
**File:** `components/mockups/WalletSettingsMockup.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `Class: text-slate-500` | Button | ❌ DEAD | No logic |
| `Class: text-slate-500` | Button | ❌ DEAD | No logic |
| `{t('mockups.wallet.primary')}` | Button | ❌ DEAD | No logic |
| `{t('mockups.wallet.secondary')` | Button | ❌ DEAD | No logic |
| `{t('mockups.wallet.details')}` | Button | ❌ DEAD | No logic |
| `Input` | Form | ❌ DEAD | Uncontrolled/Default only |

## WeeklyCalendarMockup
**File:** `components/mockups/WeeklyCalendarMockup.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `Class: text-slate-500` | Button | ❌ DEAD | No logic |
| `Class: text-slate-500` | Button | ❌ DEAD | No logic |
| `{t('mockups.calendarWeekly.joi` | Button | ❌ DEAD | No logic |

## PlanFlow
**File:** `components/flow/PlanFlow.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `{props.busy ? 'Preparando...' ` | Button | ✅ WIRED | Has onClick |
| `{props.busy ? 'Procesando...' ` | Button | ✅ WIRED | Has onClick |
| `Input` | Form | ✅ WIRED | Controlled input |
| `Input` | Form | ✅ WIRED | Controlled input |
| `Textarea` | Form | ✅ WIRED | Controlled input |
| `Textarea` | Form | ✅ WIRED | Controlled input |
| `Select` | Form | ✅ WIRED | Controlled input |

## AccountSection
**File:** `components/settings/AccountSection.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `void handleLogout()} disabled=` | Button | ✅ WIRED | Has onClick |
| `{
              void handleDe` | Button | ✅ WIRED | Has onClick |
| `{
                void handle` | Button | ✅ WIRED | Has onClick |
| `setMode(mode === 'login' ? 're` | Button | ✅ WIRED | Has onClick |
| `Input` | Form | ✅ WIRED | Controlled input |
| `Input` | Form | ✅ WIRED | Controlled input |
| `Input` | Form | ✅ WIRED | Controlled input |

## BuildSection
**File:** `components/settings/BuildSection.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `{props.inspectorVisible ? t('d` | Button | ✅ WIRED | Has onClick |
| `{
              void props.on` | Button | ✅ WIRED | Has onClick |

## LlmModeSelector
**File:** `components/settings/LlmModeSelector.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `{advancedVisible ? t('settings` | Button | ✅ WIRED | Has onClick |
| `{t('settings.llm_mode.service_` | Button | ✅ WIRED | Has onClick |
| `{t('settings.llm_mode.own_key_` | Button | ✅ WIRED | Has onClick |
| `{t('settings.llm_mode.codex_ti` | Button | ✅ WIRED | Has onClick |

## OwnKeyManager
**File:** `components/settings/OwnKeyManager.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `{
            void handleSubm` | Button | ✅ WIRED | Has onClick |
| `{
            void props.onBa` | Button | ✅ WIRED | Has onClick |
| `{
            void props.onRe` | Button | ✅ WIRED | Has onClick |
| `props.onDeleteKey(record.id)}` | Button | ✅ WIRED | Has onClick |
| `Input` | Form | ✅ WIRED | Controlled input |
| `Input` | Form | ✅ WIRED | Controlled input |
| `Input` | Form | ✅ WIRED | Controlled input |
| `Input` | Form | ❌ DEAD | Uncontrolled/Default only |
| `Select` | Form | ✅ WIRED | Controlled input |

## ServiceAiSelector
**File:** `components/settings/ServiceAiSelector.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `{model.displayName}` | Button | ✅ WIRED | Has onClick |

## WalletSection
**File:** `components/settings/WalletSection.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `{props.walletBusy ? t('setting` | Button | ⚠️ PARTIAL | No logic |
| `{
              void props.on` | Button | ✅ WIRED | Has onClick |
| `Input` | Form | ✅ WIRED | Controlled input |

## PlanDashboardV5
**File:** `components/plan-viewer/PlanDashboardV5.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `{t('planV5.refresh')}` | Button | ✅ WIRED | Has onClick |
| `{t('planV5.refresh')}` | Button | ✅ WIRED | Has onClick |

## PlanDashboardV5Content
**File:** `components/plan-viewer/PlanDashboardV5Content.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `onTabChange(tab)}
          >
` | Button | ✅ WIRED | Has onClick |

## PlanSummaryBar
**File:** `components/plan-viewer/PlanSummaryBar.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `{t('planV5.summary.changes')}` | Button | ✅ WIRED | Has onClick |
| `{t('planV5.summary.tradeoffs')` | Button | ✅ WIRED | Has onClick |

## TradeoffDialog
**File:** `components/plan-viewer/TradeoffDialog.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `{t('planV5.tradeoff.close')}` | Button | ✅ WIRED | Has onClick |
| `{
                      consol` | Button | ✅ WIRED | Has onClick |
| `{
                      consol` | Button | ✅ WIRED | Has onClick |

## MockupShell
**File:** `components/midnight-mint/MockupShell.tsx`

| Element | Type | Status | Details |
|---|---|---|---|
| `{content}` | Button | ❌ DEAD | No logic |
| `{item.label}` | Button | ❌ DEAD | No logic |
| `{tabContent}` | Button | ❌ DEAD | No logic |

## Summary

- **✅ WIRED:** 47
- **⚠️ PARTIAL:** 1
- **❌ DEAD:** 65

### Top Priority (Top 5 Dead Elements)
1. `SettingsMockupPage.tsx` Settings tabs (no action)
2. `RefinementMockup.tsx` Chat inputs/buttons
3. `ConflictResolverMockup.tsx` Resolution actions
4. `AuthScreen.tsx` Login/Register form
5. `DashboardMockup.tsx` Empty state actions

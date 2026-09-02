/**
 * Framework registry
 * Single source of truth for prompt frameworks and their section/component types.
 * Adding a new framework = add an entry to FRAMEWORK_DEFINITIONS in
 * sectionTypes.ts (plus any new SECTION_TYPE_LABELS entry), then give the type
 * an icon and colour below.
 *
 * The data lives in sectionTypes.ts, which stays free of MUI so the API routes
 * and the Markdown parser can use the same registry without pulling icons into
 * the server bundle.
 */

import type { SvgIconComponent } from "@mui/icons-material";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import PersonIcon from "@mui/icons-material/Person";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import AbcIcon from "@mui/icons-material/Abc";
import BrushIcon from "@mui/icons-material/Brush";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import RuleIcon from "@mui/icons-material/Rule";
import OutputIcon from "@mui/icons-material/Output";
import FlagIcon from "@mui/icons-material/Flag";
import SourceIcon from "@mui/icons-material/Source";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import InputIcon from "@mui/icons-material/Input";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import ListAltIcon from "@mui/icons-material/ListAlt";
import SportsScoreIcon from "@mui/icons-material/SportsScore";
import FilterAltIcon from "@mui/icons-material/FilterAlt";

import {
  ALL_TYPE_VALUES,
  DEFAULT_FRAMEWORK_ID,
  DEFAULT_TYPE,
  FRAMEWORK_DEFINITIONS,
  isValidSectionType,
  SECTION_TYPE_LABELS,
  type FrameworkDefinition,
  type FrameworkId,
  type SectionTypeValue,
} from "./sectionTypes";

export {
  ALL_TYPE_VALUES,
  DEFAULT_FRAMEWORK_ID,
  DEFAULT_TYPE,
  isValidSectionType,
  normalizeHeader,
  suggestSectionType,
} from "./sectionTypes";
export type { FrameworkId, SectionTypeValue } from "./sectionTypes";

export interface SectionTypeMeta {
  label: string;
  color: string;
  icon: SvgIconComponent;
}

/** Presentation for each type; the keys come from the registry. */
const TYPE_PRESENTATION: Record<SectionTypeValue, { color: string; icon: SvgIconComponent }> = {
  instruction: { color: "#e67e22", icon: FormatListBulletedIcon },
  role: { color: "#f7e920", icon: PersonIcon },
  context: { color: "#3498db", icon: LibraryBooksIcon },
  format: { color: "#2ecc71", icon: AbcIcon },
  style: { color: "#9b59b6", icon: BrushIcon },
  task: { color: "#e74c3c", icon: TaskAltIcon },
  constraints: { color: "#fd79a8", icon: RuleIcon },
  output: { color: "#00cec9", icon: OutputIcon },
  goal: { color: "#f39c12", icon: FlagIcon },
  source: { color: "#74b9ff", icon: SourceIcon },
  expectations: { color: "#a29bfe", icon: FactCheckIcon },
  input: { color: "#55efc4", icon: InputIcon },
  steps: { color: "#fab1a0", icon: FormatListNumberedIcon },
  expectation: { color: "#badc58", icon: FactCheckIcon },
  instructions: { color: "#ff9f43", icon: ListAltIcon },
  "end-goal": { color: "#ff7675", icon: SportsScoreIcon },
  narrowing: { color: "#81ecec", icon: FilterAltIcon },
};

export const SECTION_TYPES = ALL_TYPE_VALUES.reduce((types, key) => {
  types[key] = { label: SECTION_TYPE_LABELS[key], ...TYPE_PRESENTATION[key] };
  return types;
}, {} as Record<SectionTypeValue, SectionTypeMeta>);

export type Framework = FrameworkDefinition;

// Not widened to Framework[]: callers rely on the framework ids staying a
// literal union (FrameworkId) rather than plain string.
export const FRAMEWORKS = FRAMEWORK_DEFINITIONS;

export const getTypeMeta = (value: string | undefined): SectionTypeMeta =>
  (value && isValidSectionType(value) ? SECTION_TYPES[value] : SECTION_TYPES[DEFAULT_TYPE]);

export const getTypeLabel = (value: string | undefined): string => getTypeMeta(value).label;

export const getTypeColor = (value: string | undefined): string => getTypeMeta(value).color;

export const getFramework = (id: string): Framework =>
  FRAMEWORKS.find((framework) => framework.id === id) ?? FRAMEWORKS[0];

/** First framework containing the type; Standard is first, so legacy types resolve to Standard */
export const getFrameworkForType = (value: string | undefined): Framework =>
  FRAMEWORKS.find((framework) => (framework.types as readonly string[]).includes(value ?? "")) ?? FRAMEWORKS[0];

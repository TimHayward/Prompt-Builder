/**
 * Framework registry
 * Single source of truth for prompt frameworks and their section/component types.
 * Adding a new framework = add an entry to FRAMEWORKS (plus any new SECTION_TYPES entries).
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

export interface SectionTypeMeta {
  label: string;
  color: string;
  icon: SvgIconComponent;
}

export const SECTION_TYPES = {
  // Legacy values — stored in existing DBs, must not be renamed
  instruction: { label: "Instruction", color: "#e67e22", icon: FormatListBulletedIcon },
  role: { label: "Role", color: "#f7e920", icon: PersonIcon },
  context: { label: "Context", color: "#3498db", icon: LibraryBooksIcon },
  format: { label: "Format", color: "#2ecc71", icon: AbcIcon },
  style: { label: "Style", color: "#9b59b6", icon: BrushIcon },
  // Framework-specific values
  task: { label: "Task", color: "#e74c3c", icon: TaskAltIcon },
  constraints: { label: "Constraints", color: "#fd79a8", icon: RuleIcon },
  output: { label: "Output", color: "#00cec9", icon: OutputIcon },
  goal: { label: "Goal", color: "#f39c12", icon: FlagIcon },
  source: { label: "Source", color: "#74b9ff", icon: SourceIcon },
  expectations: { label: "Expectations", color: "#a29bfe", icon: FactCheckIcon },
  input: { label: "Input", color: "#55efc4", icon: InputIcon },
  steps: { label: "Steps", color: "#fab1a0", icon: FormatListNumberedIcon },
  expectation: { label: "Expectation", color: "#badc58", icon: FactCheckIcon },
  instructions: { label: "Instructions", color: "#ff9f43", icon: ListAltIcon },
  "end-goal": { label: "End Goal", color: "#ff7675", icon: SportsScoreIcon },
  narrowing: { label: "Narrowing", color: "#81ecec", icon: FilterAltIcon },
} as const satisfies Record<string, SectionTypeMeta>;

export type SectionTypeValue = keyof typeof SECTION_TYPES;

export interface Framework {
  id: string;
  label: string;
  /** Ordered as displayed in the Type dropdown */
  types: readonly SectionTypeValue[];
}

export const FRAMEWORKS = [
  { id: "standard", label: "Standard", types: ["instruction", "role", "context", "format", "style"] },
  { id: "rctcso", label: "R-C-T-C-S-O", types: ["role", "context", "task", "constraints", "style", "output"] },
  { id: "gcse", label: "GCSE", types: ["goal", "context", "source", "expectations"] },
  { id: "rise", label: "RISE", types: ["role", "input", "steps", "expectation"] },
  { id: "risen", label: "RISEN", types: ["role", "instructions", "steps", "end-goal", "narrowing"] },
] as const satisfies readonly Framework[];

export type FrameworkId = (typeof FRAMEWORKS)[number]["id"];

export const DEFAULT_FRAMEWORK_ID: FrameworkId = "standard";
export const DEFAULT_TYPE: SectionTypeValue = "instruction";

export const ALL_TYPE_VALUES = Object.keys(SECTION_TYPES) as SectionTypeValue[];

export const isValidSectionType = (value: unknown): value is SectionTypeValue =>
  typeof value === "string" && value in SECTION_TYPES;

export const getTypeMeta = (value: string | undefined): SectionTypeMeta =>
  (value && isValidSectionType(value) ? SECTION_TYPES[value] : SECTION_TYPES[DEFAULT_TYPE]);

export const getTypeLabel = (value: string | undefined): string => getTypeMeta(value).label;

export const getTypeColor = (value: string | undefined): string => getTypeMeta(value).color;

export const getFramework = (id: string): Framework =>
  FRAMEWORKS.find((framework) => framework.id === id) ?? FRAMEWORKS[0];

/** First framework containing the type; Standard is first, so legacy types resolve to Standard */
export const getFrameworkForType = (value: string | undefined): Framework =>
  FRAMEWORKS.find((framework) => (framework.types as readonly string[]).includes(value ?? "")) ?? FRAMEWORKS[0];

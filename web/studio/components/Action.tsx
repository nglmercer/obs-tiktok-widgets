import { t } from "../../shared/i18n";
import { useState, type ComponentType } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  Plus,
  Pencil,
  Copy,
  PanelsTopLeft,
  Code2,
  Paintbrush,
  Eye,
  Rocket,
  Hammer,
  ShieldCheck,
  Play,
  Square,
  RotateCcw,
  Undo2,
  Redo2,
  Download,
  Upload,
  FolderOpen,
  SlidersHorizontal,
  History,
  MonitorUp,
  Trash2,
  CircleHelp,
  RefreshCw,
} from "lucide-react";
const Icons = {
  Plus,
  Pencil,
  Copy,
  PanelsTopLeft,
  Code2,
  Paintbrush,
  Eye,
  Rocket,
  Hammer,
  ShieldCheck,
  Play,
  Square,
  RotateCcw,
  Undo2,
  Redo2,
  Download,
  Upload,
  FolderOpen,
  SlidersHorizontal,
  History,
  MonitorUp,
  Trash2,
  CircleHelp,
  RefreshCw,
};
import registry from "../../shared/actions.json";
export const actions = registry;
export function Action({
  id,
  onClick,
  disabledReason = "",
  primary = false,
}: {
  id: string;
  onClick: () => void;
  disabledReason?: string;
  primary?: boolean;
}) {
  const action = actions.find((a) => a.id === id)!;
  const Icon = Icons[action.icon as keyof typeof Icons] as React.ComponentType<{
    size: number;
  }>;
  const title = [
    t(action.label),
    action.shortcut,
    t(disabledReason || action.description),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <IconButton
      label={t(action.label)}
      title={title}
      icon={Icon}
      onClick={onClick}
      disabled={!!disabledReason}
      showLabel={primary}
      danger={action.isDestructive}
    />
  );
}

export function IconButton({
  label,
  title = label,
  icon: Icon,
  onClick,
  disabled = false,
  showLabel = false,
  danger = false,
}: {
  label: string;
  title?: string;
  icon: ComponentType<{ size: number; "aria-hidden"?: boolean }>;
  onClick: () => void;
  disabled?: boolean;
  showLabel?: boolean;
  danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip.Root
      open={open}
      onOpenChange={setOpen}
      delayDuration={0}
      disableHoverableContent
    >
      <Tooltip.Trigger asChild>
        <span
          className="action-wrap"
          onPointerEnter={() => setOpen(true)}
          onPointerLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          tabIndex={disabled ? 0 : undefined}
          aria-label={disabled ? title : undefined}
        >
          <button
            type="button"
            aria-label={label}
            aria-description={title}
            disabled={disabled}
            onClick={onClick}
            className={danger ? "danger" : ""}
          >
            <Icon size={18} aria-hidden={true} />
            {showLabel && <span>{label}</span>}
          </button>
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={6}>
          {title}
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

import { useState } from "react";
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
  const [open, setOpen] = useState(false);
  const action = actions.find((a) => a.id === id)!;
  const Icon = Icons[action.icon as keyof typeof Icons] as React.ComponentType<{
    size: number;
  }>;
  const title = [
    action.label,
    action.shortcut,
    disabledReason || action.description,
  ]
    .filter(Boolean)
    .join(" · ");
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
          tabIndex={disabledReason ? 0 : undefined}
          aria-label={disabledReason ? title : undefined}
        >
          <button
            type="button"
            aria-label={action.label}
            title={title}
            disabled={!!disabledReason}
            onClick={onClick}
            className={action.isDestructive ? "danger" : ""}
          >
            <Icon size={18} />
            {primary && <span>{action.label}</span>}
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

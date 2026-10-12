import { useStudioProject } from "./features/useStudioProject";
import { StudioShell } from "./components/StudioShell";
export default function App() {
  return <StudioShell controller={useStudioProject()} />;
}

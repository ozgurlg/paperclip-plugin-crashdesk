import { createRoot } from "react-dom/client";
import { CrashdeskDashboardWidget, CrashdeskPage } from "../../src/ui/index.tsx";

const context = { companyId: "c1" } as never;
const widget = new URLSearchParams(location.search).has("widget");

createRoot(document.getElementById("root")!).render(
  widget ? (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)", padding: 20 }}>
        <CrashdeskDashboardWidget context={context} />
      </div>
    </div>
  ) : (
    <CrashdeskPage context={context} />
  ),
);

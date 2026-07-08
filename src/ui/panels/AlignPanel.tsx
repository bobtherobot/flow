import { IconActionGroup, type ActionOption } from "./controls/IconActionGroup";
import type { SelectionStyle } from "./useSelectionStyle";

/** Small inline icon wrapper (18x14, currentColor) matching TextPanel's style. */
function icon(children: React.ReactNode) {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
      {children}
    </svg>
  );
}

const line = (d: string) => (
  <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
);

// Align: a guide line at the target edge + two bars positioned against it.
const ALIGN_LEFT = icon(<>{line("M2 1 V13")}<rect x="3.5" y="3" width="7" height="3" fill="currentColor" /><rect x="3.5" y="8" width="11" height="3" fill="currentColor" /></>);
const ALIGN_HCENTER = icon(<>{line("M9 1 V13")}<rect x="5.5" y="3" width="7" height="3" fill="currentColor" /><rect x="3.5" y="8" width="11" height="3" fill="currentColor" /></>);
const ALIGN_RIGHT = icon(<>{line("M16 1 V13")}<rect x="7.5" y="3" width="7" height="3" fill="currentColor" /><rect x="3.5" y="8" width="11" height="3" fill="currentColor" /></>);
const ALIGN_TOP = icon(<>{line("M1 2 H17")}<rect x="4" y="3.5" width="3" height="7" fill="currentColor" /><rect x="11" y="3.5" width="3" height="9" fill="currentColor" /></>);
const ALIGN_VCENTER = icon(<>{line("M1 7 H17")}<rect x="4" y="3.5" width="3" height="7" fill="currentColor" /><rect x="11" y="2.5" width="3" height="9" fill="currentColor" /></>);
const ALIGN_BOTTOM = icon(<>{line("M1 12 H17")}<rect x="4" y="3.5" width="3" height="7" fill="currentColor" /><rect x="11" y="1.5" width="3" height="9" fill="currentColor" /></>);

// Distribute: three evenly spaced bars along the axis.
const DIST_H = icon(<><rect x="2" y="3" width="2.5" height="8" fill="currentColor" /><rect x="7.75" y="3" width="2.5" height="8" fill="currentColor" /><rect x="13.5" y="3" width="2.5" height="8" fill="currentColor" /></>);
const DIST_V = icon(<><rect x="4" y="2" width="10" height="2.5" fill="currentColor" /><rect x="4" y="5.75" width="10" height="2.5" fill="currentColor" /><rect x="4" y="9.5" width="10" height="2.5" fill="currentColor" /></>);

/**
 * Align panel: align (6) and distribute (2) actions dispatched through the
 * shared executeAction bridge. Align needs >=2 selected, distribute >=3;
 * rows grey out below their threshold. All geometry is Excalidraw's action —
 * flow only dispatches.
 */
export function AlignPanel({ sel }: { sel: SelectionStyle }) {
  const run = (name: string) => () => sel.executeAction(name);

  const alignOptions: ActionOption[] = [
    { key: "left", label: "Align left", icon: ALIGN_LEFT, onClick: run("alignLeft") },
    { key: "hcenter", label: "Align center", icon: ALIGN_HCENTER, onClick: run("alignHorizontallyCentered") },
    { key: "right", label: "Align right", icon: ALIGN_RIGHT, onClick: run("alignRight") },
    { key: "top", label: "Align top", icon: ALIGN_TOP, onClick: run("alignTop") },
    { key: "vcenter", label: "Align middle", icon: ALIGN_VCENTER, onClick: run("alignVerticallyCentered") },
    { key: "bottom", label: "Align bottom", icon: ALIGN_BOTTOM, onClick: run("alignBottom") },
  ];

  const distributeOptions: ActionOption[] = [
    { key: "dh", label: "Distribute horizontally", icon: DIST_H, onClick: run("distributeHorizontally") },
    { key: "dv", label: "Distribute vertically", icon: DIST_V, onClick: run("distributeVertically") },
  ];

  const alignDisabled = sel.selectedCount < 2;
  const distributeDisabled = sel.selectedCount < 3;

  return (
    <div className="flow-align-panel">
      <div className="flow-ctl-row" aria-disabled={alignDisabled || undefined}>
        <span className="flow-ctl-row__label">Align</span>
        <div className="flow-ctl-row__control">
          <IconActionGroup options={alignOptions} ariaLabel="Align" disabled={alignDisabled} />
        </div>
      </div>

      <div className="flow-ctl-row" aria-disabled={distributeDisabled || undefined}>
        <span className="flow-ctl-row__label">Distribute</span>
        <div className="flow-ctl-row__control">
          <IconActionGroup options={distributeOptions} ariaLabel="Distribute" disabled={distributeDisabled} />
        </div>
      </div>
    </div>
  );
}

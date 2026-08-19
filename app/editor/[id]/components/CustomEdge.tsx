import { BaseEdge, type EdgeProps } from "@xyflow/react";
import { useMindMapStore } from "@/store/mindMapStore";
import { THEMES } from "@/app/editor/[id]/lib/themes";

export default function CustomEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps) {
  const canvasTheme = useMindMapStore((s) => s.canvasTheme);
  const edgeColor = THEMES[canvasTheme].edgeColor;

  const STUB = 20;
  const SEGMENT = 9;

  const stubX = sourceX + STUB;

  const mx2 = targetX - SEGMENT;
  const dx = mx2 - stubX;
  const cx1 = stubX + dx / 2;
  const cy1 = sourceY;
  const cx2 = mx2 - dx / 2;
  const cy2 = targetY;

  const d = `M${sourceX},${sourceY} L${stubX},${sourceY} C${cx1},${cy1} ${cx2},${cy2} ${mx2},${targetY} L${targetX},${targetY}`;

  return <BaseEdge path={d} style={{ stroke: edgeColor }} />;
}

export type CanvasTheme = "light" | "dark" | "soft" | "ocean" | "nebula";
export interface ThemeConfig {
  canvasBg: string;
  patternColor: string;
  nodeDefaultBg: string;
  nodeDefaultBorder: string;
  nodeDefaultText: string;
  edgeColor: string;
  miniMapBg: string;
  miniMapNodeDefault: string;
  miniMapMask: string;
  miniMapBorder: string;
}

export const THEMES: Record<CanvasTheme, ThemeConfig> = {
  dark: {
    canvasBg: "#0d1117",
    patternColor: "#21262d",
    nodeDefaultBg: "#161b22",
    nodeDefaultBorder: "#3fb950", // hijau terang tegas sebagai aksen
    nodeDefaultText: "#f0f6fc",
    edgeColor: "#3fb950",
    miniMapBg: "#010409",
    miniMapNodeDefault: "#21262d",
    miniMapMask: "rgba(1, 4, 9, 0.6)",
    miniMapBorder: "#3fb950",
  },
  light: {
    canvasBg: "#ffffff",
    patternColor: "#e8ebef",
    nodeDefaultBg: "#ffffff",
    nodeDefaultBorder: "#1f6feb", // biru tegas
    nodeDefaultText: "#0d1117",
    edgeColor: "#1f6feb",
    miniMapBg: "#f6f8fa",
    miniMapNodeDefault: "#ffffff",
    miniMapMask: "rgba(31, 111, 235, 0.15)",
    miniMapBorder: "#1f6feb",
  },
  soft: {
    canvasBg: "#fdf6ec",
    patternColor: "#f0e2c8",
    nodeDefaultBg: "#fffaf3",
    nodeDefaultBorder: "#d97706", // oranye/amber tegas
    nodeDefaultText: "#2b1d0e",
    edgeColor: "#d97706",
    miniMapBg: "#f5ede1",
    miniMapNodeDefault: "#fffaf3",
    miniMapMask: "rgba(217, 119, 6, 0.2)",
    miniMapBorder: "#d97706",
  },
  ocean: {
    canvasBg: "#071c2e",
    patternColor: "#0d2e47",
    nodeDefaultBg: "#0d2e47",
    nodeDefaultBorder: "#00b4ff", // cyan-biru terang tegas
    nodeDefaultText: "#e8f7ff",
    edgeColor: "#00b4ff",
    miniMapBg: "#040f1a",
    miniMapNodeDefault: "#0d2e47",
    miniMapMask: "rgba(4, 15, 26, 0.6)",
    miniMapBorder: "#00b4ff",
  },
  nebula: {
    canvasBg: "#170f24",
    patternColor: "#281a3d",
    nodeDefaultBg: "#281a3d",
    nodeDefaultBorder: "#c084fc", // ungu terang tegas
    nodeDefaultText: "#f5e9ff",
    edgeColor: "#c084fc",
    miniMapBg: "#0f0918",
    miniMapNodeDefault: "#281a3d",
    miniMapMask: "rgba(15, 9, 24, 0.6)",
    miniMapBorder: "#c084fc",
  },
};

import type { CSSProperties, ReactElement } from "react";

/**
 * Hand-written types for the react-bits component (GradientASCII-JS-CSS).
 * It destructures `dpr`/`style` with no default, so inference makes them
 * required; and React 19 dropped the global JSX namespace, so the return
 * type is spelled out rather than written as JSX.Element.
 */
export interface GradientASCIIProps {
  colors?: string[];
  shape?: "horizon" | "pinch" | "rise" | "eclipse";
  characters?: string;
  cellSize?: number;
  density?: number;
  glyphOpacity?: number;
  glow?: number;
  depthOfField?: number;
  flicker?: number;
  softness?: number;
  scale?: number;
  flow?: number;
  speed?: number;
  gradientOpacity?: number;
  grain?: number;
  variation?: number;
  mouseInteraction?: boolean;
  scrambleRadius?: number;
  clickEffect?: "none" | "wave" | "burst";
  intro?: boolean;
  lightMode?: boolean;
  fontFamily?: string;
  dpr?: number;
  className?: string;
  style?: CSSProperties;
}

declare const GradientASCII: (props: GradientASCIIProps) => ReactElement;
export default GradientASCII;

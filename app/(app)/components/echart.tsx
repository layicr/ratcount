"use client";

import { useEffect, useRef } from "react";
import type { EChartsOption, ECharts } from "echarts";

/**
 * 通用 ECharts 容器（客户端）
 *  - echarts 动态导入，避免在 SSR / 首屏触碰 window/document
 *  - 仅在挂载后 init；optionRef 保证首帧即应用配置
 *  - 监听窗口缩放自动 resize，卸载时 dispose
 */
export function EChart({ option, height = 320 }: { option: EChartsOption; height?: number }) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const optionRef = useRef(option);
  optionRef.current = option;

  useEffect(() => {
    let disposed = false;
    let onResize: (() => void) | undefined;
    import("echarts").then((echarts) => {
      if (disposed || !elRef.current) return;
      const chart = echarts.init(elRef.current);
      chartRef.current = chart;
      chart.setOption(optionRef.current, true);
      onResize = () => chart.resize();
      window.addEventListener("resize", onResize);
    });
    return () => {
      disposed = true;
      if (onResize) window.removeEventListener("resize", onResize);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return <div ref={elRef} style={{ width: "100%", height }} />;
}

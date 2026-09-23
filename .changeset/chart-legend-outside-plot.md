---
'@modern-admin/ui': patch
---

`TimeSeriesChart`: render the legend as plain DOM below the plot instead of Recharts' in-chart `<Legend>`. Wrapped legend rows were subtracted from the chart box, so a chart with many series (a `groupBy` breakdown) collapsed to a few pixels of plot on narrow cards. The legend now stacks under the chart, caps its own height (scrollable, tighter on narrow containers) and keeps click-to-toggle plus hover/focus dimming.

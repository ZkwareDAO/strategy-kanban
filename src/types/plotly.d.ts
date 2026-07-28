declare module 'plotly.js-dist-min' {
  export interface Data {
    x?: (string | number)[]
    y?: (number | null)[]
    open?: number[]
    high?: number[]
    low?: number[]
    close?: number[]
    type: string
    mode?: string
    name?: string
    line?: Record<string, unknown>
    marker?: Record<string, unknown>
    fill?: string
    fillcolor?: string
    xaxis?: string
    yaxis?: string
    showlegend?: boolean
    hoverinfo?: string
    increasing?: Record<string, unknown>
    decreasing?: Record<string, unknown>
  }

  export interface Layout {
    title?: { text: string; font?: { size: number } }
    xaxis?: Record<string, unknown>
    yaxis?: Record<string, unknown>
    grid?: {
      rows: number
      columns: number
      pattern: 'independent' | 'coupled'
      xside?: 'bottom' | 'bottom plot' | 'top plot' | 'top'
      yaxes?: string[]
      roworder?: 'top to bottom' | 'bottom to top'
    }
    height?: number
    margin?: Record<string, number>
    showlegend?: boolean
    legend?: Record<string, unknown>
    dragmode?: 'pan' | 'zoom' | 'select' | 'lasso' | 'orbit' | 'turntable'
    hovermode?: 'x' | 'y' | 'closest' | 'x unified' | 'y unified' | false
  }

  export interface Config {
    responsive?: boolean
    displayModeBar?: boolean
    modeBarButtonsToRemove?: string[]
    scrollZoom?: boolean
    doubleClick?: 'reset' | 'autosize' | 'reset+autosize'
    displaylogo?: boolean
  }

  export function newPlot(
    root: HTMLElement,
    data: Data[],
    layout?: Partial<Layout>,
    config?: Partial<Config>
  ): Promise<void>

  export function purge(root: HTMLElement): void

  const Plotly: {
    newPlot: typeof newPlot
    purge: typeof purge
  }

  export default Plotly
}

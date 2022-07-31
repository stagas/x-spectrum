import $ from 'sigl'

import { dbToFloat, fftLogIndexer } from 'webaudio-tools'

const style = /*css*/ `
:host {
  display: inline-flex;
  outline: none;
  user-select: none;
  touch-action: none;
}

:host([autoresize]) {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

:host([autoresize]) canvas {
  width: 100% !important;
  height: 100% !important;
}

canvas {
  image-rendering: pixelated;
}`

export interface SpectrumElement extends $.Element<SpectrumElement> {}

@$.element()
export class SpectrumElement extends HTMLElement {
  root = $.shadow(this, `<style>${style}</style><canvas></canvas>`)

  @$.attr() autoResize = false

  @$.attr() width = 150
  @$.attr() height = 50
  @$.attr() pixelRatio = window.devicePixelRatio

  @$.attr() minFreq = 62
  @$.attr() maxFreq = 21000

  @$.attr() speed = 0.03
  @$.attr() gravity = 0.05

  @$.attr() background = '#123'
  @$.attr() color = '#1ff'

  analyser?: AnalyserNode
  analyserData?: Float32Array
  getFFTLogIndex?: (normal: number) => number
  gradient?: CanvasGradient
  peakPos?: Float32Array
  peakVel?: Float32Array
  screen?: {
    canvas: HTMLCanvasElement
    ctx: CanvasRenderingContext2D
  }
  gradientColors = {
    '0.3': '#424242',
    '1': '#2f2f2f',
  }
  draw?: () => void
  loop?: {
    start(): void
    stop(): void
  }
  /**
   * Start displaying the spectrum.
   */
  start() {
    this.loop?.start()
  }
  /**
   * Stop displaying the spectrum.
   */
  stop() {
    this.loop?.stop()
  }

  mounted($: this['$']) {
    let animFrame: any

    $.screen = $.reduce(({ root }) => {
      const canvas = root.querySelector('canvas')!
      const ctx = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      })!
      return { canvas, ctx }
    })

    $.effect(({ background, screen: { canvas, ctx }, width, height, pixelRatio }) => {
      const w = width * pixelRatio | 0
      const h = height * pixelRatio | 0
      if (w !== canvas.width || h !== canvas.height) {
        canvas.width = w
        canvas.height = h
        canvas.style.width = width + 'px'
        canvas.style.height = height + 'px'
        ctx.fillStyle = background
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      $.mutate(() => {
        $.peakPos ??= new Float32Array(canvas.width).fill(canvas.height)
        $.peakVel ??= new Float32Array(canvas.width)
      })
    })

    $.gradient = $.reduce(({ screen: { canvas, ctx }, gradientColors }) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
      for (const [key, value] of Object.entries(gradientColors)) {
        gradient.addColorStop(+key, value)
        gradient.addColorStop(+key, value)
      }
      return gradient
    })

    $.draw = $.reduce(({
      analyser,
      analyserData,
      background,
      screen: {
        canvas,
        ctx,
      },
      color,
      getFFTLogIndex,
      gradient,
      gravity,
      peakPos,
      peakVel,
      pixelRatio,
      speed,
    }) =>
      function draw() {
        animFrame = requestAnimationFrame(draw)
        analyser.getFloatFrequencyData(analyserData)

        ctx.fillStyle = background
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        ctx.fillStyle = 'rgba(0,0,0,0.3)'
        ctx.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2)
        const w = 1
        for (let i = 0; i < canvas.width; i++) {
          const ni = i / canvas.width
          const index = getFFTLogIndex(ni)
          const db = analyserData[index]
          const n = dbToFloat(db)
          const h = Math.tanh((n ** 0.33) * 9) * canvas.height
          const top = canvas.height - h

          if (!isFinite(top)) return

          let peak = peakPos[i]
          if (top < peak) {
            peak = peakPos[i] = peak - (peak - top) * speed
            peakVel[i] = 0
          } else {
            peak += peakVel[i]
          }
          if (i > 1 && i < peakPos.length - 1)
            peak = (peakPos[i - 1] + peakPos[i + 1] + peak) * 0.33333
          peakPos[i] = peak
          peakVel[i] += gravity

          // prevents flickering when near silence
          if (peakPos[i] > canvas.height - 1) continue

          ctx.fillStyle = gradient
          ctx.fillRect(i, top | 0, w, h | 0)

          peak |= 0
          ctx.fillStyle = color
          ctx.fillRect(i, peak, w + pixelRatio, pixelRatio)

          ctx.fillStyle = '#000'
          ctx.fillRect(i, peak - pixelRatio, w + pixelRatio, pixelRatio)
          ctx.fillRect(i, peak + pixelRatio * 2, w + pixelRatio, pixelRatio)
        }
      }
    )

    $.analyserData = $.reduce(({ analyser }) => new Float32Array(analyser.frequencyBinCount))

    $.getFFTLogIndex = $.reduce(({ analyser, minFreq, maxFreq }) =>
      fftLogIndexer(
        minFreq,
        maxFreq,
        analyser.context.sampleRate,
        analyser.frequencyBinCount
      )
    )

    $.loop = $.reduce(({ draw }) => ({
      start() {
        animFrame = requestAnimationFrame(draw)
      },
      stop() {
        cancelAnimationFrame(animFrame)
      },
    }))

    $.effect(({ loop }) => {
      loop.start()
      return () => loop.stop()
    })
  }
}

import { useEffect, useRef } from 'react'
import { getPeaks } from '../audio/sourceRepository'
import type { Clip } from '../domain/types'

export function WaveformCanvas({ clip, color, selected }: { clip: Clip; color: string; selected: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const draw = () => {
      const bounds = canvas.getBoundingClientRect()
      const scale = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.floor(bounds.width * scale)); canvas.height = Math.max(1, Math.floor(bounds.height * scale))
      const context = canvas.getContext('2d')
      if (!context) return
      context.scale(scale, scale)
      const width = bounds.width; const height = bounds.height; const center = height / 2
      const peaks = getPeaks(clip.sourceId, clip.sourceStart, clip.duration, Math.max(1, Math.floor(width)))
      context.clearRect(0, 0, width, height)
      context.beginPath(); context.moveTo(0, center)
      for (let index = 0; index < width; index += 1) context.lineTo(index, center + peaks[index * 2] * height * 0.44)
      for (let index = Math.floor(width) - 1; index >= 0; index -= 1) context.lineTo(index, center + peaks[index * 2 + 1] * height * 0.44)
      context.closePath(); context.fillStyle = selected ? '#e5fffb' : color; context.globalAlpha = selected ? 0.96 : 0.82; context.fill()
      context.globalAlpha = 0.34; context.strokeStyle = selected ? '#ffffff' : color; context.lineWidth = 1; context.stroke()
      if (clip.fadeIn > 0) {
        const x = Math.min(width, width * clip.fadeIn / clip.duration)
        context.globalAlpha = 0.9; context.strokeStyle = '#fff'; context.beginPath(); context.moveTo(0, height); context.quadraticCurveTo(x * 0.35, height, x, 2); context.stroke()
      }
      if (clip.fadeOut > 0) {
        const x = Math.max(0, width - width * clip.fadeOut / clip.duration)
        context.globalAlpha = 0.9; context.beginPath(); context.moveTo(x, 2); context.quadraticCurveTo(width - (width - x) * 0.35, height, width, height); context.stroke()
      }
    }
    draw()
    const observer = new ResizeObserver(draw); observer.observe(canvas)
    return () => observer.disconnect()
  }, [clip, color, selected])
  return <canvas ref={ref} className="waveform-canvas" aria-label={`Waveform for ${clip.name}, ${clip.duration.toFixed(2)} seconds`} />
}

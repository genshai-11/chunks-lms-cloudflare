import { useState, useEffect } from 'react'
import { type SpectrumStepBreakdown } from '../metrics/calculate'

export type DynamicAcnPreset = 'v2_completed' | 'v2_fixed49' | 'v1_legacy_probe_avg' | 'custom'

export type DynamicAcnConfig = {
  preset: DynamicAcnPreset
  customFormula?: string
}

export type DynamicAcnInput = {
  spectrum: SpectrumStepBreakdown
  finalizedCount: number
  probedCount: number
  legacyProbeDepthSum: number
  totalItemsCount?: number
}

export type DynamicAcnResult = {
  acn: number
  acnTitle: string
  formulaDescription: string
  activePreset: DynamicAcnPreset
  details: {
    nTotal: number
    nGreen: number
    nBlue: number
    nIndigo: number
    totalN: number
    denominator: number
  }
}

const DEFAULT_CONFIG: DynamicAcnConfig = {
  preset: 'v2_completed',
  customFormula: '(N_total - totalN) / finalized_count'
}

export function calculateDynamicAcn(
  input: DynamicAcnInput,
  config: DynamicAcnConfig
): DynamicAcnResult {
  const { spectrum, finalizedCount, probedCount, legacyProbeDepthSum, totalItemsCount = 49 } = input
  const { preset, customFormula } = config

  const nTotal = spectrum.totalRecords
  const nGreen = spectrum.byColor.green
  const nBlue = spectrum.byColor.blue
  const nIndigo = spectrum.byColor.indigo
  const totalN = nGreen + nBlue + nIndigo
  
  let acn = 0
  let denominator = 1
  let acnTitle = ''
  let formulaDescription = ''

  if (preset === 'v2_completed') {
    denominator = Math.max(finalizedCount, 1)
    acn = finalizedCount > 0 ? (nTotal - totalN) / denominator : 0
    formulaDescription = 'v2: (N_total - Tổng n) / Đã hoàn thành'
    acnTitle = `ACN = (N_total - Tổng n) / Số câu hoàn thành = (${nTotal} - ${totalN}) / ${finalizedCount} = ${(nTotal - totalN)} / ${finalizedCount} = ${acn.toFixed(2)}\n• N_total = ${nTotal} (tổng spectrum steps)\n• Tổng n = ${totalN} (Green: ${nGreen}, Blue: ${nBlue}, Indigo: ${nIndigo})\n• Đã hoàn thành: ${finalizedCount}/${totalItemsCount} câu`
  } else if (preset === 'v2_fixed49') {
    denominator = Math.max(totalItemsCount, 1)
    acn = (nTotal - totalN) / denominator
    formulaDescription = `v2: (N_total - Tổng n) / ${totalItemsCount} câu`
    acnTitle = `ACN = (N_total - Tổng n) / 49 = (${nTotal} - ${totalN}) / ${totalItemsCount} = ${(nTotal - totalN)} / ${totalItemsCount} = ${acn.toFixed(2)}\n• N_total = ${nTotal} (tổng spectrum steps)\n• Tổng n = ${totalN} (Green: ${nGreen}, Blue: ${nBlue}, Indigo: ${nIndigo})\n• Cố định: ${totalItemsCount} câu`
  } else if (preset === 'v1_legacy_probe_avg') {
    denominator = Math.max(probedCount, 1)
    acn = probedCount > 0 ? legacyProbeDepthSum / probedCount : 0
    formulaDescription = 'v1: Probed Depth Avg (Cũ)'
    acnTitle = `ACN (v1 cũ) = Chunks number trung bình của ${probedCount} câu đã probe = ${legacyProbeDepthSum} / ${probedCount} = ${acn.toFixed(2)}\n• N_total = ${nTotal}\n• Tổng n = ${totalN}\n• Đã probe: ${probedCount} câu`
  } else if (preset === 'custom' && customFormula) {
    try {
      const formula = customFormula
        .replace(/N_total/g, nTotal.toString())
        .replace(/totalN/g, totalN.toString())
        .replace(/finalized_count/g, finalizedCount.toString())
        .replace(/n_green/g, nGreen.toString())
        .replace(/n_blue/g, nBlue.toString())
        .replace(/n_indigo/g, nIndigo.toString())

      // Only allow safe math chars: digits, math operators, parens, decimal point, whitespace
      if (!/^[\d+\-*/().\s]+$/.test(formula)) {
        throw new Error('Formula contains unsupported characters')
      }
      // eslint-disable-next-line no-new-func
      const result = new Function(`"use strict"; return (${formula});`)()
      acn = typeof result === 'number' && Number.isFinite(result) ? result : 0
      formulaDescription = 'Custom Formula'
      acnTitle = `ACN (Custom) = ${customFormula} = ${acn.toFixed(2)}\n• N_total = ${nTotal}\n• Tổng n = ${totalN} (Green: ${nGreen}, Blue: ${nBlue}, Indigo: ${nIndigo})\n• Đã hoàn thành: ${finalizedCount} câu`
    } catch {
      acn = 0
      formulaDescription = 'Custom Formula (Error)'
      acnTitle = `Error evaluating custom formula: ${customFormula}\n• N_total = ${nTotal}\n• Tổng n = ${totalN}`
    }
  } else {
    // Default fallback
    denominator = Math.max(finalizedCount, 1)
    acn = finalizedCount > 0 ? (nTotal - totalN) / denominator : 0
    formulaDescription = 'v2: (N_total - Tổng n) / Đã hoàn thành'
    acnTitle = `ACN = (N_total - Tổng n) / Số câu hoàn thành = (${nTotal} - ${totalN}) / ${finalizedCount} = ${(nTotal - totalN)} / ${finalizedCount} = ${acn.toFixed(2)}\n• N_total = ${nTotal} (tổng spectrum steps)\n• Tổng n = ${totalN} (Green: ${nGreen}, Blue: ${nBlue}, Indigo: ${nIndigo})\n• Đã hoàn thành: ${finalizedCount}/${totalItemsCount} câu`
  }

  return {
    acn,
    acnTitle,
    formulaDescription,
    activePreset: preset || 'v2_completed',
    details: {
      nTotal,
      nGreen,
      nBlue,
      nIndigo,
      totalN,
      denominator
    }
  }
}

export function useDynamicAcnConfig() {
  const [config, setConfig] = useState<DynamicAcnConfig>(() => {
    try {
      const stored = localStorage.getItem('chunks_acn_config')
      if (stored) {
        return JSON.parse(stored) as DynamicAcnConfig
      }
    } catch (err) {
      console.warn('Failed to parse dynamic acn config from localStorage', err)
    }
    return DEFAULT_CONFIG
  })

  useEffect(() => {
    try {
      localStorage.setItem('chunks_acn_config', JSON.stringify(config))
    } catch (err) {
      console.warn('Failed to save dynamic acn config to localStorage', err)
    }
  }, [config])

  const setPreset = (preset: DynamicAcnPreset) => {
    setConfig(c => ({ ...c, preset }))
  }

  const setCustomFormula = (customFormula: string) => {
    setConfig(c => ({ ...c, customFormula, preset: 'custom' }))
  }

  const reset = () => {
    setConfig(DEFAULT_CONFIG)
  }

  return {
    config,
    setPreset,
    setCustomFormula,
    reset
  }
}

// HTA Builder service types
export interface HTATemplate {
  id: string
  name: string
  description: string
  category: string
  industry?: string
  complexity: 'simple' | 'medium' | 'complex'
  structure: HTANode[]
  tags: string[]
  isPublic: boolean
  usageCount: number
  createdBy: string
  tenantId: string
  createdAt: string
  updatedAt: string
  metadata: Record<string, any>
}

export interface HTANode {
  id: string
  type: 'objective' | 'strategy' | 'initiative' | 'task' | 'subtask'
  title: string
  description?: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  estimatedHours?: number
  dependencies: string[]
  children: HTANode[]
  metadata: {
    aiGenerated?: boolean
    confidence?: number
    rationale?: string
    tags?: string[]
    skills?: string[]
    resources?: string[]
  }
}

export interface HTAGenerationRequest {
  description: string
  projectType?: string
  industry?: string
  complexity?: 'simple' | 'medium' | 'complex'
  constraints?: {
    maxDepth?: number
    maxChildren?: number
    timeframe?: string
    budget?: number
    teamSize?: number
  }
  preferences?: {
    methodology?: string
    riskTolerance?: 'low' | 'medium' | 'high'
    innovationLevel?: 'conservative' | 'moderate' | 'aggressive'
  }
  existingContext?: {
    templates?: string[]
    similarProjects?: string[]
    organizationalStandards?: string[]
  }
}

export interface HTAGenerationResult {
  structure: HTANode[]
  metadata: {
    confidence: number
    rationale: string
    alternatives: HTANode[][]
    risks: Risk[]
    recommendations: string[]
    estimatedDuration: string
    estimatedCost?: number
    requiredSkills: string[]
    generatedAt: string
    modelUsed: string
    tokensUsed: number
  }
}

export interface Risk {
  id: string
  type: 'technical' | 'resource' | 'timeline' | 'dependency' | 'scope'
  level: 'low' | 'medium' | 'high' | 'critical'
  description: string
  impact: string
  mitigation: string
  probability: number
}

export interface HTAValidationResult {
  isValid: boolean
  issues: ValidationIssue[]
  suggestions: string[]
  score: number
  metrics: {
    depth: number
    breadth: number
    complexity: number
    completeness: number
    feasibility: number
  }
}

export interface ValidationIssue {
  type: 'error' | 'warning' | 'suggestion'
  code: string
  message: string
  nodeId?: string
  severity: 'low' | 'medium' | 'high'
  autoFixable: boolean
}

export interface HTARefinementRequest {
  structure: HTANode[]
  feedback: string
  focusAreas?: string[]
  constraints?: {
    budget?: number
    timeline?: string
    resources?: string[]
  }
}

export interface HTARefinementResult {
  refinedStructure: HTANode[]
  changes: StructureChange[]
  explanation: string
  confidence: number
}

export interface StructureChange {
  type: 'add' | 'remove' | 'modify' | 'reorder'
  nodeId: string
  parentId?: string
  description: string
  rationale: string
}

export interface HTAExportOptions {
  format: 'json' | 'csv' | 'excel' | 'pdf' | 'mpp' | 'gantt'
  includeMetadata: boolean
  includeEstimates: boolean
  flattenHierarchy?: boolean
  customFields?: string[]
}

export interface HTAImportResult {
  structure: HTANode[]
  issues: ValidationIssue[]
  metadata: {
    sourceFormat: string
    importedNodes: number
    skippedNodes: number
    warnings: string[]
  }
}

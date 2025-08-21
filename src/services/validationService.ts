import { HTANode, HTAValidationResult, ValidationIssue } from '../types'
import { logger } from './loggerService'

export class ValidationService {
  
  /**
   * Validate HTA structure comprehensively
   */
  validateHTA(structure: HTANode[]): HTAValidationResult {
    const issues: ValidationIssue[] = []
    const metrics = this.calculateMetrics(structure)
    
    try {
      // Run all validation checks
      this.validateHierarchy(structure, issues)
      this.validateNodeProperties(structure, issues)
      this.validateDependencies(structure, issues)
      this.validateEstimates(structure, issues)
      this.validateCompleteness(structure, issues)
      this.validateFeasibility(structure, issues)
      
      const score = this.calculateScore(issues, metrics)
      const suggestions = this.generateSuggestions(issues, metrics)
      
      const result: HTAValidationResult = {
        isValid: issues.filter(i => i.type === 'error').length === 0,
        issues,
        suggestions,
        score,
        metrics
      }
      
      logger.debug('HTA validation completed', {
        isValid: result.isValid,
        errorCount: issues.filter(i => i.type === 'error').length,
        warningCount: issues.filter(i => i.type === 'warning').length,
        score
      })
      
      return result
    } catch (error) {
      logger.error('HTA validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      
      return {
        isValid: false,
        issues: [{
          type: 'error',
          code: 'VALIDATION_ERROR',
          message: 'Validation process failed',
          severity: 'high',
          autoFixable: false
        }],
        suggestions: ['Please review the structure and try again'],
        score: 0,
        metrics: {
          depth: 0,
          breadth: 0,
          complexity: 0,
          completeness: 0,
          feasibility: 0
        }
      }
    }
  }

  private validateHierarchy(nodes: HTANode[], issues: ValidationIssue[], depth = 0, path = ''): void {
    if (depth > 6) {
      issues.push({
        type: 'warning',
        code: 'EXCESSIVE_DEPTH',
        message: `Hierarchy depth exceeds recommended maximum (6 levels) at path: ${path}`,
        severity: 'medium',
        autoFixable: false
      })
    }

    nodes.forEach((node, index) => {
      const currentPath = path ? `${path}.${index}` : `${index}`
      
      // Validate node type hierarchy
      this.validateNodeTypeHierarchy(node, nodes, issues, currentPath)
      
      // Validate children count
      if (node.children && node.children.length > 8) {
        issues.push({
          type: 'warning',
          code: 'TOO_MANY_CHILDREN',
          message: `Node "${node.title}" has ${node.children.length} children. Consider grouping some tasks.`,
          nodeId: node.id,
          severity: 'medium',
          autoFixable: false
        })
      }
      
      // Recursively validate children
      if (node.children && node.children.length > 0) {
        this.validateHierarchy(node.children, issues, depth + 1, currentPath)
      }
    })
  }

  private validateNodeTypeHierarchy(node: HTANode, siblings: HTANode[], issues: ValidationIssue[], path: string): void {
    const typeHierarchy = ['objective', 'strategy', 'initiative', 'task', 'subtask']
    const currentTypeIndex = typeHierarchy.indexOf(node.type)
    
    if (currentTypeIndex === -1) {
      issues.push({
        type: 'error',
        code: 'INVALID_NODE_TYPE',
        message: `Invalid node type "${node.type}" for node "${node.title}"`,
        nodeId: node.id,
        severity: 'high',
        autoFixable: true
      })
      return
    }
    
    // Check children have appropriate types
    if (node.children) {
      node.children.forEach(child => {
        const childTypeIndex = typeHierarchy.indexOf(child.type)
        if (childTypeIndex !== -1 && childTypeIndex <= currentTypeIndex) {
          issues.push({
            type: 'error',
            code: 'INVALID_HIERARCHY',
            message: `Child node "${child.title}" has type "${child.type}" which should not be under "${node.type}"`,
            nodeId: child.id,
            severity: 'high',
            autoFixable: true
          })
        }
      })
    }
  }

  private validateNodeProperties(nodes: HTANode[], issues: ValidationIssue[]): void {
    this.traverseNodes(nodes, (node) => {
      // Validate required properties
      if (!node.id || node.id.trim() === '') {
        issues.push({
          type: 'error',
          code: 'MISSING_ID',
          message: `Node "${node.title}" is missing a valid ID`,
          nodeId: node.id,
          severity: 'high',
          autoFixable: true
        })
      }
      
      if (!node.title || node.title.trim() === '') {
        issues.push({
          type: 'error',
          code: 'MISSING_TITLE',
          message: `Node with ID "${node.id}" is missing a title`,
          nodeId: node.id,
          severity: 'high',
          autoFixable: false
        })
      }
      
      // Validate title length and quality
      if (node.title && node.title.length > 100) {
        issues.push({
          type: 'warning',
          code: 'LONG_TITLE',
          message: `Title for "${node.title.substring(0, 50)}..." is too long (${node.title.length} chars). Consider shortening.`,
          nodeId: node.id,
          severity: 'low',
          autoFixable: false
        })
      }
      
      if (node.title && node.title.length < 5) {
        issues.push({
          type: 'warning',
          code: 'SHORT_TITLE',
          message: `Title "${node.title}" is very short. Consider being more descriptive.`,
          nodeId: node.id,
          severity: 'low',
          autoFixable: false
        })
      }
      
      // Validate priority
      const validPriorities = ['low', 'medium', 'high', 'critical']
      if (!validPriorities.includes(node.priority)) {
        issues.push({
          type: 'error',
          code: 'INVALID_PRIORITY',
          message: `Node "${node.title}" has invalid priority "${node.priority}"`,
          nodeId: node.id,
          severity: 'medium',
          autoFixable: true
        })
      }
      
      // Validate description
      if (!node.description || node.description.trim() === '') {
        if (['task', 'subtask'].includes(node.type)) {
          issues.push({
            type: 'warning',
            code: 'MISSING_DESCRIPTION',
            message: `${node.type} "${node.title}" should have a description for clarity`,
            nodeId: node.id,
            severity: 'medium',
            autoFixable: false
          })
        }
      }
    })
  }

  private validateDependencies(nodes: HTANode[], issues: ValidationIssue[]): void {
    const allNodeIds = new Set<string>()
    
    // Collect all node IDs
    this.traverseNodes(nodes, (node) => {
      allNodeIds.add(node.id)
    })
    
    // Validate dependencies
    this.traverseNodes(nodes, (node) => {
      if (node.dependencies && node.dependencies.length > 0) {
        node.dependencies.forEach(depId => {
          if (!allNodeIds.has(depId)) {
            issues.push({
              type: 'error',
              code: 'INVALID_DEPENDENCY',
              message: `Node "${node.title}" has dependency on non-existent node "${depId}"`,
              nodeId: node.id,
              severity: 'high',
              autoFixable: true
            })
          }
        })
        
        // Check for circular dependencies
        if (this.hasCircularDependency(node, nodes)) {
          issues.push({
            type: 'error',
            code: 'CIRCULAR_DEPENDENCY',
            message: `Node "${node.title}" has circular dependency`,
            nodeId: node.id,
            severity: 'high',
            autoFixable: false
          })
        }
      }
    })
  }

  private validateEstimates(nodes: HTANode[], issues: ValidationIssue[]): void {
    this.traverseNodes(nodes, (node) => {
      if (node.estimatedHours !== undefined) {
        if (node.estimatedHours < 0) {
          issues.push({
            type: 'error',
            code: 'NEGATIVE_ESTIMATE',
            message: `Node "${node.title}" has negative time estimate`,
            nodeId: node.id,
            severity: 'medium',
            autoFixable: true
          })
        }
        
        if (node.estimatedHours > 1000) {
          issues.push({
            type: 'warning',
            code: 'LARGE_ESTIMATE',
            message: `Node "${node.title}" has very large time estimate (${node.estimatedHours} hours). Consider breaking down.`,
            nodeId: node.id,
            severity: 'medium',
            autoFixable: false
          })
        }
        
        // For leaf nodes (tasks/subtasks), estimate should be reasonable
        if (['task', 'subtask'].includes(node.type) && (!node.children || node.children.length === 0)) {
          if (node.estimatedHours === 0) {
            issues.push({
              type: 'warning',
              code: 'ZERO_ESTIMATE',
              message: `${node.type} "${node.title}" has zero time estimate`,
              nodeId: node.id,
              severity: 'medium',
              autoFixable: false
            })
          }
          
          if (node.estimatedHours > 40) {
            issues.push({
              type: 'warning',
              code: 'LONG_TASK',
              message: `${node.type} "${node.title}" has estimate > 40 hours. Consider breaking down.`,
              nodeId: node.id,
              severity: 'medium',
              autoFixable: false
            })
          }
        }
      } else if (['task', 'subtask'].includes(node.type)) {
        issues.push({
          type: 'warning',
          code: 'MISSING_ESTIMATE',
          message: `${node.type} "${node.title}" is missing time estimate`,
          nodeId: node.id,
          severity: 'medium',
          autoFixable: false
        })
      }
    })
  }

  private validateCompleteness(nodes: HTANode[], issues: ValidationIssue[]): void {
    let leafNodes = 0
    let nodesWithEstimates = 0
    let nodesWithDescriptions = 0
    
    this.traverseNodes(nodes, (node) => {
      if (!node.children || node.children.length === 0) {
        leafNodes++
      }
      
      if (node.estimatedHours !== undefined && node.estimatedHours > 0) {
        nodesWithEstimates++
      }
      
      if (node.description && node.description.trim() !== '') {
        nodesWithDescriptions++
      }
    })
    
    const totalNodes = this.countNodes(nodes)
    const estimateCompleteness = nodesWithEstimates / totalNodes
    const descriptionCompleteness = nodesWithDescriptions / totalNodes
    
    if (estimateCompleteness < 0.7) {
      issues.push({
        type: 'warning',
        code: 'INCOMPLETE_ESTIMATES',
        message: `Only ${Math.round(estimateCompleteness * 100)}% of nodes have time estimates`,
        severity: 'medium',
        autoFixable: false
      })
    }
    
    if (descriptionCompleteness < 0.5) {
      issues.push({
        type: 'warning',
        code: 'INCOMPLETE_DESCRIPTIONS',
        message: `Only ${Math.round(descriptionCompleteness * 100)}% of nodes have descriptions`,
        severity: 'low',
        autoFixable: false
      })
    }
  }

  private validateFeasibility(nodes: HTANode[], issues: ValidationIssue[]): void {
    const totalEstimate = this.calculateTotalEstimate(nodes)
    
    if (totalEstimate > 2000) { // More than 1 person-year
      issues.push({
        type: 'warning',
        code: 'LARGE_PROJECT',
        message: `Total project estimate is ${totalEstimate} hours (${Math.round(totalEstimate / 2000 * 100) / 100} person-years). Consider phase approach.`,
        severity: 'medium',
        autoFixable: false
      })
    }
    
    // Check for unrealistic parallel work
    this.traverseNodes(nodes, (node) => {
      if (node.children && node.children.length > 0) {
        const childEstimates = node.children
          .filter(child => child.estimatedHours)
          .map(child => child.estimatedHours || 0)
        
        const totalChildEstimate = childEstimates.reduce((sum, est) => sum + est, 0)
        const nodeEstimate = node.estimatedHours || 0
        
        if (nodeEstimate > 0 && totalChildEstimate > nodeEstimate * 3) {
          issues.push({
            type: 'warning',
            code: 'UNREALISTIC_BREAKDOWN',
            message: `Node "${node.title}" estimate (${nodeEstimate}h) is much less than sum of children (${totalChildEstimate}h)`,
            nodeId: node.id,
            severity: 'medium',
            autoFixable: false
          })
        }
      }
    })
  }

  private calculateMetrics(nodes: HTANode[]) {
    const depth = this.calculateMaxDepth(nodes)
    const breadth = this.calculateMaxBreadth(nodes)
    const complexity = Math.min(100, (depth * 10) + (breadth * 5))
    
    const totalNodes = this.countNodes(nodes)
    const nodesWithEstimates = this.countNodesWithProperty(nodes, 'estimatedHours')
    const nodesWithDescriptions = this.countNodesWithProperty(nodes, 'description')
    
    const completeness = Math.round(((nodesWithEstimates + nodesWithDescriptions) / (totalNodes * 2)) * 100)
    
    const totalEstimate = this.calculateTotalEstimate(nodes)
    const feasibility = totalEstimate > 0 && totalEstimate < 2000 ? 
      Math.min(100, 100 - (totalEstimate / 50)) : 50
    
    return {
      depth,
      breadth,
      complexity,
      completeness,
      feasibility: Math.round(feasibility)
    }
  }

  private calculateScore(issues: ValidationIssue[], metrics: any): number {
    let score = 100
    
    // Deduct for errors and warnings
    issues.forEach(issue => {
      switch (issue.severity) {
        case 'high':
          score -= issue.type === 'error' ? 15 : 8
          break
        case 'medium':
          score -= issue.type === 'error' ? 10 : 5
          break
        case 'low':
          score -= issue.type === 'error' ? 5 : 2
          break
      }
    })
    
    // Factor in metrics
    score = Math.round((score + metrics.completeness + metrics.feasibility) / 3)
    
    return Math.max(0, Math.min(100, score))
  }

  private generateSuggestions(issues: ValidationIssue[], metrics: any): string[] {
    const suggestions: string[] = []
    
    const errorCount = issues.filter(i => i.type === 'error').length
    const warningCount = issues.filter(i => i.type === 'warning').length
    
    if (errorCount > 0) {
      suggestions.push(`Fix ${errorCount} critical error${errorCount > 1 ? 's' : ''} before proceeding`)
    }
    
    if (warningCount > 5) {
      suggestions.push('Consider addressing multiple warnings to improve structure quality')
    }
    
    if (metrics.depth > 5) {
      suggestions.push('Consider flattening the hierarchy to improve manageability')
    }
    
    if (metrics.breadth > 8) {
      suggestions.push('Group related tasks to reduce cognitive load')
    }
    
    if (metrics.completeness < 70) {
      suggestions.push('Add more time estimates and descriptions for better planning')
    }
    
    if (metrics.feasibility < 60) {
      suggestions.push('Consider breaking the project into phases or reducing scope')
    }
    
    if (suggestions.length === 0) {
      suggestions.push('Structure looks good! Consider reviewing estimates and dependencies.')
    }
    
    return suggestions
  }

  private hasCircularDependency(node: HTANode, allNodes: HTANode[], visited = new Set<string>()): boolean {
    if (visited.has(node.id)) {
      return true
    }
    
    visited.add(node.id)
    
    if (node.dependencies) {
      for (const depId of node.dependencies) {
        const depNode = this.findNodeById(allNodes, depId)
        if (depNode && this.hasCircularDependency(depNode, allNodes, new Set(visited))) {
          return true
        }
      }
    }
    
    return false
  }

  private findNodeById(nodes: HTANode[], id: string): HTANode | null {
    for (const node of nodes) {
      if (node.id === id) {
        return node
      }
      if (node.children) {
        const found = this.findNodeById(node.children, id)
        if (found) return found
      }
    }
    return null
  }

  private traverseNodes(nodes: HTANode[], callback: (node: HTANode) => void): void {
    nodes.forEach(node => {
      callback(node)
      if (node.children) {
        this.traverseNodes(node.children, callback)
      }
    })
  }

  private countNodes(nodes: HTANode[]): number {
    let count = nodes.length
    nodes.forEach(node => {
      if (node.children) {
        count += this.countNodes(node.children)
      }
    })
    return count
  }

  private countNodesWithProperty(nodes: HTANode[], property: keyof HTANode): number {
    let count = 0
    this.traverseNodes(nodes, (node) => {
      if (node[property] !== undefined && node[property] !== null && node[property] !== '') {
        count++
      }
    })
    return count
  }

  private calculateMaxDepth(nodes: HTANode[], currentDepth = 0): number {
    let maxDepth = currentDepth
    
    nodes.forEach(node => {
      if (node.children && node.children.length > 0) {
        const childDepth = this.calculateMaxDepth(node.children, currentDepth + 1)
        maxDepth = Math.max(maxDepth, childDepth)
      }
    })
    
    return maxDepth
  }

  private calculateMaxBreadth(nodes: HTANode[]): number {
    let maxBreadth = nodes.length
    
    nodes.forEach(node => {
      if (node.children && node.children.length > 0) {
        const childBreadth = this.calculateMaxBreadth(node.children)
        maxBreadth = Math.max(maxBreadth, childBreadth)
      }
    })
    
    return maxBreadth
  }

  private calculateTotalEstimate(nodes: HTANode[]): number {
    let total = 0
    this.traverseNodes(nodes, (node) => {
      if (node.estimatedHours && (!node.children || node.children.length === 0)) {
        total += node.estimatedHours
      }
    })
    return total
  }
}

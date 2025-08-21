import OpenAI from 'openai'
import { HTAGenerationRequest, HTAGenerationResult, HTANode, HTARefinementRequest, HTARefinementResult } from '../types'
import { logger } from './loggerService'

export class AIService {
  private openai: OpenAI
  private primaryModel: string
  private fallbackModel: string

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
    this.primaryModel = process.env.PRIMARY_AI_MODEL || 'gpt-4o-mini'
    this.fallbackModel = process.env.FALLBACK_AI_MODEL || 'gpt-3.5-turbo'
  }

  /**
   * Generate HTA structure from description using AI
   */
  async generateHTA(request: HTAGenerationRequest): Promise<HTAGenerationResult> {
    const startTime = Date.now()
    
    try {
      const prompt = this.buildHTAGenerationPrompt(request)
      
      logger.info('Generating HTA structure', {
        description: request.description.substring(0, 100),
        complexity: request.complexity,
        industry: request.industry
      })

      const response = await this.openai.chat.completions.create({
        model: this.primaryModel,
        messages: [
          {
            role: 'system',
            content: this.getHTASystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 8000,
        response_format: { type: 'json_object' }
      })

      const result = this.parseHTAResponse(response.choices[0]?.message?.content || '{}')
      
      const executionTime = Date.now() - startTime
      logger.info('HTA generation completed', {
        tokensUsed: response.usage?.total_tokens || 0,
        executionTime,
        nodeCount: this.countNodes(result.structure)
      })

      return {
        ...result,
        metadata: {
          ...result.metadata,
          generatedAt: new Date().toISOString(),
          modelUsed: this.primaryModel,
          tokensUsed: response.usage?.total_tokens || 0
        }
      }

    } catch (error) {
      logger.error('HTA generation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      // Try fallback model
      try {
        return await this.generateHTAWithFallback(request)
      } catch (fallbackError) {
        logger.error('Fallback HTA generation also failed', {
          error: fallbackError instanceof Error ? fallbackError.message : 'Unknown error'
        })
        throw new Error('AI service unavailable')
      }
    }
  }

  /**
   * Refine existing HTA structure based on feedback
   */
  async refineHTA(request: HTARefinementRequest): Promise<HTARefinementResult> {
    try {
      const prompt = this.buildRefinementPrompt(request)
      
      logger.info('Refining HTA structure', {
        feedback: request.feedback.substring(0, 100),
        nodeCount: this.countNodes(request.structure)
      })

      const response = await this.openai.chat.completions.create({
        model: this.primaryModel,
        messages: [
          {
            role: 'system',
            content: this.getRefinementSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.6,
        max_tokens: 8000,
        response_format: { type: 'json_object' }
      })

      const result = this.parseRefinementResponse(response.choices[0]?.message?.content || '{}')
      
      logger.info('HTA refinement completed', {
        changes: result.changes.length,
        confidence: result.confidence
      })

      return result

    } catch (error) {
      logger.error('HTA refinement failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw new Error('Failed to refine HTA structure')
    }
  }

  /**
   * Generate alternative approaches for the same project
   */
  async generateAlternatives(request: HTAGenerationRequest, count: number = 2): Promise<HTANode[][]> {
    const alternatives: HTANode[][] = []
    
    for (let i = 0; i < count; i++) {
      try {
        const modifiedRequest = {
          ...request,
          preferences: {
            ...request.preferences,
            innovationLevel: i === 0 ? 'conservative' : 'aggressive' as const
          }
        }
        
        const result = await this.generateHTA(modifiedRequest)
        alternatives.push(result.structure)
      } catch (error) {
        logger.warn(`Failed to generate alternative ${i + 1}`, {
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return alternatives
  }

  private async generateHTAWithFallback(request: HTAGenerationRequest): Promise<HTAGenerationResult> {
    const prompt = this.buildHTAGenerationPrompt(request)
    
    const response = await this.openai.chat.completions.create({
      model: this.fallbackModel,
      messages: [
        {
          role: 'system',
          content: this.getHTASystemPrompt()
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 6000,
      response_format: { type: 'json_object' }
    })

    const result = this.parseHTAResponse(response.choices[0]?.message?.content || '{}')
    
    return {
      ...result,
      metadata: {
        ...result.metadata,
        generatedAt: new Date().toISOString(),
        modelUsed: this.fallbackModel,
        tokensUsed: response.usage?.total_tokens || 0
      }
    }
  }

  private buildHTAGenerationPrompt(request: HTAGenerationRequest): string {
    return `Generate a comprehensive Hierarchical Task Analysis (HTA) for the following project:

Project Description: ${request.description}

Requirements:
- Industry: ${request.industry || 'General'}
- Complexity: ${request.complexity || 'medium'}
- Project Type: ${request.projectType || 'Standard'}

Constraints:
${request.constraints ? `
- Max Depth: ${request.constraints.maxDepth || 5} levels
- Max Children per Node: ${request.constraints.maxChildren || 8}
- Timeframe: ${request.constraints.timeframe || 'Not specified'}
- Team Size: ${request.constraints.teamSize || 'Not specified'}
- Budget: ${request.constraints.budget ? `$${request.constraints.budget}` : 'Not specified'}
` : '- No specific constraints provided'}

Preferences:
${request.preferences ? `
- Methodology: ${request.preferences.methodology || 'Standard'}
- Risk Tolerance: ${request.preferences.riskTolerance || 'medium'}
- Innovation Level: ${request.preferences.innovationLevel || 'moderate'}
` : '- Standard preferences'}

Please create a detailed HTA structure that includes:

1. Clear hierarchy from objectives down to actionable tasks
2. Realistic time estimates for each task
3. Dependencies between tasks
4. Priority levels (critical, high, medium, low)
5. Risk assessment and mitigation strategies
6. Required skills and resources

The structure should follow these types in order of hierarchy:
- objective (top level)
- strategy 
- initiative
- task
- subtask (most granular)

Return a JSON object with the following structure:
{
  "structure": [/* array of HTANode objects */],
  "metadata": {
    "confidence": /* 0-100 score */,
    "rationale": "/* explanation of approach */",
    "risks": [/* array of identified risks */],
    "recommendations": [/* array of recommendations */],
    "estimatedDuration": "/* overall project duration */",
    "requiredSkills": [/* array of required skills */]
  }
}

Each HTANode should have:
{
  "id": "unique-id",
  "type": "objective|strategy|initiative|task|subtask",
  "title": "Clear, actionable title",
  "description": "Detailed description",
  "priority": "low|medium|high|critical",
  "estimatedHours": number,
  "dependencies": ["array of node IDs this depends on"],
  "children": [/* nested HTANode objects */],
  "metadata": {
    "aiGenerated": true,
    "confidence": /* 0-100 */,
    "rationale": "Why this is necessary",
    "tags": [/* relevant tags */],
    "skills": [/* required skills */],
    "resources": [/* required resources */]
  }
}`
  }

  private buildRefinementPrompt(request: HTARefinementRequest): string {
    return `Please refine the following HTA structure based on the provided feedback:

Current HTA Structure:
${JSON.stringify(request.structure, null, 2)}

Feedback:
${request.feedback}

Focus Areas:
${request.focusAreas?.join(', ') || 'General improvement'}

Additional Constraints:
${request.constraints ? `
- Budget: ${request.constraints.budget ? `$${request.constraints.budget}` : 'Not specified'}
- Timeline: ${request.constraints.timeline || 'Not specified'}
- Available Resources: ${request.constraints.resources?.join(', ') || 'Not specified'}
` : 'No additional constraints'}

Please analyze the feedback and provide:

1. Refined HTA structure addressing the feedback
2. Detailed explanation of changes made
3. Rationale for each significant modification
4. Confidence score for the refinements

Return a JSON object with:
{
  "refinedStructure": [/* updated HTANode array */],
  "changes": [/* array of StructureChange objects */],
  "explanation": "/* detailed explanation of refinements */",
  "confidence": /* 0-100 confidence score */
}

Each StructureChange should include:
{
  "type": "add|remove|modify|reorder",
  "nodeId": "affected node ID",
  "parentId": "parent node ID if applicable",
  "description": "what was changed",
  "rationale": "why this change was made"
}`
  }

  private getHTASystemPrompt(): string {
    return `You are an expert project manager and organizational strategist specializing in Hierarchical Task Analysis (HTA). Your role is to create comprehensive, actionable work breakdown structures that:

1. Follow proper HTA methodology with clear parent-child relationships
2. Ensure all tasks are SMART (Specific, Measurable, Achievable, Relevant, Time-bound)
3. Include realistic time estimates based on industry standards
4. Identify critical dependencies and potential bottlenecks
5. Consider resource constraints and skill requirements
6. Anticipate risks and provide mitigation strategies

Key principles:
- Each level should have 3-8 children maximum for cognitive clarity
- Tasks should be estimated in hours for granular planning
- Dependencies should be clearly identified to enable critical path analysis
- Priority levels should reflect business impact and urgency
- The structure should be implementable by real teams

Focus on creating structures that enable effective project execution and progress tracking.`
  }

  private getRefinementSystemPrompt(): string {
    return `You are an expert project optimization specialist. Your role is to refine existing HTA structures based on stakeholder feedback, making targeted improvements while maintaining the overall integrity of the plan.

When refining:
1. Carefully analyze the feedback to understand specific concerns
2. Make minimal, targeted changes rather than wholesale restructuring
3. Preserve existing dependencies unless they need modification
4. Maintain realistic time estimates and resource requirements
5. Explain the rationale for each significant change
6. Consider the impact of changes on the overall project timeline

Focus on practical improvements that address real concerns while keeping the structure implementable.`
  }

  private parseHTAResponse(content: string): HTAGenerationResult {
    try {
      const parsed = JSON.parse(content)
      
      // Validate and assign IDs if missing
      if (parsed.structure) {
        this.assignIdsRecursively(parsed.structure)
      }

      return {
        structure: parsed.structure || [],
        metadata: {
          confidence: parsed.metadata?.confidence || 75,
          rationale: parsed.metadata?.rationale || 'Generated using AI analysis',
          alternatives: [],
          risks: parsed.metadata?.risks || [],
          recommendations: parsed.metadata?.recommendations || [],
          estimatedDuration: parsed.metadata?.estimatedDuration || 'To be determined',
          requiredSkills: parsed.metadata?.requiredSkills || [],
          generatedAt: new Date().toISOString(),
          modelUsed: this.primaryModel,
          tokensUsed: 0
        }
      }
    } catch (error) {
      logger.error('Failed to parse HTA response', {
        content: content.substring(0, 500),
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw new Error('Invalid AI response format')
    }
  }

  private parseRefinementResponse(content: string): HTARefinementResult {
    try {
      const parsed = JSON.parse(content)
      
      if (parsed.refinedStructure) {
        this.assignIdsRecursively(parsed.refinedStructure)
      }

      return {
        refinedStructure: parsed.refinedStructure || [],
        changes: parsed.changes || [],
        explanation: parsed.explanation || 'Structure refined based on feedback',
        confidence: parsed.confidence || 75
      }
    } catch (error) {
      logger.error('Failed to parse refinement response', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw new Error('Invalid refinement response format')
    }
  }

  private assignIdsRecursively(nodes: HTANode[], prefix = 'node'): void {
    nodes.forEach((node, index) => {
      if (!node.id) {
        node.id = `${prefix}-${Date.now()}-${index}`
      }
      if (node.children && node.children.length > 0) {
        this.assignIdsRecursively(node.children, `${node.id}-child`)
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
}

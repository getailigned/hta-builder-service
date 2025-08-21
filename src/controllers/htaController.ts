import { Request, Response } from 'express'
import { AIService } from '../services/aiService'
import { TemplateService } from '../services/templateService'
import { ValidationService } from '../services/validationService'
import { HTAGenerationRequest, HTARefinementRequest } from '../types'
import { logger } from '../services/loggerService'
import { z } from 'zod'

const HTAGenerationSchema = z.object({
  description: z.string().min(10).max(5000),
  projectType: z.string().optional(),
  industry: z.string().optional(),
  complexity: z.enum(['simple', 'medium', 'complex']).optional(),
  constraints: z.object({
    maxDepth: z.number().min(1).max(10).optional(),
    maxChildren: z.number().min(2).max(20).optional(),
    timeframe: z.string().optional(),
    budget: z.number().min(0).optional(),
    teamSize: z.number().min(1).optional()
  }).optional(),
  preferences: z.object({
    methodology: z.string().optional(),
    riskTolerance: z.enum(['low', 'medium', 'high']).optional(),
    innovationLevel: z.enum(['conservative', 'moderate', 'aggressive']).optional()
  }).optional(),
  existingContext: z.object({
    templates: z.array(z.string()).optional(),
    similarProjects: z.array(z.string()).optional(),
    organizationalStandards: z.array(z.string()).optional()
  }).optional()
})

const HTARefinementSchema = z.object({
  structure: z.array(z.any()), // HTANode array
  feedback: z.string().min(5).max(2000),
  focusAreas: z.array(z.string()).optional(),
  constraints: z.object({
    budget: z.number().min(0).optional(),
    timeline: z.string().optional(),
    resources: z.array(z.string()).optional()
  }).optional()
})

const TemplateCreateSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().min(10).max(1000),
  category: z.string().min(2).max(50),
  industry: z.string().max(50).optional(),
  complexity: z.enum(['simple', 'medium', 'complex']),
  structure: z.array(z.any()), // HTANode array
  tags: z.array(z.string()).max(20),
  isPublic: z.boolean().default(false)
})

export class HTAController {
  constructor(
    private aiService: AIService,
    private templateService: TemplateService,
    private validationService: ValidationService
  ) {}

  /**
   * Generate HTA structure from description
   */
  generateHTA = async (req: Request, res: Response): Promise<void> => {
    try {
      const validatedRequest = HTAGenerationSchema.parse(req.body)
      const user = (req as any).user

      if (!user) {
        res.status(401).json({ error: 'Authentication required' })
        return
      }

      logger.info('Generating HTA structure', {
        userId: user.userId,
        description: validatedRequest.description.substring(0, 100),
        complexity: validatedRequest.complexity
      })

      const result = await this.aiService.generateHTA(validatedRequest)

      // Validate the generated structure
      const validation = this.validationService.validateHTA(result.structure)

      res.json({
        success: true,
        data: {
          ...result,
          validation
        }
      })

    } catch (error) {
      logger.error('HTA generation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Invalid request parameters',
          details: error.errors
        })
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to generate HTA structure'
        })
      }
    }
  }

  /**
   * Refine existing HTA structure
   */
  refineHTA = async (req: Request, res: Response): Promise<void> => {
    try {
      const validatedRequest = HTARefinementSchema.parse(req.body)
      const user = (req as any).user

      if (!user) {
        res.status(401).json({ error: 'Authentication required' })
        return
      }

      logger.info('Refining HTA structure', {
        userId: user.userId,
        feedback: validatedRequest.feedback.substring(0, 100)
      })

      const result = await this.aiService.refineHTA(validatedRequest)

      // Validate the refined structure
      const validation = this.validationService.validateHTA(result.refinedStructure)

      res.json({
        success: true,
        data: {
          ...result,
          validation
        }
      })

    } catch (error) {
      logger.error('HTA refinement failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Invalid request parameters',
          details: error.errors
        })
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to refine HTA structure'
        })
      }
    }
  }

  /**
   * Validate HTA structure
   */
  validateHTA = async (req: Request, res: Response): Promise<void> => {
    try {
      const { structure } = req.body
      const user = (req as any).user

      if (!user) {
        res.status(401).json({ error: 'Authentication required' })
        return
      }

      if (!structure || !Array.isArray(structure)) {
        res.status(400).json({
          success: false,
          error: 'Valid structure array is required'
        })
        return
      }

      const validation = this.validationService.validateHTA(structure)

      res.json({
        success: true,
        data: validation
      })

    } catch (error) {
      logger.error('HTA validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      res.status(500).json({
        success: false,
        error: 'Failed to validate HTA structure'
      })
    }
  }

  /**
   * Generate alternatives for the same project
   */
  generateAlternatives = async (req: Request, res: Response): Promise<void> => {
    try {
      const validatedRequest = HTAGenerationSchema.parse(req.body)
      const { count = 2 } = req.query
      const user = (req as any).user

      if (!user) {
        res.status(401).json({ error: 'Authentication required' })
        return
      }

      const alternativeCount = Math.min(parseInt(count as string) || 2, 5)

      logger.info('Generating HTA alternatives', {
        userId: user.userId,
        count: alternativeCount
      })

      const alternatives = await this.aiService.generateAlternatives(validatedRequest, alternativeCount)

      res.json({
        success: true,
        data: {
          alternatives,
          count: alternatives.length
        }
      })

    } catch (error) {
      logger.error('HTA alternatives generation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      res.status(500).json({
        success: false,
        error: 'Failed to generate alternatives'
      })
    }
  }

  /**
   * Create template from HTA structure
   */
  createTemplate = async (req: Request, res: Response): Promise<void> => {
    try {
      const validatedRequest = TemplateCreateSchema.parse(req.body)
      const user = (req as any).user

      if (!user) {
        res.status(401).json({ error: 'Authentication required' })
        return
      }

      // Validate structure before creating template
      const validation = this.validationService.validateHTA(validatedRequest.structure)
      
      if (!validation.isValid) {
        res.status(400).json({
          success: false,
          error: 'Structure has validation errors',
          details: validation.issues.filter(i => i.type === 'error')
        })
        return
      }

      const template = await this.templateService.createTemplate({
        ...validatedRequest,
        createdBy: user.userId,
        tenantId: user.tenantId,
        metadata: {
          validationScore: validation.score,
          nodeCount: this.countNodes(validatedRequest.structure),
          createdFromGeneration: true
        }
      })

      logger.info('HTA template created', {
        templateId: template.id,
        userId: user.userId,
        name: template.name
      })

      res.json({
        success: true,
        data: template
      })

    } catch (error) {
      logger.error('Template creation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Invalid template parameters',
          details: error.errors
        })
      } else {
        res.status(500).json({
          success: false,
          error: 'Failed to create template'
        })
      }
    }
  }

  /**
   * Get all templates
   */
  getTemplates = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = (req as any).user
      const {
        category,
        industry,
        complexity,
        tags,
        query,
        includePublic = 'true',
        limit = '20',
        offset = '0'
      } = req.query

      if (!user) {
        res.status(401).json({ error: 'Authentication required' })
        return
      }

      const filters = {
        tenantId: user.tenantId,
        category: category as string,
        industry: industry as string,
        complexity: complexity as 'simple' | 'medium' | 'complex',
        tags: tags ? (tags as string).split(',') : undefined,
        query: query as string,
        includePublic: includePublic === 'true',
        limit: parseInt(limit as string),
        offset: parseInt(offset as string)
      }

      const result = await this.templateService.searchTemplates(filters)

      res.json({
        success: true,
        data: result
      })

    } catch (error) {
      logger.error('Template search failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve templates'
      })
    }
  }

  /**
   * Get template by ID
   */
  getTemplate = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params
      const user = (req as any).user

      if (!user) {
        res.status(401).json({ error: 'Authentication required' })
        return
      }

      const template = await this.templateService.getTemplate(id, user.tenantId)

      if (!template) {
        res.status(404).json({
          success: false,
          error: 'Template not found'
        })
        return
      }

      // Increment usage count
      await this.templateService.incrementUsage(id)

      res.json({
        success: true,
        data: template
      })

    } catch (error) {
      logger.error('Template retrieval failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve template'
      })
    }
  }

  /**
   * Health check endpoint
   */
  health = async (req: Request, res: Response): Promise<void> => {
    try {
      res.json({
        status: 'healthy',
        service: 'hta-builder-service',
        timestamp: new Date().toISOString(),
        features: {
          aiGeneration: true,
          templateManagement: true,
          validation: true,
          refinement: true
        }
      })

    } catch (error) {
      logger.error('Health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      res.status(503).json({
        status: 'unhealthy',
        service: 'hta-builder-service',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  private countNodes(nodes: any[]): number {
    let count = nodes.length
    nodes.forEach(node => {
      if (node.children) {
        count += this.countNodes(node.children)
      }
    })
    return count
  }
}

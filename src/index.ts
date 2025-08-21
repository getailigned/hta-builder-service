import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'

import { AIService } from './services/aiService'
import { TemplateService } from './services/templateService'
import { ValidationService } from './services/validationService'
import { HTAController } from './controllers/htaController'
import { authMiddleware, requireRole } from './middleware/authMiddleware'
import { logger } from './services/loggerService'

// Load environment variables
dotenv.config()

class HTABuilderServiceApp {
  private app: express.Application
  private aiService: AIService
  private templateService: TemplateService
  private validationService: ValidationService
  private htaController: HTAController
  private port: number

  constructor() {
    this.port = parseInt(process.env.PORT || '3007')
    this.app = express()

    // Initialize services
    this.aiService = new AIService()
    this.templateService = new TemplateService()
    this.validationService = new ValidationService()
    this.htaController = new HTAController(
      this.aiService,
      this.templateService,
      this.validationService
    )

    this.setupMiddleware()
    this.setupRoutes()
  }

  private setupMiddleware(): void {
    this.app.use(helmet())
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || "http://localhost:3000",
      credentials: true
    }))
    this.app.use(express.json({ limit: '50mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }))

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      })
      next()
    })
  }

  private setupRoutes(): void {
    // Public health check
    this.app.get('/health', this.htaController.health)

    // API routes with authentication
    const apiRouter = express.Router()
    
    // Apply authentication to all API routes
    apiRouter.use(authMiddleware)

    // HTA Generation endpoints
    apiRouter.post('/generate', this.htaController.generateHTA)
    apiRouter.post('/refine', this.htaController.refineHTA)
    apiRouter.post('/validate', this.htaController.validateHTA)
    apiRouter.post('/alternatives', this.htaController.generateAlternatives)

    // Template management endpoints
    apiRouter.post('/templates', this.htaController.createTemplate)
    apiRouter.get('/templates', this.htaController.getTemplates)
    apiRouter.get('/templates/:id', this.htaController.getTemplate)

    // Admin endpoints for template management
    apiRouter.put('/templates/:id', 
      requireRole(['admin', 'CEO', 'President', 'VP', 'Director']), 
      this.updateTemplate
    )
    apiRouter.delete('/templates/:id', 
      requireRole(['admin', 'CEO', 'President']), 
      this.deleteTemplate
    )

    // Mount API router
    this.app.use('/api', apiRouter)

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found'
      })
    })

    // Error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method
      })

      res.status(500).json({
        success: false,
        error: 'Internal server error'
      })
    })
  }

  /**
   * Update template endpoint
   */
  private updateTemplate = async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { id } = req.params
      const updates = req.body
      const user = (req as any).user

      if (!user) {
        res.status(401).json({ error: 'Authentication required' })
        return
      }

      const template = await this.templateService.updateTemplate(id, updates, user.tenantId)

      if (!template) {
        res.status(404).json({
          success: false,
          error: 'Template not found or access denied'
        })
        return
      }

      res.json({
        success: true,
        data: template
      })

    } catch (error) {
      logger.error('Template update failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      res.status(500).json({
        success: false,
        error: 'Failed to update template'
      })
    }
  }

  /**
   * Delete template endpoint
   */
  private deleteTemplate = async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const { id } = req.params
      const user = (req as any).user

      if (!user) {
        res.status(401).json({ error: 'Authentication required' })
        return
      }

      const deleted = await this.templateService.deleteTemplate(id, user.tenantId)

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Template not found or access denied'
        })
        return
      }

      res.json({
        success: true,
        message: 'Template deleted successfully'
      })

    } catch (error) {
      logger.error('Template deletion failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      res.status(500).json({
        success: false,
        error: 'Failed to delete template'
      })
    }
  }

  async start(): Promise<void> {
    try {
      // Start HTTP server
      this.app.listen(this.port, () => {
        logger.info(`HTA Builder service started on port ${this.port}`)
      })

      // Setup graceful shutdown
      this.setupGracefulShutdown()

    } catch (error) {
      logger.error('Failed to start HTA Builder service', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      process.exit(1)
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`)
      
      try {
        // Close database connections
        await this.templateService.close()
        
        logger.info('HTA Builder service shut down')
        process.exit(0)
      } catch (error) {
        logger.error('Error during shutdown', {
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        process.exit(1)
      }
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  }
}

// Start the service
const service = new HTABuilderServiceApp()
service.start().catch((error) => {
  logger.error('Failed to start service', {
    error: error instanceof Error ? error.message : 'Unknown error'
  })
  process.exit(1)
})

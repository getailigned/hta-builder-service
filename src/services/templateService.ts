import { Pool } from 'pg'
import { HTATemplate, HTANode } from '../types'
import { logger } from './loggerService'
import { v4 as uuidv4 } from 'uuid'

export class TemplateService {
  private db: Pool

  constructor() {
    this.db = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/htma',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
  }

  /**
   * Create a new HTA template
   */
  async createTemplate(template: Omit<HTATemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>): Promise<HTATemplate> {
    const client = await this.db.connect()
    
    try {
      const id = uuidv4()
      const now = new Date().toISOString()
      
      const query = `
        INSERT INTO hta_templates (
          id, name, description, category, industry, complexity, 
          structure, tags, is_public, created_by, tenant_id, 
          created_at, updated_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `
      
      const values = [
        id,
        template.name,
        template.description,
        template.category,
        template.industry,
        template.complexity,
        JSON.stringify(template.structure),
        template.tags,
        template.isPublic,
        template.createdBy,
        template.tenantId,
        now,
        now,
        JSON.stringify(template.metadata)
      ]
      
      const result = await client.query(query, values)
      const created = this.mapRowToTemplate(result.rows[0])
      
      logger.info('HTA template created', {
        templateId: id,
        name: template.name,
        category: template.category
      })
      
      return created
    } finally {
      client.release()
    }
  }

  /**
   * Get template by ID
   */
  async getTemplate(id: string, tenantId: string): Promise<HTATemplate | null> {
    const client = await this.db.connect()
    
    try {
      const query = `
        SELECT * FROM hta_templates 
        WHERE id = $1 AND (tenant_id = $2 OR is_public = true)
      `
      
      const result = await client.query(query, [id, tenantId])
      
      if (result.rows.length === 0) {
        return null
      }
      
      return this.mapRowToTemplate(result.rows[0])
    } finally {
      client.release()
    }
  }

  /**
   * Search templates with filters
   */
  async searchTemplates(filters: {
    tenantId: string
    category?: string
    industry?: string
    complexity?: string
    tags?: string[]
    query?: string
    includePublic?: boolean
    limit?: number
    offset?: number
  }): Promise<{ templates: HTATemplate[], total: number }> {
    const client = await this.db.connect()
    
    try {
      let whereConditions = []
      let queryParams: any[] = []
      let paramIndex = 1

      // Tenant and public filter
      if (filters.includePublic !== false) {
        whereConditions.push(`(tenant_id = $${paramIndex} OR is_public = true)`)
      } else {
        whereConditions.push(`tenant_id = $${paramIndex}`)
      }
      queryParams.push(filters.tenantId)
      paramIndex++

      // Category filter
      if (filters.category) {
        whereConditions.push(`category = $${paramIndex}`)
        queryParams.push(filters.category)
        paramIndex++
      }

      // Industry filter
      if (filters.industry) {
        whereConditions.push(`industry = $${paramIndex}`)
        queryParams.push(filters.industry)
        paramIndex++
      }

      // Complexity filter
      if (filters.complexity) {
        whereConditions.push(`complexity = $${paramIndex}`)
        queryParams.push(filters.complexity)
        paramIndex++
      }

      // Tags filter
      if (filters.tags && filters.tags.length > 0) {
        whereConditions.push(`tags && $${paramIndex}`)
        queryParams.push(filters.tags)
        paramIndex++
      }

      // Text search
      if (filters.query) {
        whereConditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`)
        queryParams.push(`%${filters.query}%`)
        paramIndex++
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''
      
      // Count query
      const countQuery = `
        SELECT COUNT(*) as total FROM hta_templates ${whereClause}
      `
      const countResult = await client.query(countQuery, queryParams)
      const total = parseInt(countResult.rows[0].total)

      // Main query with pagination
      const limit = filters.limit || 20
      const offset = filters.offset || 0
      
      const query = `
        SELECT * FROM hta_templates 
        ${whereClause}
        ORDER BY usage_count DESC, created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `
      queryParams.push(limit, offset)
      
      const result = await client.query(query, queryParams)
      const templates = result.rows.map(row => this.mapRowToTemplate(row))
      
      return { templates, total }
    } finally {
      client.release()
    }
  }

  /**
   * Update template
   */
  async updateTemplate(id: string, updates: Partial<HTATemplate>, tenantId: string): Promise<HTATemplate | null> {
    const client = await this.db.connect()
    
    try {
      const setClauses: string[] = []
      const queryParams: any[] = []
      let paramIndex = 1

      if (updates.name !== undefined) {
        setClauses.push(`name = $${paramIndex}`)
        queryParams.push(updates.name)
        paramIndex++
      }

      if (updates.description !== undefined) {
        setClauses.push(`description = $${paramIndex}`)
        queryParams.push(updates.description)
        paramIndex++
      }

      if (updates.category !== undefined) {
        setClauses.push(`category = $${paramIndex}`)
        queryParams.push(updates.category)
        paramIndex++
      }

      if (updates.industry !== undefined) {
        setClauses.push(`industry = $${paramIndex}`)
        queryParams.push(updates.industry)
        paramIndex++
      }

      if (updates.complexity !== undefined) {
        setClauses.push(`complexity = $${paramIndex}`)
        queryParams.push(updates.complexity)
        paramIndex++
      }

      if (updates.structure !== undefined) {
        setClauses.push(`structure = $${paramIndex}`)
        queryParams.push(JSON.stringify(updates.structure))
        paramIndex++
      }

      if (updates.tags !== undefined) {
        setClauses.push(`tags = $${paramIndex}`)
        queryParams.push(updates.tags)
        paramIndex++
      }

      if (updates.isPublic !== undefined) {
        setClauses.push(`is_public = $${paramIndex}`)
        queryParams.push(updates.isPublic)
        paramIndex++
      }

      if (updates.metadata !== undefined) {
        setClauses.push(`metadata = $${paramIndex}`)
        queryParams.push(JSON.stringify(updates.metadata))
        paramIndex++
      }

      if (setClauses.length === 0) {
        throw new Error('No updates provided')
      }

      setClauses.push(`updated_at = $${paramIndex}`)
      queryParams.push(new Date().toISOString())
      paramIndex++

      const query = `
        UPDATE hta_templates 
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
        RETURNING *
      `
      queryParams.push(id, tenantId)
      
      const result = await client.query(query, queryParams)
      
      if (result.rows.length === 0) {
        return null
      }
      
      logger.info('HTA template updated', { templateId: id })
      return this.mapRowToTemplate(result.rows[0])
    } finally {
      client.release()
    }
  }

  /**
   * Delete template
   */
  async deleteTemplate(id: string, tenantId: string): Promise<boolean> {
    const client = await this.db.connect()
    
    try {
      const query = `
        DELETE FROM hta_templates 
        WHERE id = $1 AND tenant_id = $2
      `
      
      const result = await client.query(query, [id, tenantId])
      
      if (result.rowCount && result.rowCount > 0) {
        logger.info('HTA template deleted', { templateId: id })
        return true
      }
      
      return false
    } finally {
      client.release()
    }
  }

  /**
   * Increment template usage count
   */
  async incrementUsage(id: string): Promise<void> {
    const client = await this.db.connect()
    
    try {
      const query = `
        UPDATE hta_templates 
        SET usage_count = usage_count + 1
        WHERE id = $1
      `
      
      await client.query(query, [id])
      
      logger.debug('Template usage incremented', { templateId: id })
    } finally {
      client.release()
    }
  }

  /**
   * Get popular templates
   */
  async getPopularTemplates(tenantId: string, limit: number = 10): Promise<HTATemplate[]> {
    const client = await this.db.connect()
    
    try {
      const query = `
        SELECT * FROM hta_templates 
        WHERE tenant_id = $1 OR is_public = true
        ORDER BY usage_count DESC, created_at DESC
        LIMIT $2
      `
      
      const result = await client.query(query, [tenantId, limit])
      return result.rows.map(row => this.mapRowToTemplate(row))
    } finally {
      client.release()
    }
  }

  /**
   * Get templates by category
   */
  async getTemplatesByCategory(tenantId: string): Promise<Record<string, HTATemplate[]>> {
    const client = await this.db.connect()
    
    try {
      const query = `
        SELECT * FROM hta_templates 
        WHERE tenant_id = $1 OR is_public = true
        ORDER BY category, usage_count DESC
      `
      
      const result = await client.query(query, [tenantId])
      const templates = result.rows.map(row => this.mapRowToTemplate(row))
      
      const categorized: Record<string, HTATemplate[]> = {}
      templates.forEach(template => {
        if (!categorized[template.category]) {
          categorized[template.category] = []
        }
        categorized[template.category].push(template)
      })
      
      return categorized
    } finally {
      client.release()
    }
  }

  /**
   * Create template from existing HTA structure
   */
  async createTemplateFromStructure(
    structure: HTANode[],
    metadata: {
      name: string
      description: string
      category: string
      industry?: string
      complexity: 'simple' | 'medium' | 'complex'
      tags: string[]
      isPublic: boolean
      createdBy: string
      tenantId: string
    }
  ): Promise<HTATemplate> {
    // Clean the structure for template use
    const cleanedStructure = this.cleanStructureForTemplate(structure)
    
    const template: Omit<HTATemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'> = {
      ...metadata,
      structure: cleanedStructure,
      metadata: {
        originalNodeCount: this.countNodes(structure),
        templateNodeCount: this.countNodes(cleanedStructure),
        createdFromProject: true
      }
    }
    
    return await this.createTemplate(template)
  }

  private cleanStructureForTemplate(nodes: HTANode[]): HTANode[] {
    return nodes.map(node => ({
      ...node,
      id: this.generateTemplateNodeId(node.type),
      dependencies: [], // Clear dependencies for template
      metadata: {
        ...node.metadata,
        aiGenerated: false,
        isTemplate: true
      },
      children: node.children ? this.cleanStructureForTemplate(node.children) : []
    }))
  }

  private generateTemplateNodeId(type: string): string {
    return `template-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
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

  private mapRowToTemplate(row: any): HTATemplate {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      industry: row.industry,
      complexity: row.complexity,
      structure: row.structure,
      tags: row.tags || [],
      isPublic: row.is_public,
      usageCount: row.usage_count || 0,
      createdBy: row.created_by,
      tenantId: row.tenant_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata || {}
    }
  }

  async close(): Promise<void> {
    await this.db.end()
    logger.info('Template service database connection closed')
  }
}

/**
 * Platform Knowledge Base Service
 *
 * Provides search and retrieval of platform documentation, FAQs,
 * troubleshooting guides, and feature information for Customer Support agents.
 *
 * Features:
 * - Documentation search with relevance ranking
 * - FAQ retrieval
 * - Troubleshooting guides
 * - Feature explanations
 * - Best practices
 * - Version-specific information
 */

export interface KnowledgeSearchQuery {
  query: string;
  category?: 'all' | 'docs' | 'faq' | 'troubleshooting' | 'features' | 'api' | 'billing';
  searchDepth?: 'basic' | 'comprehensive';
  limit?: number;
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  category: string;
  content: string;
  tags: string[];
  relevanceScore: number;
  lastUpdated: Date;
  relatedArticles?: string[];
}

export interface KnowledgeSearchResult {
  articles: KnowledgeArticle[];
  totalResults: number;
  searchTime: number;
  suggestions: string[];
}

export class PlatformKnowledgeBase {
  private knowledgeBase: Map<string, KnowledgeArticle[]> = new Map();
  private faqDatabase: Map<string, string> = new Map();
  private featureIndex: Map<string, any> = new Map();

  constructor() {
    this.initializeKnowledgeBase();
  }

  /**
   * Search the knowledge base
   */
  async search(query: KnowledgeSearchQuery): Promise<KnowledgeSearchResult> {
    const startTime = Date.now();
    const category = query.category || 'all';
    const searchDepth = query.searchDepth || 'basic';
    const limit = query.limit || 10;

    console.log(`[PlatformKB] Searching: "${query.query}" in ${category}`);

    // Search across categories
    let results: KnowledgeArticle[] = [];

    if (category === 'all' || category === 'docs') {
      results.push(...this.searchDocumentation(query.query));
    }

    if (category === 'all' || category === 'faq') {
      results.push(...this.searchFAQ(query.query));
    }

    if (category === 'all' || category === 'troubleshooting') {
      results.push(...this.searchTroubleshooting(query.query));
    }

    if (category === 'all' || category === 'features') {
      results.push(...this.searchFeatures(query.query));
    }

    if (category === 'all' || category === 'billing') {
      results.push(...this.searchBilling(query.query));
    }

    // Rank by relevance
    results = this.rankResults(results, query.query);

    // Apply limit
    const limitedResults = results.slice(0, limit);

    // Generate suggestions
    const suggestions = this.generateSuggestions(query.query, results);

    const searchTime = Date.now() - startTime;

    return {
      articles: limitedResults,
      totalResults: results.length,
      searchTime,
      suggestions
    };
  }

  /**
   * Get a specific article by ID
   */
  async getArticle(articleId: string): Promise<KnowledgeArticle | null> {
    for (const [category, articles] of this.knowledgeBase.entries()) {
      const article = articles.find(a => a.id === articleId);
      if (article) {
        return article;
      }
    }
    return null;
  }

  /**
   * Get FAQ by category
   */
  async getFAQsByCategory(category: string): Promise<Array<{ question: string; answer: string }>> {
    const faqs: Array<{ question: string; answer: string }> = [];

    for (const [question, answer] of this.faqDatabase.entries()) {
      if (question.toLowerCase().includes(category.toLowerCase())) {
        faqs.push({ question, answer });
      }
    }

    return faqs;
  }

  /**
   * Get troubleshooting guide
   */
  async getTroubleshootingGuide(issue: string): Promise<KnowledgeArticle | null> {
    const troubleshootingArticles = this.knowledgeBase.get('troubleshooting') || [];

    for (const article of troubleshootingArticles) {
      if (article.title.toLowerCase().includes(issue.toLowerCase()) ||
          article.tags.some(tag => tag.toLowerCase().includes(issue.toLowerCase()))) {
        return article;
      }
    }

    return null;
  }

  // ==========================================
  // PRIVATE METHODS
  // ==========================================

  private initializeKnowledgeBase(): void {
    // Documentation
    this.knowledgeBase.set('docs', [
      {
        id: 'doc_001',
        title: 'Getting Started with ChimariData',
        category: 'docs',
        content: `ChimariData is a comprehensive data analysis platform with AI-guided workflows.

**Quick Start**:
1. Create a project with your objectives
2. Upload your data (CSV, Excel, or connect to databases)
3. Choose your journey type (AI-Guided, Template-Based, Self-Service, or Consultation)
4. Let our agents guide you through analysis

**Journey Types**:
- **AI-Guided**: Full agent orchestration for non-technical users
- **Template-Based**: Pre-built industry templates for common analyses
- **Self-Service**: Full control for technical users
- **Consultation**: Expert-assisted custom analysis`,
        tags: ['getting-started', 'onboarding', 'basics', 'journey-types'],
        relevanceScore: 0,
        lastUpdated: new Date('2025-10-20'),
        relatedArticles: ['doc_002', 'doc_003']
      },
      {
        id: 'doc_002',
        title: 'User Journey Types Explained',
        category: 'docs',
        content: `Each journey type is designed for different user expertise levels:

**AI-Guided Journey**: Best for business users without technical background
- Automated analysis recommendations
- Plain-language insights
- Interactive agent support
- No coding required

**Template-Based Journey**: For business analysts
- Industry-specific templates (HR, Finance, Healthcare, Retail, etc.)
- Pre-configured analysis workflows
- Customizable reports
- Moderate technical knowledge helpful

**Self-Service Journey**: For data scientists and analysts
- Full control over analysis
- Code generation (Python/R)
- Advanced statistical methods
- ML model development

**Consultation Journey**: For complex or custom projects
- Expert consultation
- Custom methodology design
- Strategic advisory
- Highest level of customization`,
        tags: ['journeys', 'ai-guided', 'template', 'self-service', 'consultation'],
        relevanceScore: 0,
        lastUpdated: new Date('2025-10-20'),
        relatedArticles: ['doc_001', 'doc_005']
      },
      {
        id: 'doc_003',
        title: 'Data Upload and Connection Guide',
        category: 'docs',
        content: `Upload data or connect to various sources:

**File Uploads**:
- CSV files (automatic encoding detection)
- Excel files (supports multiple sheets)
- JSON/JSONL files
- Parquet files

**Database Connections**:
- SQL databases (PostgreSQL, MySQL, SQL Server)
- NoSQL databases (MongoDB, DynamoDB)
- Cloud data warehouses (Snowflake, BigQuery, Redshift)

**API Connections**:
- REST APIs with authentication
- GraphQL endpoints
- WebSocket streaming data

**Cloud Storage**:
- AWS S3
- Azure Blob Storage
- Google Cloud Storage

**PII Detection**: Automatically scans for sensitive data and offers anonymization.`,
        tags: ['data-upload', 'connections', 'databases', 'api', 'cloud-storage'],
        relevanceScore: 0,
        lastUpdated: new Date('2025-10-22'),
        relatedArticles: ['doc_001', 'faq_003']
      },
      {
        id: 'doc_004',
        title: 'Analysis Types and Capabilities',
        category: 'docs',
        content: `ChimariData supports comprehensive analysis types:

**Statistical Analysis**:
- Descriptive statistics
- Hypothesis testing (t-tests, ANOVA, chi-square)
- Regression analysis (linear, logistic, polynomial)
- Correlation and causation analysis
- Time series analysis

**Machine Learning**:
- Classification (binary and multi-class)
- Regression prediction
- Clustering analysis
- Anomaly detection
- AutoML with hyperparameter optimization

**LLM Fine-Tuning**:
- Parameter-efficient fine-tuning (LoRA, QLoRA)
- Full fine-tuning for custom models
- Automatic method recommendation

**Business Intelligence**:
- KPI dashboards
- ROI calculation
- Competitive analysis
- Trend forecasting

**Visualizations**:
- Interactive charts (Plotly, Bokeh, D3.js)
- Publication-quality static charts (Matplotlib, Seaborn)
- Custom dashboards
- Export capabilities (PNG, SVG, PDF)`,
        tags: ['analysis', 'statistics', 'machine-learning', 'visualization', 'bi'],
        relevanceScore: 0,
        lastUpdated: new Date('2025-10-22'),
        relatedArticles: ['doc_002', 'doc_006']
      },
      {
        id: 'doc_005',
        title: 'Agent System Overview',
        category: 'docs',
        content: `ChimariData uses specialized AI agents:

**Project Manager Agent**: Orchestrates workflow
- Coordinates between agents
- Tracks progress and milestones
- Manages checkpoints and approvals
- Resource allocation

**Data Engineer Agent**: Data pipeline management
- ETL/ELT pipeline design
- Data quality monitoring
- Schema evolution
- Batch processing

**Data Scientist Agent**: Advanced analytics
- Statistical analysis
- Machine learning
- LLM fine-tuning
- Visualization generation

**Business Agent**: Business intelligence
- Industry research
- Compliance checking
- ROI analysis
- Competitive analysis

**Customer Support Agent**: User assistance
- Platform knowledge
- Troubleshooting
- Billing support
- Feature explanation

**Research Agent**: Information gathering
- Internet research
- Academic paper retrieval
- Template creation
- Trend analysis`,
        tags: ['agents', 'ai', 'automation', 'orchestration'],
        relevanceScore: 0,
        lastUpdated: new Date('2025-10-23'),
        relatedArticles: ['doc_002', 'doc_001']
      },
      {
        id: 'doc_006',
        title: 'Subscription Tiers and Pricing',
        category: 'docs',
        content: `ChimariData offers flexible pricing:

**Trial Tier** (Free):
- Limited usage for evaluation
- Basic analysis features
- 50 AI queries/month
- Community support

**Starter Tier** ($29/month):
- 500 AI queries/month
- All analysis types
- 10 GB data storage
- Email support

**Professional Tier** ($99/month):
- 2,000 AI queries/month
- Advanced ML and LLM capabilities
- 50 GB data storage
- Priority support
- Custom integrations

**Enterprise Tier** (Custom):
- Unlimited usage
- Dedicated resources
- White-label options
- SLA guarantees
- Dedicated support team

**Usage-Based Billing**: Overage charges apply when quotas exceeded.
**Quota Tracking**: Real-time quota monitoring in dashboard.`,
        tags: ['pricing', 'subscription', 'billing', 'tiers', 'quotas'],
        relevanceScore: 0,
        lastUpdated: new Date('2025-10-23'),
        relatedArticles: ['faq_005', 'faq_006']
      }
    ]);

    // FAQs
    this.faqDatabase.set(
      'How do I upload my data?',
      'Click "Create Project" → "Upload Data" → Select your file (CSV, Excel, JSON, or Parquet). Files are automatically validated and PII is detected.'
    );

    this.faqDatabase.set(
      'What file formats are supported?',
      'We support CSV, Excel (.xlsx, .xls), JSON, JSONL, Parquet, and direct database connections (SQL and NoSQL).'
    );

    this.faqDatabase.set(
      'How does PII detection work?',
      'Our system automatically scans uploaded data for personally identifiable information (names, emails, SSNs, phone numbers, addresses). You can choose to anonymize detected PII before analysis.'
    );

    this.faqDatabase.set(
      'What is the difference between journey types?',
      'AI-Guided is fully automated for non-technical users. Template-Based uses pre-built industry templates. Self-Service gives you full control. Consultation provides expert assistance for complex projects.'
    );

    this.faqDatabase.set(
      'How does billing work?',
      'Subscribed users get monthly quotas. Usage within quota is free. Overage charges apply when quotas are exceeded. You can track your usage in real-time on the dashboard.'
    );

    this.faqDatabase.set(
      'Can I cancel my subscription?',
      'Yes, you can cancel anytime from your account settings. You\'ll retain access until the end of your current billing period.'
    );

    this.faqDatabase.set(
      'What payment methods do you accept?',
      'We accept all major credit cards (Visa, Mastercard, American Express, Discover) through our secure Stripe integration.'
    );

    this.faqDatabase.set(
      'Is my data secure?',
      'Yes. All data is encrypted at rest and in transit. We are SOC 2 Type II certified and GDPR/CCPA compliant. You maintain full ownership of your data.'
    );

    this.faqDatabase.set(
      'Can I connect to my database?',
      'Yes. We support connections to PostgreSQL, MySQL, SQL Server, MongoDB, and cloud data warehouses like Snowflake and BigQuery.'
    );

    this.faqDatabase.set(
      'What machine learning algorithms are available?',
      'We support classification (logistic regression, random forests, XGBoost, neural networks), regression, clustering (K-means, DBSCAN), and anomaly detection. AutoML automatically selects the best algorithm.'
    );

    // Troubleshooting
    this.knowledgeBase.set('troubleshooting', [
      {
        id: 'trouble_001',
        title: 'File Upload Fails',
        category: 'troubleshooting',
        content: `If your file upload fails, try these steps:

1. **Check file size**: Free tier limited to 10MB. Upgrade for larger files.
2. **Verify file format**: Ensure file is CSV, Excel, JSON, or Parquet.
3. **Check file encoding**: Use UTF-8 encoding for CSV files.
4. **Remove special characters**: File names should not contain special characters.
5. **Try a smaller file**: Upload a subset of data to test.

If issue persists, contact support with:
- File format and size
- Browser and OS
- Error message screenshot`,
        tags: ['upload', 'error', 'file-size', 'format'],
        relevanceScore: 0,
        lastUpdated: new Date('2025-10-22')
      },
      {
        id: 'trouble_002',
        title: 'Analysis Not Starting',
        category: 'troubleshooting',
        content: `If analysis doesn't start:

1. **Check quota**: Verify you haven't exceeded monthly quota in dashboard.
2. **Verify data**: Ensure dataset has been uploaded successfully.
3. **Check project status**: Make sure project is active, not archived.
4. **Clear browser cache**: Refresh page after clearing cache.
5. **Check system status**: Visit status.chimaridata.com for service health.

If problem continues:
- Try creating a new project
- Use a different browser
- Contact support with project ID`,
        tags: ['analysis', 'error', 'quota', 'status'],
        relevanceScore: 0,
        lastUpdated: new Date('2025-10-22')
      },
      {
        id: 'trouble_003',
        title: 'Billing or Payment Issues',
        category: 'troubleshooting',
        content: `Common billing issues and solutions:

**Card Declined**:
- Verify card details are correct
- Check with your bank for restrictions
- Ensure sufficient funds available
- Try a different payment method

**Invoice Not Received**:
- Check spam/junk folder
- Verify email address in account settings
- Download from Billing page in dashboard

**Quota Not Updating**:
- Wait 5-10 minutes for system sync
- Refresh dashboard
- Contact support if delay persists

**Unexpected Charges**:
- Review usage details in Billing page
- Check for overage usage
- Verify active subscriptions
- Contact support for charge disputes`,
        tags: ['billing', 'payment', 'invoice', 'quota', 'charges'],
        relevanceScore: 0,
        lastUpdated: new Date('2025-10-23')
      },
      {
        id: 'trouble_004',
        title: 'Cannot Access Premium Features',
        category: 'troubleshooting',
        content: `If premium features are inaccessible:

1. **Verify subscription status**: Check subscription tier in account settings
2. **Check payment status**: Ensure payment method is valid and charged
3. **Refresh session**: Log out and log back in
4. **Clear cache**: Browser cache might have outdated permissions
5. **Verify feature availability**: Some features require Professional or Enterprise tier

Premium features include:
- Advanced ML algorithms
- LLM fine-tuning
- Spark-based distributed processing
- Custom integrations
- Priority support

Contact support if subscription shows active but features unavailable.`,
        tags: ['premium', 'features', 'subscription', 'access'],
        relevanceScore: 0,
        lastUpdated: new Date('2025-10-23')
      }
    ]);

    // Features
    this.featureIndex.set('checkpoints', {
      name: 'Agent Checkpoints',
      description: 'Approval gates where agents pause for user review',
      usage: 'Agents automatically create checkpoints at key workflow stages',
      benefits: ['User control', 'Quality assurance', 'Transparent AI decisions']
    });

    this.featureIndex.set('templates', {
      name: 'Business Templates',
      description: 'Pre-built analysis workflows for specific industries',
      usage: 'Select template during project creation for your industry',
      benefits: ['Time savings', 'Best practices', 'Industry-specific insights']
    });

    console.log('[PlatformKB] Knowledge base initialized with documentation, FAQs, and troubleshooting guides');
  }

  private searchDocumentation(query: string): KnowledgeArticle[] {
    const docs = this.knowledgeBase.get('docs') || [];
    return this.filterByQuery(docs, query);
  }

  private searchFAQ(query: string): KnowledgeArticle[] {
    const results: KnowledgeArticle[] = [];
    const queryLower = query.toLowerCase();

    for (const [question, answer] of this.faqDatabase.entries()) {
      if (question.toLowerCase().includes(queryLower) ||
          answer.toLowerCase().includes(queryLower)) {
        results.push({
          id: `faq_${question.substring(0, 20).replace(/\s/g, '_')}`,
          title: question,
          category: 'faq',
          content: answer,
          tags: ['faq'],
          relevanceScore: 0,
          lastUpdated: new Date()
        });
      }
    }

    return results;
  }

  private searchTroubleshooting(query: string): KnowledgeArticle[] {
    const articles = this.knowledgeBase.get('troubleshooting') || [];
    return this.filterByQuery(articles, query);
  }

  private searchFeatures(query: string): KnowledgeArticle[] {
    const results: KnowledgeArticle[] = [];
    const queryLower = query.toLowerCase();

    for (const [featureKey, feature] of this.featureIndex.entries()) {
      if (featureKey.includes(queryLower) ||
          feature.name.toLowerCase().includes(queryLower) ||
          feature.description.toLowerCase().includes(queryLower)) {
        results.push({
          id: `feature_${featureKey}`,
          title: feature.name,
          category: 'features',
          content: `${feature.description}\n\n**Usage**: ${feature.usage}\n\n**Benefits**:\n${feature.benefits.map(b => `- ${b}`).join('\n')}`,
          tags: ['features', featureKey],
          relevanceScore: 0,
          lastUpdated: new Date()
        });
      }
    }

    return results;
  }

  private searchBilling(query: string): KnowledgeArticle[] {
    const docs = this.knowledgeBase.get('docs') || [];
    const billingDocs = docs.filter(doc =>
      doc.tags.includes('billing') ||
      doc.tags.includes('pricing') ||
      doc.tags.includes('subscription')
    );

    return this.filterByQuery(billingDocs, query);
  }

  private filterByQuery(articles: KnowledgeArticle[], query: string): KnowledgeArticle[] {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(' ').filter(term => term.length > 2);

    return articles.filter(article => {
      const searchText = `${article.title} ${article.content} ${article.tags.join(' ')}`.toLowerCase();

      // Match if any query term is found
      return queryTerms.some(term => searchText.includes(term));
    });
  }

  private rankResults(articles: KnowledgeArticle[], query: string): KnowledgeArticle[] {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(' ').filter(term => term.length > 2);

    // Calculate relevance scores
    articles.forEach(article => {
      let score = 0;

      // Title matches worth more
      queryTerms.forEach(term => {
        if (article.title.toLowerCase().includes(term)) {
          score += 10;
        }
        if (article.content.toLowerCase().includes(term)) {
          score += 5;
        }
        if (article.tags.some(tag => tag.toLowerCase().includes(term))) {
          score += 7;
        }
      });

      // Boost recent articles slightly
      const daysSinceUpdate = (Date.now() - article.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 30) {
        score += 2;
      }

      article.relevanceScore = score;
    });

    // Sort by relevance
    return articles.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  private generateSuggestions(query: string, results: KnowledgeArticle[]): string[] {
    const suggestions: Set<string> = new Set();

    // Extract common tags from top results
    results.slice(0, 5).forEach(article => {
      article.tags.forEach(tag => {
        if (!query.toLowerCase().includes(tag.toLowerCase())) {
          suggestions.add(tag);
        }
      });
    });

    // Add related article suggestions
    results.slice(0, 3).forEach(article => {
      if (article.relatedArticles) {
        article.relatedArticles.forEach(relatedId => {
          const related = this.getArticleSync(relatedId);
          if (related) {
            suggestions.add(related.title);
          }
        });
      }
    });

    return Array.from(suggestions).slice(0, 5);
  }

  private getArticleSync(articleId: string): KnowledgeArticle | null {
    for (const [category, articles] of this.knowledgeBase.entries()) {
      const article = articles.find(a => a.id === articleId);
      if (article) {
        return article;
      }
    }
    return null;
  }
}

// Singleton instance
export const platformKnowledgeBase = new PlatformKnowledgeBase();

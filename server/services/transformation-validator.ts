/**
 * Transformation Code Validator
 * 
 * Validates transformation code to prevent code injection and ensure only safe operations are executed.
 * Uses whitelist approach for allowed operations and blacklist for dangerous patterns.
 */

export interface ValidationResult {
    valid: boolean;
    error?: string;
    warnings?: string[];
}

export class TransformationValidator {
    // Whitelist of allowed pandas operations
    private static readonly ALLOWED_OPERATIONS = [
        // Type conversions
        /^pd\.to_datetime\(/,
        /^pd\.to_numeric\(/,
        /^pd\.to_timedelta\(/,

        // DataFrame operations
        /^df\[['"][a-zA-Z0-9_]+['"]\]\.astype\(/,
        /^df\[['"][a-zA-Z0-9_]+['"]\]\.fillna\(/,
        /^df\[['"][a-zA-Z0-9_]+['"]\]\.replace\(/,
        /^df\[['"][a-zA-Z0-9_]+['"]\]\.str\./,
        /^df\[['"][a-zA-Z0-9_]+['"]\]\.dt\./,
        /^df\[['"][a-zA-Z0-9_]+['"]\]\.cat\./,

        // String operations
        /^df\[['"][a-zA-Z0-9_]+['"]\]\.str\.strip\(/,
        /^df\[['"][a-zA-Z0-9_]+['"]\]\.str\.lower\(/,
        /^df\[['"][a-zA-Z0-9_]+['"]\]\.str\.upper\(/,
        /^df\[['"][a-zA-Z0-9_]+['"]\]\.str\.replace\(/,

        // Math operations
        /^df\[['"][a-zA-Z0-9_]+['"]\]\s*[\+\-\*\/]\s*\d+/,
        /^df\[['"][a-zA-Z0-9_]+['"]\]\.round\(/,
        /^df\[['"][a-zA-Z0-9_]+['"]\]\.abs\(/,

        // Comments
        /^#/
    ];

    // Blacklist of dangerous operations
    private static readonly DANGEROUS_PATTERNS = [
        // Code execution
        /eval\(/i,
        /exec\(/i,
        /compile\(/i,
        /__import__/i,

        // System operations
        /import\s+os/i,
        /import\s+sys/i,
        /import\s+subprocess/i,
        /system\(/i,
        /popen\(/i,
        /spawn/i,

        // File operations
        /open\(/i,
        /file\(/i,
        /read\(/i,
        /write\(/i,

        // Network operations
        /import\s+requests/i,
        /import\s+urllib/i,
        /import\s+socket/i,

        // Dangerous builtins
        /globals\(/i,
        /locals\(/i,
        /vars\(/i,
        /dir\(/i,
        /getattr\(/i,
        /setattr\(/i,
        /delattr\(/i
    ];

    /**
     * Validate transformation code for security
     */
    static validate(code: string): ValidationResult {
        if (!code || typeof code !== 'string') {
            return { valid: false, error: 'Code must be a non-empty string' };
        }

        const trimmedCode = code.trim();
        if (trimmedCode.length === 0) {
            return { valid: false, error: 'Code cannot be empty' };
        }

        // Check for dangerous patterns first
        for (const pattern of this.DANGEROUS_PATTERNS) {
            if (pattern.test(trimmedCode)) {
                return {
                    valid: false,
                    error: `Unsafe operation detected: ${pattern.source}`
                };
            }
        }

        // Split into lines and validate each
        const lines = trimmedCode.split('\n').filter(line => line.trim().length > 0);
        const warnings: string[] = [];

        for (const line of lines) {
            const trimmedLine = line.trim();

            // Skip comments
            if (trimmedLine.startsWith('#')) {
                continue;
            }

            // Check if line matches any allowed pattern
            const isAllowed = this.ALLOWED_OPERATIONS.some(pattern => pattern.test(trimmedLine));

            if (!isAllowed) {
                return {
                    valid: false,
                    error: `Operation not in whitelist: ${trimmedLine.substring(0, 50)}...`
                };
            }

            // Check for potential issues
            if (trimmedLine.includes('errors=') && !trimmedLine.includes("errors='coerce'")) {
                warnings.push('Consider using errors="coerce" for safer error handling');
            }
        }

        return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
    }

    /**
     * Validate a complete transformation configuration
     */
    static validateTransformation(transformation: {
        type: string;
        config: Record<string, any>;
    }): ValidationResult {
        // Validate transformation type
        const allowedTypes = ['filter', 'select', 'rename', 'convert', 'clean', 'aggregate', 'sort', 'join', 'map', 'custom'];
        if (!allowedTypes.includes(transformation.type)) {
            return {
                valid: false,
                error: `Invalid transformation type: ${transformation.type}`
            };
        }

        // Validate code if present
        if (transformation.config.code) {
            // Check if it's JS or Python. For now, assume JS if used in StreamingTransformer context.
            // But this method is generic.
            // Let's add a specific check for JS dangerous patterns if it looks like JS.
            // Or better, let the caller specify the language.
            // For backward compatibility, we'll use the existing validate() which is Python-centric but has some overlap.

            const codeValidation = this.validate(transformation.config.code);
            if (!codeValidation.valid) {
                return codeValidation;
            }
        }

        // Type-specific validation
        switch (transformation.type) {
            case 'filter':
                if (!transformation.config.field && !transformation.config.code) {
                    return { valid: false, error: 'Filter requires field or code' };
                }
                break;

            case 'select':
                if (!Array.isArray(transformation.config.columns) || transformation.config.columns.length === 0) {
                    return { valid: false, error: 'Select requires at least one column' };
                }
                break;

            case 'rename':
                if (!Array.isArray(transformation.config.mappings) || transformation.config.mappings.length === 0) {
                    return { valid: false, error: 'Rename requires at least one mapping' };
                }
                break;
        }

        return { valid: true };
    }

    /**
     * Validate JavaScript code for StreamingTransformer
     */
    static validateJS(code: string): ValidationResult {
        if (!code || typeof code !== 'string') return { valid: false, error: 'Code must be a string' };

        const dangerousJS = [
            /process\.exit/i,
            /eval\(/i,
            /new Function\(/i, // We use new Function, but user code shouldn't
            /require\(/i,
            /import\(/i,
            /global\./i,
            /window\./i,
            /document\./i,
            /__dirname/i,
            /__filename/i,
            /console\./i // Optional: block console logs to prevent spam
        ];

        for (const pattern of dangerousJS) {
            if (pattern.test(code)) {
                return { valid: false, error: `Unsafe JavaScript operation detected: ${pattern.source}` };
            }
        }

        return { valid: true };
    }
}

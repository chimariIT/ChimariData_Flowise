# User-Uploaded Presentation Templates

This directory stores custom presentation templates uploaded by users for personalized branding.

## Directory Structure

```
uploads/templates/presentations/
├── {userId1}/
│   ├── custom-template.pptx
│   ├── branded-deck.pptx
│   └── metadata.json
├── {userId2}/
│   └── company-template.pptx
└── README.md (this file)
```

## Template Upload Flow

1. User uploads `.pptx` template via settings page
2. File stored in `{userId}/` subdirectory
3. Template metadata saved to database:
   - Template ID
   - Original filename
   - Upload timestamp
   - Number of slides
   - Identified placeholders
   - Branding elements (colors, fonts)

## Template Validation

Uploaded templates are validated for:
- Valid `.pptx` format (not corrupted)
- Contains required placeholders (at minimum `{ProjectName}`)
- File size under limit (default: 10MB)
- No malicious content (virus scan)

## Template Metadata

Each template directory may contain a `metadata.json` file:

```json
{
  "templateId": "template-123",
  "userId": "user-456",
  "originalFilename": "acme-corp-template.pptx",
  "uploadedAt": "2025-11-07T12:00:00Z",
  "slideCount": 12,
  "placeholders": [
    "{ProjectName}",
    "{GeneratedDate}",
    "{ChartPlaceholder1}",
    "{ExecutiveSummary}"
  ],
  "branding": {
    "primaryColor": "#0066CC",
    "secondaryColor": "#FF6600",
    "fontFamily": "Arial",
    "logoPosition": "top-right"
  },
  "isDefault": false
}
```

## Usage in Presentation Generation

When agent generates presentation:

```typescript
executeTool('presentation_generator', 'business_agent', {
  projectId: 'proj-123',
  userId: 'user-456',
  audience: 'business',
  userTemplateId: 'template-123'  // Uses custom template
})
```

If `userTemplateId` not provided, system falls back to default Chimari templates.

## Security Considerations

- Templates isolated by user ID (no cross-user access)
- All uploads scanned for malicious content
- File size limits enforced
- Only `.pptx` format allowed
- Template ownership verified before use

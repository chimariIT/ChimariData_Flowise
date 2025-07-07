import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { FileProcessor } from "./file-processor";
import { insertDataProjectSchema, fileUploadResponseSchema } from "@shared/schema";

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept common data file types
    const allowedTypes = [
      'application/json',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ];
    
    const allowedExtensions = ['.json', '.csv', '.xlsx', '.xls', '.txt'];
    const hasValidExtension = allowedExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext));
    
    if (allowedTypes.includes(file.mimetype) || hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Please upload CSV, JSON, Excel, or text files.'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // File upload endpoint
  app.post("/api/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          success: false, 
          error: "No file uploaded" 
        });
      }

      const file = req.file;
      console.log(`Processing file: ${file.originalname} (${file.size} bytes)`);

      // Process the file
      const processedData = await FileProcessor.processFile(
        file.buffer,
        file.originalname,
        file.mimetype
      );

      // Create project in storage
      const project = await storage.createProject({
        name: file.originalname.replace(/\.[^/.]+$/, ""), // Remove file extension
        fileName: file.originalname,
        fileSize: file.size,
        fileType: file.mimetype,
        schema: processedData.schema,
        recordCount: processedData.recordCount,
      });

      // Mark as processed
      await storage.updateProject(project.id, { processed: true });

      console.log(`File processed successfully: ${project.id}`);

      res.json({
        success: true,
        projectId: project.id,
        project: {
          ...project,
          preview: processedData.preview
        }
      });

    } catch (error) {
      console.error("File upload error:", error);
      res.status(500).json({ 
        success: false, 
        error: error.message || "Failed to process file" 
      });
    }
  });

  // Get all projects
  app.get("/api/projects", async (req, res) => {
    try {
      const projects = await storage.getAllProjects();
      res.json({ projects });
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  // Get specific project
  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  // Delete project
  app.delete("/api/projects/:id", async (req, res) => {
    try {
      const success = await storage.deleteProject(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
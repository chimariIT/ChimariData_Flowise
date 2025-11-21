// chimariapp2/ChimariData_Flowise-chimaridataApp2/custom.d.ts
import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    // Populated by auth middleware; many routes expect req.user.id
    user?: {
      id?: string;
      role?: string;
      [key: string]: any;
    };
    // Convenience field mirrored from req.user.id in some routes
    userId?: string;
    // Added by usage/permission middleware for downstream handlers
    userLimits?: any;
    currentUsage?: any;
    adminUser?: {
      id?: string;
      role?: string;
      permissions?: string[];
      [key: string]: any;
    };
  }
}
declare module 'recharts';
declare module 'react-plotly.js';
declare module 'plotly.js';
declare module 'clsx';
declare module 'lucide-react';
declare module 'tw-animate-css';
declare module 'embla-carousel-react';
declare module 'robots-txt-parse';

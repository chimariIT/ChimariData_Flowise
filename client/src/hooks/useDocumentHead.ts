import { useEffect } from 'react';

/**
 * MEDIUM PRIORITY FIX: React-friendly hook for document head management
 *
 * This hook provides a declarative API for managing document title and meta tags.
 * It can be easily replaced with react-helmet-async in the future if needed.
 *
 * @example
 * ```tsx
 * useDocumentHead({
 *   title: 'Page Title | ChimariData',
 *   description: 'Page description for SEO'
 * });
 * ```
 */
interface DocumentHeadOptions {
  title?: string;
  description?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}

export function useDocumentHead(options: DocumentHeadOptions) {
  useEffect(() => {
    // Store original values for cleanup
    const originalTitle = document.title;

    // Set document title
    if (options.title) {
      document.title = options.title;
    }

    // Helper function to set or create meta tag
    const setMetaTag = (name: string, content: string, property = false) => {
      const attributeName = property ? 'property' : 'name';
      let meta = document.querySelector(`meta[${attributeName}="${name}"]`);

      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attributeName, name);
        document.head.appendChild(meta);
      }

      meta.setAttribute('content', content);
    };

    // Set meta description
    if (options.description) {
      setMetaTag('description', options.description);
    }

    // Set keywords
    if (options.keywords) {
      setMetaTag('keywords', options.keywords);
    }

    // Set Open Graph tags
    if (options.ogTitle) {
      setMetaTag('og:title', options.ogTitle, true);
    }

    if (options.ogDescription) {
      setMetaTag('og:description', options.ogDescription, true);
    }

    if (options.ogImage) {
      setMetaTag('og:image', options.ogImage, true);
    }

    // Cleanup: restore original title on unmount
    return () => {
      document.title = originalTitle;
    };
  }, [options.title, options.description, options.keywords, options.ogTitle, options.ogDescription, options.ogImage]);
}

export default useDocumentHead;

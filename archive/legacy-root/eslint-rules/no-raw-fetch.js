/**
 * ESLint rule to disallow raw fetch() and axios calls in components
 * Forces developers to use apiClient instead
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow raw fetch() and axios calls in components. Use apiClient instead.',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      noRawFetch: 'Direct fetch() calls are not allowed in components. Use apiClient from "@/lib/api-client" instead.',
      noRawFetchHttp: 'Direct fetch() calls with HTTP URLs are not allowed. Use apiClient from "@/lib/api-client" instead.',
      noAxios: 'Direct axios calls are not allowed in components. Use apiClient from "@/lib/api-client" instead.',
    },
    schema: [],
  },
  create(context) {
    // Check if the current file is a component file
    function isComponentFile(filename) {
      if (!filename) return false;
      
      // Allow fetch in api-client.ts (the implementation itself)
      if (filename.includes('api-client.ts') || filename.includes('api-client.js')) {
        return false;
      }
      
      // Allow fetch in service workers and scripts
      if (filename.includes('sw.js') || 
          filename.includes('service-worker') ||
          filename.includes('/scripts/') ||
          filename.includes('/public/')) {
        return false;
      }
      
      // Check if it's a component file (in components/, app/, or has .tsx/.jsx extension)
      const isComponentDir = filename.includes('/components/') || 
                            filename.includes('/app/') ||
                            filename.includes('\\components\\') ||
                            filename.includes('\\app\\');
      
      const isComponentExtension = filename.endsWith('.tsx') || filename.endsWith('.jsx');
      
      return isComponentDir || isComponentExtension;
    }

    // Check if a fetch call uses an HTTP URL
    function hasHttpUrl(node) {
      if (!node.arguments || node.arguments.length === 0) return false;
      
      const firstArg = node.arguments[0];
      
      // Check for string literals like fetch("http://...")
      if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
        return firstArg.value.startsWith('http://') || firstArg.value.startsWith('https://');
      }
      
      // Check for template literals like fetch(`http://...`)
      if (firstArg.type === 'TemplateLiteral') {
        const templateValue = context.getSourceCode().getText(firstArg);
        return templateValue.includes('http://') || templateValue.includes('https://');
      }
      
      return false;
    }

    return {
      // Catch fetch() calls
      CallExpression(node) {
        const filename = context.getFilename();
        
        if (!isComponentFile(filename)) {
          return;
        }

        // Check for fetch() calls
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'fetch'
        ) {
          // Flag all fetch calls, but provide specific message for HTTP URLs
          if (hasHttpUrl(node)) {
            context.report({
              node,
              messageId: 'noRawFetchHttp',
            });
          } else {
            context.report({
              node,
              messageId: 'noRawFetch',
            });
          }
        }

        // Check for axios calls (axios.get, axios.post, etc.)
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'axios'
        ) {
          context.report({
            node,
            messageId: 'noAxios',
          });
        }

        // Check for axios() direct calls
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'axios'
        ) {
          context.report({
            node,
            messageId: 'noAxios',
          });
        }
      },
    };
  },
};



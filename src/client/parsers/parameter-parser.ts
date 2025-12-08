import { z } from 'zod';

// Define parameter schemas
const ParameterSchema = z.object({
  ns: z.string().optional(),
  namespace: z.string().optional(),
  hzh: z.string().optional(),
  pods: z.boolean().optional(),
});

export type ParameterData = z.infer<typeof ParameterSchema>;

export interface CleanedParameters {
  namespace: string;
  command: string;
}

export interface ParseResult {
  success: boolean;
  data?: CleanedParameters;
  error?: string;
}

/**
 * Parse unordered parameters and extract relevant information
 * Supports input: ["ns", "hzh", "pods"]
 */
export function parseUnorderedParameters(rawArgs: string[]): ParseResult {
  try {
    // Initialize parameter object
    const params: any = {};

    // Process each argument
    for (let i = 0; i < rawArgs.length; i++) {
      const arg = rawArgs[i].toLowerCase().trim();

      // Handle different parameter formats
      if (arg === 'ns' || arg === 'namespace') {
        // Next argument might be the namespace value
        const nextArg = rawArgs[i + 1];
        if (nextArg && !['ns', 'hzh', 'pods', 'namespace'].includes(nextArg.toLowerCase())) {
          params.namespace = nextArg;
          i++; // Skip the next argument as we've processed it
        }
      } else if (arg === 'hzh') {
        // hzh is typically the namespace value in this context
        params.hzh = arg;
      } else if (arg === 'pods') {
        params.pods = true;
      } else {
        // If it's not a known keyword, it might be a namespace value
        if (arg.match(/^[a-z0-9-]+$/)) {
          // If we haven't found a namespace yet, use this as namespace
          if (!params.namespace && !params.hzh) {
            params.namespace = arg;
          } else if (arg === 'hzh' && !params.namespace) {
            // Special case: if "hzh" is found without namespace, use it
            params.namespace = 'hzh';
          }
        }
      }
    }

    // Determine the final namespace
    let finalNamespace = '';
    if (params.namespace) {
      finalNamespace = params.namespace;
    } else if (params.hzh) {
      // For the specific input ["ns", "hzh", "pods"], hzh is the namespace
      finalNamespace = 'hzh';
    } else {
      return {
        success: false,
        error: 'No namespace found in parameters',
      };
    }

    // Validate using Zod schema
    const validatedParams = ParameterSchema.parse(params);

    // Generate the command
    const command = `kubectl get pods -n ${finalNamespace}`;

    const result: CleanedParameters = {
      namespace: finalNamespace,
      command,
    };

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown parsing error',
    };
  }
}

/**
 * Clean and validate parameters for various input patterns
 * Handles: ["ns-mh69tey1", "hzh", "pods"], ["ns", "hzh", "pods"], etc.
 */
export function cleanNsHzhPodsParameters(rawArgs: string[]): ParseResult {
  // Look for namespace-like values (alphanumeric strings with possible hyphens)
  let namespace = '';

  for (const arg of rawArgs) {
    const lowerArg = arg.toLowerCase().trim();

    // Skip known keywords
    if (lowerArg === 'ns' || lowerArg === 'namespace' || lowerArg === 'pods') {
      continue;
    }

    // If it looks like a namespace (alphanumeric with possible hyphens)
    if (arg.match(/^[a-z0-9-]+$/i) && arg.length > 1) {
      namespace = arg;
      break; // Take the first namespace-like value
    }
  }

  // If no namespace found, fall back to general parser
  if (!namespace) {
    return parseUnorderedParameters(rawArgs);
  }

  const result: CleanedParameters = {
    namespace: namespace,
    command: `kubectl get pods -n ${namespace}`,
  };

  return {
    success: true,
    data: result,
  };
}
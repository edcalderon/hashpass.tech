type TemplateArg = TemplateStringsArray | string;

export const t = (template: TemplateArg, ...values: unknown[]): string => {
  if (typeof template === 'string') {
    return template;
  }

  if (Array.isArray(template)) {
    return template.reduce((result, part, index) => {
      const value = index < values.length ? String(values[index] ?? '') : '';
      return result + part + value;
    }, '');
  }

  return '';
};

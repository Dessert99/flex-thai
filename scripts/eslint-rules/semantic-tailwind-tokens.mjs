/** 프로젝트 작성 UI에서 Tailwind 원시 시각 값을 금지한다 */
const numericVisualValue = /^\d+(?:\.\d+)?(?:\/\d+)?$/;
const arbitraryValue = /^\[.+\]$/;
const rawTextSize = /^(?:xs|sm|base|lg|xl|\d+xl)$/;
const rawRadius = /^(?:sm|md|lg|xl|\d+xl)$/;
const rawElevation = /^(?:sm|md|lg|xl|\d+xl)$/;
const rawPalette =
  /^(?:black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d+)?$/;

const spacingUtility =
  /^(?:-)?(?:p[trblxy]?|m[trblxy]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|right|bottom|left)-(.+)$/;
const sizeUtility = /^(?:min-|max-)?(?:size|w|h)-(.+)$/;
const colorUtility =
  /^(?:bg|border|divide|outline|ring|text|decoration|placeholder|accent|caret|fill|stroke|from|via|to)-(.+)$/;

function removeVariants(className) {
  return className.replace(/^(?:[a-z0-9_-]+:)+/iu, '').replace(/^!/u, '');
}

function isForbiddenClass(className) {
  const utility = removeVariants(className);
  const spacingMatch = spacingUtility.exec(utility);
  if (
    spacingMatch &&
    (numericVisualValue.test(spacingMatch[1]) ||
      arbitraryValue.test(spacingMatch[1]))
  ) {
    return true;
  }

  const sizeMatch = sizeUtility.exec(utility);
  if (
    sizeMatch &&
    (numericVisualValue.test(sizeMatch[1]) || arbitraryValue.test(sizeMatch[1]))
  ) {
    return true;
  }

  const colorMatch = colorUtility.exec(utility);
  if (
    colorMatch &&
    (arbitraryValue.test(colorMatch[1]) || rawPalette.test(colorMatch[1]))
  ) {
    return true;
  }

  if (utility.startsWith('text-') && rawTextSize.test(utility.slice(5))) {
    return true;
  }

  if (utility.startsWith('rounded-') && rawRadius.test(utility.slice(8))) {
    return true;
  }

  if (utility.startsWith('shadow-') && rawElevation.test(utility.slice(7))) {
    return true;
  }

  return /^(?:duration|delay)-\d+$/u.test(utility);
}

function reportForbiddenClasses(context, node, value) {
  for (const className of value.split(/\s+/u).filter(Boolean)) {
    if (isForbiddenClass(className)) {
      context.report({
        data: { className },
        messageId: 'useSemanticToken',
        node,
      });
    }
  }
}

/** 비시맨틱 Tailwind 시각 값을 보고하는 ESLint 규칙 */
export const semanticTailwindTokensRule = {
  meta: {
    docs: {
      description: '프로젝트 UI에서 semantic Tailwind token만 사용하게 한다.',
    },
    messages: {
      useSemanticToken:
        "'{{ className }}' 대신 정의된 semantic Tailwind token을 사용하세요.",
    },
    schema: [],
    type: 'problem',
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === 'string') {
          reportForbiddenClasses(context, node, node.value);
        }
      },
      TemplateElement(node) {
        reportForbiddenClasses(context, node, node.value.raw);
      },
    };
  },
};
